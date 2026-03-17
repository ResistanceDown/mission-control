import { getDatabase } from './db'
import { logger } from './logger'
import { getAllGatewaySessions, type GatewaySession } from './sessions'
import { getCompatibilityLaneAgentIdForAssignee } from './habi-agent-jobs'

function normalizeAgentName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

function pickBestSession(sessions: GatewaySession[]): GatewaySession | null {
  if (sessions.length === 0) return null
  const sorted = [...sessions].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
  return sorted[0] || null
}

export function resolveSessionKeyForAgent(agentName: string): string | null {
  const direct = resolveSessionLinkForAgent(agentName)
  return direct.sessionKey
}

export function resolveSessionLinkForAgent(agentName: string): {
  sessionKey: string | null
  compatibilityAgent: string | null
} {
  const normalized = normalizeAgentName(agentName)
  const sessions = getAllGatewaySessions().filter(
    (session) => normalizeAgentName(session.agent) === normalized
  )
  const best = pickBestSession(sessions)
  if (best) {
    return {
      sessionKey: best.key || best.sessionId || null,
      compatibilityAgent: null,
    }
  }

  const compatibilityAgent = getCompatibilityLaneAgentIdForAssignee(agentName)
  if (!compatibilityAgent) {
    return { sessionKey: null, compatibilityAgent: null }
  }

  const fallbackSessions = getAllGatewaySessions().filter(
    (session) => normalizeAgentName(session.agent) === normalizeAgentName(compatibilityAgent)
  )
  const fallback = pickBestSession(fallbackSessions)
  return {
    sessionKey: fallback ? (fallback.key || fallback.sessionId || null) : null,
    compatibilityAgent: fallback ? compatibilityAgent : null,
  }
}

export function syncAgentSessionLinks(workspaceId: number): {
  updated: number
  matched: number
} {
  try {
    const db = getDatabase()
    const agents = db
      .prepare('SELECT id, name, session_key FROM agents WHERE workspace_id = ?')
      .all(workspaceId) as Array<{ id: number; name: string; session_key: string | null }>

    const updateSessionKey = db.prepare(
      'UPDATE agents SET session_key = ?, last_seen = ?, updated_at = ? WHERE id = ? AND workspace_id = ?'
    )
    const now = Math.floor(Date.now() / 1000)
    let updated = 0
    let matched = 0

    const tx = db.transaction(() => {
      for (const agent of agents) {
        const { sessionKey: linkedSessionKey, compatibilityAgent } = resolveSessionLinkForAgent(agent.name)
        if (!linkedSessionKey) continue
        matched += 1
        if (compatibilityAgent) continue
        if (agent.session_key === linkedSessionKey) continue
        updateSessionKey.run(linkedSessionKey, now, now, agent.id, workspaceId)
        updated += 1
      }
    })

    tx()
    return { updated, matched }
  } catch (err) {
    logger.warn({ err }, 'Failed to sync agent session links')
    return { updated: 0, matched: 0 }
  }
}
