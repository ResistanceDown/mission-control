import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'

const HABI_ROOT = process.env.HABI_ROOT || '/Users/kokoro/Coding/Habi'
const FOUNDER_PACKET_ROOT = path.join(HABI_ROOT, 'output', 'founder', 'daily')
const SIGNAL_LEDGER_PATH = path.join(HABI_ROOT, 'output', 'founder', 'customer-signal-ledger.json')
const PRODUCT_PROOF_PATH = path.join(HABI_ROOT, 'output', 'founder', 'product-proof-ledger.json')
const ADOPTION_SCORECARD_PATH = path.join(HABI_ROOT, 'output', 'revenue', 'revenue-escape-scorecard.json')

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
          AND coalesce(json_extract(metadata, '$.execution_mode'), '') IN ('audit_only', 'draft_pr')
          AND coalesce(json_extract(metadata, '$.disposition'), '') IN ('execute_now', 'founder_decision_needed')
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

  const approvalQueue = approvalQueueRows.map((task) => {
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
    }
  })

  const appFinishQueue = db.prepare(`
    SELECT id, title, status, assigned_to, priority, updated_at
    FROM tasks
    WHERE workspace_id = ?
      AND lower(coalesce(assigned_to,'')) LIKE 'habi-%'
      AND status NOT IN ('review', 'quality_review', 'done', 'cancelled')
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
    LIMIT 8
  `).all(workspaceId) as Array<{
    id: number
    title: string
    status: string
    assigned_to: string | null
    priority: string
    updated_at: number
  }>

  const appFinishCounts = db.prepare(`
    SELECT
      SUM(CASE
        WHEN lower(coalesce(assigned_to,'')) LIKE 'habi-%'
          AND status NOT IN ('done', 'cancelled')
          AND coalesce(json_extract(metadata, '$.origin_lane'), '') != 'growth'
          AND coalesce(json_extract(metadata, '$.execution_mode'), '') IN ('audit_only', 'draft_pr')
        THEN 1 ELSE 0 END
      ) AS active_count,
      SUM(CASE
        WHEN lower(coalesce(assigned_to,'')) LIKE 'habi-%'
          AND status IN ('review', 'quality_review')
          AND coalesce(json_extract(metadata, '$.origin_lane'), '') != 'growth'
          AND coalesce(json_extract(metadata, '$.execution_mode'), '') IN ('audit_only', 'draft_pr')
        THEN 1 ELSE 0 END
      ) AS blocked_by_founder,
      SUM(CASE
        WHEN lower(coalesce(assigned_to,'')) LIKE 'habi-%'
          AND status NOT IN ('done', 'cancelled')
          AND coalesce(json_extract(metadata, '$.origin_lane'), '') != 'growth'
          AND coalesce(json_extract(metadata, '$.execution_mode'), '') IN ('audit_only', 'draft_pr')
          AND trim(coalesce(json_extract(metadata, '$.blocked_reason'), '')) != ''
        THEN 1 ELSE 0 END
      ) AS blocked_by_evidence
    FROM tasks
    WHERE workspace_id = ?
  `).get(workspaceId) as {
    active_count?: number
    blocked_by_founder?: number
    blocked_by_evidence?: number
  }

  return {
    totalActive,
    byStatus,
    awaitingReview: approvalQueue.length,
    topActive,
    reviewQueue,
    approvalQueue,
    appFinishQueue,
    appFinishCounts: {
      active: Number(appFinishCounts?.active_count || 0),
      blockedByFounder: Number(appFinishCounts?.blocked_by_founder || 0),
      blockedByEvidence: Number(appFinishCounts?.blocked_by_evidence || 0),
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
      tasks: loadTaskSnapshot(workspaceId),
    })
  } catch (error) {
    logger.error({ err: error }, 'Founder packet API error')
    return NextResponse.json({ error: 'Failed to load founder packet' }, { status: 500 })
  }
}
