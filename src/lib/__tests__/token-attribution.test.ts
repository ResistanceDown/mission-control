import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({
    prepare: () => ({
      all: () => [],
    }),
  }),
}))

describe('token attribution', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('keeps explicit task ids attributed', async () => {
    const { classifyTokenAttribution } = await import('@/lib/token-attribution')

    const [record] = classifyTokenAttribution([
      {
        taskId: 42,
        agentName: 'habi-ui-fix-implementer',
        sessionId: 'agent:habi-ui-fix-implementer:task:task-42',
      },
    ], 1)

    expect(record.taskId).toBe(42)
    expect(record.attributionKind).toBe('task')
    expect(record.attributionReason).toBe('explicit_task_id')
  })

  it('treats Habi cron publish and readiness jobs as background spend', async () => {
    const { classifyTokenAttribution } = await import('@/lib/token-attribution')

    const records = classifyTokenAttribution([
      {
        agentName: 'habi-publish-gate-checker',
        sessionId: 'agent:habi-publish-gate-checker:cron:abc',
        label: 'Cron: habi-x-publish-scheduled-15m',
      },
      {
        agentName: 'habi-readiness-auditor',
        sessionId: 'agent:habi-readiness-auditor:cron:def',
        label: 'Cron: habi-readiness-gate-4h',
      },
    ], 1)

    expect(records[0]?.attributionKind).toBe('background')
    expect(records[0]?.attributionReason).toBe('background_agent')
    expect(records[1]?.attributionKind).toBe('background')
    expect(records[1]?.attributionReason).toBe('background_agent')
  })
})
