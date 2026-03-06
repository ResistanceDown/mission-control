import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase, db_helpers } from '@/lib/db'
import { logger } from '@/lib/logger'
import { mutationLimiter } from '@/lib/rate-limit'
import { dispatchTaskMessage } from '@/lib/task-assignment-dispatch'
import { syncAgentSessionLinks } from '@/lib/agent-session-link'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const resolvedParams = await params
    const taskId = Number.parseInt(resolvedParams.id, 10)
    if (!Number.isFinite(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const note = String(body?.message || '').trim()
    const workspaceId = auth.user.workspace_id ?? 1
    const db = getDatabase()
    const task = db
      .prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?')
      .get(taskId, workspaceId) as any

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (!task.assigned_to) {
      return NextResponse.json({ error: 'Task has no assignee' }, { status: 400 })
    }

    syncAgentSessionLinks(workspaceId)

    const message = [
      'Mission Control task ping',
      `Task: #${task.id} ${task.title}`,
      `Current status: ${task.status}`,
      `Priority: ${task.priority}`,
      `Requested by: ${auth.user.username}`,
      note ? `Operator note: ${note}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const dispatch = await dispatchTaskMessage({
      workspaceId,
      actor: auth.user.username,
      assignee: task.assigned_to,
      taskId: task.id,
      title: task.title,
      message,
    })

    if (!dispatch.delivered) {
      const reason = dispatch.reason || 'unknown'
      const warning =
        reason === 'no_active_session' || reason === 'no_session_key'
          ? `Assignee ${task.assigned_to} is currently offline; ping is queued context only. Action: relink/check session in Office/Agents and retry.`
          : `Assignee ${task.assigned_to} could not be reached right now (reason=${reason}). Action: retry ping; if it repeats, relink/check session in Office/Agents.`

      const now = Math.floor(Date.now() / 1000)
      db.prepare(`
        INSERT INTO comments (task_id, author, content, created_at, parent_id, mentions, workspace_id)
        VALUES (?, ?, ?, ?, NULL, NULL, ?)
      `).run(task.id, 'system', warning, now, workspaceId)

      db_helpers.createNotification(
        auth.user.username,
        'status_change',
        'Task dispatch failed',
        `Task "${task.title}" ping to ${task.assigned_to} failed (${reason}).`,
        'task',
        task.id,
        workspaceId
      )
      db_helpers.logActivity(
        'task_dispatch_failed',
        'task',
        task.id,
        auth.user.username,
        `Task assignee ping failed for ${task.assigned_to}`,
        { assignee: task.assigned_to, reason },
        workspaceId
      )
      return NextResponse.json(
        { delivered: false, warning_posted: true, reason },
        { status: 409 }
      )
    }

    db_helpers.logActivity(
      'task_dispatch_ping',
      'task',
      task.id,
      auth.user.username,
      `Task assignee ping delivered to ${task.assigned_to}`,
      { assignee: task.assigned_to, session_key: dispatch.sessionKey || null },
      workspaceId
    )

    return NextResponse.json({
      delivered: true,
      assignee: task.assigned_to,
      session_key: dispatch.sessionKey || null,
    })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/tasks/[id]/ping-assignee error')
    return NextResponse.json({ error: 'Failed to ping assignee' }, { status: 500 })
  }
}
