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

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json() as {
      action?: 'refresh_research' | 'generate_drafts' | 'approve_draft' | 'reject_draft' | 'archive_draft' | 'reset_to_research'
      week?: string
      draftId?: string
      feedback?: string
    }

    const week = body.week || await findLatestGrowthWeek(GROWTH_WEEKS_ROOT)
    if (!week) {
      return NextResponse.json({ error: 'No growth week is available yet.' }, { status: 400 })
    }

    const weekDir = path.join(GROWTH_WEEKS_ROOT, week)
    const researchBriefPath = path.join(weekDir, 'research-brief.md')
    const draftPackJsonPath = path.join(weekDir, 'draft-pack.json')
    const draftPackPath = path.join(weekDir, 'draft-pack.md')
    const draftQueuePath = path.join(weekDir, 'draft-queue.md')
    const approvedPostsPath = path.join(weekDir, 'approved-posts.json')
    const draftReviewLogPath = path.join(weekDir, 'draft-review-log.json')

    switch (body.action) {
      case 'refresh_research': {
        await runGrowthCommand('growth:m92:week-open', week)
        await runGrowthCommand('growth:m92:results-sync', week)
        await runGrowthCommand('growth:m92:research-brief', week)
        return NextResponse.json({ status: 'ok', action: 'refresh_research', week })
      }
      case 'generate_drafts': {
        await runGrowthCommand('growth:m92:draft-pack', week)
        return NextResponse.json({ status: 'ok', action: 'generate_drafts', week })
      }
      case 'reset_to_research': {
        await runGrowthCommand('growth:m92:week-open', week)
        await runGrowthCommand('growth:m92:research-brief', week)
        await writeJson(approvedPostsPath, [])
        await writeJson(draftReviewLogPath, [])
        await fs.rm(draftPackJsonPath, { force: true })
        await fs.rm(draftPackPath, { force: true })
        await fs.writeFile(
          draftQueuePath,
          buildDraftQueueMarkdown(week, `output/growth/weeks/${week}/research-brief.md`, []),
          'utf8',
        )
        return NextResponse.json({ status: 'ok', action: 'reset_to_research', week })
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

        const nextApproval =
          body.action === 'approve_draft'
            ? 'approved'
            : body.action === 'archive_draft'
              ? 'archived'
              : 'rejected'
        const feedback = String(body.feedback || '').trim()
        target.approval = nextApproval
        target.status = nextApproval
        target.reviewedAtPt = nowPt()
        if (feedback) {
          target.feedback = feedback
        }
        const reviewLog = (await readJsonOrNull<Array<Record<string, string>>>(draftReviewLogPath)) || []
        reviewLog.push({
          id: draftId,
          signature: String(target.signature || ''),
          decision: nextApproval,
          reviewedAtPt: String(target.reviewedAtPt || ''),
          angle: String(target.angle || ''),
          sourceType: String(target.source_type || ''),
          archetype: String(target.pillar || ''),
          feedback,
        })
        await writeJson(draftReviewLogPath, reviewLog)

        if (body.action === 'approve_draft') {
          const approvedPosts = (await readJsonOrNull<Array<Record<string, string>>>(approvedPostsPath)) || []
          if (!approvedPosts.some((entry) => entry.id === draftId)) {
            const sourceTweet =
              target.source_tweet && typeof target.source_tweet === 'object'
                ? target.source_tweet as Record<string, unknown>
                : null
            approvedPosts.push({
              id: draftId,
              text: String(target.text || ''),
              pillar: String(target.pillar || ''),
              angle: String(target.angle || ''),
              source_type: String(target.source_type || ''),
              cluster_id: String(target.cluster_id || ''),
              source_tweet_url: String(sourceTweet?.url || ''),
              source_tweet_text: String(sourceTweet?.text || ''),
              status: 'approved',
              approved_at_pt: String(target.reviewedAtPt || ''),
              feedback,
            })
          }
          await writeJson(approvedPostsPath, approvedPosts)
        } else {
          const approvedPosts = (await readJsonOrNull<Array<Record<string, string>>>(approvedPostsPath)) || []
          const filtered = approvedPosts.filter((entry) => entry.id !== draftId)
          if (filtered.length !== approvedPosts.length) {
            await writeJson(approvedPostsPath, filtered)
          }
        }

        await writeJson(draftPackJsonPath, draftPack)
        await fs.writeFile(
          draftQueuePath,
          buildDraftQueueMarkdown(week, `output/growth/weeks/${week}/research-brief.md`, draftPack.drafts),
          'utf8',
        )

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
