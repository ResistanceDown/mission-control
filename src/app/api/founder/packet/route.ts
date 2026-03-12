import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { classifyFounderTaskState, hasFounderApproval } from '@/lib/habi-founder-state'
import { logger } from '@/lib/logger'
import { isExecutionProgressComment, isKickoffComment } from '@/lib/habi-task-execution'

const HABI_ROOT = process.env.HABI_ROOT || '/Users/kokoro/Coding/Habi'
const FOUNDER_PACKET_ROOT = path.join(HABI_ROOT, 'output', 'founder', 'daily')
const SIGNAL_LEDGER_PATH = path.join(HABI_ROOT, 'output', 'founder', 'customer-signal-ledger.json')
const PRODUCT_PROOF_PATH = path.join(HABI_ROOT, 'output', 'founder', 'product-proof-ledger.json')
const ADOPTION_SCORECARD_PATH = path.join(HABI_ROOT, 'output', 'revenue', 'revenue-escape-scorecard.json')
const GROWTH_WEEKS_ROOT = path.join(HABI_ROOT, 'output', 'growth', 'weeks')
const GROWTH_FOLLOW_LOG_PATH = path.join(HABI_ROOT, 'output', 'growth', 'follow-log.json')

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

function resolveOperationalWeekName() {
  const week1Start = new Date('2026-03-02T00:00:00-08:00')
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value || '2026')
  const month = Number(parts.find((part) => part.type === 'month')?.value || '3')
  const day = Number(parts.find((part) => part.type === 'day')?.value || '2')
  const localMidnight = new Date(Date.UTC(year, month - 1, day, 8, 0, 0))
  const weekday = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).format(localMidnight)
    .replace('Sun', '0').replace('Mon', '1').replace('Tue', '2').replace('Wed', '3').replace('Thu', '4').replace('Fri', '5').replace('Sat', '6'))
  const monday = new Date(localMidnight)
  monday.setUTCDate(monday.getUTCDate() - ((weekday + 6) % 7))
  const diffMs = monday.getTime() - week1Start.getTime()
  const week = Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1)
  return `week-${week}`
}

async function resolveGrowthWeek(root: string): Promise<string | null> {
  const currentWeek = resolveOperationalWeekName()
  try {
    const stat = await fs.stat(path.join(root, currentWeek))
    if (stat.isDirectory()) return currentWeek
  } catch {
    // fall back to highest existing week
  }
  return findLatestGrowthWeek(root)
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
  orphanCount: number
  reconciledCount: number
  whatChangedSinceLastRun: string[]
} | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  return {
    newCount: Number(record.newCount || 0),
    retainedCount: Number(record.retainedCount || 0),
    changedDraftIds: Array.isArray(record.changedDraftIds) ? record.changedDraftIds.map((value) => String(value).trim()).filter(Boolean).slice(0, 10) : [],
    feedbackEffects: Array.isArray(record.feedbackEffects) ? record.feedbackEffects.map((value) => String(value).trim()).filter(Boolean).slice(0, 6) : [],
    orphanCount: Number(record.orphanCount || 0),
    reconciledCount: Number(record.reconciledCount || 0),
    whatChangedSinceLastRun: Array.isArray(record.whatChangedSinceLastRun) ? record.whatChangedSinceLastRun.map((value) => String(value).trim()).filter(Boolean).slice(0, 8) : [],
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

function normalizeSelectedOpportunities(input: unknown): Array<{
  id: string
  opportunityId: string
  title: string
  distributionType: string
  sourceType: string
  sourceState: string
  sourceFamilyKey: string
  sourceUrl: string | null
  sourceAccount: string
  sourceText: string
  clusterId: string | null
  clusterLabel: string
  whyNow: string
  audienceFit: string
  brandFit: string
  growthScore: number
  brandScore: number
  timelinessScore: number
  confidence: string
  selectionReason: string
  selectionFactors: string[]
  sourceSeenCount: number
  accountSeenCount: number
  clusterSeenCount: number
  accountState: string
  replyEligible: boolean
  blockedReason?: string
  suppressionReason?: string
  supportingSignals: string[]
}> {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const id = String(record.id || '').trim()
      if (!id) return null
      return {
        id,
        opportunityId: String(record.opportunityId || id).trim(),
        title: String(record.title || '').trim(),
        distributionType: String(record.distributionType || '').trim(),
        sourceType: String(record.sourceType || '').trim(),
        sourceState: String(record.sourceState || 'available').trim(),
        sourceFamilyKey: String(record.sourceFamilyKey || '').trim(),
        sourceUrl: String(record.sourceUrl || '').trim() || null,
        sourceAccount: String(record.sourceAccount || '').trim(),
        sourceText: String(record.sourceText || '').trim(),
        clusterId: String(record.clusterId || '').trim() || null,
        clusterLabel: String(record.clusterLabel || '').trim(),
        whyNow: String(record.whyNow || '').trim(),
        audienceFit: String(record.audienceFit || '').trim(),
        brandFit: String(record.brandFit || '').trim(),
        growthScore: Number(record.growthScore || 0),
        brandScore: Number(record.brandScore || 0),
        timelinessScore: Number(record.timelinessScore || 0),
        confidence: String(record.confidence || '').trim(),
        selectionReason: String(record.selectionReason || '').trim(),
        selectionFactors: Array.isArray(record.selectionFactors) ? record.selectionFactors.map((value) => String(value).trim()).filter(Boolean).slice(0, 5) : [],
        sourceSeenCount: Number(record.sourceSeenCount || 0),
        accountSeenCount: Number(record.accountSeenCount || 0),
        clusterSeenCount: Number(record.clusterSeenCount || 0),
        accountState: String(record.accountState || 'available').trim(),
        replyEligible: Boolean(record.replyEligible),
        blockedReason: String(record.blockedReason || '').trim() || undefined,
        suppressionReason: String(record.suppressionReason || '').trim() || undefined,
        supportingSignals: Array.isArray(record.supportingSignals) ? record.supportingSignals.map((value) => String(value).trim()).filter(Boolean).slice(0, 4) : [],
      }
    })
    .filter(Boolean)
    .slice(0, 16) as Array<{
      id: string
      opportunityId: string
      title: string
      distributionType: string
      sourceType: string
      sourceState: string
      sourceFamilyKey: string
      sourceUrl: string | null
      sourceAccount: string
      sourceText: string
      clusterId: string | null
      clusterLabel: string
      whyNow: string
      audienceFit: string
      brandFit: string
      growthScore: number
      brandScore: number
      timelinessScore: number
      confidence: string
      selectionReason: string
      selectionFactors: string[]
      sourceSeenCount: number
      accountSeenCount: number
      clusterSeenCount: number
      accountState: string
      replyEligible: boolean
      blockedReason?: string
      suppressionReason?: string
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

function growthOpportunityFamilyKey(opportunity: Record<string, any>) {
  const explicit = String(opportunity.sourceFamilyKey || '').trim().toLowerCase()
  if (explicit) return explicit
  const distributionType = String(opportunity.distributionType || '').trim().toLowerCase() || 'original'
  const sourceUrl = String(opportunity.sourceUrl || '').trim().toLowerCase()
  if (sourceUrl) return `${distributionType}::${sourceUrl}`
  const opportunityId = String(opportunity.opportunityId || opportunity.id || '').trim().toLowerCase()
  return opportunityId ? `${distributionType}::${opportunityId}` : ''
}

function growthDraftFamilyKey(draft: Record<string, any>) {
  const explicit = String(draft.variant_family_id || '').trim().toLowerCase()
  if (explicit) return explicit
  const distributionType = String(draft.distribution_type || '').trim().toLowerCase() || 'original'
  const sourceUrl = String(draft.source_tweet?.url || draft.source_url || draft.source_tweet_url || '').trim().toLowerCase()
  if (sourceUrl) return `${distributionType}::${sourceUrl}`
  const opportunityId = String(draft.opportunity_id || '').trim().toLowerCase()
  return opportunityId ? `${distributionType}::${opportunityId}` : ''
}


function filterConsumedGrowthOpportunities(
  opportunities: Array<Record<string, any>>,
  approvedPosts: Array<Record<string, any>>,
) {
  const consumedFamilies = new Set(
    approvedPosts
      .map((post) => String(post.variantFamilyId || post.variant_family_id || '').trim().toLowerCase())
      .filter(Boolean),
  )
  if (!consumedFamilies.size) return opportunities
  return opportunities.filter((opportunity) => !consumedFamilies.has(growthOpportunityFamilyKey(opportunity)))
}

function reconcileGrowthDraftCandidates(
  selectedOpportunities: Array<Record<string, any>>,
  draftCandidates: Array<Record<string, any>>,
  approvedPosts: Array<Record<string, any>>,
) {
  const selectedByFamily = new Map<string, Record<string, any>>()
  for (const opportunity of selectedOpportunities) {
    const familyKey = growthOpportunityFamilyKey(opportunity)
    if (!familyKey) continue
    selectedByFamily.set(familyKey, opportunity)
  }

  const consumedFamilies = new Set(
    approvedPosts
      .map((post) => String(post.variantFamilyId || post.variant_family_id || '').trim().toLowerCase())
      .filter(Boolean),
  )

  const seenTextsByFamily = new Map<string, Set<string>>()
  const familyCounts = new Map<string, number>()
  let orphanCount = 0
  let consumedCount = 0
  let prunedVariantCount = 0
  const reconciled = []

  for (const draft of draftCandidates) {
    const familyKey = growthDraftFamilyKey(draft)
    const selected = selectedByFamily.get(familyKey)
    if (!selected) {
      orphanCount += 1
      continue
    }
    if (consumedFamilies.has(familyKey)) {
      consumedCount += 1
      continue
    }

    const maxVariants = selected.distributionType === 'reply' || selected.distributionType === 'quote' ? 2 : 1
    const currentCount = familyCounts.get(familyKey) || 0
    const normalizedText = String(draft.text || '').trim().toLowerCase()
    const seenTexts = seenTextsByFamily.get(familyKey) || new Set<string>()
    if ((normalizedText && seenTexts.has(normalizedText)) || currentCount >= maxVariants) {
      prunedVariantCount += 1
      continue
    }

    if (normalizedText) seenTexts.add(normalizedText)
    seenTextsByFamily.set(familyKey, seenTexts)
    familyCounts.set(familyKey, currentCount + 1)

    reconciled.push({
      ...draft,
      opportunity_id: draft.opportunity_id || selected.opportunityId || selected.id,
      variant_family_id: familyKey || draft.variant_family_id,
      source_state: draft.source_state || selected.sourceState || 'available',
    })
  }

  return {
    draftCandidates: reconciled.slice(0, 12),
    integrity: {
      selectedOpportunityCount: selectedOpportunities.length,
      draftCandidateCount: reconciled.length,
      orphanDraftCount: orphanCount,
      consumedDraftCount: consumedCount,
      prunedVariantCount,
    },
  }
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
  publishError?: string | null
}> {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const text = String(record.text || '').trim()
      if (!text) return null
      const rawStatus = String(record.status || 'approved').trim()
      const publishStatus = String(record.publish_status || '').trim().toLowerCase()
      const hasPublishedArtifact = Boolean(
        String(record.tweet_url || '').trim() ||
        String(record.tweet_id || '').trim(),
      )
      const status =
        publishStatus === 'published' || (hasPublishedArtifact && String(record.posted_at || '').trim())
          ? 'published'
          : publishStatus === 'failed' && rawStatus !== 'published'
            ? 'failed'
            : rawStatus
      return {
        id: String(record.id || '').trim(),
        text,
        pillar: String(record.pillar || '').trim(),
        angle: String(record.angle || '').trim(),
        status,
        approvedAtPt: String(record.approved_at_pt || '').trim(),
        scheduledAt: String(record.scheduled_at || '').trim() || null,
        scheduledAtPt: String(record.scheduled_at_pt || '').trim() || null,
        scheduleSource: String(record.schedule_source || '').trim() || null,
        scheduleNote: String(record.schedule_note || '').trim() || null,
        variantFamilyId: String(record.variant_family_id || '').trim() || null,
        distributionType: String(record.distribution_type || '').trim() || undefined,
        sourceType: String(record.source_type || '').trim() || undefined,
        selectionReason: String(record.selection_reason || '').trim() || undefined,
        tweetId: String(record.tweet_id || '').trim(),
        tweetUrl: String(record.tweet_url || '').trim() || (record.tweet_id ? `https://x.com/i/web/status/${record.tweet_id}` : null),
        publishError: String(record.publish_error || '').trim() || null,
      }
    })
    .filter(Boolean)
    .slice(0, 20) as Array<{
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
      variantFamilyId?: string | null
      distributionType?: string
      sourceType?: string
      selectionReason?: string
      tweetId?: string
      tweetUrl?: string | null
      publishError?: string | null
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
  blockedSourceCount: number
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
  const sources = record.sources && typeof record.sources === 'object'
    ? Object.values(record.sources).filter((value) => value && typeof value === 'object')
    : []
  const blockedSourceCount = sources.filter((value) => {
    const state = String((value as Record<string, unknown>).state || '').trim().toLowerCase()
    return state === 'non_replyable'
  }).length

  return {
    updatedAt: String(record.updatedAt || '').trim() || null,
    rejectedSources: ensureStringArray(record.rejectedSources, 8),
    rejectedClusters: ensureStringArray(record.rejectedClusters, 8),
    rejectedPhrases: ensureStringArray(record.rejectedPhrases, 8),
    negativeStyleMarkers: ensureStringArray(record.negativeStyleMarkers, 8),
    positiveStyleMarkers: ensureStringArray(record.positiveStyleMarkers, 8),
    accounts,
    blockedSourceCount,
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
      founderState: classifyFounderTaskState({
        status: task.status,
        assigned_to: task.assigned_to,
        metadata: parsedMetadata,
        aegisApproved: hasAegisApproval(db, task.id, workspaceId),
      }),
    }
  })

  const approvalQueue = approvalCandidates.filter((task) =>
    task.founderState === 'needs_founder_approval' ||
    task.founderState === 'ready_to_merge' ||
    task.founderState === 'ready_for_founder_closeout'
  )
  const waitingOnQcQueue = approvalCandidates.filter((task) => task.founderState === 'waiting_on_qc')

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
        founderState: classifyFounderTaskState({
          status: task.status,
          assigned_to: task.assigned_to,
          metadata,
          aegisApproved: hasAegisApproval(db, task.id, workspaceId),
        }),
      }
    })
    .filter((task) => task.founderState === 'queued_for_execution' || task.founderState === 'in_execution')
    .slice(0, 8)

  const surfacedTaskIds = new Set<number>([
    ...approvalQueue.map((task) => task.id),
    ...waitingOnQcQueue.map((task) => task.id),
    ...appFinishQueue.map((task) => task.id),
  ])

  const backgroundWork = topActive
    .filter((task) => !surfacedTaskIds.has(task.id))
    .slice(0, 6)
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

      const originLane = String(parsedMetadata.origin_lane || '').trim()
      const executionMode = String(parsedMetadata.execution_mode || '').trim()
      const founderApproved = hasFounderApproval(parsedMetadata)
      const waitingOnForeman = Boolean(parsedMetadata.waiting_on_foreman)
      const founderState = classifyFounderTaskState({
        status: task.status,
        assigned_to: task.assigned_to,
        metadata: parsedMetadata,
        aegisApproved: hasAegisApproval(db, task.id, workspaceId),
      })
      const backgroundReason =
        task.status === 'assigned' && founderApproved
          ? 'Approved and queued for execution'
          : task.status === 'assigned' && originLane === 'growth'
            ? 'Growth lane work'
            : task.status === 'assigned' && waitingOnForeman
              ? 'Waiting on foreman'
              : task.status === 'assigned' && executionMode === 'audit_only'
                ? 'Audit lane work'
                : task.status === 'in_progress'
                  ? 'Execution in progress'
                  : originLane === 'growth'
                    ? 'Growth lane work'
                    : 'Tracked outside the main founder decision lanes'

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        assigned_to: task.assigned_to,
        priority: task.priority,
        updated_at: task.updated_at,
        founderApproved,
        founderState,
        backgroundReason,
      }
    })
    .filter((task) => task.founderState === 'background_work')

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
    backgroundWork,
    appFinishCounts: {
      active: appFinishQueue.length,
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
    duplicateFingerprintCount: 0,
    productionTruth: {
      duplicateFingerprintCount: 0,
      staleReportCount: 0,
      criticalOfflineAgentCount: 0,
      latestChecks: [],
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
    const latestGrowthWeek = await resolveGrowthWeek(GROWTH_WEEKS_ROOT)
    const growthPaths = latestGrowthWeek
      ? {
          researchBriefPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'research-brief.json'),
          opportunityPackPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'opportunity-pack.json'),
          researchHistoryPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'research-history.json'),
          draftPackPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'draft-pack.json'),
          scorecardPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'scorecard.json'),
          approvedPostsPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'approved-posts.json'),
          resultsSummaryPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'results-summary.json'),
          strategyMemoryPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'strategy-memory.json'),
          editorialMemoryPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'editorial-memory.json'),
          sourceMemoryPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'source-memory.json'),
          publishLogPath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'publish-log.json'),
          followQueuePath: path.join(GROWTH_WEEKS_ROOT, latestGrowthWeek, 'follow-queue.json'),
        }
      : null
    const growthResearch = growthPaths ? await readJsonOrNull<any>(growthPaths.researchBriefPath) : null
    const growthOpportunityPack = growthPaths ? await readJsonOrNull<any>(growthPaths.opportunityPackPath) : null
    const growthResearchHistory = growthPaths ? await readJsonOrNull<any>(growthPaths.researchHistoryPath) : null
    const growthDraftPack = growthPaths ? await readJsonOrNull<any>(growthPaths.draftPackPath) : null
    const growthScorecard = growthPaths ? await readJsonOrNull<any>(growthPaths.scorecardPath) : null
    const growthApprovedPosts = growthPaths ? await readJsonOrNull<any>(growthPaths.approvedPostsPath) : null
    const growthResultsSummary = growthPaths ? await readJsonOrNull<any>(growthPaths.resultsSummaryPath) : null
    const growthStrategyMemory = growthPaths ? await readJsonOrNull<any>(growthPaths.strategyMemoryPath) : null
    const growthEditorialMemory = growthPaths ? await readJsonOrNull<any>(growthPaths.editorialMemoryPath) : null
    const growthSourceMemory = growthPaths ? await readJsonOrNull<any>(growthPaths.sourceMemoryPath) : null
    const growthPublishLog = growthPaths ? await readJsonOrNull<any>(growthPaths.publishLogPath) : null
    const growthFollowQueue = growthPaths ? await readJsonOrNull<any[]>(growthPaths.followQueuePath) : null
    const growthFollowLog = await readJsonOrNull<any[]>(GROWTH_FOLLOW_LOG_PATH)
    const repeatedPains = summarizeRepeatedPains(signalLedger)
    const workspaceId = auth.user.workspace_id ?? 1

    const normalizedSourceMemory = normalizeSourceMemory(growthSourceMemory)
    const normalizedAccountTargets = overlayAccountTargetsWithSourceMemory(
      normalizeAccountTargets(growthResearch?.accountTargets),
      growthSourceMemory,
    )
    const normalizedWatchlistRecommendations = overlayWatchlistRecommendationsWithSourceMemory(
      normalizeWatchlistRecommendations(growthResearch?.watchlistRecommendations),
      growthSourceMemory,
    )

    const normalizedApprovedPosts = normalizeApprovedPosts(growthApprovedPosts)
    const normalizedSelectedOpportunities = filterConsumedGrowthOpportunities(
      normalizeSelectedOpportunities(growthOpportunityPack?.selected),
      normalizedApprovedPosts,
    )
    const normalizedBlockedOpportunities = filterConsumedGrowthOpportunities(
      normalizeSelectedOpportunities(growthOpportunityPack?.blocked),
      normalizedApprovedPosts,
    )
    const normalizedWatchOnlyOpportunities = filterConsumedGrowthOpportunities(
      normalizeSelectedOpportunities(growthOpportunityPack?.watchOnly),
      normalizedApprovedPosts,
    )
    const reconciledGrowthState = reconcileGrowthDraftCandidates(
      normalizedSelectedOpportunities,
      normalizeDraftCandidates(growthDraftPack?.drafts),
      normalizedApprovedPosts,
    )
    const normalizedRecommendations = filterGrowthRecommendations(
      normalizeGrowthRecommendations(growthDraftPack?.recommendations),
      reconciledGrowthState.draftCandidates,
    )
    const normalizedChangesSummary = normalizeGrowthChangesSummary(growthDraftPack?.changesSummary)
    if (normalizedChangesSummary && reconciledGrowthState.integrity.orphanDraftCount > 0) {
      normalizedChangesSummary.whatChangedSinceLastRun = [
        ...normalizedChangesSummary.whatChangedSinceLastRun,
        `${reconciledGrowthState.integrity.orphanDraftCount} orphan draft${reconciledGrowthState.integrity.orphanDraftCount === 1 ? '' : 's'} hidden because the source family is no longer selected`,
      ].slice(0, 8)
    }
    if (normalizedChangesSummary && reconciledGrowthState.integrity.prunedVariantCount > 0) {
      normalizedChangesSummary.whatChangedSinceLastRun = [
        ...normalizedChangesSummary.whatChangedSinceLastRun,
        `${reconciledGrowthState.integrity.prunedVariantCount} extra variant${reconciledGrowthState.integrity.prunedVariantCount === 1 ? '' : 's'} pruned to preserve grounded/sharper family limits`,
      ].slice(0, 8)
    }
    const blockedSourceCount = Number(normalizedSourceMemory?.blockedSourceCount || 0)
    const noOpportunityReason =
      normalizedSelectedOpportunities.length === 0
        ? normalizedBlockedOpportunities.length > 0
          ? 'Current live listening found source families, but they are blocked by source truth and reply-permission rules.'
          : String(growthResearch?.externalStatus || '').trim().toLowerCase() === 'live'
            ? blockedSourceCount > 0
              ? 'Current live listening is fresh, but no new viable opportunities cleared the bar after blocked reply targets were suppressed.'
              : 'Current live listening is fresh, but no source family cleared the selection bar yet.'
            : 'Research is not fresh enough yet to surface reliable opportunities.'
        : null

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
        opportunityPackPath: growthPaths?.opportunityPackPath ?? null,
        researchHistoryPath: growthPaths?.researchHistoryPath ?? null,
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
        researchHistory: growthResearchHistory || null,
        selectedOpportunities: normalizedSelectedOpportunities,
        blockedOpportunities: normalizedBlockedOpportunities,
        watchOnlyOpportunities: normalizedWatchOnlyOpportunities,
        editorialOpportunities: normalizeEditorialOpportunities(growthResearch?.editorialOpportunities || growthResearch?.opportunities),
        listeningDiagnostics: growthResearch?.listeningDiagnostics || null,
        trendClusters: normalizeTrendClusters(growthResearch?.trendClusters),
        sourceSamples: normalizeSourceSamples(growthResearch?.sourceSamples, growthResearch?.trendClusters),
        draftCandidates: reconciledGrowthState.draftCandidates,
        recommendations: normalizedRecommendations,
        changesSummary: normalizedChangesSummary,
        stateIntegrity: reconciledGrowthState.integrity,
        noOpportunityReason,
        approvedPosts: normalizedApprovedPosts,
        resultsSummary: normalizeResultsSummary(growthResultsSummary),
        publishLog: Array.isArray(growthPublishLog) ? growthPublishLog.slice(-5).reverse() : [],
        followQueue: Array.isArray(growthFollowQueue) ? growthFollowQueue : [],
        followLog: Array.isArray(growthFollowLog) ? growthFollowLog.slice(-10).reverse() : [],
        scorecard: growthScorecard,
      },
      tasks: loadTaskSnapshot(workspaceId),
    })
  } catch (error) {
    logger.error({ err: error }, 'Founder packet API error')
    return NextResponse.json({ error: 'Failed to load founder packet' }, { status: 500 })
  }
}
