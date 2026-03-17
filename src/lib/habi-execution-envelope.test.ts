import { describe, expect, it } from 'vitest'
import {
  buildExecutionEnvelope,
  detectSessionScope,
  evaluateExecutionGovernance,
} from './habi-execution-envelope'

describe('detectSessionScope', () => {
  it('classifies task, probe, and main sessions', () => {
    expect(detectSessionScope('agent:habi-ui-fix-implementer:task:task-42')).toBe('task')
    expect(detectSessionScope('agent:habi-growth-draft-generator:probe:task-30')).toBe('probe')
    expect(detectSessionScope('agent:habi-readiness-auditor:main')).toBe('main')
  })
})

describe('buildExecutionEnvelope', () => {
  it('marks compatibility delivery explicitly', () => {
    const envelope = buildExecutionEnvelope({
      assignee: 'habi-growth-draft-generator',
      compatibilityAgent: 'habi-growth',
      routeKind: 'compatibility',
      sessionKey: 'agent:habi-growth:cron:abc',
      metadata: {
        origin_lane: 'growth',
        agent_job: 'growth-draft-generator',
        mutation_mode: 'artifact_only',
        evidence_path: '/tmp/evidence.md',
        runtime_model_policy: { class: 'trinity', fallbacks: [] },
      },
    })

    expect(envelope.route_kind).toBe('compatibility')
    expect(envelope.compatibility_agent).toBe('habi-growth')
    expect(envelope.session_scope).toBe('unknown')
    expect(envelope.approval_state).toBe('not_required')
    expect(envelope.evidence_state).toBe('ready')
  })
})

describe('evaluateExecutionGovernance', () => {
  it('blocks repo-write execution without founder approval', () => {
    const result = evaluateExecutionGovernance({
      assignee: 'habi-ui-fix-implementer',
      metadata: {
        origin_lane: 'readiness',
        agent_job: 'ui-fix-implementer',
        mutation_mode: 'repo_write',
        execution_mode: 'draft_pr',
        evidence_path: '/tmp/evidence.md',
        branch_name: 'codex/test',
        worktree_path: '/tmp/worktree',
        handoff_artifact: '/tmp/handoff.md',
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'Founder approval is required before repo-write execution can start.',
    })
  })

  it('accepts fully-declared repo-write execution with approval', () => {
    const result = evaluateExecutionGovernance({
      assignee: 'habi-ui-fix-implementer',
      metadata: {
        origin_lane: 'readiness',
        agent_job: 'ui-fix-implementer',
        mutation_mode: 'repo_write',
        execution_mode: 'draft_pr',
        evidence_path: '/tmp/evidence.md',
        branch_name: 'codex/test',
        worktree_path: '/tmp/worktree',
        handoff_artifact: '/tmp/handoff.md',
        founder_approved_at: '2026-03-17T00:00:00Z',
      },
    })

    expect(result).toEqual({ ok: true })
  })
})
