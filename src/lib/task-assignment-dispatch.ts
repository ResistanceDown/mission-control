import { getDatabase } from './db'
import { runOpenClaw } from './command'
import { logger } from './logger'
import { resolveSessionKeyForAgent, syncAgentSessionLinks } from './agent-session-link'
import { getAllGatewaySessions } from './sessions'

interface AssignmentDispatchInput {
  workspaceId: number
  actor: string
  assignee: string
  taskId: number
  title: string
  priority: string
  status: string
}

interface TaskMessageDispatchInput {
  workspaceId: number
  actor: string
  assignee: string
  taskId: number
  title: string
  message: string
}

function buildDispatchParams(sessionKey: string, message: string, idempotencyKey: string) {
  return JSON.stringify({
    sessionKey,
    message,
    idempotencyKey,
  })
}

async function sendViaGatewayChat(sessionKey: string, message: string, idempotencyKey: string) {
  await runOpenClaw(
    ['gateway', 'call', 'chat.send', '--params', buildDispatchParams(sessionKey, message, idempotencyKey)],
    { timeoutMs: 12000 }
  )
}

export async function dispatchTaskAssignment(input: AssignmentDispatchInput): Promise<{
  attempted: boolean
  delivered: boolean
  sessionKey?: string
  reason?: string
}> {
  const { workspaceId, actor, assignee, taskId, title, priority, status } = input
  const message = [
    'Mission Control assignment',
    `Task: #${taskId} ${title}`,
    `Assignee: ${assignee}`,
    `Priority: ${priority}`,
    `Status: ${status}`,
    `Assigned by: ${actor}`,
  ].join('\n')
  return dispatchTaskMessage({
    workspaceId,
    actor,
    assignee,
    taskId,
    title,
    message,
  })
}

export async function dispatchTaskMessage(input: TaskMessageDispatchInput): Promise<{
  attempted: boolean
  delivered: boolean
  sessionKey?: string
  reason?: string
}> {
  const { workspaceId, assignee, taskId, message } = input
  const db = getDatabase()
  const agent = db
    .prepare('SELECT id, session_key FROM agents WHERE lower(name) = lower(?) AND workspace_id = ?')
    .get(assignee, workspaceId) as { id: number; session_key: string | null } | undefined

  const activeSessions = getAllGatewaySessions()
    .filter((session) => session.active && session.agent.toLowerCase() === assignee.toLowerCase())
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const preferredSessionKey = activeSessions[0]?.key || activeSessions[0]?.sessionId || null
  const sessionKey = preferredSessionKey || agent?.session_key || resolveSessionKeyForAgent(assignee)
  if (!sessionKey) {
    return { attempted: false, delivered: false, reason: 'no_session_key' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (agent?.id && agent.session_key !== sessionKey) {
    db.prepare('UPDATE agents SET session_key = ?, last_seen = ?, updated_at = ? WHERE id = ? AND workspace_id = ?')
      .run(sessionKey, now, now, agent.id, workspaceId)
  }

  try {
    const idempotencyKey = `task-${taskId}-dispatch-${assignee.toLowerCase()}-${Date.now()}`
    await sendViaGatewayChat(sessionKey, message, idempotencyKey)
    return { attempted: true, delivered: true, sessionKey }
  } catch (err) {
    syncAgentSessionLinks(workspaceId)
    const relinked = resolveSessionKeyForAgent(assignee)
    if (relinked && relinked !== sessionKey) {
      try {
        const retryKey = `task-${taskId}-dispatch-retry-${assignee.toLowerCase()}-${Date.now()}`
        await sendViaGatewayChat(relinked, message, retryKey)
        return { attempted: true, delivered: true, sessionKey: relinked }
      } catch {
        // fall through to classified failure below
      }
    }

    const hasActiveSession = getAllGatewaySessions().some(
      (session) => session.active && session.agent.toLowerCase() === assignee.toLowerCase()
    )
    logger.warn(
      {
        err,
        assignee,
        sessionKey,
        taskId,
      },
      'Failed to dispatch task assignment to session'
    )
    return {
      attempted: true,
      delivered: false,
      sessionKey,
      reason: hasActiveSession ? 'gateway_send_failed' : 'no_active_session',
    }
  }
}
