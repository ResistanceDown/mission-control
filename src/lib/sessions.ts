import fs from 'node:fs'
import path from 'node:path'
import { config } from './config'

const sessionTaskIdCache = new Map<string, { mtimeMs: number; taskId: number | null }>()

export interface GatewaySession {
  /** Session store key, e.g. "agent:<agent>:main" */
  key: string
  /** Agent directory name, e.g. "<agent>" */
  agent: string
  sessionId: string
  updatedAt: number
  chatType: string
  channel: string
  model: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  contextTokens: number
  active: boolean
  taskId?: number | null
}

function inferChatTypeFromKey(key: string): string {
  const parts = String(key).split(':').filter(Boolean)
  return parts.length >= 3 ? parts[2] : 'unknown'
}

function getGatewaySessionStoreFiles(): string[] {
  const openclawStateDir = config.openclawStateDir
  if (!openclawStateDir) return []

  const agentsDir = path.join(openclawStateDir, 'agents')
  if (!fs.existsSync(agentsDir)) return []

  let agentDirs: string[]
  try {
    agentDirs = fs.readdirSync(agentsDir)
  } catch {
    return []
  }

  const files: string[] = []
  for (const agentName of agentDirs) {
    const sessionsFile = path.join(agentsDir, agentName, 'sessions', 'sessions.json')
    try {
      if (fs.statSync(sessionsFile).isFile()) files.push(sessionsFile)
    } catch {
      // Skip missing or unreadable session stores.
    }
  }
  return files
}

/**
 * Read all sessions from OpenClaw agent session stores on disk.
 *
 * OpenClaw stores sessions per-agent at:
 *   {OPENCLAW_STATE_DIR}/agents/{agentName}/sessions/sessions.json
 *
 * Each file is a JSON object keyed by session key (e.g. "agent:<agent>:main")
 * with session metadata as values.
 */

function getSessionTranscriptPath(agentName: string, sessionMeta: Record<string, any>): string | null {
  const configured = typeof sessionMeta.sessionFile === 'string' ? sessionMeta.sessionFile.trim() : ''
  if (configured) return configured
  const sessionId = typeof sessionMeta.sessionId === 'string' ? sessionMeta.sessionId.trim() : ''
  if (!sessionId || !config.openclawStateDir) return null
  return path.join(config.openclawStateDir, 'agents', agentName, 'sessions', `${sessionId}.jsonl`)
}

function inferSessionTaskId(agentName: string, sessionMeta: Record<string, any>): number | null {
  const transcriptPath = getSessionTranscriptPath(agentName, sessionMeta)
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null

  try {
    const stats = fs.statSync(transcriptPath)
    const cached = sessionTaskIdCache.get(transcriptPath)
    if (cached && cached.mtimeMs === stats.mtimeMs) return cached.taskId

    const raw = fs.readFileSync(transcriptPath, 'utf-8')
    const matches = [...raw.matchAll(/Task:\s*#(\d+)/g)]
    const taskId = matches.length > 0 ? Number(matches[matches.length - 1][1]) : null
    sessionTaskIdCache.set(transcriptPath, { mtimeMs: stats.mtimeMs, taskId })
    return taskId
  } catch {
    return null
  }
}

export function getAllGatewaySessions(activeWithinMs = 60 * 60 * 1000): GatewaySession[] {
  const sessions: GatewaySession[] = []
  const now = Date.now()
  for (const sessionsFile of getGatewaySessionStoreFiles()) {
    const agentName = path.basename(path.dirname(path.dirname(sessionsFile)))
    try {
      const raw = fs.readFileSync(sessionsFile, 'utf-8')
      const data = JSON.parse(raw)

      for (const [key, entry] of Object.entries(data)) {
        const s = entry as Record<string, any>
        const updatedAt = s.updatedAt || 0
        const chatType = typeof s.chatType === 'string' && s.chatType.trim()
          ? s.chatType.trim()
          : inferChatTypeFromKey(key)
        sessions.push({
          key,
          agent: agentName,
          sessionId: s.sessionId || '',
          updatedAt,
          chatType,
          channel: s.deliveryContext?.channel || s.lastChannel || s.channel || '',
          model: typeof s.model === 'object' && s.model?.primary ? String(s.model.primary) : String(s.model || ''),
          totalTokens: s.totalTokens || 0,
          inputTokens: s.inputTokens || 0,
          outputTokens: s.outputTokens || 0,
          contextTokens: s.contextTokens || 0,
          active: (now - updatedAt) < activeWithinMs,
          taskId: inferSessionTaskId(agentName, s),
        })
      }
    } catch {
      // Skip agents without valid session files
    }
  }

  // Sort by most recently updated first
  sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  return sessions
}

export function countStaleGatewaySessions(retentionDays: number): number {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0
  const cutoff = Date.now() - retentionDays * 86400000
  let stale = 0

  for (const sessionsFile of getGatewaySessionStoreFiles()) {
    try {
      const raw = fs.readFileSync(sessionsFile, 'utf-8')
      const data = JSON.parse(raw) as Record<string, any>
      for (const entry of Object.values(data)) {
        const updatedAt = Number((entry as any)?.updatedAt || 0)
        if (updatedAt > 0 && updatedAt < cutoff) stale += 1
      }
    } catch {
      // Ignore malformed session stores.
    }
  }

  return stale
}

export function pruneGatewaySessionsOlderThan(retentionDays: number): { deleted: number; filesTouched: number } {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return { deleted: 0, filesTouched: 0 }
  const cutoff = Date.now() - retentionDays * 86400000
  let deleted = 0
  let filesTouched = 0

  for (const sessionsFile of getGatewaySessionStoreFiles()) {
    try {
      const raw = fs.readFileSync(sessionsFile, 'utf-8')
      const data = JSON.parse(raw) as Record<string, any>
      const nextEntries: Record<string, any> = {}
      let fileDeleted = 0

      for (const [key, entry] of Object.entries(data)) {
        const updatedAt = Number((entry as any)?.updatedAt || 0)
        if (updatedAt > 0 && updatedAt < cutoff) {
          fileDeleted += 1
          continue
        }
        nextEntries[key] = entry
      }

      if (fileDeleted > 0) {
        const tempPath = `${sessionsFile}.tmp`
        fs.writeFileSync(tempPath, `${JSON.stringify(nextEntries, null, 2)}\n`, 'utf-8')
        fs.renameSync(tempPath, sessionsFile)
        deleted += fileDeleted
        filesTouched += 1
      }
    } catch {
      // Ignore malformed/unwritable session stores.
    }
  }

  return { deleted, filesTouched }
}

/**
 * Derive agent active/idle/offline status from their sessions.
 * Returns a map of agentName -> { status, lastActivity, channel }
 */
export function getAgentLiveStatuses(): Map<string, {
  status: 'active' | 'idle' | 'offline'
  lastActivity: number
  channel: string
}> {
  const sessions = getAllGatewaySessions()
  const now = Date.now()
  const statuses = new Map<string, { status: 'active' | 'idle' | 'offline'; lastActivity: number; channel: string }>()

  for (const session of sessions) {
    const existing = statuses.get(session.agent)
    // Keep the most recent session per agent
    if (!existing || session.updatedAt > existing.lastActivity) {
      const age = now - session.updatedAt
      let status: 'active' | 'idle' | 'offline'
      if (age < 5 * 60 * 1000) {
        status = 'active'       // Active within 5 minutes
      } else if (age < 60 * 60 * 1000) {
        status = 'idle'         // Active within 1 hour
      } else {
        status = 'offline'
      }
      statuses.set(session.agent, {
        status,
        lastActivity: session.updatedAt,
        channel: session.channel,
      })
    }
  }

  return statuses
}
