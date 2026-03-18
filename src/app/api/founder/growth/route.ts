import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'

const execFileAsync = promisify(execFile)

const HABI_ROOT = process.env.HABI_ROOT || '/Users/kokoro/Coding/Habi'
const GROWTH_WEEKS_ROOT = path.join(HABI_ROOT, 'output', 'growth', 'weeks')
const FOUNDER_VOICE_MODULE_PATH = path.join(HABI_ROOT, 'scripts', 'growth', 'founder-voice.mjs')

type GrowthAction =
  | 'refresh_research'
  | 'select_opportunities'
  | 'refresh_research_and_select'
  | 'reject_opportunity'
  | 'archive_opportunity'
  | 'generate_drafts'
  | 'refresh_research_and_generate'
  | 'expand_family_variants'
  | 'rewrite_draft'
  | 'update_draft_text'
  | 'approve_draft'
  | 'reject_draft'
  | 'archive_draft'
  | 'reset_to_research'
  | 'clear_current_drafts'
  | 'schedule_draft'
  | 'post_now'
  | 'unschedule_draft'
  | 'cancel_approved_post'
  | 'mark_published'
  | 'link_manual_publish'
  | 'reopen_published'
  | 'set_account_target_state'

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

function nowPt() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date()).replace(',', '') + ' PT'
}

async function readJsonOrNull<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function updateDraftPackStatus(
  draftPackJsonPath: string,
  draftId: string,
  patch: Record<string, unknown>,
) {
  const draftPack = await readJsonOrNull<Record<string, any>>(draftPackJsonPath)
  if (!draftPack || !Array.isArray(draftPack.drafts)) return
  const target = draftPack.drafts.find((draft: Record<string, any>) => String(draft?.id || '').trim() === draftId)
  if (!target) return
  Object.assign(target, patch)
  await writeJson(draftPackJsonPath, draftPack)
}

async function removeDraftFromPack(
  draftPackJsonPath: string,
  draftId: string,
) {
  const draftPack = await readJsonOrNull<Record<string, any>>(draftPackJsonPath)
  if (!draftPack || !Array.isArray(draftPack.drafts)) return []
  const nextDrafts = draftPack.drafts.filter((draft: Record<string, any>) => String(draft?.id || '').trim() !== draftId)
  draftPack.drafts = nextDrafts
  await writeJson(draftPackJsonPath, draftPack)
  return nextDrafts
}

async function sanitizeDraftPack(
  draftPackJsonPath: string,
) {
  const draftPack = await readJsonOrNull<Record<string, any>>(draftPackJsonPath)
  if (!draftPack || !Array.isArray(draftPack.drafts)) return []
  const nextDrafts = draftPack.drafts.filter((draft: Record<string, any>) => {
    const status = String(draft?.status || '').trim().toLowerCase()
    const approval = String(draft?.approval || '').trim().toLowerCase()
    return !['approved', 'scheduled', 'published', 'archived', 'rejected'].includes(status)
      && !['approved', 'scheduled', 'published', 'archived', 'rejected'].includes(approval)
  })
  draftPack.drafts = nextDrafts
  await writeJson(draftPackJsonPath, draftPack)
  return nextDrafts
}

function buildDraftQueueMarkdown(weekId: string, researchPath: string, drafts: Array<Record<string, unknown>>) {
  const lines = [
    '# M92 Draft Queue',
    '',
    '## Week',
    `- ${weekId}`,
    '',
    '## Research Source',
    `- ${researchPath}`,
    '',
    '## Draft Slots',
    '| Slot | Pillar | Angle | Source | Why now | Status | Approval |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ]

  drafts.forEach((draft, index) => {
    lines.push(
      `| ${index + 1} | ${String(draft.pillar || '')} | ${String(draft.angle || '')} | ${String(draft.source || '')} | ${String(draft.why_now || '')} | ${String(draft.status || '')} | ${String(draft.approval || '')} |`,
    )
  })

  if (!drafts.length) {
    lines.push('| - | No draft pack generated yet |  |  |  |  |')
  }

  lines.push('', '## Draft Text')
  if (!drafts.length) {
    lines.push('- Research is ready. Generate a draft pack when you want reviewable candidates.')
  } else {
    drafts.forEach((draft, index) => {
      lines.push(`${index + 1}. ${String(draft.pillar || 'Draft')}:`)
      lines.push(`   - ${String(draft.text || '')}`)
      lines.push(`   - Source basis: ${String(draft.source_type || 'unknown')}${draft.cluster_id ? ` / ${String(draft.cluster_id)}` : ''}`)
    })
  }

  return `${lines.join('\n')}\n`
}

async function runGrowthCommand(script: string, week: string, extraArgs: string[] = []) {
  const { stdout, stderr } = await execFileAsync('pnpm', [script, '--', '--week', week, ...extraArgs], {
    cwd: HABI_ROOT,
    env: process.env,
  })
  return { stdout, stderr }
}

async function postGrowthDraftNow(week: string, draftId: string) {
  const { stdout, stderr } = await execFileAsync('pnpm', ['growth:m92:publish-approved:keychain', '--', '--week', week, '--max-posts', '1', '--draft-id', draftId], {
    cwd: HABI_ROOT,
    env: process.env,
  })
  return { stdout, stderr }
}

function parseTrailingJsonObject(raw: string) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const start = trimmed.lastIndexOf('{')
  if (start < 0) return null
  const candidate = trimmed.slice(start)
  try {
    return JSON.parse(candidate) as Record<string, unknown>
  } catch {
    return null
  }
}

function toUsername(value: unknown) {
  return String(value || '').replace(/^@/, '').trim().toLowerCase()
}

function normalizeFeedbackTags(feedback: string) {
  return feedback
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeFeedbackText(value: unknown) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function trimSentence(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '')
}

function normalizeQueueText(value: unknown) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeQueueDistribution(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function normalizeQueueSourceUrl(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function normalizeGrowthUsername(value: unknown) {
  return String(value || '').replace(/^@/, '').trim().toLowerCase()
}

function extractTweetIdFromUrl(value: unknown) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  const match = normalized.match(/status\/(\d+)/)
  return match?.[1] ? match[1] : ''
}

function extractMentionedUsernames(text: unknown) {
  const value = String(text || '')
  if (!value) return []
  const usernames = new Set<string>()
  for (const match of value.matchAll(/(^|\s)@([A-Za-z0-9_]{1,15})/g)) {
    const username = normalizeGrowthUsername(match[2])
    if (username) usernames.add(username)
  }
  return [...usernames]
}

function isRecentTimestamp(value: unknown, maxAgeDays = 45) {
  const text = String(value || '').trim()
  if (!text) return false
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return false
  const ageMs = Date.now() - date.getTime()
  return ageMs >= 0 && ageMs <= (maxAgeDays * 24 * 60 * 60 * 1000)
}

function evaluateReplyPreflight(
  record: Record<string, any>,
  sourceMemory: Record<string, any>,
  strategyMemory: Record<string, any>,
) {
  const distributionType = String(record?.distribution_type || record?.distributionType || '').trim().toLowerCase()
  if (distributionType !== 'reply') {
    return {
      eligible: true,
      state: 'not_applicable',
      reasonCode: 'not_a_reply',
      reason: 'Reply preflight applies only to reply candidates.',
      warmthSource: null,
    }
  }

  const founderUsername = normalizeGrowthUsername(strategyMemory?.founderTimeline?.account?.username || 'Jeremy_Habi')
  const sourceUrl = normalizeQueueSourceUrl(
    record?.source_tweet?.url || record?.source_tweet_url || record?.source_url || '',
  )
  const sourceTweetId = extractTweetIdFromUrl(sourceUrl)
  const sourceUsername = normalizeGrowthUsername(
    record?.source_account ||
      record?.source_author ||
      record?.source_tweet?.author?.username ||
      '',
  )
  const sourceText = String(
    record?.source_tweet?.text || record?.source_tweet_text || record?.sourceText || '',
  ).trim()

  const sourceEntries = sourceMemory?.sources && typeof sourceMemory.sources === 'object'
    ? sourceMemory.sources as Record<string, any>
    : {}
  const sourceEntry = sourceUrl ? sourceEntries[sourceUrl] || null : null
  const sourceState = String(sourceEntry?.state || '').trim().toLowerCase()
  if (sourceState === 'non_replyable') {
    return {
      eligible: false,
      state: 'blocked',
      reasonCode: 'known_non_replyable',
      reason: String(sourceEntry?.note || '').trim() || 'This source thread already failed replyability checks on X.',
      warmthSource: 'source_memory',
    }
  }

  if (founderUsername && extractMentionedUsernames(sourceText).includes(founderUsername)) {
    return {
      eligible: true,
      state: 'eligible',
      reasonCode: 'source_mentions_founder',
      reason: `The source post already mentions @${founderUsername}, so replying is allowed.`,
      warmthSource: 'source_mentions_founder',
    }
  }

  const timelinePosts = Array.isArray(strategyMemory?.founderTimeline?.posts)
    ? strategyMemory.founderTimeline.posts as Array<Record<string, any>>
    : []
  const recentReplyPosts = timelinePosts.filter((post) => (
    String(post?.timelineKind || '').trim().toLowerCase() === 'reply' &&
    isRecentTimestamp(post?.posted_at, 45)
  ))

  if (
    sourceTweetId &&
    recentReplyPosts.some((post) => String(post?.reply_target_tweet_id || '').trim() === sourceTweetId)
  ) {
    return {
      eligible: true,
      state: 'eligible',
      reasonCode: 'same_thread_recent_reply',
      reason: 'Jeremy has already replied in this source thread recently.',
      warmthSource: 'founder_timeline_thread',
    }
  }

  if (
    sourceUsername &&
    recentReplyPosts.some((post) => {
      const mentioned = Array.isArray(post?.mentioned_usernames)
        ? post.mentioned_usernames.map((value: unknown) => normalizeGrowthUsername(value)).filter(Boolean)
        : extractMentionedUsernames(post?.text)
      return mentioned.includes(sourceUsername)
    })
  ) {
    return {
      eligible: true,
      state: 'eligible',
      reasonCode: 'recent_author_interaction',
      reason: `Jeremy has replied to @${sourceUsername} recently, so this thread is warm enough to try.`,
      warmthSource: 'founder_timeline_author',
    }
  }

  const accountEntries = sourceMemory?.accounts && typeof sourceMemory.accounts === 'object'
    ? sourceMemory.accounts as Record<string, any>
    : {}
  const accountEntry = sourceUsername ? accountEntries[sourceUsername] || null : null
  if (accountEntry?.replySafe && isRecentTimestamp(accountEntry?.lastReplySucceededAt, 45)) {
    return {
      eligible: true,
      state: 'eligible',
      reasonCode: 'recent_reply_success',
      reason: `Jeremy has a recent successful reply history with @${sourceUsername}.`,
      warmthSource: 'account_history',
    }
  }

  return {
    eligible: false,
    state: 'blocked',
    reasonCode: 'cold_external_thread',
    reason: 'This reply targets a cold external thread with no recent mention, no recent thread warmth, and no proven recent reply success.',
    warmthSource: null,
  }
}

function isActiveQueueStatus(value: unknown) {
  const status = String(value || '').trim().toLowerCase()
  return !['cancelled', 'archived', 'rejected'].includes(status)
}

function findDuplicateApprovedPost(
  approvedPosts: Array<Record<string, any>>,
  target: Record<string, any>,
  draftId: string,
  sourceTweet: Record<string, unknown> | null,
) {
  const targetDistribution = normalizeQueueDistribution(target.distribution_type || target.distributionType)
  const targetText = normalizeQueueText(target.text)
  const targetSourceUrl = normalizeQueueSourceUrl(sourceTweet?.url || target.source_tweet_url || target.source_url)
  const targetCandidateId = String(target.candidate_id || '').trim()
  const targetFamilyId = String(target.family_id || target.variant_family_id || '').trim()

  return approvedPosts.find((entry) => {
    if (String(entry?.id || '').trim() === draftId) return false
    if (!isActiveQueueStatus(entry?.status)) return false

    const sameCandidate = targetCandidateId && String(entry?.candidate_id || '').trim() === targetCandidateId
    const sameFamily = targetFamilyId && String(entry?.family_id || entry?.variant_family_id || '').trim() === targetFamilyId
    const sameSource =
      targetSourceUrl &&
      normalizeQueueDistribution(entry?.distribution_type || entry?.distributionType) === targetDistribution &&
      normalizeQueueSourceUrl(entry?.source_tweet_url || entry?.source_url) === targetSourceUrl
    const sameText =
      targetText &&
      normalizeQueueDistribution(entry?.distribution_type || entry?.distributionType) === targetDistribution &&
      normalizeQueueText(entry?.text) === targetText

    return Boolean(sameCandidate || sameFamily || sameSource || sameText)
  }) || null
}

function ensureTerminalPeriod(value: string) {
  const trimmed = trimSentence(value)
  return trimmed ? `${trimmed}.` : ''
}

type FounderVoiceProfile = {
  id?: string
  bannedPatterns?: string[]
}

const DEFAULT_FOUNDER_VOICE_PROFILE: FounderVoiceProfile = {
  id: 'habi_founder_v1',
  bannedPatterns: [],
}

async function loadFounderVoiceProfile(): Promise<FounderVoiceProfile> {
  try {
    const raw = await fs.readFile(FOUNDER_VOICE_MODULE_PATH.replace(/founder-voice\.mjs$/, '../../config/growth/founder-voice.json'), 'utf8')
    const parsed = JSON.parse(raw) as FounderVoiceProfile
    return parsed || DEFAULT_FOUNDER_VOICE_PROFILE
  } catch {
    try {
      const raw = await fs.readFile(path.join(HABI_ROOT, 'config', 'growth', 'founder-voice.json'), 'utf8')
      const parsed = JSON.parse(raw) as FounderVoiceProfile
      return parsed || DEFAULT_FOUNDER_VOICE_PROFILE
    } catch {
      return DEFAULT_FOUNDER_VOICE_PROFILE
    }
  }
}

function normalizeWhitespace(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function sentenceCase(value: unknown) {
  const text = normalizeWhitespace(value)
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function trimVoiceSentence(value: unknown) {
  return sentenceCase(value).replace(/[.?!]+$/, '')
}

function ensureVoicePeriod(value: unknown) {
  const text = trimVoiceSentence(value)
  return text ? `${text}.` : ''
}

function lowerFirst(value: unknown) {
  const text = normalizeWhitespace(value)
  if (!text) return ''
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function splitVoiceSentences(value: unknown) {
  return normalizeWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean)
}

function firstVoiceClause(value: unknown) {
  return trimVoiceSentence(String(value || '').split(/[.?!]/)[0] || '')
}

function removeBannedVoicePatterns(text: string, bannedPatterns: string[] = []) {
  let next = String(text || '')
  for (const pattern of bannedPatterns) {
    if (!pattern) continue
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    next = next.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '')
  }
  return normalizeWhitespace(next)
}

function addSharperVoiceEdge(text: string, sourceText = '') {
  const trimmed = trimVoiceSentence(text)
  if (!trimmed) return ''
  const normalized = trimmed.toLowerCase()
  if (/^(most|people|that|the problem|the real line|capability|bad systems)/.test(normalized)) {
    return ensureVoicePeriod(trimmed)
  }
  if (/(trust|control|schedule|plan|workflow|friction)/.test(String(sourceText || '').toLowerCase())) {
    return `The problem usually starts before the failure is obvious: ${lowerFirst(trimmed)}.`
  }
  return `Most teams talk around this. ${trimmed}.`
}

function addQuietlyDangerousVoice(text: string, sourceText = '') {
  const trimmed = trimVoiceSentence(text)
  if (!trimmed) return ''
  const source = String(sourceText || '').toLowerCase()
  if (/people have normalized|should bother us more/i.test(trimmed)) {
    return ensureVoicePeriod(trimmed)
  }
  if (/(trust|confidence|control|reversible|legible)/i.test(trimmed)) {
    return `${trimmed}. That should bother us more than it does.`
  }
  if (/(schedule|calendar|plan|workflow)/.test(source)) {
    return 'The quiet failure is not complexity itself. It is the point where the plan stops feeling legible once the week shifts.'
  }
  return `${trimmed}. People have gotten used to carrying drag that should have been designed out.`
}

function makeVoiceMoreGrounded(text: string) {
  const sentences = splitVoiceSentences(text)
  if (!sentences.length) return ''
  const first = trimVoiceSentence(sentences[0])
  const second = sentences[1] ? trimVoiceSentence(sentences[1]) : ''
  const simplified = first
    .replace(/^The problem usually starts before the failure is obvious:\s*/i, '')
    .replace(/^Most teams talk around this\.\s*/i, '')
  return ensureVoicePeriod(second ? `${simplified}. ${second}` : simplified)
}

function makeVoiceLessProducty(text: string) {
  return ensureVoicePeriod(
    normalizeWhitespace(
      String(text || '')
        .replace(/\bproduct(s)?\b/gi, 'tool$1')
        .replace(/\bdesign\b/gi, 'approach')
        .replace(/\bsystem(s)?\b/gi, 'setup$1')
        .replace(/\bHabi\b/gi, '')
        .replace(/\s{2,}/g, ' '),
    ),
  )
}

function makeVoiceMoreHumane(text: string) {
  const trimmed = trimVoiceSentence(text)
  if (!trimmed) return ''
  if (/(people|momentum|confidence|dignity|lost|behind|stupid|worn down)/i.test(trimmed)) {
    return ensureVoicePeriod(trimmed)
  }
  return `${trimmed}. Bad systems cost people more than time.`
}

function makeVoiceLessBiting(text: string) {
  return ensureVoicePeriod(
    normalizeWhitespace(
      String(text || '')
        .replace(/^Most teams talk around this\.\s*/i, '')
        .replace(/^The problem usually starts before the failure is obvious:\s*/i, 'The drift usually starts earlier than people expect: ')
        .replace(/^The quiet failure is not complexity itself\.\s*/i, 'The hard part is not complexity itself. '),
    ),
  )
}

function makeVoiceMoreSpecific(text: string, sourceText = '') {
  const trimmed = trimVoiceSentence(text)
  const sourceLead = firstVoiceClause(sourceText)
  if (!trimmed) return ''
  if (!sourceLead) return ensureVoicePeriod(trimmed)
  if (normalizeWhitespace(trimmed).toLowerCase().includes(sourceLead.toLowerCase().slice(0, 12))) {
    return ensureVoicePeriod(trimmed)
  }
  return `${sourceLead} — and that is usually where the friction becomes impossible to ignore.`
}

function makeVoiceShorter(text: string) {
  const sentences = splitVoiceSentences(text)
  return ensureVoicePeriod(sentences[0] || text)
}

function applyVoiceDirection(text: string, voiceDirection = '', sourceText = '') {
  const direction = normalizeWhitespace(voiceDirection).toLowerCase()
  if (!direction) return ensureVoicePeriod(text)
  let next = String(text || '')
  if (direction.includes('sharper hook') || direction.includes('more cutting') || direction.includes('quote with more bite')) {
    next = addSharperVoiceEdge(next, sourceText)
  }
  if (direction.includes('quietly dangerous')) {
    next = addQuietlyDangerousVoice(next, sourceText)
  }
  if (direction.includes('more grounded')) {
    next = makeVoiceMoreGrounded(next)
  }
  if (direction.includes('less biting')) {
    next = makeVoiceLessBiting(next)
  }
  if (direction.includes('less product-y') || direction.includes('less producty')) {
    next = makeVoiceLessProducty(next)
  }
  if (direction.includes('more humane')) {
    next = makeVoiceMoreHumane(next)
  }
  if (direction.includes('more specific') || direction.includes('source context') || direction.includes('less abstract') || direction.includes('product-specific')) {
    next = makeVoiceMoreSpecific(next, sourceText)
  }
  if (direction.includes('shorter')) {
    next = makeVoiceShorter(next)
  }
  return ensureVoicePeriod(next)
}

function applyVoiceVariantMode(text: string, variantMode = 'default', sourceText = '') {
  if (variantMode === 'grounded') return makeVoiceMoreGrounded(text)
  if (variantMode === 'sharper') return addSharperVoiceEdge(text, sourceText)
  return ensureVoicePeriod(text)
}

function enforceFounderVoiceLocally(
  text: string,
  {
    profile = DEFAULT_FOUNDER_VOICE_PROFILE,
    variantMode = 'default',
    sourceText = '',
    voiceDirection = '',
  }: {
    profile?: FounderVoiceProfile
    variantMode?: string
    sourceText?: string
    voiceDirection?: string
  } = {},
) {
  let next = normalizeWhitespace(text)
  if (!next) return ''
  next = removeBannedVoicePatterns(next, profile?.bannedPatterns || [])
  next = applyVoiceVariantMode(next, variantMode, sourceText)
  next = applyVoiceDirection(next, voiceDirection, sourceText)
  next = removeBannedVoicePatterns(next, profile?.bannedPatterns || [])
  next = next
    .replace(/\bvery expensive way to\b/gi, 'way to')
    .replace(/\bjust\b/gi, 'simply')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return ensureVoicePeriod(next)
}

function buildSourceSpecificRewrite(sourceLead: string, fallback: string) {
  const lead = trimSentence(sourceLead)
  if (!lead) return ensureTerminalPeriod(fallback)
  return `${lead} — but the real break is usually when the plan takes more interpretation than the work itself.`
}

export function buildPromptDrivenRewrite(
  currentText: string,
  feedback: string,
  voiceDirection: string,
  sourceText: string,
  distributionType: string,
) {
  const normalizedPrompt = normalizeFeedbackText(`${feedback} ${voiceDirection}`)
  const sourceLead = trimSentence(sourceText).split(/[.?!]/)[0]?.trim() || ''
  const wantsSharperRewrite =
    normalizedPrompt.includes('contrarian') ||
    normalizedPrompt.includes('sharper') ||
    normalizedPrompt.includes('direct') ||
    normalizedPrompt.includes('specific') ||
    normalizedPrompt.includes('grounded')

  if (wantsSharperRewrite) {
    if (distributionType === 'reply') {
      return ensureTerminalPeriod('The interruption is the visible part. The recovery cost is the part people undercount.')
    }
    if (distributionType === 'quote') {
      return ensureTerminalPeriod('The visible point is only half the story. The recovery cost is the part people undercount.')
    }
    return ensureTerminalPeriod('The real test is not the interruption itself. It is whether the recovery cost stays low enough to keep moving.')
  }

  const sharedTail =
    distributionType === 'reply'
      ? 'The hidden cost is not the interruption itself. It is the time needed to rebuild enough context to keep moving.'
      : distributionType === 'quote'
        ? 'The visible point is only half the story. The other half is the recovery cost people keep undercounting.'
        : 'The important part is the cost of recovery, not only the visible disruption.'
  const sourceClause = sourceLead ? `${ensureTerminalPeriod(sourceLead)} ` : ''
  const leadIn = normalizedPrompt.includes('contrarian')
    ? 'The uncomfortable part is that '
    : normalizedPrompt.includes('sharper')
      ? 'The sharper read is that '
      : normalizedPrompt.includes('direct')
        ? 'The direct read is that '
        : normalizedPrompt.includes('specific')
          ? 'The specific read is that '
          : normalizedPrompt.includes('grounded')
            ? 'The grounded read is that '
            : ''
  return ensureTerminalPeriod(`${leadIn}${sourceClause}${sharedTail}`.trim())
}

function buildDraftPackMarkdown(weekId: string, drafts: Array<Record<string, unknown>>) {
  const lines = [
    '# M92 Draft Pack',
    '',
    '## Week',
    `- ${weekId}`,
    '',
    '## Draft Candidates',
  ]

  for (const draft of drafts) {
    lines.push(`### ${String(draft.pillar || 'Draft')}: ${String(draft.angle || '')}`)
    lines.push(`- Source: ${String(draft.source || '')}`)
    lines.push(`- Source type: ${String(draft.source_type || '')}`)
    if (draft.cluster_id) lines.push(`- Cluster: ${String(draft.cluster_id)}`)
    const sourceTweet = draft.source_tweet && typeof draft.source_tweet === 'object' ? draft.source_tweet as Record<string, any> : null
    if (sourceTweet?.url) lines.push(`- Source post: ${String(sourceTweet.url)}`)
    lines.push(`- Why now: ${String(draft.why_now || '')}`)
    lines.push(`- Draft: ${String(draft.text || '')}`)
    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}

async function rewriteDraftText(
  draft: Record<string, any>,
  feedback: string,
  voiceDirection: string,
  founderVoiceProfile: FounderVoiceProfile,
) {
  const currentText = trimSentence(draft.text)
  const sourceText = String(draft.source_tweet?.text || '').trim()
  const normalizedFeedback = normalizeFeedbackText(feedback)
  const distributionType = String(draft.distribution_type || '').trim().toLowerCase()
  const sourceContext = normalizeFeedbackText(sourceText)
  const sourceLead = trimSentence(draft.source_tweet?.text || '').split(/[.?!]/)[0]?.trim() || ''

  if (!currentText) return ''

  const variantMode =
    normalizedFeedback.includes('more grounded')
      ? 'grounded'
      : normalizedFeedback.includes('sharper hook') || normalizedFeedback.includes('stronger hook') || normalizedFeedback.includes('more cutting') || normalizedFeedback.includes('quote with more bite') || normalizeFeedbackText(voiceDirection).includes('sharper')
        ? 'sharper'
        : 'default'

  const finalize = (value: string) => enforceFounderVoiceLocally(value, {
    profile: founderVoiceProfile,
    variantMode,
    sourceText,
    voiceDirection,
  })

  if (normalizedFeedback.includes('contrarian')) {
    if (distributionType === 'reply') {
      return finalize('The problem is usually not that people need more discipline. It is that the system still asks them to translate the plan before they can trust the next move.')
    }
    return finalize('Most workflow advice still treats discipline as the bottleneck. The more common failure is a planning layer that costs too much interpretation before useful work starts.')
  }

  if (normalizedFeedback.includes('sharper hook') || normalizedFeedback.includes('stronger hook')) {
    if (/shopping|tool|course|app|subscription/.test(sourceContext)) {
      return finalize('People do not keep buying planning tools because they love planning. They keep buying certainty because the next move still does not feel clear enough to trust.')
    }
    if (/trust|control|unsupervised|delegate|assistant/.test(sourceContext)) {
      return finalize('Capability is not the line. The line is whether the system stays legible once it changes the plan without asking first.')
    }
    return finalize('The real issue is usually simpler than the post makes it sound: the plan starts costing more interpretation than the work itself.')
  }

  if (normalizedFeedback.includes('use source context') || normalizedFeedback.includes('source context')) {
    if (/(reddit|subreddit|community)/.test(sourceContext) && /(join|invite|share|page|discuss)/.test(sourceContext)) {
      return finalize('The useful part of a community like that is when people bring the messy edge cases. The real signal is usually where planning breaks on trust, recovery cost, and context rebuild.')
    }
    if (/(course|tool|subscription|productivity app|panic-buying|spending money|momentum)/.test(sourceContext)) {
      return finalize('That usually points to planning resentment, not a lack of options. People keep shopping when the next move still takes too much interpretation to trust.')
    }
    if (/(clients won.t go for it|adverse to change|want to control)/.test(sourceContext) && /(schedule|scheduling|calendar)/.test(sourceContext)) {
      return finalize('That is usually the line. People accept more scheduling help when the change stays legible and easy to override.')
    }
    if (/(interrupt|interruption|context switching|attention residue)/.test(sourceContext)) {
      return finalize('The hidden cost is not just the interruption itself. It is the work of rebuilding enough context to trust the next step.')
    }
    if (/(automation|assistant|agent|delegate)/.test(sourceContext) && /(trust|control|safe|unsafe)/.test(sourceContext)) {
      return finalize('That is usually the real line. People accept more automation when they can still understand why the plan changed and take control back quickly.')
    }
    if (sourceLead) {
      return finalize(buildSourceSpecificRewrite(sourceLead, currentText))
    }
  }

  if (normalizedFeedback.includes('too generic') || normalizedFeedback.includes('more specific')) {
    if (distributionType === 'reply') {
      if (/trust|control|unsupervised|delegate|assistant/.test(sourceContext)) {
        return finalize('The trust break usually happens when the plan changes without staying legible. People will hand off more once they can understand the change and reverse it quickly.')
      }
      if (/shopping|tool|course|app|subscription/.test(sourceContext)) {
        return finalize('That is usually not a tooling problem. It is a signal that the planning layer still costs more interpretation than the person can tolerate.')
      }
      return finalize(`${currentText}. The part people usually miss is the recovery cost after the interruption or change, not just the visible disruption.`)
    }
    return finalize(`${currentText}. The important test is whether the plan still feels legible when the week gets messy.`)
  }

  if (normalizedFeedback.includes('shorter') || normalizedFeedback.includes('tighter')) {
    const sentence = currentText.split(/[.?!]/)[0]?.trim() || currentText
    return finalize(`${sentence}.`)
  }

  if (normalizedFeedback.includes('less product-y') || normalizedFeedback.includes('too product-y')) {
    const lessProduct = currentText
      .replace(/\b(product|tool|system)\b/gi, 'approach')
      .replace(/\bHabi\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return finalize(lessProduct)
  }

  if (normalizedFeedback.includes('good direction, rewrite') || normalizedFeedback.includes('rewrite')) {
    if (distributionType === 'reply') {
      if (/trust|control|unsupervised|delegate|assistant/.test(sourceContext)) {
        return finalize('Yes — and the trust break usually happens before the work itself. Once the plan changes without staying legible, people pull control back fast.')
      }
      if (/shopping|tool|course|app|subscription/.test(sourceContext)) {
        return finalize('Yes — and that usually points to planning resentment more than feature hunger. People keep shopping when the current plan still needs too much interpretation.')
      }
      return finalize('Yes — and the trust break usually happens before the work itself. Once the plan takes effort to reinterpret, people fall back to memory, notes, or calendar patchwork.')
    }
    if (distributionType === 'quote') {
      return finalize('The stronger product move is not more automation in theory. It is a plan people can still read and trust under a messy week.')
    }
    return finalize(buildPromptDrivenRewrite(currentText, feedback, voiceDirection, sourceText, distributionType))
  }

  if (normalizedFeedback || normalizeFeedbackText(voiceDirection)) {
    return finalize(buildPromptDrivenRewrite(currentText, feedback, voiceDirection, sourceText, distributionType))
  }

  return finalize(currentText)
}

function nextDraftNumber(drafts: Array<Record<string, any>>) {
  const used = new Set<number>()
  for (const draft of drafts) {
    const match = String(draft?.id || '').trim().match(/^draft-(\d+)$/)
    if (!match?.[1]) continue
    used.add(Number.parseInt(match[1], 10))
  }
  let candidate = 1
  while (used.has(candidate)) candidate += 1
  return candidate
}

function uniquePrompts(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = String(value || '').trim()
    if (!trimmed) continue
    const key = normalizeFeedbackText(trimmed)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function dedupeFeedbackApplied(values: unknown[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = String(value || '').trim()
    if (!trimmed) continue
    const key = normalizeFeedbackText(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function familyExpansionPrompts(anchor: Record<string, any>, familyDrafts: Array<Record<string, any>>, feedback: string) {
  const sourceText = normalizeFeedbackText(anchor?.source_tweet?.text || anchor?.sourceTweet?.text || '')
  const prompts: string[] = []
  const familyLabels = new Set(
    familyDrafts
      .map((draft) => String(draft?.variant_label || '').trim().toLowerCase())
      .filter(Boolean),
  )

  if (feedback) prompts.push(String(feedback).trim())

  const hasGrounded = [...familyLabels].some((label) => label.includes('grounded'))
  const hasSharper = [...familyLabels].some((label) => label.includes('sharper'))
  if (!hasGrounded) prompts.push('grounded, use source context')
  if (!hasSharper) prompts.push('sharper hook, use source context')

  if (/(panic-buying|another course|another tool|productivity app|subscription|momentum)/.test(sourceText)) {
    prompts.push('more specific, use source context')
    prompts.push('sharper hook, less abstract')
    prompts.push('shorter, use source context')
  } else if (/(trust|control|unsupervised|delegate|assistant|calendar|schedule)/.test(sourceText)) {
    prompts.push('use source context')
    prompts.push('sharper hook')
    prompts.push('shorter')
  } else if (/(context switching|interruption|attention residue|decision fatigue|brain fry)/.test(sourceText)) {
    prompts.push('more specific, use source context')
    prompts.push('shorter')
    prompts.push('good direction, rewrite')
  } else {
    prompts.push('use source context')
    prompts.push('more specific')
    prompts.push('shorter')
  }

  return uniquePrompts(prompts)
}

function defaultAccountStateNote(accountState: string, username: string) {
  switch (accountState) {
    case 'prioritize':
      return `Prioritize @${username} for higher-quality reply or quote opportunities this week.`
    case 'mute':
      return `Mute @${username} from top recommendations until the source quality improves.`
    case 'engage_this_week':
      return `Look for a credible opportunity to engage with @${username} this week.`
    case 'watch':
    default:
      return `Watch @${username} for future reply or quote opportunities.`
  }
}

function ensureArray<T>(input: unknown): T[] {
  return Array.isArray(input) ? input as T[] : []
}

function opportunityFingerprint(entry: Record<string, any>) {
  return [
    String(entry.clusterId || entry.cluster_id || '').trim().toLowerCase(),
    String(entry.sourceUrl || entry.source_url || entry.sourceTweetUrl || entry.source_tweet_url || '').trim().toLowerCase(),
    String(entry.distributionType || entry.distribution_type || '').trim().toLowerCase(),
    normalizeFeedbackText(entry.title || entry.angle || ''),
  ].join('::')
}

function updateSourceMemoryFromReview(sourceMemory: Record<string, any>, reviewEntry: Record<string, any>) {
  const next = { ...sourceMemory }
  const rejectedSources = new Set(ensureArray<string>(next.rejectedSources))
  const rejectedClusters = new Set(ensureArray<string>(next.rejectedClusters))
  const rejectedFingerprints = new Set(ensureArray<string>(next.rejectedFingerprints))
  const rejectedPhrases = new Set(ensureArray<string>(next.rejectedPhrases))
  const rejectedTerms = new Set(ensureArray<string>(next.rejectedTerms))
  const preferredArchetypes = { ...(next.preferredArchetypes || {}) }
  const negativeStyleMarkers = new Set(ensureArray<string>(next.negativeStyleMarkers))
  const positiveStyleMarkers = new Set(ensureArray<string>(next.positiveStyleMarkers))
  const recentFeedback = ensureArray<Record<string, any>>(next.recentFeedback)
  const sources = next.sources && typeof next.sources === 'object' ? { ...next.sources } : {}

  const sourceUrl = String(reviewEntry.sourceTweetUrl || '').trim()
  const clusterId = String(reviewEntry.clusterId || '').trim()
  const archetype = String(reviewEntry.archetype || '').trim() || 'unknown'
  const decision = String(reviewEntry.decision || '').trim()
  const feedback = String(reviewEntry.feedback || '').trim()
  const feedbackTags = normalizeFeedbackTags(feedback)
  const rejectedTokenStopwords = new Set([
    'generic',
    'source',
    'product',
    'producty',
    'abstract',
    'wrong',
    'audience',
    'prefer',
    'target',
    'founder',
    'theater',
    'need',
    'needs',
    'sharper',
    'external',
    'hook',
    'reply',
    'quote',
    'rewrite',
    'direction',
    'good',
    'weak',
    'slop',
  ])
  const fingerprint = [
    clusterId.toLowerCase(),
    sourceUrl.toLowerCase(),
    archetype.toLowerCase(),
    normalizeFeedbackText(reviewEntry.angle || reviewEntry.title || ''),
  ].join('::')

  if (decision === 'rejected' || decision === 'archived') {
    if (sourceUrl) rejectedSources.add(sourceUrl)
    if (clusterId && !sourceUrl) rejectedClusters.add(clusterId)
    if (fingerprint) rejectedFingerprints.add(fingerprint)
    feedbackTags.forEach((tag) => rejectedPhrases.add(tag.toLowerCase()))
    for (const token of normalizeFeedbackText(feedback).split(/[^a-z0-9]+/).filter((value) => value.length >= 5 && !rejectedTokenStopwords.has(value))) {
      rejectedTerms.add(token)
    }
    preferredArchetypes[archetype] = {
      ...(preferredArchetypes[archetype] || {}),
      discouraged: Number(preferredArchetypes[archetype]?.discouraged || 0) + 1,
    }
  }

  if (decision === 'approved') {
    if (sourceUrl) rejectedSources.delete(sourceUrl)
    if (clusterId) rejectedClusters.delete(clusterId)
    if (fingerprint) rejectedFingerprints.delete(fingerprint)
    for (const token of normalizeFeedbackText(feedback).split(/[^a-z0-9]+/).filter((value) => value.length >= 5 && !rejectedTokenStopwords.has(value))) {
      rejectedTerms.delete(token)
    }
    preferredArchetypes[archetype] = {
      ...(preferredArchetypes[archetype] || {}),
      encouraged: Number(preferredArchetypes[archetype]?.encouraged || 0) + 1,
    }
  }

  for (const tag of feedbackTags) {
    const lower = tag.toLowerCase()
    if (['too generic', 'weak source', 'too product-y', 'wrong audience', 'too abstract', 'too founder-theater'].includes(lower)) {
      negativeStyleMarkers.add(lower)
    }
    if (lower.includes('good direction')) {
      positiveStyleMarkers.add(lower)
    }
  }

  recentFeedback.push({
    reviewedAt: new Date().toISOString(),
    decision,
    feedback,
    archetype,
    sourceUrl,
    clusterId,
  })

  next.updatedAt = new Date().toISOString()
  next.sources = sources
  next.rejectedSources = [...rejectedSources].slice(-50)
  next.rejectedClusters = [...rejectedClusters].slice(-50)
  next.rejectedFingerprints = [...rejectedFingerprints].slice(-80)
  next.rejectedPhrases = [...rejectedPhrases].slice(-80)
  next.rejectedTerms = [...rejectedTerms].slice(-80)
  next.preferredArchetypes = preferredArchetypes
  next.negativeStyleMarkers = [...negativeStyleMarkers].slice(-30)
  next.positiveStyleMarkers = [...positiveStyleMarkers].slice(-20)
  next.recentFeedback = recentFeedback.slice(-40)
  return next
}

function updateSourceMemoryFromOpportunityReview(sourceMemory: Record<string, any>, reviewEntry: Record<string, any>) {
  const next = updateSourceMemoryFromReview(sourceMemory, reviewEntry)
  const sourceUrl = String(reviewEntry.sourceTweetUrl || '').trim()
  const decision = String(reviewEntry.decision || '').trim()
  const feedback = normalizeFeedbackText(reviewEntry.feedback || '')
  const distributionType = String(reviewEntry.distributionType || '').trim() || 'unknown'

  if (!next.sources || typeof next.sources !== 'object') next.sources = {}
  if (sourceUrl) {
    const existing = next.sources[sourceUrl] && typeof next.sources[sourceUrl] === 'object' ? next.sources[sourceUrl] : {}
    let state = String(existing.state || 'available')
    if (decision === 'archived') state = 'archived_angle'
    else if (feedback.includes('already replied') || feedback.includes('replied to this') || feedback.includes('already used') || feedback.includes('used this')) state = 'used'
    else if (feedback.includes('non replyable') || feedback.includes('can’t reply') || feedback.includes('cannot reply') || feedback.includes('not allowed to reply')) state = 'non_replyable'
    else if (decision === 'rejected' && (feedback.includes('weak source') || feedback.includes('wrong audience'))) state = 'rejected'
    else if (decision === 'rejected') state = String(existing.state || 'rejected')

    next.sources[sourceUrl] = {
      ...existing,
      state,
      note: String(reviewEntry.feedback || '').trim() || String(existing.note || '').trim(),
      distribution_type: distributionType,
      updatedAt: new Date().toISOString(),
    }
  }

  return next
}

function appendPublishLog(existing: Array<Record<string, any>>, entry: Record<string, any>) {
  const next = Array.isArray(existing) ? [...existing] : []
  next.push(entry)
  return next.slice(-100)
}

function buildCandidateIdentity(record: Record<string, any> | null | undefined) {
  if (!record || typeof record !== 'object') {
    return {
      signature: '',
      sourceTweetUrl: '',
      clusterId: '',
      distributionType: '',
      sourceType: '',
      text: '',
    }
  }

  return {
    signature: String(record.signature || '').trim(),
    sourceTweetUrl: String(
      record.sourceTweetUrl ||
      record.source_tweet_url ||
      record.source_url ||
      record.sourceTweet?.url ||
      record.source_tweet?.url ||
      '',
    ).trim(),
    clusterId: String(record.clusterId || record.cluster_id || '').trim(),
    distributionType: String(record.distributionType || record.distribution_type || '').trim(),
    sourceType: String(record.sourceType || record.source_type || '').trim(),
    text: String(record.text || '').trim(),
  }
}

function shouldReuseApprovalState(
  existing: Record<string, any> | undefined,
  target: Record<string, any>,
  sourceTweet: Record<string, unknown> | null,
) {
  if (!existing) return false

  const existingIdentity = buildCandidateIdentity(existing)
  const targetIdentity = buildCandidateIdentity({
    signature: target.signature,
    source_tweet_url: sourceTweet?.url,
    cluster_id: target.cluster_id,
    distribution_type: target.distribution_type,
    source_type: target.source_type,
    text: target.text,
  })

  if (existingIdentity.signature && targetIdentity.signature) {
    return existingIdentity.signature === targetIdentity.signature
  }

  if (
    existingIdentity.sourceTweetUrl &&
    targetIdentity.sourceTweetUrl &&
    existingIdentity.distributionType &&
    targetIdentity.distributionType
  ) {
    return (
      existingIdentity.sourceTweetUrl === targetIdentity.sourceTweetUrl &&
      existingIdentity.distributionType === targetIdentity.distributionType
    )
  }

  if (
    existingIdentity.text &&
    targetIdentity.text &&
    existingIdentity.clusterId &&
    targetIdentity.clusterId
  ) {
    return (
      existingIdentity.text === targetIdentity.text &&
      existingIdentity.clusterId === targetIdentity.clusterId
    )
  }

  return false
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json() as {
      action?: GrowthAction
      week?: string
      draftId?: string
      feedback?: string
      voiceDirection?: string
      draftText?: string
      scheduledAt?: string
      scheduleNote?: string
      scheduleSource?: 'machine_suggested' | 'user_selected'
      accountUsername?: string
      accountState?: 'watch' | 'prioritize' | 'mute' | 'engage_this_week'
      tweetUrl?: string
      tweetId?: string
    }

    const resolvedWeek = body.week || await resolveGrowthWeek(GROWTH_WEEKS_ROOT)
    if (!resolvedWeek) {
      return NextResponse.json({ error: 'No growth week is available yet.' }, { status: 400 })
    }
    const week = resolvedWeek

    const weekDir = path.join(GROWTH_WEEKS_ROOT, week)
    const draftPackJsonPath = path.join(weekDir, 'draft-pack.json')
    const draftPackPath = path.join(weekDir, 'draft-pack.md')
    const draftQueuePath = path.join(weekDir, 'draft-queue.md')
    const approvedPostsPath = path.join(weekDir, 'approved-posts.json')
    const draftReviewLogPath = path.join(weekDir, 'draft-review-log.json')
    const opportunityReviewLogPath = path.join(weekDir, 'opportunity-review-log.json')
    const editorialMemoryPath = path.join(weekDir, 'editorial-memory.json')
    const sourceMemoryPath = path.join(weekDir, 'source-memory.json')
    const strategyMemoryPath = path.join(weekDir, 'strategy-memory.json')
    const publishLogPath = path.join(weekDir, 'publish-log.json')
    const opportunityPackJsonPath = path.join(weekDir, 'opportunity-pack.json')

    async function writeDraftQueue(drafts: Array<Record<string, unknown>>) {
      await fs.writeFile(
        draftQueuePath,
        buildDraftQueueMarkdown(week, `output/growth/weeks/${week}/research-brief.md`, drafts),
        'utf8',
      )
    }

    async function writeDraftArtifacts(drafts: Array<Record<string, unknown>>) {
      await writeDraftQueue(drafts)
      await fs.writeFile(draftPackPath, buildDraftPackMarkdown(week, drafts), 'utf8')
    }

    switch (body.action) {
      case 'refresh_research': {
        await sanitizeDraftPack(draftPackJsonPath)
        await runGrowthCommand('growth:m92:daily-plan', week, ['--force-refresh', 'true'])
        return NextResponse.json({ status: 'ok', action: 'refresh_research', week })
      }
      case 'select_opportunities': {
        await sanitizeDraftPack(draftPackJsonPath)
        await runGrowthCommand('growth:m92:select-opportunities', week)
        await runGrowthCommand('growth:m92:draft-pack', week)
        return NextResponse.json({ status: 'ok', action: 'select_opportunities', week })
      }
      case 'reject_opportunity':
      case 'archive_opportunity': {
        const opportunityId = String(body.draftId || '').trim()
        if (!opportunityId) {
          return NextResponse.json({ error: 'opportunity id is required.' }, { status: 400 })
        }

        const opportunityPack = await readJsonOrNull<Record<string, any>>(opportunityPackJsonPath)
        if (!opportunityPack) {
          return NextResponse.json({ error: 'No opportunity pack is available to review.' }, { status: 400 })
        }

        const selected = ensureArray<Record<string, any>>(opportunityPack.selected)
        const watchOnly = ensureArray<Record<string, any>>(opportunityPack.watchOnly)
        const blocked = ensureArray<Record<string, any>>(opportunityPack.blocked)
        const target = [...selected, ...watchOnly, ...blocked].find((entry) => String(entry?.id || '').trim() === opportunityId)
        if (!target) {
          return NextResponse.json({ error: 'Opportunity not found.' }, { status: 404 })
        }

        const feedback = String(body.feedback || '').trim()
        const decision = body.action === 'archive_opportunity' ? 'archived' : 'rejected'
        const reviewedAt = new Date().toISOString()
        const reviewEntry = {
          id: opportunityId,
          signature: opportunityFingerprint(target),
          decision,
          reviewedAtPt: nowPt(),
          reviewedAt,
          title: String(target.title || ''),
          angle: String(target.title || ''),
          sourceType: String(target.sourceType || ''),
          distributionType: String(target.distributionType || ''),
          archetype: String(target.distributionType || '').replace(/_/g, ' ') || 'opportunity',
          clusterId: String(target.clusterId || ''),
          sourceTweetUrl: String(target.sourceUrl || ''),
          feedback,
        }

        const opportunityReviewLog = (await readJsonOrNull<Array<Record<string, any>>>(opportunityReviewLogPath)) || []
        opportunityReviewLog.push(reviewEntry)
        await writeJson(opportunityReviewLogPath, opportunityReviewLog.slice(-100))

        const existingEditorialMemory = (await readJsonOrNull<Record<string, any>>(editorialMemoryPath)) || {}
        const recentFeedback = Array.isArray(existingEditorialMemory.recentFeedback)
          ? [...existingEditorialMemory.recentFeedback]
          : []
        recentFeedback.push(reviewEntry)
        await writeJson(editorialMemoryPath, {
          ...existingEditorialMemory,
          week,
          updatedAt: reviewedAt,
          recentFeedback: recentFeedback.slice(-60),
        })

        const existingSourceMemory = (await readJsonOrNull<Record<string, any>>(sourceMemoryPath)) || {}
        await writeJson(sourceMemoryPath, updateSourceMemoryFromOpportunityReview(existingSourceMemory, reviewEntry))

        const remainingSelected = selected.filter((entry) => String(entry?.id || '').trim() !== opportunityId)
        const remainingWatchOnly = watchOnly.filter((entry) => String(entry?.id || '').trim() !== opportunityId)
        const normalizedSourceState =
          feedback.toLowerCase().includes('already replied') || feedback.toLowerCase().includes('replied to this') || feedback.toLowerCase().includes('already used')
            ? 'used'
            : feedback.toLowerCase().includes('non replyable') || feedback.toLowerCase().includes('cannot reply') || feedback.toLowerCase().includes('can’t reply')
              ? 'non_replyable'
              : decision === 'archived'
                ? 'archived_angle'
                : 'rejected'
        const updatedBlocked = target.sourceUrl
          ? [{
              ...target,
              sourceState: normalizedSourceState,
              blockedReason: feedback || (decision === 'archived' ? 'Archived from the active opportunity lane.' : 'Rejected from the active opportunity lane.'),
            }, ...blocked.filter((entry) => String(entry?.id || '').trim() !== opportunityId)].slice(0, 20)
          : blocked.filter((entry) => String(entry?.id || '').trim() !== opportunityId)

        opportunityPack.selected = remainingSelected
        opportunityPack.watchOnly = remainingWatchOnly
        opportunityPack.blocked = updatedBlocked
        opportunityPack.counts = {
          selected: remainingSelected.length,
          watchOnly: remainingWatchOnly.length,
          blocked: updatedBlocked.length,
        }
        await writeJson(opportunityPackJsonPath, opportunityPack)

        const draftPack = await readJsonOrNull<Record<string, any>>(draftPackJsonPath)
        if (draftPack && Array.isArray(draftPack.drafts)) {
          const targetSourceUrl = String(target.sourceUrl || '').trim().toLowerCase()
          const targetClusterId = String(target.clusterId || '').trim().toLowerCase()
          draftPack.drafts = draftPack.drafts.filter((draft: Record<string, any>) => {
            const draftSourceUrl = String(draft?.source_url || '').trim().toLowerCase()
            const draftClusterId = String(draft?.cluster_id || '').trim().toLowerCase()
            if (targetSourceUrl && draftSourceUrl === targetSourceUrl) return false
            if (!targetSourceUrl && targetClusterId && draftClusterId === targetClusterId && String(target?.distributionType || '') === 'original') return false
            return true
          })
          await writeJson(draftPackJsonPath, draftPack)
          await writeDraftArtifacts(draftPack.drafts)
        }

        return NextResponse.json({ status: 'ok', action: body.action, week, opportunityId })
      }
      case 'refresh_research_and_select': {
        await sanitizeDraftPack(draftPackJsonPath)
        await runGrowthCommand('growth:m92:daily-plan', week, ['--force-refresh', 'true'])
        return NextResponse.json({ status: 'ok', action: 'refresh_research_and_select', week })
      }
      case 'refresh_research_and_generate': {
        const voiceDirection = String(body.voiceDirection || '').trim()
        await sanitizeDraftPack(draftPackJsonPath)
        await runGrowthCommand('growth:m92:daily-plan', week, ['--force-refresh', 'true'])
        if (voiceDirection) {
          await runGrowthCommand('growth:m92:draft-pack', week, ['--voice-direction', voiceDirection])
        }
        return NextResponse.json({ status: 'ok', action: 'refresh_research_and_generate', week })
      }
      case 'generate_drafts': {
        const voiceDirection = String(body.voiceDirection || '').trim()
        await sanitizeDraftPack(draftPackJsonPath)
        await runGrowthCommand('growth:m92:draft-pack', week, voiceDirection ? ['--voice-direction', voiceDirection] : [])
        return NextResponse.json({ status: 'ok', action: 'generate_drafts', week })
      }
      case 'expand_family_variants': {
        const draftId = String(body.draftId || '').trim()
        if (!draftId) {
          return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
        }
        const draftPack = await readJsonOrNull<{
          week?: string
          generatedAt?: string
          researchBriefPath?: string
          drafts?: Array<Record<string, any>>
        }>(draftPackJsonPath)
        if (!draftPack?.drafts?.length) {
          return NextResponse.json({ error: 'No draft pack is available to expand.' }, { status: 400 })
        }
        const anchor = draftPack.drafts.find((draft) => String(draft?.id || '').trim() === draftId)
        if (!anchor) {
          return NextResponse.json({ error: 'Draft not found.' }, { status: 404 })
        }
        const familyId = String(anchor.variant_family_id || '').trim()
        if (!familyId) {
          return NextResponse.json({ error: 'This draft is not part of a variant family.' }, { status: 400 })
        }

        const maxVariants = 5
        const familyDrafts = draftPack.drafts.filter((draft) => String(draft?.variant_family_id || '').trim() === familyId)
        if (familyDrafts.length >= maxVariants) {
          return NextResponse.json({ status: 'ok', action: body.action, week, draftId, added: 0, reason: 'family_at_cap' })
        }

        const usedTexts = new Set(
          familyDrafts
            .map((draft) => normalizeFeedbackText(draft?.text || ''))
            .filter(Boolean),
        )
        const prompts = familyExpansionPrompts(anchor, familyDrafts, String(body.feedback || ''))
        const voiceDirection = String(body.voiceDirection || '').trim()
        const founderVoiceProfile = await loadFounderVoiceProfile()
        let nextId = nextDraftNumber(draftPack.drafts)
        let added = 0
        const expansionAt = new Date().toISOString()
        const baseFeedbackApplied = Array.isArray(anchor.feedback_applied) ? [...anchor.feedback_applied] : []

        for (const prompt of prompts) {
          if (familyDrafts.length + added >= maxVariants) break
          const rewritten = await rewriteDraftText(anchor, prompt, voiceDirection, founderVoiceProfile)
          const normalized = normalizeFeedbackText(rewritten)
          if (!rewritten || !normalized || usedTexts.has(normalized)) continue
          usedTexts.add(normalized)
          const variantPosition = familyDrafts.length + added + 1
          const nextDraft = {
            ...anchor,
            id: `draft-${nextId}`,
            signature: `${String(anchor.signature || draftId)}::expand-${variantPosition}-${Date.now()}`,
            text: rewritten,
            status: 'draft',
            approval: 'pending',
            reviewedAtPt: null,
            feedback: '',
            changed_since_last_run: 'expanded with alternate wording from the same source family',
            feedback_applied: [...baseFeedbackApplied, `family expansion: ${prompt}`].slice(-8),
            voice_profile: founderVoiceProfile.id || 'habi_founder_v1',
            voice_direction: voiceDirection || null,
            variant_position: variantPosition,
            expanded_from_draft_id: draftId,
            expanded_at: expansionAt,
          }
          draftPack.drafts.push(nextDraft)
          added += 1
          nextId += 1
        }

        const refreshedFamily = draftPack.drafts.filter((draft) => String(draft?.variant_family_id || '').trim() === familyId)
        for (const draft of refreshedFamily) {
          draft.variant_count = refreshedFamily.length
        }
        await writeJson(draftPackJsonPath, draftPack)
        await writeDraftArtifacts(draftPack.drafts)
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId, added, familyCount: refreshedFamily.length })
      }
      case 'reset_to_research':
      case 'clear_current_drafts': {
        await runGrowthCommand('growth:m92:week-open', week)
        await runGrowthCommand('growth:m92:research-brief', week)
        const approvedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
        const retainedPosts = approvedPosts.filter((entry) => {
          const status = String(entry?.status || '').trim()
          if (status !== 'scheduled' && status !== 'published') return false
          const tweetId = String(entry?.tweet_id || '').trim()
          const tweetUrl = String(entry?.tweet_url || '').trim()
          return status === 'scheduled' || Boolean(tweetId || tweetUrl)
        })
        await writeJson(approvedPostsPath, retainedPosts)
        await fs.rm(draftPackJsonPath, { force: true })
        await fs.rm(draftPackPath, { force: true })
        await writeDraftQueue([])
        return NextResponse.json({ status: 'ok', action: body.action, week })
      }
      case 'set_account_target_state': {
        const username = toUsername(body.accountUsername)
        const accountState = String(body.accountState || '').trim()
        if (!username || !['watch', 'prioritize', 'mute', 'engage_this_week'].includes(accountState)) {
          return NextResponse.json({ error: 'Valid accountUsername and accountState are required.' }, { status: 400 })
        }
        const sourceMemory = (await readJsonOrNull<Record<string, any>>(sourceMemoryPath)) || {}
        const accounts = sourceMemory.accounts && typeof sourceMemory.accounts === 'object' ? { ...sourceMemory.accounts } : {}
        const note = String(body.feedback || '').trim() || defaultAccountStateNote(accountState, username)
        accounts[username] = {
          ...(accounts[username] || {}),
          state: accountState,
          updatedAt: new Date().toISOString(),
          note,
        }
        await writeJson(sourceMemoryPath, {
          ...sourceMemory,
          week,
          updatedAt: new Date().toISOString(),
          accounts,
        })
        return NextResponse.json({ status: 'ok', action: body.action, week, username, accountState })
      }
      case 'update_draft_text':
      case 'rewrite_draft': {
        const draftId = String(body.draftId || '').trim()
        const voiceDirection = String(body.voiceDirection || '').trim()
        if (!draftId) {
          return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
        }

        const draftPack = await readJsonOrNull<{ drafts?: Array<Record<string, any>> }>(draftPackJsonPath)
        if (!draftPack?.drafts?.length) {
          return NextResponse.json({ error: 'No draft pack is available to edit.' }, { status: 400 })
        }

        const target = draftPack.drafts.find((draft) => String(draft?.id || '').trim() === draftId)
        if (!target) {
          return NextResponse.json({ error: 'Draft not found.' }, { status: 404 })
        }

        if (body.action === 'update_draft_text') {
          const nextText = String((body as any).draftText || '').trim()
          if (!nextText) {
            return NextResponse.json({ error: 'draftText is required.' }, { status: 400 })
          }
          target.text = nextText
          target.changed_since_last_run = 'edited manually before approval'
        } else {
          const founderVoiceProfile = await loadFounderVoiceProfile()
          const nextText = await rewriteDraftText(target, String(body.feedback || '').trim(), voiceDirection, founderVoiceProfile)
          if (!nextText) {
            return NextResponse.json({ error: 'Could not rewrite draft.' }, { status: 400 })
          }
          target.text = nextText
          target.changed_since_last_run = 'rewritten locally from the current research snapshot'
          const existingFeedback = Array.isArray(target.feedback_applied) ? [...target.feedback_applied] : []
          if (body.feedback) existingFeedback.push(`rewrite: ${String(body.feedback).trim()}`)
          target.feedback_applied = dedupeFeedbackApplied(existingFeedback).slice(-6)
          target.voice_profile = founderVoiceProfile.id || 'habi_founder_v1'
          target.voice_direction = voiceDirection || null
        }

        target.approval = 'pending'
        target.status = 'draft'
        await writeJson(draftPackJsonPath, draftPack)
        await writeDraftArtifacts(draftPack.drafts)
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId, draft: target })
      }
      case 'approve_draft':
      case 'reject_draft':
      case 'archive_draft': {
        const draftId = String(body.draftId || '').trim()
        if (!draftId) {
          return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
        }

        const draftPack = await readJsonOrNull<{
          week?: string
          generatedAt?: string
          researchBriefPath?: string
          drafts?: Array<Record<string, unknown>>
        }>(draftPackJsonPath)

        if (!draftPack?.drafts?.length) {
          return NextResponse.json({ error: 'No draft pack is available to review.' }, { status: 400 })
        }

        const target = draftPack.drafts.find((draft) => draft.id === draftId)
        if (!target) {
          return NextResponse.json({ error: 'Draft not found.' }, { status: 404 })
        }

        const nextApproval = body.action === 'approve_draft'
          ? 'approved'
          : body.action === 'archive_draft'
            ? 'archived'
            : 'rejected'
        if (body.action === 'approve_draft') {
          const sourceMemory = (await readJsonOrNull<Record<string, any>>(sourceMemoryPath)) || {}
          const strategyMemory = (await readJsonOrNull<Record<string, any>>(strategyMemoryPath)) || {}
          const replyPreflight = evaluateReplyPreflight(target, sourceMemory, strategyMemory)
          if (!replyPreflight.eligible) {
            return NextResponse.json({
              error: replyPreflight.reason,
              replyPreflight,
            }, { status: 400 })
          }
          target.reply_preflight_state = replyPreflight.state
          target.reply_preflight_reason = replyPreflight.reason
          target.reply_preflight_reason_code = replyPreflight.reasonCode
          target.reply_warmth_source = replyPreflight.warmthSource
        }
        const feedback = String(body.feedback || '').trim()
        const reviewSourceTweet = target.source_tweet && typeof target.source_tweet === 'object'
          ? target.source_tweet as Record<string, unknown>
          : null
        target.approval = nextApproval
        target.status = nextApproval
        target.reviewedAtPt = nowPt()
        if (feedback) {
          target.feedback = feedback
        }

        const reviewLog = (await readJsonOrNull<Array<Record<string, string>>>(draftReviewLogPath)) || []
        const reviewEntry = {
          id: draftId,
          signature: String(target.signature || ''),
          decision: nextApproval,
          reviewedAtPt: String(target.reviewedAtPt || ''),
          angle: String(target.angle || ''),
          sourceType: String(target.source_type || ''),
          archetype: String(target.pillar || ''),
          clusterId: String(target.cluster_id || ''),
          sourceTweetUrl: String(reviewSourceTweet?.url || ''),
          feedback,
        }
        reviewLog.push(reviewEntry)
        await writeJson(draftReviewLogPath, reviewLog)

        const existingEditorialMemory = (await readJsonOrNull<Record<string, any>>(editorialMemoryPath)) || {}
        const recentFeedback = Array.isArray(existingEditorialMemory.recentFeedback)
          ? [...existingEditorialMemory.recentFeedback]
          : []
        recentFeedback.push({ ...reviewEntry, reviewedAt: new Date().toISOString() })
        const archetypeStats = { ...(existingEditorialMemory.archetypeStats as Record<string, { approved?: number; rejected?: number; archived?: number }> || {}) }
        const archetypeKey = String(target.pillar || '').trim() || 'unknown'
        const archetypeState = { ...(archetypeStats[archetypeKey] || {}) }
        if (nextApproval === 'approved') archetypeState.approved = Number(archetypeState.approved || 0) + 1
        if (nextApproval === 'rejected') archetypeState.rejected = Number(archetypeState.rejected || 0) + 1
        if (nextApproval === 'archived') archetypeState.archived = Number(archetypeState.archived || 0) + 1
        archetypeStats[archetypeKey] = archetypeState
        await writeJson(editorialMemoryPath, {
          ...existingEditorialMemory,
          week,
          updatedAt: new Date().toISOString(),
          recentFeedback: recentFeedback.slice(-40),
          archetypeStats,
        })

        const existingSourceMemory = (await readJsonOrNull<Record<string, any>>(sourceMemoryPath)) || {}
        await writeJson(sourceMemoryPath, updateSourceMemoryFromReview(existingSourceMemory, reviewEntry))

        if (body.action === 'approve_draft') {
          const approvedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
          const sourceTweet = reviewSourceTweet
          const variantFamilyId = String(target.variant_family_id || '').trim() || null
          const duplicate = findDuplicateApprovedPost(approvedPosts, target as Record<string, any>, draftId, sourceTweet)
          if (duplicate) {
            return NextResponse.json({
              error: 'A matching post is already in the publishing queue. Cancel or edit the existing one instead of queuing it twice.',
              duplicateDraftId: String(duplicate.id || '').trim() || null,
            }, { status: 409 })
          }
          const existing = approvedPosts.find((entry) => entry.id === draftId)
          const reuseApprovalState = shouldReuseApprovalState(existing, target, sourceTweet)
          const nextPost = {
            id: draftId,
            signature: String(target.signature || ''),
            text: String(target.text || ''),
            pillar: String(target.pillar || ''),
            angle: String(target.angle || ''),
            source_type: String(target.source_type || ''),
            distribution_type: String(target.distribution_type || ''),
            cluster_id: String(target.cluster_id || ''),
            why_now: String(target.why_now || ''),
            selection_reason: String(target.selection_reason || ''),
            feedback_applied: Array.isArray(target.feedback_applied) ? target.feedback_applied : [],
            changed_since_last_run: String(target.changed_since_last_run || ''),
            source_tweet_url: String(sourceTweet?.url || ''),
            source_tweet_text: String(sourceTweet?.text || ''),
            source_metrics: target.source_metrics || sourceTweet?.public_metrics || {},
            source_author: String((sourceTweet?.author as Record<string, unknown> | undefined)?.username || ''),
            candidate_id: String(target.candidate_id || '').trim() || null,
            family_id: String(target.family_id || '').trim() || null,
            variant_family_id: variantFamilyId,
            reply_preflight_state: String(target.reply_preflight_state || '').trim() || null,
            reply_preflight_reason_code: String(target.reply_preflight_reason_code || '').trim() || null,
            reply_preflight_reason: String(target.reply_preflight_reason || '').trim() || null,
            reply_warmth_source: String(target.reply_warmth_source || '').trim() || null,
            status: reuseApprovalState
              ? existing?.status === 'published'
                ? 'published'
                : existing?.status === 'scheduled'
                  ? 'scheduled'
                  : 'approved'
              : 'approved',
            approved_at_pt: String(target.reviewedAtPt || ''),
            approval_reason: String(target.selection_reason || ''),
            follower_growth_score: Number(target.follower_growth_score || 0),
            brand_building_score: Number(target.brand_building_score || 0),
            timeliness_score: Number(target.timeliness_score || 0),
            confidence: String(target.confidence || ''),
            scheduled_at: reuseApprovalState ? existing?.scheduled_at || null : null,
            scheduled_at_pt: reuseApprovalState ? existing?.scheduled_at_pt || null : null,
            schedule_source: reuseApprovalState ? existing?.schedule_source || null : null,
            schedule_note: reuseApprovalState ? existing?.schedule_note || '' : '',
            tweet_id: reuseApprovalState ? existing?.tweet_id || '' : '',
            tweet_url: reuseApprovalState ? existing?.tweet_url || '' : '',
            feedback,
          }
          if (existing) {
            Object.assign(existing, nextPost)
          } else {
            approvedPosts.push(nextPost)
          }
          if (variantFamilyId) {
            for (const entry of approvedPosts) {
              if (String(entry?.id || '').trim() === draftId) continue
              const siblingFamily = String(entry?.variant_family_id || '').trim()
              if (siblingFamily && siblingFamily === variantFamilyId) {
                entry.status = 'archived'
                entry.archived_reason = 'family_variant_selected'
                entry.selected_variant_id = draftId
                entry.archived_at = new Date().toISOString()
              }
            }
          }
          await writeJson(approvedPostsPath, approvedPosts)
          if (variantFamilyId) {
            const draftPackWithSiblings = await readJsonOrNull<{ drafts?: Array<Record<string, any>> }>(draftPackJsonPath)
            const currentDrafts = Array.isArray(draftPackWithSiblings?.drafts) ? draftPackWithSiblings.drafts : []
            for (const draft of currentDrafts) {
              const siblingId = String(draft?.id || '').trim()
              if (!siblingId || siblingId === draftId) continue
              const siblingFamily = String(draft?.variant_family_id || '').trim()
              if (siblingFamily && siblingFamily === variantFamilyId) {
                draft.status = 'archived'
                draft.approval = 'archived'
                draft.archived_reason = 'family_variant_selected'
                draft.selected_variant_id = draftId
              }
            }
            await writeJson(draftPackJsonPath, { ...(draftPackWithSiblings || {}), drafts: currentDrafts })
          }
          const remainingDrafts = await removeDraftFromPack(draftPackJsonPath, draftId)
          await writeDraftQueue(remainingDrafts)
        } else {
          const approvedPosts = (await readJsonOrNull<Array<Record<string, string>>>(approvedPostsPath)) || []
          const filtered = approvedPosts.filter((entry) => entry.id !== draftId)
          if (filtered.length !== approvedPosts.length) {
            await writeJson(approvedPostsPath, filtered)
          }
          const remainingDrafts = await removeDraftFromPack(draftPackJsonPath, draftId)
          await writeDraftArtifacts(remainingDrafts)
        }

        return NextResponse.json({ status: 'ok', action: body.action, week, draftId })
      }
      case 'post_now': {
        const draftId = String(body.draftId || '').trim()
        if (!draftId) {
          return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
        }
        const approvedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
        const target = approvedPosts.find((entry) => entry.id === draftId)
        if (!target) {
          return NextResponse.json({ error: 'Approved draft not found.' }, { status: 404 })
        }
        if (!['approved', 'failed', 'scheduled'].includes(String(target.status || '').trim().toLowerCase())) {
          return NextResponse.json({ error: 'Draft is not in a publishable state.' }, { status: 400 })
        }
        const sourceMemory = (await readJsonOrNull<Record<string, any>>(sourceMemoryPath)) || {}
        const strategyMemory = (await readJsonOrNull<Record<string, any>>(strategyMemoryPath)) || {}
        const replyPreflight = evaluateReplyPreflight(target, sourceMemory, strategyMemory)
        if (!replyPreflight.eligible) {
          return NextResponse.json({
            error: replyPreflight.reason,
            replyPreflight,
            draft: target,
          }, { status: 400 })
        }
        const result = await postGrowthDraftNow(week, draftId)
        const refreshedApprovedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
        const refreshedTarget = refreshedApprovedPosts.find((entry) => entry.id === draftId) || null
        return NextResponse.json({
          status: 'ok',
          action: body.action,
          week,
          draftId,
          publishResult: parseTrailingJsonObject(result.stdout),
          draft: refreshedTarget,
        })
      }
      case 'schedule_draft': {
        const draftId = String(body.draftId || '').trim()
        const scheduledAt = String(body.scheduledAt || '').trim()
        if (!draftId || !scheduledAt) {
          return NextResponse.json({ error: 'draftId and scheduledAt are required.' }, { status: 400 })
        }
        const approvedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
        const target = approvedPosts.find((entry) => entry.id === draftId)
        if (!target) {
          return NextResponse.json({ error: 'Approved draft not found.' }, { status: 404 })
        }
        target.status = 'scheduled'
        target.scheduled_at = scheduledAt
        target.schedule_source = body.scheduleSource === 'machine_suggested' ? 'machine_suggested' : 'user_selected'
        target.schedule_note = String(body.scheduleNote || '').trim()
        target.scheduled_at_pt = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(new Date(scheduledAt)).replace(',', '') + ' PT'
        await writeJson(approvedPostsPath, approvedPosts)
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId, scheduledAt })
      }
      case 'unschedule_draft': {
        const draftId = String(body.draftId || '').trim()
        if (!draftId) {
          return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
        }
        const approvedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
        const target = approvedPosts.find((entry) => entry.id === draftId)
        if (!target) {
          return NextResponse.json({ error: 'Scheduled draft not found.' }, { status: 404 })
        }
        target.status = 'approved'
        target.scheduled_at = null
        target.scheduled_at_pt = null
        target.schedule_source = null
        target.schedule_note = ''
        await writeJson(approvedPostsPath, approvedPosts)
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId })
      }
      case 'cancel_approved_post': {
        const draftId = String(body.draftId || '').trim()
        if (!draftId) {
          return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
        }
        const approvedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
        const target = approvedPosts.find((entry) => entry.id === draftId)
        if (!target) {
          return NextResponse.json({ error: 'Queued post not found.' }, { status: 404 })
        }
        const currentStatus = String(target.status || '').trim().toLowerCase()
        if (currentStatus === 'published') {
          return NextResponse.json({ error: 'Published posts cannot be cancelled from the queue.' }, { status: 400 })
        }
        target.status = 'cancelled'
        target.cancelled_at = new Date().toISOString()
        target.cancelled_at_pt = nowPt()
        target.cancelled_reason = String(body.feedback || '').trim() || 'Cancelled from Mission Control.'
        target.scheduled_at = null
        target.scheduled_at_pt = null
        target.schedule_source = null
        target.schedule_note = ''
        await writeJson(approvedPostsPath, approvedPosts)
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId })
      }
      case 'mark_published':
      case 'link_manual_publish': {
        const draftId = String(body.draftId || '').trim()
        if (!draftId) {
          return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
        }
        const approvedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
        const target = approvedPosts.find((entry) => entry.id === draftId)
        if (!target) {
          return NextResponse.json({ error: 'Approved or scheduled draft not found.' }, { status: 404 })
        }
        const candidateTweetUrl = String(body.tweetUrl || target.tweet_url || '').trim()
        const candidateTweetId = String(body.tweetId || target.tweet_id || '').trim() || extractTweetIdFromUrl(candidateTweetUrl)
        const sourceTweetUrl = String(target.source_tweet_url || target.source_url || '').trim()
        const sourceTweetId = extractTweetIdFromUrl(sourceTweetUrl)

        if (!candidateTweetUrl && !candidateTweetId) {
          return NextResponse.json({ error: 'tweetUrl or tweetId is required to mark a post published.' }, { status: 400 })
        }

        if ((candidateTweetId && sourceTweetId && candidateTweetId === sourceTweetId) || (candidateTweetUrl && sourceTweetUrl && candidateTweetUrl === sourceTweetUrl)) {
          return NextResponse.json({
            error: 'Published post must reference Jeremy_Habi’s actual post URL/ID, not the source post you replied to or quoted.',
          }, { status: 400 })
        }

        target.status = 'published'
        target.tweet_url = candidateTweetUrl
        target.tweet_id = candidateTweetId
        target.posted_at = new Date().toISOString()
        target.posted_at_pt = nowPt()
        await writeJson(approvedPostsPath, approvedPosts)
        const publishLog = (await readJsonOrNull<Array<Record<string, any>>>(publishLogPath)) || []
        await writeJson(publishLogPath, appendPublishLog(publishLog, {
          id: target.id,
          tweet_id: target.tweet_id || null,
          tweet_url: target.tweet_url || null,
          source_tweet_url: target.source_tweet_url || null,
          variant_family_id: target.variant_family_id || null,
          posted_at: target.posted_at,
          posted_at_pt: target.posted_at_pt,
          distribution_type: target.distribution_type || '',
          source_type: target.source_type || '',
          pillar: target.pillar || '',
          angle: target.angle || '',
        }))
        const existingSourceMemory = (await readJsonOrNull<Record<string, any>>(sourceMemoryPath)) || {}
        const sourceUrl = String(target.source_tweet_url || target.source_url || '').trim()
        const nextSourceMemory = {
          ...existingSourceMemory,
          week,
          updatedAt: new Date().toISOString(),
          sources: {
            ...(existingSourceMemory.sources && typeof existingSourceMemory.sources === 'object' ? existingSourceMemory.sources : {}),
            ...(sourceUrl
              ? {
                  [sourceUrl]: {
                    ...((existingSourceMemory.sources && typeof existingSourceMemory.sources === 'object' && existingSourceMemory.sources[sourceUrl]) || {}),
                    state: 'used',
                    note: 'Used in a published post.',
                    distribution_type: String(target.distribution_type || ''),
                    tweet_id: target.tweet_id || '',
                    tweet_url: target.tweet_url || '',
                    updatedAt: new Date().toISOString(),
                  },
                }
              : {}),
          },
        }
        await writeJson(sourceMemoryPath, nextSourceMemory)
        await runGrowthCommand('growth:m92:results-sync', week)
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId, tweetId: target.tweet_id || null })
      }
      case 'reopen_published': {
        const draftId = String(body.draftId || '').trim()
        if (!draftId) {
          return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
        }
        const approvedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
        const target = approvedPosts.find((entry) => entry.id === draftId)
        if (!target) {
          return NextResponse.json({ error: 'Published draft not found.' }, { status: 404 })
        }
        const priorTweetId = String(target.tweet_id || '').trim()
        const priorTweetUrl = String(target.tweet_url || '').trim()
        target.status = target.scheduled_at ? 'scheduled' : 'approved'
        target.tweet_id = ''
        target.tweet_url = ''
        target.posted_at = null
        target.posted_at_pt = null
        await writeJson(approvedPostsPath, approvedPosts)

        const publishLog = (await readJsonOrNull<Array<Record<string, any>>>(publishLogPath)) || []
        const filteredLog = publishLog.filter((entry) => {
          const sameId = String(entry?.id || '').trim() === draftId
          const sameTweetId = priorTweetId && String(entry?.tweet_id || '').trim() === priorTweetId
          const sameTweetUrl = priorTweetUrl && String(entry?.tweet_url || '').trim() === priorTweetUrl
          return !(sameId || sameTweetId || sameTweetUrl)
        })
        if (filteredLog.length !== publishLog.length) {
          await writeJson(publishLogPath, filteredLog)
        }
        await runGrowthCommand('growth:m92:results-sync', week)
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId, restoredStatus: target.status })
      }
      default:
        return NextResponse.json({ error: 'Unsupported growth action.' }, { status: 400 })
    }
  } catch (error) {
    logger.error({ err: error }, 'Founder growth action API error')
    return NextResponse.json({ error: 'Failed to update growth workflow.' }, { status: 500 })
  }
}
