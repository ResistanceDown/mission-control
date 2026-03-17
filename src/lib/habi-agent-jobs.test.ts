import { describe, expect, it } from 'vitest'
import {
  getCompatibilityLaneAgentIdForAssignee,
  getAgentIdForJob,
  inferAgentJob,
  inferHabiAssignee,
  normalizeRuntimeModelPolicy,
} from './habi-agent-jobs'

describe('habi-agent-jobs', () => {
  it('maps readiness draft work to the ui fix implementer job', () => {
    expect(
      inferAgentJob({ lane: 'readiness', executionMode: 'draft_pr' })
    ).toBe('ui-fix-implementer')
    expect(
      inferHabiAssignee({ lane: 'readiness', executionMode: 'draft_pr' })
    ).toBe(getAgentIdForJob('ui-fix-implementer'))
  })

  it('maps growth audit work to the publish gate checker job', () => {
    expect(
      inferAgentJob({ lane: 'growth', executionMode: 'audit_only' })
    ).toBe('publish-gate-checker')
  })

  it('preserves explicit narrow assignees', () => {
    expect(
      inferHabiAssignee({ lane: 'readiness', fallback: 'habi-ui-fix-implementer' })
    ).toBe('habi-ui-fix-implementer')
  })

  it('maps narrow assignees back to compatibility lane agents during soak', () => {
    expect(getCompatibilityLaneAgentIdForAssignee('habi-ui-fix-implementer')).toBe('habi-readiness')
    expect(getCompatibilityLaneAgentIdForAssignee('habi-control')).toBeNull()
  })

  it('normalizes missing runtime policy from job defaults', () => {
    expect(normalizeRuntimeModelPolicy(undefined, 'readiness-auditor')).toEqual({
      class: 'local',
      fallbacks: ['trinity'],
      reason: 'deterministic audits should use the cheapest acceptable model first',
    })
  })
})
