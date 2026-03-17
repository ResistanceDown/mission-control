import type { GatewaySession } from './sessions'

function normalizeSessionKey(value: string | null | undefined): string {
  return String(value || '').trim()
}

function normalizeAgentToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
}

export function isMainAgentSessionKey(sessionKey: string | null | undefined): boolean {
  return normalizeSessionKey(sessionKey).endsWith(':main')
}

export function buildScopedAgentSessionKey(
  agentName: string,
  scope: 'task' | 'probe',
  taskId: number
): string {
  return `agent:${normalizeAgentToken(agentName)}:${scope}:task-${taskId}`
}

export function pickBestAgentSession(
  sessions: GatewaySession[],
  options?: { preferScoped?: boolean }
): GatewaySession | null {
  if (sessions.length === 0) return null
  const preferScoped = options?.preferScoped !== false
  const sorted = [...sessions].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    if (preferScoped) {
      const aMain = isMainAgentSessionKey(a.key)
      const bMain = isMainAgentSessionKey(b.key)
      if (aMain !== bMain) return aMain ? 1 : -1
    }
    return b.updatedAt - a.updatedAt
  })
  return sorted[0] || null
}
