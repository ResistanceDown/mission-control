import { existsSync } from 'node:fs'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase, db_helpers } from '@/lib/db'
import { eventBus } from '@/lib/event-bus'
import { habiTaskContractErrorMessage, validateHabiTaskContract } from '@/lib/habi-task-contract'
import {
  computeHabiFingerprint,
  ensureHabiTaskSubscriptions,
  inferHabiAssignee,
  mapSeverityToPriority,
  mergeHabiMetadata,
} from '@/lib/habi-task-ops'
import { logger } from '@/lib/logger'
import { mutationLimiter } from '@/lib/rate-limit'
import { dispatchTaskAssignment } from '@/lib/task-assignment-dispatch'
import { habiTaskIngestSchema, validateBody } from '@/lib/validation'

type IngestStatus = 'assigned' | 'in_progress' | 'review' | 'quality_review'

function shouldSkipResolvedReferenceItem(item: {
  status_hint?: string
  disposition?: string
}) {
  return item.status_hint === 'resolved' || item.disposition === 'reference_only'
}

function resolveGeneralProjectId(db: ReturnType<typeof getDatabase>, workspaceId: number): number {
  const project = db.prepare(`
    SELECT id FROM projects
    WHERE workspace_id = ? AND status = 'active'
    ORDER BY CASE WHEN slug = 'general' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `).get(workspaceId) as { id: number } | undefined
  if (!project) throw new Error('No active project available in workspace')
  return project.id
}

function resolveTargetStatus(
  statusHint: string | undefined,
  hasEvidence: boolean,
  options?: { executionMode?: string; disposition?: string }
): { status: IngestStatus; blockedReason?: string } {
  const isPlannedExecution =
    (options?.executionMode === 'draft_pr' || options?.executionMode === 'audit_only') &&
    (options?.disposition === 'execute_now' || options?.disposition === 'founder_decision_needed')
  let status: IngestStatus = 'assigned'

  switch (statusHint) {
    case 'blocked':
      status = 'assigned'
      break
    case 'active':
      status = 'assigned'
      break
    case 'review_ready':
      status = 'review'
      break
    case 'quality_ready':
      status = 'quality_review'
      break
    case 'resolved':
      status = hasEvidence ? 'quality_review' : 'review'
      break
    default:
      break
  }

  if (!hasEvidence && (status === 'review' || status === 'quality_review')) {
    return {
      status: 'in_progress',
      blockedReason: 'Missing evidence path blocks status advancement',
    }
  }
  return { status }
}

function resolveExistingTaskStatus(
  existingStatus: string,
  proposedStatus: IngestStatus,
  options?: {
    executionMode?: string
    disposition?: string
    executionContextReady?: boolean
    blockedReason?: string
    qcPassed?: boolean
  }
): IngestStatus {
  const isPlannedExecution =
    (options?.executionMode === 'draft_pr' || options?.executionMode === 'audit_only') &&
    (options?.disposition === 'execute_now' || options?.disposition === 'founder_decision_needed')

  if (options?.qcPassed && proposedStatus === 'assigned') {
    return 'quality_review'
  }

  if (options?.blockedReason && proposedStatus === 'assigned') {
    return 'assigned'
  }

  if (
    isPlannedExecution &&
    ['in_progress', 'review', 'quality_review'].includes(existingStatus) &&
    proposedStatus === 'assigned'
  ) {
    if (existingStatus === 'in_progress' && options?.executionContextReady !== true) {
      return 'assigned'
    }
    return existingStatus as IngestStatus
  }

  return proposedStatus
}

function addTaskComment(
  db: ReturnType<typeof getDatabase>,
  workspaceId: number,
  taskId: number,
  content: string
) {
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO comments (task_id, author, content, created_at, parent_id, mentions, workspace_id)
    VALUES (?, 'system', ?, ?, NULL, NULL, ?)
  `).run(taskId, content, now, workspaceId)
}

function formatIngestCreatedComment(item: {
  source_report: string
  lane: string
  severity: string
  surface?: string
  execution_mode?: string
  disposition?: string
}) {
  return [
    'Ingest created task',
    `Source: ${item.source_report}`,
    `Lane: ${item.lane}`,
    `Severity: ${item.severity}`,
    ...(item.surface ? [`Surface: ${item.surface}`] : []),
    ...(item.execution_mode ? [`Execution mode: ${item.execution_mode}`] : []),
    ...(item.disposition ? [`Disposition: ${item.disposition}`] : []),
  ].join('\n')
}

function formatIngestSyncComment(item: { source_report: string }, changes: string[]) {
  return [
    'Ingest sync update',
    `Source: ${item.source_report}`,
    ...changes.map((change) => `- ${change}`),
  ].join('\n')
}

function formatGuardrailComment(message: string) {
  return ['Guardrail applied', message].join('\n')
}

function formatIngestNoteComment(message: string) {
  return ['Ingest note', message].join('\n')
}

function formatOfflineComment(assignee: string) {
  return [
    'Assignee offline',
    `${assignee} does not have an active linked session right now.`,
    'Task remains queued. Relink the session if work should resume immediately.',
  ].join('\n')
}

function shouldSkipCancelledFingerprintReuse(existingTask: any) {
  const metadata = mergeHabiMetadata(existingTask?.metadata, {})
  const cancelledReason = String(metadata.cancelled_reason || '').trim().toLowerCase()
  return (
    existingTask?.status === 'cancelled' &&
    ['superseded_by_redesign_cutover', 'reference_only_decision_already_recorded'].includes(cancelledReason)
  )
}

function cancelSupersededDuplicates(
  db: ReturnType<typeof getDatabase>,
  workspaceId: number,
  survivingTaskId: number,
  actor: string,
  now: number,
  metadata: Record<string, unknown>,
) {
  const keys = [
    String(metadata.branch_name || '').trim(),
    String(metadata.worktree_path || '').trim(),
    String(metadata.evidence_path || '').trim(),
    String(metadata.handoff_artifact || '').trim(),
  ].filter(Boolean)

  if (keys.length === 0) return

  const placeholders = keys.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT id, title, status, metadata
    FROM tasks
    WHERE workspace_id = ?
      AND id != ?
      AND status NOT IN ('done', 'cancelled')
      AND (
        json_extract(metadata, '$.branch_name') IN (${placeholders})
        OR json_extract(metadata, '$.worktree_path') IN (${placeholders})
        OR json_extract(metadata, '$.evidence_path') IN (${placeholders})
        OR json_extract(metadata, '$.handoff_artifact') IN (${placeholders})
      )
    ORDER BY updated_at DESC
  `).all(workspaceId, survivingTaskId, ...keys, ...keys, ...keys, ...keys) as Array<{
    id: number
    title: string
    status: string
    metadata?: string | null
  }>

  const survivorFingerprint = String(metadata.fingerprint || '')
  for (const row of rows) {
    const previousMetadata = mergeHabiMetadata(row.metadata, {})
    if (String(previousMetadata.fingerprint || '') === survivorFingerprint) continue
    const mergedMetadata = {
      ...previousMetadata,
      cancelled_reason: 'superseded_by_redesign_cutover',
      superseded_by_task_id: survivingTaskId,
      superseded_at: new Date().toISOString(),
    }
    db.prepare(`
      UPDATE tasks
      SET status = 'cancelled', metadata = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(JSON.stringify(mergedMetadata), now, row.id, workspaceId)
    addTaskComment(
      db,
      workspaceId,
      row.id,
      [
        'Task cancelled',
        `Superseded by task #${survivingTaskId} during Habi ingest reconciliation.`,
        'Reason: redesign-first cutover replaced an older duplicate work stream.',
      ].join('\n'),
    )
    db_helpers.logActivity(
      'task_superseded',
      'task',
      row.id,
      actor,
      `Habi ingest cancelled duplicate task "${row.title}"`,
      { superseded_by_task_id: survivingTaskId, cancelled_reason: 'superseded_by_redesign_cutover' },
      workspaceId
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const validated = await validateBody(request, habiTaskIngestSchema)
    if ('error' in validated) return validated.error

    const { items, dry_run, source } = validated.data
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const projectId = resolveGeneralProjectId(db, workspaceId)
    const now = Math.floor(Date.now() / 1000)
    const actor = auth.user.username || 'api'
    const actionPlan: Array<Record<string, unknown>> = []
    const touchedTaskIds: number[] = []
    let created = 0
    let updated = 0

    for (const item of items) {
      if (item.disposition === 'defer' || item.disposition === 'narrative_only') {
        actionPlan.push({
          action: 'skip',
          title: item.title,
          lane: item.lane,
          reason: `disposition=${item.disposition}`,
        })
        continue
      }
      const assignee = inferHabiAssignee(item.lane, item.assignee)
      const fingerprint =
        (item.fingerprint || '').trim() ||
        computeHabiFingerprint({
          lane: item.lane,
          title: item.title,
          scope: item.scope,
        })
      const hasEvidence = existsSync(item.evidence_path)
      const targetStatus = resolveTargetStatus(item.status_hint, hasEvidence, {
        executionMode: item.execution_mode,
        disposition: item.disposition,
      })
      const metadataPatch = {
        objective: item.objective,
        scope: item.scope,
        acceptance: item.acceptance,
        evidence_path: item.evidence_path,
        gate_required: item.gate_required,
        rollback: item.rollback,
        origin_lane: item.lane,
        origin_report: item.source_report,
        last_sync_at: new Date().toISOString(),
        fingerprint,
        quality_owner: 'jeremy',
        surface: item.surface || '',
        execution_mode: item.execution_mode || '',
        branch_name: item.branch_name || '',
        worktree_path: item.worktree_path || '',
        validation_commands: item.validation_commands || [],
        handoff_artifact: item.handoff_artifact || '',
        disposition: item.disposition || '',
        blocked_reason: targetStatus.blockedReason || (item.status_hint === 'blocked' ? item.notes || 'blocked' : ''),
      }
      const priority = mapSeverityToPriority(item.severity)

      const existingTask = db.prepare(`
        SELECT *
        FROM tasks
        WHERE workspace_id = ?
          AND json_extract(metadata, '$.fingerprint') = ?
        ORDER BY CASE WHEN status IN ('done', 'cancelled') THEN 1 ELSE 0 END, updated_at DESC
        LIMIT 1
      `).get(workspaceId, fingerprint) as any

      if (shouldSkipResolvedReferenceItem(item)) {
        if (!dry_run && existingTask && !['done', 'cancelled'].includes(existingTask.status)) {
          const resolvedMetadata = mergeHabiMetadata(existingTask.metadata, {
            cancelled_reason: 'resolved_at_source',
          })
          db.prepare(`
            UPDATE tasks
            SET status = 'cancelled', metadata = ?, updated_at = ?
            WHERE id = ? AND workspace_id = ?
          `).run(JSON.stringify(resolvedMetadata), now, existingTask.id, workspaceId)
          addTaskComment(
            db,
            workspaceId,
            existingTask.id,
            'Foreman update\nSource backlog now marks this item as resolved/reference-only. Retiring the task to keep the queue honest.'
          )
        }
        actionPlan.push({
          action: 'skip',
          task_id: existingTask?.id,
          title: item.title,
          lane: item.lane,
          reason: 'resolved_reference_item',
        })
        continue
      }

      const shouldCreate = !existingTask || existingTask.status === 'done' || existingTask.status === 'cancelled'
      if (existingTask && shouldSkipCancelledFingerprintReuse(existingTask)) {
        actionPlan.push({
          action: 'skip',
          task_id: existingTask.id,
          title: item.title,
          lane: item.lane,
          reason: `cancelled_reason=${mergeHabiMetadata(existingTask.metadata, {}).cancelled_reason}`,
        })
        continue
      }
      if (shouldCreate) {
        const metadata = metadataPatch
        const contract = validateHabiTaskContract({ assigned_to: assignee, metadata })
        if (!contract.ok) {
          return NextResponse.json(
            { error: habiTaskContractErrorMessage(contract.missing, contract.invalidGate) },
            { status: 400 }
          )
        }

        actionPlan.push({
          action: 'create',
          title: item.title,
          assignee,
          lane: item.lane,
          status: targetStatus.status,
          priority,
          fingerprint,
          surface: item.surface || null,
          execution_mode: item.execution_mode || null,
          disposition: item.disposition || null,
        })

        if (dry_run) continue

        db.prepare(`
          INSERT INTO tasks (
            title, description, status, priority, project_id, project_ticket_no, assigned_to, created_by,
            created_at, updated_at, tags, metadata, workspace_id
          ) VALUES (
            ?, ?, ?, ?, ?, (
              SELECT ticket_counter + 1 FROM projects WHERE id = ? AND workspace_id = ?
            ), ?, ?, ?, ?, ?, ?, ?
          )
        `).run(
          item.title,
          `${item.objective}\n\nScope: ${item.scope}\n\nAcceptance: ${item.acceptance}`,
          targetStatus.status,
          priority,
          projectId,
          projectId,
          workspaceId,
          assignee,
          source || 'habi-ingest',
          now,
          now,
          JSON.stringify([`lane:${item.lane}`, 'habi']),
          JSON.stringify(metadata),
          workspaceId
        )
        db.prepare(`
          UPDATE projects
          SET ticket_counter = ticket_counter + 1, updated_at = ?
          WHERE id = ? AND workspace_id = ?
        `).run(now, projectId, workspaceId)

        const createdTask = db.prepare(`
          SELECT *
          FROM tasks
          WHERE workspace_id = ?
            AND json_extract(metadata, '$.fingerprint') = ?
          ORDER BY id DESC
          LIMIT 1
        `).get(workspaceId, fingerprint) as any

        created += 1
        touchedTaskIds.push(createdTask.id)
        ensureHabiTaskSubscriptions(createdTask.id, workspaceId, assignee, source || actor)
        addTaskComment(
          db,
          workspaceId,
          createdTask.id,
          formatIngestCreatedComment(item)
        )
        if (targetStatus.blockedReason) {
          addTaskComment(db, workspaceId, createdTask.id, formatGuardrailComment(targetStatus.blockedReason))
        }
        if (item.notes) {
          addTaskComment(db, workspaceId, createdTask.id, formatIngestNoteComment(item.notes))
        }
        db_helpers.logActivity(
          'task_ingested',
          'task',
          createdTask.id,
          source || actor,
          `Habi ingest created task "${item.title}"`,
          { lane: item.lane, fingerprint, status: targetStatus.status, priority },
          workspaceId
        )
        cancelSupersededDuplicates(db, workspaceId, createdTask.id, source || actor, now, metadata)
        eventBus.broadcast('task.created', createdTask)

        const dispatch = await dispatchTaskAssignment({
          workspaceId,
          actor: source || actor,
          assignee,
          taskId: createdTask.id,
          title: item.title,
          priority,
          status: targetStatus.status,
        })
        if (!dispatch.delivered) {
          const reason = dispatch.reason || 'unknown'
          if (reason === 'no_active_session' || reason === 'no_session_key') {
            addTaskComment(
              db,
              workspaceId,
              createdTask.id,
              formatOfflineComment(assignee)
            )
          }
          db_helpers.logActivity(
            'task_dispatch_failed',
            'task',
            createdTask.id,
            source || actor,
            `Habi ingest dispatch failed for ${assignee}`,
            { assignee, reason },
            workspaceId
          )
        }
        continue
      }

      const previousMetadata = mergeHabiMetadata(existingTask.metadata, {})
      const nextStatus = resolveExistingTaskStatus(existingTask.status, targetStatus.status, {
        executionMode: item.execution_mode,
        disposition: item.disposition,
        executionContextReady: previousMetadata.execution_context_ready === true,
        blockedReason: targetStatus.blockedReason || metadataPatch.blocked_reason,
        qcPassed: previousMetadata.qc_passed === true,
      })
      const mergedMetadata = mergeHabiMetadata(existingTask.metadata, metadataPatch)
      const contract = validateHabiTaskContract({ assigned_to: assignee, metadata: mergedMetadata })
      if (!contract.ok) {
        return NextResponse.json(
          { error: habiTaskContractErrorMessage(contract.missing, contract.invalidGate) },
          { status: 400 }
        )
      }

      actionPlan.push({
        action: 'update',
        task_id: existingTask.id,
        title: item.title,
        assignee,
        lane: item.lane,
        status_from: existingTask.status,
        status_to: nextStatus,
        priority_from: existingTask.priority,
        priority_to: priority,
        surface: item.surface || null,
        execution_mode: item.execution_mode || null,
        disposition: item.disposition || null,
      })

      if (dry_run) continue

      db.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, priority = ?, assigned_to = ?, status = ?, metadata = ?, updated_at = ?, project_id = ?
        WHERE id = ? AND workspace_id = ?
      `).run(
        item.title,
        `${item.objective}\n\nScope: ${item.scope}\n\nAcceptance: ${item.acceptance}`,
        priority,
        assignee,
        nextStatus,
        JSON.stringify(mergedMetadata),
        now,
        projectId,
        existingTask.id,
        workspaceId
      )

      updated += 1
      touchedTaskIds.push(existingTask.id)
      ensureHabiTaskSubscriptions(existingTask.id, workspaceId, assignee, source || actor)

      const syncChanges: string[] = []
      if (existingTask.status !== nextStatus) syncChanges.push(`Status: ${existingTask.status} -> ${nextStatus}`)
      if (existingTask.priority !== priority) syncChanges.push(`Priority: ${existingTask.priority} -> ${priority}`)
      if ((existingTask.assigned_to || '') !== assignee) syncChanges.push(`Assignee: ${existingTask.assigned_to || 'unassigned'} -> ${assignee}`)
      if (existingTask.title !== item.title) syncChanges.push(`Title updated to: ${item.title}`)
      if (syncChanges.length > 0) {
        addTaskComment(
          db,
          workspaceId,
          existingTask.id,
          formatIngestSyncComment(item, syncChanges)
        )
      }
      if (targetStatus.blockedReason && previousMetadata.blocked_reason !== targetStatus.blockedReason) {
        addTaskComment(db, workspaceId, existingTask.id, formatGuardrailComment(targetStatus.blockedReason))
      }
      if (item.notes && previousMetadata.origin_report !== item.source_report && previousMetadata.blocked_reason !== item.notes) {
        addTaskComment(db, workspaceId, existingTask.id, formatIngestNoteComment(item.notes))
      }
      db_helpers.logActivity(
        'task_ingested',
        'task',
        existingTask.id,
        source || actor,
        `Habi ingest updated task "${item.title}"`,
        {
          lane: item.lane,
          fingerprint,
          status_from: existingTask.status,
          status_to: nextStatus,
          priority_from: existingTask.priority,
          priority_to: priority,
        },
        workspaceId
      )
      cancelSupersededDuplicates(db, workspaceId, existingTask.id, source || actor, now, mergedMetadata)
    }

    return NextResponse.json({
      dry_run,
      source: source || actor,
      created,
      updated,
      planned: actionPlan,
      touched_task_ids: touchedTaskIds,
    })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/tasks/ingest/habi error')
    return NextResponse.json({ error: 'Failed to ingest Habi tasks' }, { status: 500 })
  }
}
