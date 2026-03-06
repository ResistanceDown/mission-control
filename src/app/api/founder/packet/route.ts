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
        }
      : null
    const growthResearch = growthPaths ? await readJsonOrNull<any>(growthPaths.researchBriefPath) : null
    const growthDraftPack = growthPaths ? await readJsonOrNull<any>(growthPaths.draftPackPath) : null
    const growthScorecard = growthPaths ? await readJsonOrNull<any>(growthPaths.scorecardPath) : null
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
        researchSignals: normalizeGrowthResearchSignals(growthResearch?.signals),
        draftCandidates: Array.isArray(growthDraftPack?.drafts) ? growthDraftPack.drafts.slice(0, 3) : [],
        scorecard: growthScorecard,
      },
      tasks: loadTaskSnapshot(workspaceId),
    })
  } catch (error) {
    logger.error({ err: error }, 'Founder packet API error')
    return NextResponse.json({ error: 'Failed to load founder packet' }, { status: 500 })
  }
}
