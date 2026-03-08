import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import { isExecutionProgressComment, isKickoffComment } from '@/lib/habi-task-execution'

const HABI_ROOT = process.env.HABI_ROOT || '/Users/kokoro/Coding/Habi'
const FOUNDER_PACKET_ROOT = path.join(HABI_ROOT, 'output', 'founder', 'daily')
const SIGNAL_LEDGER_PATH = path.join(HABI_ROOT, 'output', 'founder', 'customer-signal-ledger.json')
const PRODUCT_PROOF_PATH = path.join(HABI_ROOT, 'output', 'founder', 'product-proof-ledger.json')
const ADOPTION_SCORECARD_PATH = path.join(HABI_ROOT, 'output', 'revenue', 'revenue-escape-scorecard.json')
const GROWTH_WEEKS_ROOT = path.join(HABI_ROOT, 'output', 'growth', 'weeks')
const REPORTS_ROOT = path.join(process.env.HOME || '/Users/kokoro', '.openclaw', 'reports')
const PRODUCTION_FRESHNESS_WINDOW_SEC = 12 * 60 * 60

async function readJsonOrNull<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function findLatestFounderPacketPath(root: string): Promise<string | null> {
  let dayEntries: Array<{ name: string; isDirectory(): boolean }> = []
  try {
    dayEntries = await fs.readdir(root, { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean }>
  } catch {
    return null
  }

  const candidates: Array<{ packetPath: string; mtimeMs: number }> = []
  for (const dayEntry of dayEntries) {
    if (!dayEntry.isDirectory()) continue
    const dayPath = path.join(root, dayEntry.name)
    let artifacts: Array<{ name: string; isFile(): boolean }> = []
    try {
      artifacts = await fs.readdir(dayPath, { withFileTypes: true }) as Array<{ name: string; isFile(): boolean }>
    } catch {
      continue
    }
    for (const artifact of artifacts) {
      if (!artifact.isFile() || !artifact.name.endsWith('.json')) continue
      const packetPath = path.join(dayPath, artifact.name)
      try {
        const stat = await fs.stat(packetPath)
        candidates.push({ packetPath, mtimeMs: stat.mtimeMs })
      } catch {
        // ignore stale entries
      }
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return candidates[0]?.packetPath ?? null
}

async function findLatestGrowthWeek(root: string): Promise<string | null> {
  let entries: Array<{ name: string; isDirectory(): boolean }> = []
  try {
    entries = await fs.readdir(root, { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean }>
  } catch {
    return null
  }

  const weekNames = entries
    .filter((entry) => entry.isDirectory() && /^week-\d+$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => {
      const leftNum = Number.parseInt(left.split('-')[1] || '0', 10)
      const rightNum = Number.parseInt(right.split('-')[1] || '0', 10)
      return rightNum - leftNum
    })

  return weekNames[0] ?? null
}

type ProductionCheckInfo = {
  label: string
  path: string | null
  generatedAt: string | null
  ageSeconds: number | null
  stale: boolean
}

function parseTaskMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function taskStatusPriority(status: string) {
  switch (status) {
    case 'quality_review':
      return 5
    case 'review':
      return 4
    case 'in_progress':
      return 3
    case 'assigned':
      return 2
    case 'inbox':
      return 1
    default:
      return 0
  }
}

function buildCanonicalVisibleTaskIds(
  rows: Array<{ id: number; status: string; updated_at: number; metadata?: string | null }>,
) {
  const groups = new Map<string, Array<{ id: number; status: string; updated_at: number; metadata: Record<string, unknown> }>>()
  const visibleIds = new Set<number>()
  let duplicateFingerprintCount = 0

  for (const row of rows) {
    const metadata = parseTaskMetadata(row.metadata)
    const fingerprint = String(metadata.fingerprint || '').trim()
    if (!fingerprint) {
      visibleIds.add(row.id)
      continue
    }
    const bucket = groups.get(fingerprint) || []
    bucket.push({
      id: row.id,
      status: row.status,
      updated_at: row.updated_at,
      metadata,
    })
    groups.set(fingerprint, bucket)
  }

  for (const [, bucket] of groups) {
    if (bucket.length === 1) {
      visibleIds.add(bucket[0].id)
      continue
    }
    duplicateFingerprintCount += bucket.length - 1
    bucket.sort((left, right) => {
      const leftSuperseded = Number(left.metadata.superseded_by_task_id || 0) > 0 ? 1 : 0
      const rightSuperseded = Number(right.metadata.superseded_by_task_id || 0) > 0 ? 1 : 0
      if (leftSuperseded !== rightSuperseded) return leftSuperseded - rightSuperseded
      const leftCanonical = Number(left.metadata.canonical_task_id || 0) === left.id ? 1 : 0
      const rightCanonical = Number(right.metadata.canonical_task_id || 0) === right.id ? 1 : 0
      if (leftCanonical !== rightCanonical) return rightCanonical - leftCanonical
      const statusDelta = taskStatusPriority(right.status) - taskStatusPriority(left.status)
      if (statusDelta !== 0) return statusDelta
      if (left.updated_at !== right.updated_at) return right.updated_at - left.updated_at
      return left.id - right.id
    })
    visibleIds.add(bucket[0].id)
  }

  return {
    visibleIds,
    duplicateFingerprintCount,
  }
}

async function findLatestReportPath(namePattern: RegExp, root = REPORTS_ROOT): Promise<string | null> {
  let entries: string[] = []
  try {
    entries = await fs.readdir(root)
  } catch {
    return null
  }
  const matches = entries.filter((entry) => namePattern.test(entry)).sort()
  if (!matches.length) return null
  const latestDir = path.join(root, matches[matches.length - 1])
  try {
    const stat = await fs.stat(latestDir)
    if (stat.isFile()) return latestDir
  } catch {
    return null
  }
  return latestDir
}

async function buildProductionCheck(label: string, targetPath: string | null): Promise<ProductionCheckInfo> {
  if (!targetPath) {
    return { label, path: null, generatedAt: null, ageSeconds: null, stale: true }
  }
  try {
    const stat = await fs.stat(targetPath)
    const ageSeconds = Math.max(0, Math.floor((Date.now() - stat.mtimeMs) / 1000))
    return {
      label,
      path: targetPath,
      generatedAt: new Date(stat.mtimeMs).toISOString(),
      ageSeconds,
      stale: ageSeconds > PRODUCTION_FRESHNESS_WINDOW_SEC,
    }
  } catch {
    return { label, path: targetPath, generatedAt: null, ageSeconds: null, stale: true }
  }
}

async function loadProductionTruth(workspaceId: number) {
  const db = getDatabase()
  const activeRows = db.prepare(`
    SELECT id, status, metadata
    FROM tasks
    WHERE workspace_id = ?
      AND lower(coalesce(assigned_to,'')) LIKE 'habi-%'
      AND status NOT IN ('done', 'cancelled')
  `).all(workspaceId) as Array<{ id: number; status: string; metadata?: string | null }>

  const fingerprintCounts = new Map<string, number>()
  for (const row of activeRows) {
    const metadata = parseTaskMetadata(row.metadata)
    const fingerprint = String(metadata.fingerprint || '').trim()
    if (!fingerprint) continue
    fingerprintCounts.set(fingerprint, (fingerprintCounts.get(fingerprint) || 0) + 1)
  }
  const unresolvedDuplicateFingerprints = [...fingerprintCounts.values()].filter((count) => count > 1).length

  const criticalAgents = ['habi-control', 'habi-foreman', 'habi-readiness', 'habi-qc', 'habi-growth', 'ops-heartbeat']
  const offlineCriticalAgentCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM agents
    WHERE workspace_id = ?
      AND id IN (${criticalAgents.map(() => '?').join(',')})
      AND status = 'offline'
  `).get(workspaceId, ...criticalAgents) as { count: number }

  const latestFounderPacket = await findLatestFounderPacketPath(FOUNDER_PACKET_ROOT)
  const latestDoctorDir = await findLatestReportPath(/^founder-os-doctor-\d{8}-\d{6}$/)
  const latestE2eDir = await findLatestReportPath(/^habi-e2e-shakedown-\d{8}-\d{6}$/)
  const latestCronDriftPath = await findLatestReportPath(/^cron-drift-\d{8}-\d{6}\.md$/)
  const latestCronQualityPath = await findLatestReportPath(/^cron-run-quality-\d{8}-\d{6}\.md$/)

  const checks = [
    await buildProductionCheck('Founder doctor', latestDoctorDir ? path.join(latestDoctorDir, 'report.json') : null),
    await buildProductionCheck('E2E shakedown', latestE2eDir ? path.join(latestE2eDir, 'system-packet.md') : null),
    await buildProductionCheck('Cron drift', latestCronDriftPath),
    await buildProductionCheck('Cron quality', latestCronQualityPath),
    await buildProductionCheck('Founder packet', latestFounderPacket),
  ]
  const staleReportCount = checks.filter((check) => check.stale).length

  return {
    duplicateFingerprintCount: unresolvedDuplicateFingerprints,
    staleReportCount,
    criticalOfflineAgentCount: Number(offlineCriticalAgentCount.count || 0),
    latestChecks: checks,
  }
}

function normalizeGrowthResearchSignals(input: unknown): string[] {
  if (!Array.isArray(input)) return []

  return input
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim()
      }

      if (!entry || typeof entry !== 'object') {
        return ''
      }

      const record = entry as Record<string, unknown>
      const persona = String(record.Persona || record.persona || '').trim()
      const problem = String(record.Problem || record.problem || '').trim()
      const objection = String(record.Objection || record.objection || '').trim()
      const nextAction = String(record['Next Action'] || record.nextAction || '').trim()

      const parts = [
        persona ? `${persona}: ${problem || 'signal captured'}` : problem,
        objection ? `objection: ${objection}` : '',
        nextAction ? `next: ${nextAction}` : '',
      ].filter(Boolean)

      return parts.join(' | ').trim()
    })
    .filter(Boolean)
    .slice(0, 3)
}

function normalizeTrendClusters(input: unknown): Array<{
  id: string
  label: string
  confidence: string
  tweetCount: number
  repeatedPains: string[]
  repeatedPhrases: string[]
  conversationThemes: string[]
  representativeExample: string | null
  contrarianTake: string | null
  fatigueSignal: string | null
  sampleTweets: string[]
  whyItMatters: string
}> {
  if (!Array.isArray(input)) return []
  const normalized = (input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, any>
      const repeatedPhrases = Array.isArray(record.repeatedPhrases)
        ? record.repeatedPhrases
            .map((phrase: any) => typeof phrase?.phrase === 'string' ? phrase.phrase : '')
            .filter(Boolean)
            .slice(0, 3)
        : []
      const repeatedPains = Array.isArray(record.repeatedPains)
        ? record.repeatedPains.map((value: unknown) => String(value || '').trim()).filter(Boolean).slice(0, 3)
        : []
      const conversationThemes = Array.isArray(record.conversationThemes)
        ? record.conversationThemes.map((value: unknown) => String(value || '').trim()).filter(Boolean).slice(0, 3)
        : []
      const representativeExample = String(record.representativeExample || '').trim() || null
      const contrarianTake = String(record.contrarianTake || '').trim() || null
      const fatigueSignal = String(record.fatigueSignal || '').trim() || null
      const sampleTweets = Array.isArray(record.sampleTweets)
        ? record.sampleTweets.map((value: unknown) => String(value || '').trim()).filter(Boolean).slice(0, 3)
        : []
      return {
        id: String(record.id || '').trim(),
        label: String(record.label || '').trim(),
        confidence: String(record.confidence || 'unknown').trim(),
        tweetCount: Number(record.tweetCount || 0),
        repeatedPains,
        repeatedPhrases,
        conversationThemes,
        representativeExample,
        contrarianTake,
        fatigueSignal,
        sampleTweets,
        whyItMatters: conversationThemes[0]
          ? conversationThemes[0]
          : repeatedPains[0]
            ? `Repeated pain around ${repeatedPains[0]}.`
            : repeatedPhrases[0]
              ? `Repeated language around ${repeatedPhrases[0]}.`
              : 'Directional external signal only.',
      }
    })
    .filter(Boolean)
  ) as Array<{
      id: string
      label: string
      confidence: string
      tweetCount: number
      repeatedPains: string[]
      repeatedPhrases: string[]
      conversationThemes: string[]
      representativeExample: string | null
      contrarianTake: string | null
      fatigueSignal: string | null
      sampleTweets: string[]
      whyItMatters: string
    }>

  const strong = normalized.filter((cluster) =>
    cluster.confidence !== 'low' &&
    (cluster.sampleTweets.length > 0 || cluster.conversationThemes.length > 0)
  )

  return (strong.length ? strong : normalized).slice(0, 3)
}

function normalizeSourceSamples(input: unknown, trendClusters?: unknown): string[] {
  if (Array.isArray(trendClusters)) {
    const curated: string[] = []
    for (const cluster of trendClusters) {
      if (!cluster || typeof cluster !== 'object') continue
      const sampleTweets = Array.isArray((cluster as Record<string, any>).sampleTweets)
        ? (cluster as Record<string, any>).sampleTweets
        : []
      for (const tweet of sampleTweets.slice(0, 2)) {
        const text = String(tweet || '').trim()
        if (text && !curated.includes(text)) curated.push(text)
        if (curated.length >= 4) return curated
      }
    }
    if (curated.length) return curated
  }

  if (!Array.isArray(input)) return []
  const samples: string[] = []
  for (const zone of input) {
    if (!zone || typeof zone !== 'object') continue
    const queries = Array.isArray((zone as Record<string, any>).queries) ? (zone as Record<string, any>).queries : []
    for (const query of queries) {
      if (!query || typeof query !== 'object') continue
      const tweets = Array.isArray((query as Record<string, any>).tweets) ? (query as Record<string, any>).tweets : []
      for (const tweet of tweets.slice(0, 2)) {
        if (!tweet || typeof tweet !== 'object') continue
        const text = String((tweet as Record<string, any>).text || '').trim()
        if (text) samples.push(text)
        if (samples.length >= 4) return samples
      }
    }
  }
  return samples
}

function normalizeGrowthStrategy(input: unknown): {
  accountStage?: string
  cadenceModel?: string
  distributionPriority: string[]
  primaryGoal: string
  contentMix: string[]
  engagementTactics: string[]
  editorialBias: string[]
  followerGrowthLoop: string[]
  targetAccountStrategy: string[]
  prioritizedAccounts: string[]
  todayBestMove?: {
    title: string
    distributionType: string
    primaryAction: string
    why: string
    sourceUrl: string
    sourceAccount: string
    clusterLabel: string
    confidence: string
  } | null
  weeklyMixRecommendation?: {
    targetMix: Array<{ type: string; share: string; reason: string }>
    availableOpportunityBalance: { reply: number; quote: number; original: number }
    currentBias: string
  } | null
  scheduleGuidance?: {
    recommendation: string
    timing: string
  } | null
  whyThisWeek: string[]
} | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  return {
    accountStage: String(record.accountStage || '').trim() || undefined,
    cadenceModel: String(record.cadenceModel || '').trim() || undefined,
    distributionPriority: Array.isArray(record.distributionPriority) ? record.distributionPriority.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    primaryGoal: String(record.primaryGoal || '').trim(),
    contentMix: Array.isArray(record.contentMix) ? record.contentMix.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    engagementTactics: Array.isArray(record.engagementTactics) ? record.engagementTactics.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    editorialBias: Array.isArray(record.editorialBias) ? record.editorialBias.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    followerGrowthLoop: Array.isArray(record.followerGrowthLoop) ? record.followerGrowthLoop.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    targetAccountStrategy: Array.isArray(record.targetAccountStrategy) ? record.targetAccountStrategy.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    prioritizedAccounts: Array.isArray(record.prioritizedAccounts) ? record.prioritizedAccounts.map((v) => String(v).trim()).filter(Boolean).slice(0, 6) : [],
    todayBestMove: record.todayBestMove && typeof record.todayBestMove === 'object'
      ? {
          title: String((record.todayBestMove as Record<string, unknown>).title || '').trim(),
          distributionType: String((record.todayBestMove as Record<string, unknown>).distributionType || '').trim(),
          primaryAction: String((record.todayBestMove as Record<string, unknown>).primaryAction || '').trim(),
          why: String((record.todayBestMove as Record<string, unknown>).why || '').trim(),
          sourceUrl: String((record.todayBestMove as Record<string, unknown>).sourceUrl || '').trim(),
          sourceAccount: String((record.todayBestMove as Record<string, unknown>).sourceAccount || '').trim(),
          clusterLabel: String((record.todayBestMove as Record<string, unknown>).clusterLabel || '').trim(),
          confidence: String((record.todayBestMove as Record<string, unknown>).confidence || '').trim(),
        }
      : null,
    weeklyMixRecommendation: record.weeklyMixRecommendation && typeof record.weeklyMixRecommendation === 'object'
      ? {
          targetMix: Array.isArray((record.weeklyMixRecommendation as Record<string, unknown>).targetMix)
            ? ((record.weeklyMixRecommendation as Record<string, unknown>).targetMix as Array<Record<string, unknown>>)
                .map((entry) => ({
                  type: String(entry?.type || '').trim(),
                  share: String(entry?.share || '').trim(),
                  reason: String(entry?.reason || '').trim(),
                }))
                .filter((entry) => entry.type && entry.share && entry.reason)
                .slice(0, 4)
            : [],
          availableOpportunityBalance: {
            reply: Number(((record.weeklyMixRecommendation as Record<string, any>).availableOpportunityBalance?.reply) || 0),
            quote: Number(((record.weeklyMixRecommendation as Record<string, any>).availableOpportunityBalance?.quote) || 0),
            original: Number(((record.weeklyMixRecommendation as Record<string, any>).availableOpportunityBalance?.original) || 0),
          },
          currentBias: String((record.weeklyMixRecommendation as Record<string, unknown>).currentBias || '').trim(),
        }
      : null,
    scheduleGuidance: record.scheduleGuidance && typeof record.scheduleGuidance === 'object'
      ? {
          recommendation: String((record.scheduleGuidance as Record<string, unknown>).recommendation || '').trim(),
          timing: String((record.scheduleGuidance as Record<string, unknown>).timing || '').trim(),
        }
      : null,
    whyThisWeek: Array.isArray(record.whyThisWeek) ? record.whyThisWeek.map((v) => String(v).trim()).filter(Boolean).slice(0, 3) : [],
  }
}

function normalizeEditorialMemory(input: unknown) {
  if (!input || typeof input !== 'object') {
    return {
      updatedAt: null,
      recentFeedback: [],
      archetypeStats: {},
    }
  }
  const record = input as Record<string, any>
  return {
    updatedAt: String(record.updatedAt || '').trim() || null,
    recentFeedback: Array.isArray(record.recentFeedback)
      ? record.recentFeedback
          .map((entry: any) => ({
            decision: String(entry?.decision || '').trim(),
            feedback: String(entry?.feedback || '').trim(),
            archetype: String(entry?.archetype || '').trim(),
            reviewedAtPt: String(entry?.reviewedAtPt || '').trim(),
          }))
          .filter((entry: { decision: string; feedback: string; archetype: string; reviewedAtPt: string }) => entry.feedback)
          .slice(-5)
      : [],
    archetypeStats: record.archetypeStats && typeof record.archetypeStats === 'object' ? record.archetypeStats : {},
  }
}

function normalizeGrowthTargets(input: unknown): {
  quoteTargets: Array<{ clusterLabel: string; why: string; url: string; text: string; author: string; likes: number; replies: number; followers: number }>
  replyTargets: Array<{ clusterLabel: string; why: string; url: string; text: string; author: string; likes: number; replies: number; followers: number }>
} {
  const normalizeList = (items: unknown) => {
    if (!Array.isArray(items)) return []
    return items
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const record = entry as Record<string, any>
        const source = record.source && typeof record.source === 'object' ? record.source as Record<string, any> : null
        const author = source?.author && typeof source.author === 'object' ? source.author as Record<string, any> : null
        const url = String(source?.url || '').trim()
        if (!url) return null
        return {
          clusterLabel: String(record.clusterLabel || '').trim(),
          why: String(record.why || '').trim(),
          url,
          text: String(source?.text || '').trim(),
          author: author?.username ? `@${String(author.username).trim()}` : String(author?.name || '').trim(),
          likes: Number(source?.public_metrics?.like_count || 0),
          replies: Number(source?.public_metrics?.reply_count || 0),
          followers: Number(author?.public_metrics?.followers_count || 0),
        }
      })
      .filter(Boolean)
      .slice(0, 4) as Array<{ clusterLabel: string; why: string; url: string; text: string; author: string; likes: number; replies: number; followers: number }>
  }

  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  return {
    quoteTargets: normalizeList(record.quoteTargets),
    replyTargets: normalizeList(record.replyTargets),
  }
}

function normalizeGrowthRecommendations(input: unknown): {
  bestForFollowerGrowth: string | null
  bestForBrandBuilding: string | null
  bestOriginalPost: string | null
} | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  return {
    bestForFollowerGrowth: record.bestForFollowerGrowth ? String(record.bestForFollowerGrowth) : null,
    bestForBrandBuilding: record.bestForBrandBuilding ? String(record.bestForBrandBuilding) : null,
    bestOriginalPost: record.bestOriginalPost ? String(record.bestOriginalPost) : null,
  }
}

function filterGrowthRecommendations(
  recommendations: {
    bestForFollowerGrowth: string | null
    bestForBrandBuilding: string | null
    bestOriginalPost: string | null
  } | null,
  draftCandidates: Array<Record<string, any>>,
) {
  if (!recommendations) return null
  const candidateIds = new Set(
    draftCandidates
      .map((entry) => String(entry?.id || '').trim())
      .filter(Boolean),
  )
  return {
    bestForFollowerGrowth: candidateIds.has(String(recommendations.bestForFollowerGrowth || '').trim())
      ? recommendations.bestForFollowerGrowth
      : null,
    bestForBrandBuilding: candidateIds.has(String(recommendations.bestForBrandBuilding || '').trim())
      ? recommendations.bestForBrandBuilding
      : null,
    bestOriginalPost: candidateIds.has(String(recommendations.bestOriginalPost || '').trim())
      ? recommendations.bestOriginalPost
      : null,
  }
}

function normalizeGrowthChangesSummary(input: unknown): {
  newCount: number
  retainedCount: number
  changedDraftIds: string[]
  feedbackEffects: string[]
} | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  return {
    newCount: Number(record.newCount || 0),
    retainedCount: Number(record.retainedCount || 0),
    changedDraftIds: Array.isArray(record.changedDraftIds) ? record.changedDraftIds.map((value) => String(value).trim()).filter(Boolean).slice(0, 10) : [],
    feedbackEffects: Array.isArray(record.feedbackEffects) ? record.feedbackEffects.map((value) => String(value).trim()).filter(Boolean).slice(0, 6) : [],
  }
}

function normalizeSourceCandidates(input: unknown): Array<{
  clusterLabel: string
  url: string
  text: string
  author: string
  likes: number
  replies: number
  followers: number
  score: number
}> {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const url = String(record.url || '').trim()
      if (!url) return null
      return {
        clusterLabel: String(record.clusterLabel || '').trim(),
        url,
        text: String(record.text || '').trim(),
        author: String(record.author || '').trim(),
        likes: Number(record.likes || 0),
        replies: Number(record.replies || 0),
        followers: Number(record.followers || 0),
        score: Number(record.score || 0),
      }
    })
    .filter(Boolean)
    .slice(0, 6) as Array<{
      clusterLabel: string
      url: string
      text: string
      author: string
      likes: number
      replies: number
      followers: number
      score: number
    }>
}

function normalizeAccountTargets(input: unknown): Array<{
  username: string
  followers: number
  verified: boolean
  why: string
  sourceUrl: string
  clusterLabel: string
  state?: string
  stateNote?: string
}> {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const username = String(record.username || '').trim()
      if (!username) return null
      return {
        username,
        followers: Number(record.followers || 0),
        verified: Boolean(record.verified),
        why: String(record.why || '').trim(),
        sourceUrl: String(record.sourceUrl || '').trim(),
        clusterLabel: String(record.clusterLabel || '').trim(),
        state: String(record.state || '').trim() || undefined,
        stateNote: String(record.reason || record.stateNote || '').trim() || undefined,
      }
    })
    .filter(Boolean)
    .slice(0, 6) as Array<{
      username: string
      followers: number
      verified: boolean
      why: string
      sourceUrl: string
      clusterLabel: string
    }>
}

function buildSourceMemoryAccountMap(input: unknown): Map<string, { state: string; updatedAt: string | null; note: string }> {
  if (!input || typeof input !== 'object') return new Map()
  const record = input as Record<string, any>
  const accounts = record.accounts && typeof record.accounts === 'object' ? record.accounts : {}
  const entries = Object.entries(accounts).map(([username, value]) => {
    const account = value as Record<string, unknown>
    return [
      String(username || '').replace(/^@/, '').trim().toLowerCase(),
      {
        state: String(account.state || 'watch').trim(),
        updatedAt: String(account.updatedAt || '').trim() || null,
        note: String(account.note || '').trim(),
      },
    ] as const
  }).filter(([username]) => Boolean(username))
  return new Map(entries)
}

function overlayAccountTargetsWithSourceMemory(
  targets: Array<{
    username: string
    followers: number
    verified: boolean
    why: string
    sourceUrl: string
    clusterLabel: string
    state?: string
    stateNote?: string
  }>,
  sourceMemory: unknown,
) {
  const memoryMap = buildSourceMemoryAccountMap(sourceMemory)
  return targets.map((target) => {
    const key = String(target.username || '').replace(/^@/, '').trim().toLowerCase()
    const memory = memoryMap.get(key)
    if (!memory) return target
    return {
      ...target,
      state: memory.state || target.state || 'watch',
      stateNote: memory.note || target.stateNote,
    }
  })
}

function normalizeWatchlistRecommendations(input: unknown): Array<{
  username: string
  clusterLabel: string
  why: string
  state: string
  stateUpdatedAt: string | null
  sourceUrl: string
  reason: string
}> {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const username = String(record.username || '').trim()
      if (!username) return null
      return {
        username,
        clusterLabel: String(record.clusterLabel || '').trim(),
        why: String(record.why || '').trim(),
        state: String(record.state || 'watch').trim(),
        stateUpdatedAt: String(record.stateUpdatedAt || '').trim() || null,
        sourceUrl: String(record.sourceUrl || '').trim(),
        reason: String(record.reason || '').trim(),
      }
    })
    .filter(Boolean)
    .slice(0, 8) as Array<{
      username: string
      clusterLabel: string
      why: string
      state: string
      stateUpdatedAt: string | null
      sourceUrl: string
      reason: string
    }>
}

function overlayWatchlistRecommendationsWithSourceMemory(
  recommendations: Array<{
    username: string
    clusterLabel: string
    why: string
    state: string
    stateUpdatedAt: string | null
    sourceUrl: string
    reason: string
  }>,
  sourceMemory: unknown,
) {
  const memoryMap = buildSourceMemoryAccountMap(sourceMemory)
  return recommendations.map((entry) => {
    const key = String(entry.username || '').replace(/^@/, '').trim().toLowerCase()
    const memory = memoryMap.get(key)
    if (!memory) return entry
    return {
      ...entry,
      state: memory.state || entry.state || 'watch',
      stateUpdatedAt: memory.updatedAt || entry.stateUpdatedAt,
      reason: memory.note || entry.reason,
    }
  })
}

function normalizeEditorialOpportunities(input: unknown): Array<{
  id: string
  title: string
  archetype: string
  sourceType: string
  whyNow: string
  brandFit: string
  supportingSignals: string[]
}> {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      return {
        id: String(record.id || '').trim(),
        title: String(record.title || '').trim(),
        archetype: String(record.archetype || '').trim(),
        sourceType: String(record.sourceType || '').trim(),
        whyNow: String(record.whyNow || '').trim(),
        brandFit: String(record.brandFit || '').trim(),
        supportingSignals: Array.isArray(record.supportingSignals) ? record.supportingSignals.map((value) => String(value).trim()).filter(Boolean).slice(0, 3) : [],
      }
    })
    .filter((entry) => entry && entry.id)
    .slice(0, 6) as Array<{
      id: string
      title: string
      archetype: string
      sourceType: string
      whyNow: string
      brandFit: string
      supportingSignals: string[]
    }>
}

function normalizeDraftCandidates(input: unknown): Array<Record<string, any>> {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = { ...(entry as Record<string, any>) }
      const status = String(record.status || '').trim().toLowerCase()
      const approval = String(record.approval || '').trim().toLowerCase()
      if (['approved', 'scheduled', 'published', 'archived', 'rejected'].includes(status)) return null
      if (['approved', 'scheduled', 'published', 'archived', 'rejected'].includes(approval)) return null
      return record
    })
    .filter(Boolean)
    .slice(0, 6) as Array<Record<string, any>>
}

function normalizeApprovedPosts(input: unknown): Array<{
  id: string
  text: string
  pillar: string
  angle: string
  status: string
  approvedAtPt: string
  scheduledAt?: string | null
  scheduledAtPt?: string | null
  scheduleSource?: string | null
  scheduleNote?: string | null
  distributionType?: string
  sourceType?: string
  selectionReason?: string
  tweetId?: string
  tweetUrl?: string | null
  publishStatus?: string
  publishError?: string
}> {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const text = String(record.text || '').trim()
      if (!text) return null
      return {
        id: String(record.id || '').trim(),
        text,
        pillar: String(record.pillar || '').trim(),
        angle: String(record.angle || '').trim(),
        status: String(record.status || 'approved').trim(),
        approvedAtPt: String(record.approved_at_pt || '').trim(),
        scheduledAt: String(record.scheduled_at || '').trim() || null,
        scheduledAtPt: String(record.scheduled_at_pt || '').trim() || null,
        scheduleSource: String(record.schedule_source || '').trim() || null,
        scheduleNote: String(record.schedule_note || '').trim() || null,
        distributionType: String(record.distribution_type || '').trim() || undefined,
        sourceType: String(record.source_type || '').trim() || undefined,
        selectionReason: String(record.selection_reason || '').trim() || undefined,
        tweetId: String(record.tweet_id || '').trim(),
        tweetUrl: String(record.tweet_url || '').trim() || (record.tweet_id ? `https://x.com/i/web/status/${record.tweet_id}` : null),
        publishStatus: String(record.publish_status || '').trim() || undefined,
        publishError: String(record.publish_error || '').trim() || undefined,
      }
    })
    .filter(Boolean)
    .slice(0, 5) as Array<{
      id: string
      text: string
      pillar: string
      angle: string
      status: string
      approvedAtPt: string
      scheduledAt?: string | null
      scheduledAtPt?: string | null
      scheduleSource?: string | null
      scheduleNote?: string | null
      distributionType?: string
      sourceType?: string
      selectionReason?: string
      tweetId?: string
      tweetUrl?: string | null
      publishStatus?: string
      publishError?: string
    }>
}

function normalizeResultsSummary(input: unknown): {
  postedCount: number
  syncedPostCount: number
  winningPillars: string[]
  winningSourceTypes: string[]
  winningDistributionTypes: string[]
  strategyNotes: string[]
  topPosts: Array<{ id: string; pillar: string; tweetUrl: string | null; engagementScore: number; distributionType: string; sourceType: string; sourceAccount: string | null }>
  winningSourceAccounts: string[]
} | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, any>
  const normalizeRankedKeys = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((entry: unknown) => {
            if (entry && typeof entry === 'object' && 'key' in (entry as Record<string, unknown>)) {
              return String((entry as Record<string, unknown>).key || '').trim()
            }
            return String(entry || '').trim()
          })
          .filter(Boolean)
      : []
  return {
    postedCount: Number(record.postedCount || 0),
    syncedPostCount: Number(record.syncedPostCount || 0),
    winningPillars: Array.isArray(record.winningPillars) ? record.winningPillars.map((v: unknown) => String(v)).filter(Boolean) : [],
    winningSourceTypes: normalizeRankedKeys(record.winningSourceTypes),
    winningDistributionTypes: normalizeRankedKeys(record.winningDistributionTypes),
    winningSourceAccounts: normalizeRankedKeys(record.winningSourceAccounts),
    strategyNotes: Array.isArray(record.strategyNotes) ? record.strategyNotes.map((v: unknown) => String(v)).filter(Boolean) : [],
    topPosts: Array.isArray(record.topPosts)
      ? record.topPosts.slice(0, 3).map((post: any) => ({
          id: String(post.id || ''),
          pillar: String(post.pillar || ''),
          tweetUrl: post.tweet_url || null,
          engagementScore: Number(post.engagementScore || 0),
          distributionType: String(post.distribution_type || ''),
          sourceType: String(post.source_type || ''),
          sourceAccount: String(post.source_tweet?.author?.username || '').trim() || null,
        }))
      : [],
  }
}

function normalizeStrategyMemory(input: unknown): {
  strategyNotes?: string[]
  accountStage?: string
  performance?: {
    postedCount?: number
    syncedPostCount?: number
    publishAttempts?: number
  }
  winningSourceTypes?: string[]
  winningDistributionTypes?: string[]
  winningArchetypes?: string[]
  winningSourceAccounts?: string[]
  timingBias?: string[]
} | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, any>
  const normalizeRankedKeys = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((entry: unknown) => {
            if (entry && typeof entry === 'object' && 'key' in (entry as Record<string, unknown>)) {
              return String((entry as Record<string, unknown>).key || '').trim()
            }
            return String(entry || '').trim()
          })
          .filter(Boolean)
      : []

  return {
    strategyNotes: ensureStringArray(record.strategyNotes, 8),
    accountStage: String(record.accountStage || '').trim() || undefined,
    performance: record.performance && typeof record.performance === 'object'
      ? {
          postedCount: Number((record.performance as Record<string, unknown>).postedCount || 0),
          syncedPostCount: Number((record.performance as Record<string, unknown>).syncedPostCount || 0),
          publishAttempts: Number((record.performance as Record<string, unknown>).publishAttempts || 0),
        }
      : undefined,
    winningSourceTypes: normalizeRankedKeys(record.winningSourceTypes).length
      ? normalizeRankedKeys(record.winningSourceTypes)
      : normalizeRankedKeys((record.performance as Record<string, unknown> | undefined)?.winningSourceTypes),
    winningDistributionTypes: normalizeRankedKeys(record.winningDistributionTypes).length
      ? normalizeRankedKeys(record.winningDistributionTypes)
      : normalizeRankedKeys((record.performance as Record<string, unknown> | undefined)?.winningDistributionTypes),
    winningArchetypes: normalizeRankedKeys(record.winningArchetypes).length
      ? normalizeRankedKeys(record.winningArchetypes)
      : normalizeRankedKeys((record.performance as Record<string, unknown> | undefined)?.winningArchetypes),
    winningSourceAccounts: normalizeRankedKeys(record.winningSourceAccounts).length
      ? normalizeRankedKeys(record.winningSourceAccounts)
      : normalizeRankedKeys((record.performance as Record<string, unknown> | undefined)?.winningSourceAccounts),
    timingBias: normalizeRankedKeys(record.timingBias).length
      ? normalizeRankedKeys(record.timingBias)
      : normalizeRankedKeys((record.performance as Record<string, unknown> | undefined)?.timingBias),
  }
}

function normalizeSourceMemory(input: unknown): {
  updatedAt: string | null
  rejectedSources: string[]
  rejectedClusters: string[]
  rejectedPhrases: string[]
  negativeStyleMarkers: string[]
  positiveStyleMarkers: string[]
  accounts: Array<{ username: string; state: string; updatedAt: string | null; note: string }>
} | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, any>
  const accounts = record.accounts && typeof record.accounts === 'object'
    ? Object.entries(record.accounts)
        .map(([username, value]) => {
          const account = value as Record<string, unknown>
          return {
            username: String(username).trim(),
            state: String(account.state || 'watch').trim(),
            updatedAt: String(account.updatedAt || '').trim() || null,
            note: String(account.note || '').trim(),
          }
        })
        .slice(0, 12)
    : []

  return {
    updatedAt: String(record.updatedAt || '').trim() || null,
    rejectedSources: ensureStringArray(record.rejectedSources, 8),
    rejectedClusters: ensureStringArray(record.rejectedClusters, 8),
    rejectedPhrases: ensureStringArray(record.rejectedPhrases, 8),
    negativeStyleMarkers: ensureStringArray(record.negativeStyleMarkers, 8),
    positiveStyleMarkers: ensureStringArray(record.positiveStyleMarkers, 8),
    accounts,
  }
}

function ensureStringArray(input: unknown, limit = 8): string[] {
  return Array.isArray(input) ? input.map((value) => String(value || '').trim()).filter(Boolean).slice(0, limit) : []
}

function summarizeRepeatedPains(entries: Array<{ problem?: string }>): string[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const key = String(entry.problem || '').trim().toLowerCase()
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([problem]) => problem)
}

function hasFounderApproval(metadata: Record<string, unknown>) {
  return Boolean(metadata.founder_approved_at || metadata.founder_approved_for_execution)
}

function hasAegisApproval(
  db: ReturnType<typeof getDatabase>,
  taskId: number,
  workspaceId: number,
) {
  const review = db.prepare(`
    SELECT status FROM quality_reviews
    WHERE task_id = ? AND reviewer = 'aegis' AND workspace_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId, workspaceId) as { status?: string } | undefined
  return review?.status === 'approved'
}

function loadTaskSnapshot(workspaceId: number) {
  const db = getDatabase()
  const activeTaskRows = db.prepare(`
    SELECT id, title, status, assigned_to, priority, updated_at, metadata
    FROM tasks
    WHERE workspace_id = ?
      AND lower(coalesce(assigned_to,'')) LIKE 'habi-%'
      AND status NOT IN ('done', 'cancelled')
  `).all(workspaceId) as Array<{
    id: number
    title: string
    status: string
    assigned_to: string | null
    priority: string
    updated_at: number
    metadata?: string | null
  }>
  const { visibleIds, duplicateFingerprintCount } = buildCanonicalVisibleTaskIds(activeTaskRows)
  const byStatus: Record<string, number> = {}
  let totalActive = 0
  for (const row of activeTaskRows) {
    if (!visibleIds.has(row.id)) continue
    byStatus[row.status] = (byStatus[row.status] || 0) + 1
    totalActive += 1
  }

  const topActive = activeTaskRows
    .filter((task) => visibleIds.has(task.id))
    .sort((left, right) => {
      const priorityOrder = (value: string) => {
        switch (value) {
          case 'urgent': return 0
          case 'critical': return 1
          case 'high': return 2
          case 'medium': return 3
          default: return 4
        }
      }
      const priorityDelta = priorityOrder(left.priority) - priorityOrder(right.priority)
      if (priorityDelta !== 0) return priorityDelta
      return right.updated_at - left.updated_at
    })
    .slice(0, 6)
    .map(({ id, title, status, assigned_to, priority, updated_at }) => ({
      id,
      title,
      status,
      assigned_to,
      priority,
      updated_at,
    }))

  const reviewQueueRows = db.prepare(`
    SELECT id, title, status, assigned_to, priority, updated_at
    FROM tasks
    WHERE workspace_id = ?
      AND lower(coalesce(assigned_to,'')) LIKE 'habi-%'
      AND status IN ('review', 'quality_review')
    ORDER BY
      CASE status
        WHEN 'quality_review' THEN 0
        ELSE 1
      END,
      CASE priority
        WHEN 'urgent' THEN 0
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      updated_at DESC
    LIMIT 5
  `).all(workspaceId) as Array<{
    id: number
    title: string
    status: string
    assigned_to: string | null
    priority: string
    updated_at: number
  }>

  const reviewQueue = reviewQueueRows
    .filter((task) => visibleIds.has(task.id))
    .map((task) => ({
    ...task,
    aegisApproved: hasAegisApproval(db, task.id, workspaceId),
  }))

  const approvalQueueRows = db.prepare(`
    SELECT id, title, status, assigned_to, priority, updated_at
    FROM tasks
    WHERE workspace_id = ?
      AND lower(coalesce(assigned_to,'')) LIKE 'habi-%'
      AND (
        status IN ('review', 'quality_review')
        OR (
          status = 'assigned'
          AND coalesce(json_extract(metadata, '$.origin_lane'), '') != 'growth'
          AND coalesce(json_extract(metadata, '$.execution_mode'), '') IN ('audit_only', 'draft_pr')
          AND coalesce(json_extract(metadata, '$.disposition'), '') IN ('execute_now', 'founder_decision_needed')
          AND coalesce(json_extract(metadata, '$.founder_approved_for_execution'), 0) != 1
          AND coalesce(json_extract(metadata, '$.founder_approved_at'), '') = ''
        )
      )
    ORDER BY
      CASE
        WHEN status = 'quality_review' THEN 0
        WHEN status = 'review' THEN 1
        WHEN coalesce(json_extract(metadata, '$.disposition'), '') = 'founder_decision_needed' THEN 2
        ELSE 3
      END,
      CASE priority
        WHEN 'urgent' THEN 0
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      updated_at DESC
    LIMIT 8
  `).all(workspaceId) as Array<{
    id: number
    title: string
    status: string
    assigned_to: string | null
    priority: string
    updated_at: number
  }>

  const approvalCandidates = approvalQueueRows
    .filter((task) => visibleIds.has(task.id))
    .map((task) => {
    const metadata = db.prepare(`
      SELECT metadata FROM tasks
      WHERE id = ? AND workspace_id = ?
      LIMIT 1
    `).get(task.id, workspaceId) as { metadata?: string } | undefined
    let parsedMetadata: Record<string, unknown> = {}
    try {
      parsedMetadata = metadata?.metadata ? JSON.parse(metadata.metadata) : {}
    } catch {
      parsedMetadata = {}
    }
    return {
      ...task,
      aegisApproved: hasAegisApproval(db, task.id, workspaceId),
      disposition: String(parsedMetadata.disposition || ''),
      executionMode: String(parsedMetadata.execution_mode || ''),
      waitingOnQc: Boolean(parsedMetadata.waiting_on_qc),
      liveInMain: parsedMetadata.live_in_main === true,
      liveApprovalExempt: parsedMetadata.live_approval_exempt === true,
    }
  })

  const approvalQueue = approvalCandidates.filter((task) => {
    if (task.status === 'quality_review') return task.aegisApproved && (task.liveInMain || task.liveApprovalExempt)
    if (task.status === 'review') return !task.waitingOnQc
    return true
  })
  const waitingOnQcQueue = approvalCandidates.filter((task) => {
    if (task.status === 'quality_review' && !task.aegisApproved) return true
    if (task.status === 'review' && task.waitingOnQc) return true
    return false
  })

  const appFinishTaskRows = db.prepare(`
    SELECT id, title, status, assigned_to, priority, updated_at, metadata
    FROM tasks
    WHERE workspace_id = ?
      AND lower(coalesce(assigned_to,'')) LIKE 'habi-%'
      AND status NOT IN ('done', 'cancelled')
      AND coalesce(json_extract(metadata, '$.origin_lane'), '') != 'growth'
      AND coalesce(json_extract(metadata, '$.execution_mode'), '') IN ('audit_only', 'draft_pr')
    ORDER BY
      CASE priority
        WHEN 'urgent' THEN 0
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      updated_at DESC
  `).all(workspaceId) as Array<{
    id: number
    title: string
    status: string
    assigned_to: string | null
    priority: string
    updated_at: number
    metadata?: string | null
  }>
  const canonicalAppFinishTaskRows = appFinishTaskRows.filter((task) => visibleIds.has(task.id))

  const appFinishQueue = canonicalAppFinishTaskRows
    .filter((task) => !['review', 'quality_review'].includes(task.status))
    .slice(0, 8)
    .map((task) => {
      let metadata: Record<string, unknown> = {}
      try {
        metadata = task.metadata ? JSON.parse(task.metadata) : {}
      } catch {
        metadata = {}
      }
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        assigned_to: task.assigned_to,
        priority: task.priority,
        updated_at: task.updated_at,
        founderApproved: hasFounderApproval(metadata),
      }
    })

  const appFinishTaskIds = canonicalAppFinishTaskRows.map((task) => task.id)
  const commentRows = appFinishTaskIds.length
    ? db.prepare(`
      SELECT task_id, author, content, created_at
      FROM comments
      WHERE workspace_id = ?
        AND task_id IN (${appFinishTaskIds.map(() => '?').join(',')})
      ORDER BY created_at DESC
    `).all(workspaceId, ...appFinishTaskIds) as Array<{
      task_id: number
      author: string
      content: string
      created_at: number
    }>
    : []

  const commentsByTask = new Map<number, Array<{ author: string; content: string; created_at: number }>>()
  for (const row of commentRows) {
    const bucket = commentsByTask.get(row.task_id) || []
    bucket.push(row)
    commentsByTask.set(row.task_id, bucket)
  }

  const staleCutoff = Math.floor(Date.now() / 1000) - (4 * 60 * 60)
  const appFinishHealth = canonicalAppFinishTaskRows.map((task) => {
    let metadata: Record<string, unknown> = {}
    try {
      metadata = task.metadata ? JSON.parse(task.metadata) : {}
    } catch {
      metadata = {}
    }
    const comments = commentsByTask.get(task.id) || []
    const kickoffSeen = comments.some((comment) => isKickoffComment(comment.content))
    const progressSeen = comments.some((comment) => isExecutionProgressComment(comment.content))
    const evidencePath = String(metadata.evidence_path || '').trim()
    const worktreePath = String(metadata.worktree_path || '').trim()
    const executionMode = String(metadata.execution_mode || '').trim()
    const blockedReason = String(metadata.blocked_reason || '').trim()
    const founderApproved = hasFounderApproval(metadata)
    const waitingOnForeman = Boolean(metadata.waiting_on_foreman)
    const staleAssigned = Boolean(metadata.stale_assigned)
    const waitingOnQc = Boolean(metadata.waiting_on_qc)
    const sentBackByQc = Boolean(metadata.sent_back_by_qc)
    const evidenceExists = evidencePath ? existsSync(evidencePath) : false
    const worktreeExists =
      executionMode === 'draft_pr'
        ? Boolean(worktreePath) && existsSync(path.join(worktreePath, '.git'))
        : true
    const latestCommentAt = comments.reduce((latest, comment) => Math.max(latest, comment.created_at), 0)
    const stalled =
      task.status === 'in_progress' &&
      kickoffSeen &&
      !blockedReason &&
      !progressSeen &&
      Math.max(task.updated_at, latestCommentAt) < staleCutoff

    return {
      taskId: task.id,
      status: task.status,
      blockedReason,
      kickoffSeen,
      progressSeen,
      evidenceExists,
      worktreeExists,
      stalled,
      founderApproved,
      waitingOnForeman,
      staleAssigned,
      waitingOnQc,
      sentBackByQc,
    }
  })

  return {
    totalActive,
    byStatus,
    awaitingReview: approvalQueue.length,
    readyForFounderDecision: approvalQueue.length,
    topActive,
    reviewQueue,
    approvalQueue,
    waitingOnQcQueue,
    appFinishQueue,
    duplicateFingerprintCount,
    appFinishCounts: {
      active: canonicalAppFinishTaskRows.length,
      blockedByFounder: appFinishHealth.filter((task) => task.status === 'assigned' && !task.founderApproved).length,
      blockedByEvidence: appFinishHealth.filter((task) =>
        ['in_progress', 'review', 'quality_review'].includes(task.status) &&
        (task.blockedReason || !task.evidenceExists || !task.worktreeExists)
      ).length,
      waitingOnKickoff: appFinishHealth.filter((task) => task.status === 'in_progress' && !task.kickoffSeen).length,
      stalledInProgress: appFinishHealth.filter((task) => task.stalled).length,
      waitingOnForeman: appFinishHealth.filter((task) => task.waitingOnForeman).length,
      waitingOnQc: appFinishHealth.filter((task) => task.waitingOnQc).length,
      sentBackByQc: appFinishHealth.filter((task) => task.sentBackByQc).length,
      staleAssigned: appFinishHealth.filter((task) => task.staleAssigned).length,
    },
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const latestPacketPath = await findLatestFounderPacketPath(FOUNDER_PACKET_ROOT)
    const packet = latestPacketPath ? await readJsonOrNull<any>(latestPacketPath) : null
    const signalLedger = (await readJsonOrNull<any[]>(SIGNAL_LEDGER_PATH)) || []
    const productProofLedger = (await readJsonOrNull<any[]>(PRODUCT_PROOF_PATH)) || []
    const adoption = await readJsonOrNull<any>(ADOPTION_SCORECARD_PATH)
    const latestGrowthWeek = await findLatestGrowthWeek(GROWTH_WEEKS_ROOT)
    const growthPaths = latestGrowthWeek
      ? {
          researchBriefPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'research-brief.json'),
          draftPackPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'draft-pack.json'),
          scorecardPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'scorecard.json'),
          approvedPostsPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'approved-posts.json'),
          resultsSummaryPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'results-summary.json'),
          strategyMemoryPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'strategy-memory.json'),
          editorialMemoryPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'editorial-memory.json'),
          sourceMemoryPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'source-memory.json'),
          publishLogPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'publish-log.json'),
        }
      : null
    const growthResearch = growthPaths ? await readJsonOrNull<any>(growthPaths.researchBriefPath) : null
    const growthDraftPack = growthPaths ? await readJsonOrNull<any>(growthPaths.draftPackPath) : null
    const growthScorecard = growthPaths ? await readJsonOrNull<any>(growthPaths.scorecardPath) : null
    const growthApprovedPosts = growthPaths ? await readJsonOrNull<any>(growthPaths.approvedPostsPath) : null
    const growthResultsSummary = growthPaths ? await readJsonOrNull<any>(growthPaths.resultsSummaryPath) : null
    const growthStrategyMemory = growthPaths ? await readJsonOrNull<any>(growthPaths.strategyMemoryPath) : null
    const growthEditorialMemory = growthPaths ? await readJsonOrNull<any>(growthPaths.editorialMemoryPath) : null
    const growthSourceMemory = growthPaths ? await readJsonOrNull<any>(growthPaths.sourceMemoryPath) : null
    const growthPublishLog = growthPaths ? await readJsonOrNull<any>(growthPaths.publishLogPath) : null
    const repeatedPains = summarizeRepeatedPains(signalLedger)
    const workspaceId = auth.user.workspace_id ?? 1
    const taskSnapshot = loadTaskSnapshot(workspaceId)
    const productionTruth = await loadProductionTruth(workspaceId)

    const normalizedSourceMemory = normalizeSourceMemory(growthSourceMemory)
    const normalizedAccountTargets = overlayAccountTargetsWithSourceMemory(
      normalizeAccountTargets(growthResearch?.accountTargets),
      growthSourceMemory,
    )
    const normalizedWatchlistRecommendations = overlayWatchlistRecommendationsWithSourceMemory(
      normalizeWatchlistRecommendations(growthResearch?.watchlistRecommendations),
      growthSourceMemory,
    )

    const normalizedDraftCandidates = normalizeDraftCandidates(growthDraftPack?.drafts)
    const normalizedRecommendations = filterGrowthRecommendations(
      normalizeGrowthRecommendations(growthDraftPack?.recommendations),
      normalizedDraftCandidates,
    )

    return NextResponse.json({
      hasPacket: Boolean(packet),
      latestPacketPath,
      packet,
      adoption,
      signals: {
        total: signalLedger.length,
        repeatedPainCount: repeatedPains.length,
        repeatedPains,
        latest: signalLedger.slice(-5).reverse(),
        ledgerPath: SIGNAL_LEDGER_PATH,
      },
      productProof: {
        total: productProofLedger.length,
        latest: productProofLedger.slice(-5).reverse(),
        ledgerPath: PRODUCT_PROOF_PATH,
      },
      growth: {
        week: latestGrowthWeek,
        researchBriefPath: growthPaths?.researchBriefPath ?? null,
        draftPackPath: growthPaths?.draftPackPath ?? null,
        scorecardPath: growthPaths?.scorecardPath ?? null,
        researchGeneratedAt: growthResearch?.generatedAt ?? null,
        draftPackGeneratedAt: growthDraftPack?.generatedAt ?? null,
        externalStatus: String(growthResearch?.externalStatus || 'missing'),
        freshness: growthResearch?.freshness || null,
        researchSignals: normalizeGrowthResearchSignals(growthResearch?.signals),
        strategy: normalizeGrowthStrategy(growthResearch?.growthStrategy),
        strategyMemory: normalizeStrategyMemory(growthStrategyMemory),
        editorialMemory: normalizeEditorialMemory(growthEditorialMemory),
        sourceMemory: normalizedSourceMemory,
        engagementTargets: normalizeGrowthTargets(growthResearch?.engagementTargets),
        sourceCandidates: normalizeSourceCandidates(growthResearch?.sourceCandidates),
        accountTargets: normalizedAccountTargets,
        watchlistRecommendations: normalizedWatchlistRecommendations,
        editorialOpportunities: normalizeEditorialOpportunities(growthResearch?.editorialOpportunities || growthResearch?.opportunities),
        listeningDiagnostics: growthResearch?.listeningDiagnostics || null,
        trendClusters: normalizeTrendClusters(growthResearch?.trendClusters),
        sourceSamples: normalizeSourceSamples(growthResearch?.sourceSamples, growthResearch?.trendClusters),
        draftCandidates: normalizedDraftCandidates,
        recommendations: normalizedRecommendations,
        changesSummary: normalizeGrowthChangesSummary(growthDraftPack?.changesSummary),
        approvedPosts: normalizeApprovedPosts(growthApprovedPosts),
        resultsSummary: normalizeResultsSummary(growthResultsSummary),
        publishLog: Array.isArray(growthPublishLog) ? growthPublishLog.slice(-5).reverse() : [],
        scorecard: growthScorecard,
      },
      tasks: {
        ...taskSnapshot,
        productionTruth,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'Founder packet API error')
    return NextResponse.json({ error: 'Failed to load founder packet' }, { status: 500 })
  }
}
