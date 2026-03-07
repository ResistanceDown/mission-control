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
  primaryGoal: string
  contentMix: string[]
  engagementTactics: string[]
  editorialBias: string[]
  followerGrowthLoop: string[]
  targetAccountStrategy: string[]
  whyThisWeek: string[]
} | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  return {
    primaryGoal: String(record.primaryGoal || '').trim(),
    contentMix: Array.isArray(record.contentMix) ? record.contentMix.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    engagementTactics: Array.isArray(record.engagementTactics) ? record.engagementTactics.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    editorialBias: Array.isArray(record.editorialBias) ? record.editorialBias.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    followerGrowthLoop: Array.isArray(record.followerGrowthLoop) ? record.followerGrowthLoop.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    targetAccountStrategy: Array.isArray(record.targetAccountStrategy) ? record.targetAccountStrategy.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
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

function normalizeApprovedPosts(input: unknown): Array<{
  id: string
  text: string
  pillar: string
  angle: string
  status: string
  approvedAtPt: string
  tweetId?: string
  tweetUrl?: string | null
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
        tweetId: String(record.tweet_id || '').trim(),
        tweetUrl: record.tweet_id ? `https://x.com/i/web/status/${record.tweet_id}` : null,
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
      tweetId?: string
      tweetUrl?: string | null
    }>
}

function normalizeResultsSummary(input: unknown): {
  postedCount: number
  winningPillars: string[]
  strategyNotes: string[]
  topPosts: Array<{ id: string; pillar: string; tweetUrl: string | null; engagementScore: number }>
} | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, any>
  return {
    postedCount: Number(record.postedCount || 0),
    winningPillars: Array.isArray(record.winningPillars) ? record.winningPillars.map((v: unknown) => String(v)).filter(Boolean) : [],
    strategyNotes: Array.isArray(record.strategyNotes) ? record.strategyNotes.map((v: unknown) => String(v)).filter(Boolean) : [],
    topPosts: Array.isArray(record.topPosts)
      ? record.topPosts.slice(0, 3).map((post: any) => ({
          id: String(post.id || ''),
          pillar: String(post.pillar || ''),
          tweetUrl: post.tweet_url || null,
          engagementScore: Number(post.engagementScore || 0),
        }))
      : [],
  }
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
  const statusRows = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM tasks
    WHERE workspace_id = ?
      AND lower(coalesce(assigned_to,'')) LIKE 'habi-%'
      AND status NOT IN ('done', 'cancelled')
    GROUP BY status
  `).all(workspaceId) as Array<{ status: string; count: number }>

  const byStatus: Record<string, number> = {}
  let totalActive = 0
  for (const row of statusRows) {
    byStatus[row.status] = row.count
    totalActive += row.count
  }

  const topActive = db.prepare(`
    SELECT id, title, status, assigned_to, priority, updated_at
    FROM tasks
    WHERE workspace_id = ?
      AND lower(coalesce(assigned_to,'')) LIKE 'habi-%'
      AND status NOT IN ('done', 'cancelled')
    ORDER BY
      CASE priority
        WHEN 'urgent' THEN 0
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      updated_at DESC
    LIMIT 6
  `).all(workspaceId) as Array<{
    id: number
    title: string
    status: string
    assigned_to: string | null
    priority: string
      updated_at: number
  }>

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

  const reviewQueue = reviewQueueRows.map((task) => ({
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

  const approvalCandidates = approvalQueueRows.map((task) => {
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

  const appFinishQueue = appFinishTaskRows
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

  const appFinishTaskIds = appFinishTaskRows.map((task) => task.id)
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
  const appFinishHealth = appFinishTaskRows.map((task) => {
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
    appFinishCounts: {
      active: appFinishTaskRows.length,
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
        }
      : null
    const growthResearch = growthPaths ? await readJsonOrNull<any>(growthPaths.researchBriefPath) : null
    const growthDraftPack = growthPaths ? await readJsonOrNull<any>(growthPaths.draftPackPath) : null
    const growthScorecard = growthPaths ? await readJsonOrNull<any>(growthPaths.scorecardPath) : null
    const growthApprovedPosts = growthPaths ? await readJsonOrNull<any>(growthPaths.approvedPostsPath) : null
    const growthResultsSummary = growthPaths ? await readJsonOrNull<any>(growthPaths.resultsSummaryPath) : null
    const growthStrategyMemory = growthPaths ? await readJsonOrNull<any>(growthPaths.strategyMemoryPath) : null
    const growthEditorialMemory = growthPaths ? await readJsonOrNull<any>(growthPaths.editorialMemoryPath) : null
    const repeatedPains = summarizeRepeatedPains(signalLedger)
    const workspaceId = auth.user.workspace_id ?? 1

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
        strategyMemory: growthStrategyMemory || null,
        editorialMemory: normalizeEditorialMemory(growthEditorialMemory),
        engagementTargets: normalizeGrowthTargets(growthResearch?.engagementTargets),
        sourceCandidates: normalizeSourceCandidates(growthResearch?.sourceCandidates),
        accountTargets: normalizeAccountTargets(growthResearch?.accountTargets),
        editorialOpportunities: normalizeEditorialOpportunities(growthResearch?.editorialOpportunities || growthResearch?.opportunities),
        trendClusters: normalizeTrendClusters(growthResearch?.trendClusters),
        sourceSamples: normalizeSourceSamples(growthResearch?.sourceSamples, growthResearch?.trendClusters),
        draftCandidates: Array.isArray(growthDraftPack?.drafts) ? growthDraftPack.drafts.slice(0, 5) : [],
        recommendations: normalizeGrowthRecommendations(growthDraftPack?.recommendations),
        changesSummary: normalizeGrowthChangesSummary(growthDraftPack?.changesSummary),
        approvedPosts: normalizeApprovedPosts(growthApprovedPosts),
        resultsSummary: normalizeResultsSummary(growthResultsSummary),
        scorecard: growthScorecard,
      },
      tasks: loadTaskSnapshot(workspaceId),
    })
  } catch (error) {
    logger.error({ err: error }, 'Founder packet API error')
    return NextResponse.json({ error: 'Failed to load founder packet' }, { status: 500 })
  }
}
