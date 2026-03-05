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
  hasEvidence: boolean
): { status: IngestStatus; blockedReason?: string } {
  let status: IngestStatus = hasEvidence ? 'in_progress' : 'assigned'
  switch (statusHint) {
    case 'blocked':
      status = 'in_progress'
      break
    case 'active':
      status = 'in_progress'
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
      const assignee = inferHabiAssignee(item.lane, item.assignee)
      const fingerprint =
        (item.fingerprint || '').trim() ||
        computeHabiFingerprint({
          lane: item.lane,
          title: item.title,
          scope: item.scope,
        })
      const hasEvidence = existsSync(item.evidence_path)
      const targetStatus = resolveTargetStatus(item.status_hint, hasEvidence)
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
        blocked_reason: targetStatus.blockedReason || (item.status_hint === 'blocked' ? item.notes || 'blocked' : ''),
      }
      const priority = mapSeverityToPriority(item.severity)

      const existingTask = db.prepare(`
        SELECT *
        FROM tasks
        WHERE workspace_id = ?
          AND json_extract(metadata, '$.fingerprint') = ?
        ORDER BY CASE WHEN status = 'done' THEN 1 ELSE 0 END, updated_at DESC
        LIMIT 1
      `).get(workspaceId, fingerprint) as any

      const shouldCreate = !existingTask || existingTask.status === 'done'
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
          `Ingest created task from ${item.source_report} (lane=${item.lane}, severity=${item.severity}).`
        )
        if (targetStatus.blockedReason) {
          addTaskComment(db, workspaceId, createdTask.id, `Auto-guardrail: ${targetStatus.blockedReason}`)
        }
        if (item.notes) {
          addTaskComment(db, workspaceId, createdTask.id, `Ingest note: ${item.notes}`)
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
              `Assignee ${assignee} is currently offline. Task is queued and will proceed when session is active.`
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

      const nextStatus = targetStatus.status
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

      addTaskComment(
        db,
        workspaceId,
        existingTask.id,
        `Ingest sync from ${item.source_report}: status ${existingTask.status} -> ${nextStatus}, priority ${existingTask.priority} -> ${priority}.`
      )
      if (targetStatus.blockedReason) {
        addTaskComment(db, workspaceId, existingTask.id, `Auto-guardrail: ${targetStatus.blockedReason}`)
      }
      if (item.notes) {
        addTaskComment(db, workspaceId, existingTask.id, `Ingest note: ${item.notes}`)
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
