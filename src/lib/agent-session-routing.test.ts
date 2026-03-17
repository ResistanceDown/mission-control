import { describe, expect, it } from 'vitest'
import type { GatewaySession } from './sessions'
import {
  buildScopedAgentSessionKey,
  isMainAgentSessionKey,
  pickBestAgentSession,
} from './agent-session-routing'

function makeSession(overrides: Partial<GatewaySession> = {}): GatewaySession {
  return {
    key: 'agent:habi-ui-fix-implementer:main',
    agent: 'habi-ui-fix-implementer',
    sessionId: 'session-1',
    updatedAt: 100,
    chatType: 'unknown',
    channel: '',
    model: 'ollama/qwen3:14b',
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    contextTokens: 0,
    active: true,
    ...overrides,
  }
}

describe('agent-session-routing', () => {
  it('detects main sessions', () => {
    expect(isMainAgentSessionKey('agent:habi-ui-fix-implementer:main')).toBe(true)
    expect(isMainAgentSessionKey('agent:habi-ui-fix-implementer:task:task-42')).toBe(false)
  })

  it('builds scoped session keys', () => {
    expect(buildScopedAgentSessionKey('habi-ui-fix-implementer', 'task', 42)).toBe(
      'agent:habi-ui-fix-implementer:task:task-42'
    )
    expect(buildScopedAgentSessionKey('Habi UI Fix Implementer', 'probe', 7)).toBe(
      'agent:habi-ui-fix-implementer:probe:task-7'
    )
  })

  it('prefers active scoped sessions over active main sessions', () => {
    const main = makeSession({
      key: 'agent:habi-ui-fix-implementer:main',
      updatedAt: 200,
    })
    const scoped = makeSession({
      key: 'agent:habi-ui-fix-implementer:task:task-42',
      sessionId: 'session-2',
      updatedAt: 150,
    })

    expect(pickBestAgentSession([main, scoped])?.key).toBe(scoped.key)
  })

  it('falls back to newest session when scoped preference is disabled', () => {
    const main = makeSession({
      key: 'agent:habi-ui-fix-implementer:main',
      updatedAt: 200,
    })
    const scoped = makeSession({
      key: 'agent:habi-ui-fix-implementer:task:task-42',
      sessionId: 'session-2',
      updatedAt: 150,
    })

    expect(pickBestAgentSession([main, scoped], { preferScoped: false })?.key).toBe(main.key)
  })
})
