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
  | 'unschedule_draft'
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

async function runGrowthCommand(script: string, week: string) {
  const { stdout, stderr } = await execFileAsync('pnpm', [script, '--', '--week', week], {
    cwd: HABI_ROOT,
    env: process.env,
  })
  return { stdout, stderr }
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

function rewriteDraftText(draft: Record<string, any>, feedback: string) {
  const currentText = trimSentence(draft.text)
  const sourceText = normalizeFeedbackText(draft.source_tweet?.text || '')
  const normalizedFeedback = normalizeFeedbackText(feedback)
  const distributionType = String(draft.distribution_type || '').trim().toLowerCase()
  const sourceContext = sourceText
  const sourceLead = trimSentence(draft.source_tweet?.text || '').split(/[.?!]/)[0]?.trim() || ''

  if (!currentText) return ''

  if (normalizedFeedback.includes('contrarian')) {
    if (distributionType === 'reply') {
      return 'The problem is usually not that people need more discipline. It is that the system still asks them to translate the plan before they can trust the next move.'
    }
    return 'Most workflow advice still treats discipline as the bottleneck. The more common failure is a planning layer that costs too much interpretation before useful work starts.'
  }

  if (normalizedFeedback.includes('sharper hook') || normalizedFeedback.includes('stronger hook')) {
    if (/shopping|tool|course|app|subscription/.test(sourceContext)) {
      return 'People do not keep buying planning tools because they love planning. They keep buying certainty because the next move still does not feel clear enough to trust.'
    }
    if (/trust|control|unsupervised|delegate|assistant/.test(sourceContext)) {
      return 'Capability is not the line. The line is whether the system stays legible once it changes the plan without asking first.'
    }
    return `The real issue is usually simpler than the post makes it sound: ${currentText.charAt(0).toLowerCase()}${currentText.slice(1)}.`
  }

  if (normalizedFeedback.includes('use source context') || normalizedFeedback.includes('source context')) {
    if (/(reddit|subreddit|community)/.test(sourceContext) && /(join|invite|share|page|discuss)/.test(sourceContext)) {
      return 'The useful part of a community like that is when people bring the messy edge cases. The real signal is usually where planning breaks on trust, recovery cost, and context rebuild.'
    }
    if (/(course|tool|subscription|productivity app|panic-buying|spending money|momentum)/.test(sourceContext)) {
      return 'That usually points to planning resentment, not a lack of options. People keep shopping when the next move still takes too much interpretation to trust.'
    }
    if (/(clients won.t go for it|adverse to change|want to control)/.test(sourceContext) && /(schedule|scheduling|calendar)/.test(sourceContext)) {
      return 'That is usually the line. People accept more scheduling help when the change stays legible and easy to override.'
    }
    if (/(interrupt|interruption|context switching|attention residue)/.test(sourceContext)) {
      return 'The hidden cost is not just the interruption itself. It is the work of rebuilding enough context to trust the next step.'
    }
    if (/(automation|assistant|agent|delegate)/.test(sourceContext) && /(trust|control|safe|unsafe)/.test(sourceContext)) {
      return 'That is usually the real line. People accept more automation when they can still understand why the plan changed and take control back quickly.'
    }
    if (sourceLead) {
      return `${sourceLead.replace(/[.?!]+$/, '')} matters less than where the plan started costing more interpretation than it saved.`
    }
  }

  if (normalizedFeedback.includes('too generic') || normalizedFeedback.includes('more specific')) {
    if (distributionType === 'reply') {
      if (/trust|control|unsupervised|delegate|assistant/.test(sourceContext)) {
        return 'The trust break usually happens when the plan changes without staying legible. People will hand off more once they can understand the change and reverse it quickly.'
      }
      if (/shopping|tool|course|app|subscription/.test(sourceContext)) {
        return 'That is usually not a tooling problem. It is a signal that the planning layer still costs more interpretation than the person can tolerate.'
      }
      return `${currentText}. The part people usually miss is the recovery cost after the interruption or change, not just the visible disruption.`
    }
    return `${currentText}. The important test is whether the plan still feels legible when the week gets messy.`
  }

  if (normalizedFeedback.includes('shorter') || normalizedFeedback.includes('tighter')) {
    const sentence = currentText.split(/[.?!]/)[0]?.trim() || currentText
    return `${sentence}.`
  }

  if (normalizedFeedback.includes('less product-y') || normalizedFeedback.includes('too product-y')) {
    return currentText
      .replace(/\b(product|tool|system)\b/gi, 'approach')
      .replace(/\bHabi\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim() + '.'
  }

  if (normalizedFeedback.includes('good direction, rewrite') || normalizedFeedback.includes('rewrite')) {
    if (distributionType === 'reply') {
      if (/trust|control|unsupervised|delegate|assistant/.test(sourceContext)) {
        return 'Yes — and the trust break usually happens before the work itself. Once the plan changes without staying legible, people pull control back fast.'
      }
      if (/shopping|tool|course|app|subscription/.test(sourceContext)) {
        return 'Yes — and that usually points to planning resentment more than feature hunger. People keep shopping when the current plan still needs too much interpretation.'
      }
      return 'Yes — and the trust break usually happens before the work itself. Once the plan takes effort to reinterpret, people fall back to memory, notes, or calendar patchwork.'
    }
    if (distributionType === 'quote') {
      return 'The stronger product move is not more automation in theory. It is a plan people can still read and trust under a messy week.'
    }
  }

  return `${currentText}.`
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

function extractTweetIdFromUrl(url: unknown) {
  const normalized = String(url || '').trim()
  if (!normalized) return ''
  const match = normalized.match(/status\/(\d+)/)
  return match?.[1] ? match[1] : ''
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
      draftText?: string
      scheduledAt?: string
      scheduleNote?: string
      scheduleSource?: 'machine_suggested' | 'user_selected'
      accountUsername?: string
      accountState?: 'watch' | 'prioritize' | 'mute' | 'engage_this_week'
      tweetUrl?: string
      tweetId?: string
    }

    const resolvedWeek = body.week || await findLatestGrowthWeek(GROWTH_WEEKS_ROOT)
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
        await runGrowthCommand('growth:m92:week-open', week)
        await runGrowthCommand('growth:m92:results-sync', week)
        await runGrowthCommand('growth:m92:research-brief', week)
        return NextResponse.json({ status: 'ok', action: 'refresh_research', week })
      }
      case 'select_opportunities': {
        await runGrowthCommand('growth:m92:select-opportunities', week)
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
        await runGrowthCommand('growth:m92:week-open', week)
        await runGrowthCommand('growth:m92:results-sync', week)
        await runGrowthCommand('growth:m92:research-brief', week)
        await runGrowthCommand('growth:m92:select-opportunities', week)
        return NextResponse.json({ status: 'ok', action: 'refresh_research_and_select', week })
      }
      case 'refresh_research_and_generate': {
        await sanitizeDraftPack(draftPackJsonPath)
        await runGrowthCommand('growth:m92:week-open', week)
        await runGrowthCommand('growth:m92:results-sync', week)
        await runGrowthCommand('growth:m92:research-brief', week)
        await runGrowthCommand('growth:m92:select-opportunities', week)
        await runGrowthCommand('growth:m92:draft-pack', week)
        return NextResponse.json({ status: 'ok', action: 'refresh_research_and_generate', week })
      }
      case 'generate_drafts': {
        await sanitizeDraftPack(draftPackJsonPath)
        await runGrowthCommand('growth:m92:draft-pack', week)
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
        let nextId = nextDraftNumber(draftPack.drafts)
        let added = 0
        const expansionAt = new Date().toISOString()
        const baseFeedbackApplied = Array.isArray(anchor.feedback_applied) ? [...anchor.feedback_applied] : []

        for (const prompt of prompts) {
          if (familyDrafts.length + added >= maxVariants) break
          const rewritten = rewriteDraftText(anchor, prompt)
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
          const nextText = rewriteDraftText(target, String(body.feedback || '').trim())
          if (!nextText) {
            return NextResponse.json({ error: 'Could not rewrite draft.' }, { status: 400 })
          }
          target.text = nextText
          target.changed_since_last_run = 'rewritten locally from the current research snapshot'
          const existingFeedback = Array.isArray(target.feedback_applied) ? [...target.feedback_applied] : []
          if (body.feedback) existingFeedback.push(`rewrite: ${String(body.feedback).trim()}`)
          target.feedback_applied = dedupeFeedbackApplied(existingFeedback).slice(-6)
        }

        target.approval = 'pending'
        target.status = 'draft'
        await writeJson(draftPackJsonPath, draftPack)
        await writeDraftArtifacts(draftPack.drafts)
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId })
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
            variant_family_id: variantFamilyId,
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
          await updateDraftPackStatus(draftPackJsonPath, draftId, {
            status: nextApproval,
            approval: nextApproval,
            feedback,
            reviewedAtPt: String(target.reviewedAtPt || ''),
          })
          const nextDraftPack = await readJsonOrNull<{ drafts?: Array<Record<string, unknown>> }>(draftPackJsonPath)
          await writeDraftQueue(Array.isArray(nextDraftPack?.drafts) ? nextDraftPack.drafts : [])
        }

        return NextResponse.json({ status: 'ok', action: body.action, week, draftId })
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
