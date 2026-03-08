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
  | 'generate_drafts'
  | 'refresh_research_and_generate'
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

function formatPtFromIso(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return nowPt()
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed).replace(',', '') + ' PT'
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

async function archiveSiblingDraftsInPack(
  draftPackJsonPath: string,
  variantFamilyId: string,
  selectedVariantId: string,
) {
  if (!variantFamilyId) return []
  const draftPack = await readJsonOrNull<Record<string, any>>(draftPackJsonPath)
  if (!draftPack || !Array.isArray(draftPack.drafts)) return []
  const archivedDraftIds: string[] = []
  for (const draft of draftPack.drafts) {
    const draftId = String(draft?.id || '').trim()
    const familyId = String(draft?.variant_family_id || '').trim()
    if (!draftId || draftId === selectedVariantId || familyId !== variantFamilyId) continue
    draft.status = 'archived'
    draft.approval = 'archived'
    draft.archived_reason = 'family_variant_selected'
    draft.selected_variant_id = selectedVariantId
    draft.reviewedAtPt = nowPt()
    archivedDraftIds.push(draftId)
  }
  await writeJson(draftPackJsonPath, draftPack)
  return archivedDraftIds
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

function appendPublishLog(existing: Array<Record<string, any>>, entry: Record<string, any>) {
  const next = Array.isArray(existing) ? [...existing] : []
  next.push(entry)
  return next.slice(-100)
}

function archiveSiblingApprovedPosts(
  approvedPosts: Array<Record<string, any>>,
  variantFamilyId: string,
  selectedVariantId: string,
) {
  if (!variantFamilyId) return approvedPosts
  for (const entry of approvedPosts) {
    const entryId = String(entry?.id || '').trim()
    const familyId = String(entry?.variant_family_id || '').trim()
    if (!entryId || entryId === selectedVariantId || familyId !== variantFamilyId) continue
    entry.status = 'archived'
    entry.archived_reason = 'family_variant_selected'
    entry.selected_variant_id = selectedVariantId
    entry.archived_at_pt = nowPt()
  }
  return approvedPosts
}

function markSourceUsed(
  sourceMemory: Record<string, any>,
  {
    sourceUrl,
    sourceAccount,
    clusterId,
    distributionType,
    tweetUrl,
    tweetId,
  }: {
    sourceUrl: string
    sourceAccount: string
    clusterId: string
    distributionType: string
    tweetUrl: string
    tweetId: string
  },
) {
  const next = { ...(sourceMemory || {}) }
  const sources = next.sources && typeof next.sources === 'object' ? { ...next.sources } : {}
  if (sourceUrl) {
    sources[sourceUrl] = {
      ...(sources[sourceUrl] || {}),
      state: 'used',
      source_url: sourceUrl,
      source_account: sourceAccount,
      cluster_id: clusterId,
      distribution_type: distributionType,
      tweet_url: tweetUrl,
      tweet_id: tweetId,
      used_at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }
  return {
    ...next,
    updatedAt: new Date().toISOString(),
    sources,
  }
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
      scheduledAt?: string
      scheduleNote?: string
      scheduleSource?: 'machine_suggested' | 'user_selected'
      accountUsername?: string
      accountState?: 'watch' | 'prioritize' | 'mute' | 'engage_this_week'
      tweetUrl?: string
      tweetId?: string
      draftText?: string
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
    const editorialMemoryPath = path.join(weekDir, 'editorial-memory.json')
    const sourceMemoryPath = path.join(weekDir, 'source-memory.json')
    const publishLogPath = path.join(weekDir, 'publish-log.json')

    async function writeDraftQueue(drafts: Array<Record<string, unknown>>) {
      await fs.writeFile(
        draftQueuePath,
        buildDraftQueueMarkdown(week, `output/growth/weeks/${week}/research-brief.md`, drafts),
        'utf8',
      )
    }

    switch (body.action) {
      case 'refresh_research': {
        await sanitizeDraftPack(draftPackJsonPath)
        await runGrowthCommand('growth:m92:week-open', week)
        await runGrowthCommand('growth:m92:results-sync', week)
        await runGrowthCommand('growth:m92:research-brief', week)
        return NextResponse.json({ status: 'ok', action: 'refresh_research', week })
      }
      case 'refresh_research_and_generate': {
        await sanitizeDraftPack(draftPackJsonPath)
        await runGrowthCommand('growth:m92:week-open', week)
        await runGrowthCommand('growth:m92:results-sync', week)
        await runGrowthCommand('growth:m92:research-brief', week)
        await runGrowthCommand('growth:m92:draft-pack', week)
        return NextResponse.json({ status: 'ok', action: 'refresh_research_and_generate', week })
      }
      case 'generate_drafts': {
        await sanitizeDraftPack(draftPackJsonPath)
        await runGrowthCommand('growth:m92:draft-pack', week)
        return NextResponse.json({ status: 'ok', action: 'generate_drafts', week })
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
      case 'update_draft_text': {
        const draftId = String(body.draftId || '').trim()
        const draftText = String(body.draftText || '').trim()
        if (!draftId || !draftText) {
          return NextResponse.json({ error: 'draftId and draftText are required.' }, { status: 400 })
        }
        const draftPack = await readJsonOrNull<{
          drafts?: Array<Record<string, unknown>>
        }>(draftPackJsonPath)
        if (!draftPack?.drafts?.length) {
          return NextResponse.json({ error: 'No draft pack is available to edit.' }, { status: 400 })
        }
        const target = draftPack.drafts.find((draft) => String(draft.id || '').trim() === draftId)
        if (!target) {
          return NextResponse.json({ error: 'Draft not found.' }, { status: 404 })
        }
        target.text = draftText
        target.changed_since_last_run = 'edited manually in Mission Control before approval'
        target.edited_at_pt = nowPt()
        await writeJson(draftPackJsonPath, draftPack)
        await writeDraftQueue(draftPack.drafts)

        const approvedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
        const approvedTarget = approvedPosts.find((entry) => String(entry.id || '').trim() === draftId)
        if (approvedTarget && String(approvedTarget.status || '').trim() !== 'published') {
          approvedTarget.text = draftText
          approvedTarget.edited_at_pt = nowPt()
          await writeJson(approvedPostsPath, approvedPosts)
        }
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId })
      }
      case 'rewrite_draft': {
        const draftId = String(body.draftId || '').trim()
        if (!draftId) {
          return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
        }
        const draftPack = await readJsonOrNull<{
          drafts?: Array<Record<string, unknown>>
        }>(draftPackJsonPath)
        if (!draftPack?.drafts?.length) {
          return NextResponse.json({ error: 'No draft pack is available to rewrite.' }, { status: 400 })
        }
        const target = draftPack.drafts.find((draft) => String(draft.id || '').trim() === draftId)
        if (!target) {
          return NextResponse.json({ error: 'Draft not found.' }, { status: 404 })
        }
        const reviewSourceTweet = target.source_tweet && typeof target.source_tweet === 'object'
          ? target.source_tweet as Record<string, unknown>
          : null
        const feedback = String(body.feedback || '').trim() || 'Good direction, rewrite'
        const reviewEntry = {
          id: draftId,
          signature: String(target.signature || ''),
          decision: 'rejected',
          reviewedAtPt: nowPt(),
          angle: String(target.angle || ''),
          sourceType: String(target.source_type || ''),
          archetype: String(target.pillar || ''),
          clusterId: String(target.cluster_id || ''),
          sourceTweetUrl: String(reviewSourceTweet?.url || ''),
          feedback,
        }
        const reviewLog = (await readJsonOrNull<Array<Record<string, string>>>(draftReviewLogPath)) || []
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
        archetypeState.rejected = Number(archetypeState.rejected || 0) + 1
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

        const approvedPosts = (await readJsonOrNull<Array<Record<string, any>>>(approvedPostsPath)) || []
        const filtered = approvedPosts.filter((entry) => String(entry.id || '').trim() !== draftId)
        if (filtered.length !== approvedPosts.length) {
          await writeJson(approvedPostsPath, filtered)
        }

        await runGrowthCommand('growth:m92:draft-pack', week)
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
        const variantFamilyId = String(target.variant_family_id || '').trim()
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
          const existing = approvedPosts.find((entry) => entry.id === draftId)
          const reuseApprovalState = shouldReuseApprovalState(existing, target, sourceTweet)
          const nextPost = {
            id: draftId,
            signature: String(target.signature || ''),
            variant_family_id: variantFamilyId,
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
          archiveSiblingApprovedPosts(approvedPosts, variantFamilyId, draftId)
          await writeJson(approvedPostsPath, approvedPosts)
          await archiveSiblingDraftsInPack(draftPackJsonPath, variantFamilyId, draftId)
          const remainingDrafts = await sanitizeDraftPack(draftPackJsonPath)
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
        archiveSiblingApprovedPosts(approvedPosts, String(target.variant_family_id || '').trim(), draftId)
        target.status = 'scheduled'
        target.scheduled_at = scheduledAt
        target.schedule_source = body.scheduleSource === 'machine_suggested' ? 'machine_suggested' : 'user_selected'
        target.schedule_note = String(body.scheduleNote || '').trim()
        target.scheduled_at_pt = formatPtFromIso(scheduledAt)
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
        target.schedule_note = ''
        target.publish_status = ''
        target.publish_error = ''
        await writeJson(approvedPostsPath, approvedPosts)
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId })
      }
      case 'mark_published': {
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

        archiveSiblingApprovedPosts(approvedPosts, String(target.variant_family_id || '').trim(), draftId)
        target.status = 'published'
        target.publish_status = 'published'
        target.publish_error = ''
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
          posted_at: target.posted_at,
          posted_at_pt: target.posted_at_pt,
          distribution_type: target.distribution_type || '',
          source_type: target.source_type || '',
          pillar: target.pillar || '',
          angle: target.angle || '',
          source_tweet_url: target.source_tweet_url || target.source_url || '',
          source_account: target.source_author || '',
        }))
        const existingSourceMemory = (await readJsonOrNull<Record<string, any>>(sourceMemoryPath)) || {}
        await writeJson(sourceMemoryPath, markSourceUsed(existingSourceMemory, {
          sourceUrl: String(target.source_tweet_url || target.source_url || '').trim(),
          sourceAccount: String(target.source_author || '').trim(),
          clusterId: String(target.cluster_id || '').trim(),
          distributionType: String(target.distribution_type || '').trim(),
          tweetUrl: String(target.tweet_url || '').trim(),
          tweetId: String(target.tweet_id || '').trim(),
        }))
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
        target.status = 'approved'
        target.publish_status = ''
        target.publish_error = ''
        target.tweet_url = ''
        target.tweet_id = ''
        target.posted_at = ''
        target.posted_at_pt = ''
        await writeJson(approvedPostsPath, approvedPosts)
        return NextResponse.json({ status: 'ok', action: body.action, week, draftId })
      }
      default:
        return NextResponse.json({ error: 'Unsupported growth action.' }, { status: 400 })
    }
  } catch (error) {
    logger.error({ err: error }, 'Founder growth action API error')
    return NextResponse.json({ error: 'Failed to update growth workflow.' }, { status: 500 })
  }
}
