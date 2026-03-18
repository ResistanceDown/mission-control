import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSpawnPayload } from './route'

describe('buildSpawnPayload', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('omits model when gateway default should be used', () => {
    vi.stubEnv('OPENCLAW_TOOLS_PROFILE', 'coding')

    const payload = buildSpawnPayload({
      task: 'Investigate flaky UI',
      label: 'worker-1',
      timeoutSeconds: 300,
      model: '',
    })

    expect(payload).toMatchObject({
      task: 'Investigate flaky UI',
      label: 'worker-1',
      runTimeoutSeconds: 300,
      tools: { profile: 'coding' },
    })
    expect(payload).not.toHaveProperty('model')
  })

  it('preserves an explicit model when provided', () => {
    vi.stubEnv('OPENCLAW_TOOLS_PROFILE', 'coding')

    const payload = buildSpawnPayload({
      task: 'Investigate flaky UI',
      label: 'worker-1',
      timeoutSeconds: 300,
      model: 'sonnet',
    })

    expect(payload).toMatchObject({
      task: 'Investigate flaky UI',
      label: 'worker-1',
      runTimeoutSeconds: 300,
      model: 'sonnet',
      tools: { profile: 'coding' },
    })
  })
})
