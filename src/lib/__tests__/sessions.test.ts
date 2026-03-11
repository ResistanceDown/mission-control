import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalEnv = process.env.OPENCLAW_STATE_DIR

afterEach(() => {
  if (originalEnv == null) delete process.env.OPENCLAW_STATE_DIR
  else process.env.OPENCLAW_STATE_DIR = originalEnv
  vi.resetModules()
})

describe('getAllGatewaySessions', () => {
  it('infers taskId from session transcript markers', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-sessions-'))
    process.env.OPENCLAW_STATE_DIR = root
    const dir = path.join(root, 'agents', 'habi-readiness', 'sessions')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify({
      'agent:habi-readiness:cron:test': {
        sessionId: 'abc-123',
        updatedAt: Date.now(),
        totalTokens: 10,
        inputTokens: 7,
        outputTokens: 3,
        contextTokens: 0,
        model: 'test-model'
      }
    }, null, 2))
    fs.writeFileSync(path.join(dir, 'abc-123.jsonl'), '{"message":{"content":[{"type":"text","text":"Mission Control assignment\nTask: #42 Planner sandbox redesign program"}]}}\n')

    const mod = await import('@/lib/sessions')
    const sessions = mod.getAllGatewaySessions(Infinity)
    expect(sessions[0]?.taskId).toBe(42)
  })
})
