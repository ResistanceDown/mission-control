import { getDatabase } from './db'
import { runOpenClaw } from './command'
import { logger } from './logger'
import { resolveSessionLinkForAgent, syncAgentSessionLinks } from './agent-session-link'
import { getAllGatewaySessions } from './sessions'
import { buildScopedAgentSessionKey, pickBestAgentSession } from './agent-session-routing'
import { detectSessionScope, type HabiRouteKind, type HabiSessionScope } from './habi-execution-envelope'

interface AssignmentDispatchInput {
  workspaceId: number
  actor: string
  assignee: string
  taskId: number
  title: string
  priority: string
  status: string
  details?: string[]
  sessionRouting?: 'default' | 'task' | 'probe'
}

interface TaskMessageDispatchInput {
  workspaceId: number
  actor: string
  assignee: string
  taskId: number
  title: string
  message: string
  sessionRouting?: 'default' | 'task' | 'probe'
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
  compatibilityAgent?: string | null
  routeKind: HabiRouteKind
  sessionScope: HabiSessionScope
}> {
  const {
    workspaceId,
    actor,
    assignee,
    taskId,
    title,
    priority,
    status,
    details = [],
    sessionRouting = 'default',
  } = input
  const message = [
    'Mission Control assignment',
    `Task: #${taskId} ${title}`,
    `Assignee: ${assignee}`,
    `Priority: ${priority}`,
    `Status: ${status}`,
    `Assigned by: ${actor}`,
    ...details.filter(Boolean),
  ].join('\n')
  return dispatchTaskMessage({
    workspaceId,
    actor,
    assignee,
    taskId,
    title,
    message,
    sessionRouting,
  })
}

export async function dispatchTaskMessage(input: TaskMessageDispatchInput): Promise<{
  attempted: boolean
  delivered: boolean
  sessionKey?: string
  reason?: string
  compatibilityAgent?: string | null
  routeKind: HabiRouteKind
  sessionScope: HabiSessionScope
}> {
  const { workspaceId, assignee, taskId, message, sessionRouting = 'default' } = input
  const db = getDatabase()
  const agent = db
    .prepare('SELECT id, session_key FROM agents WHERE lower(name) = lower(?) AND workspace_id = ?')
    .get(assignee, workspaceId) as { id: number; session_key: string | null } | undefined

  const activeSessions = getAllGatewaySessions().filter(
    (session) => session.active && session.agent.toLowerCase() === assignee.toLowerCase()
  )
  const preferredActiveSession = pickBestAgentSession(activeSessions)
  const preferredSessionKey = preferredActiveSession?.key || preferredActiveSession?.sessionId || null
  const resolvedLink = resolveSessionLinkForAgent(assignee)
  const scopedSessionKey =
    sessionRouting === 'task'
      ? buildScopedAgentSessionKey(assignee, 'task', taskId)
      : sessionRouting === 'probe'
        ? buildScopedAgentSessionKey(assignee, 'probe', taskId)
        : null
  const candidateSessionKeys = [
    scopedSessionKey,
    preferredSessionKey,
    agent?.session_key || null,
    resolvedLink.sessionKey,
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
  const compatibilityAgent =
    candidateSessionKeys[0] && candidateSessionKeys[0] !== resolvedLink.sessionKey
      ? null
      : preferredSessionKey || agent?.session_key
        ? null
        : resolvedLink.compatibilityAgent
  if (candidateSessionKeys.length === 0) {
    return { attempted: false, delivered: false, reason: 'no_session_key', routeKind: 'blocked', sessionScope: 'unknown' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (agent?.id && !compatibilityAgent && !scopedSessionKey && agent.session_key !== candidateSessionKeys[0]) {
    db.prepare('UPDATE agents SET session_key = ?, last_seen = ?, updated_at = ? WHERE id = ? AND workspace_id = ?')
      .run(candidateSessionKeys[0], now, now, agent.id, workspaceId)
  }

  let deliveredSessionKey: string | null = null
  let lastError: unknown = null

  for (const sessionKey of candidateSessionKeys) {
    try {
      const idempotencyKey = `task-${taskId}-dispatch-${assignee.toLowerCase()}-${Date.now()}`
      await sendViaGatewayChat(sessionKey, message, idempotencyKey)
      deliveredSessionKey = sessionKey
      break
    } catch (err) {
      lastError = err
    }
  }

  if (deliveredSessionKey) {
    return {
      attempted: true,
      delivered: true,
      sessionKey: deliveredSessionKey,
      compatibilityAgent,
      routeKind: compatibilityAgent ? 'compatibility' : 'direct',
      sessionScope: detectSessionScope(deliveredSessionKey),
    }
  }

  syncAgentSessionLinks(workspaceId)
  const relinkedLink = resolveSessionLinkForAgent(assignee)
  const relinked = relinkedLink.sessionKey
  if (relinked && !candidateSessionKeys.includes(relinked)) {
    try {
      const retryKey = `task-${taskId}-dispatch-retry-${assignee.toLowerCase()}-${Date.now()}`
      await sendViaGatewayChat(relinked, message, retryKey)
      return {
        attempted: true,
        delivered: true,
        sessionKey: relinked,
        compatibilityAgent: relinkedLink.compatibilityAgent,
        routeKind: relinkedLink.compatibilityAgent ? 'compatibility' : 'direct',
        sessionScope: detectSessionScope(relinked),
      }
    } catch (err) {
      lastError = err
    }
  }

  const hasActiveSession = getAllGatewaySessions().some(
    (session) => session.active && session.agent.toLowerCase() === assignee.toLowerCase()
  )
  logger.warn(
    {
      err: lastError,
      assignee,
      sessionKeysTried: candidateSessionKeys,
      taskId,
    },
    'Failed to dispatch task assignment to session'
  )
  return {
    attempted: true,
    delivered: false,
    sessionKey: candidateSessionKeys[0],
    compatibilityAgent,
    routeKind: 'blocked',
    sessionScope: detectSessionScope(candidateSessionKeys[0]),
    reason: hasActiveSession ? 'gateway_send_failed' : 'no_active_session',
  }
}
