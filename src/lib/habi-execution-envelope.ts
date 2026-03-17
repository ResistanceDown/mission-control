import { isMainAgentSessionKey } from './agent-session-routing'
import { getCompatibilityLaneAgentIdForAssignee, inferAgentJob, isLegacyLaneAgentId } from './habi-agent-jobs'
import { hasFounderApproval } from './habi-founder-state'
import { parseHabiTaskMetadata } from './habi-task-contract'

export type HabiRouteKind = 'direct' | 'compatibility' | 'blocked'
export type HabiSessionScope = 'task' | 'probe' | 'main' | 'unknown'
export type HabiApprovalState = 'approved' | 'pending' | 'not_required'
export type HabiEvidenceState = 'ready' | 'missing' | 'partial' | 'blocked'

export type HabiExecutionEnvelope = {
  agent_job: string | null
  route_kind: HabiRouteKind
  session_scope: HabiSessionScope
  mutation_mode: string | null
  approval_state: HabiApprovalState
  evidence_state: HabiEvidenceState
  runtime_model_policy: Record<string, unknown> | null
  compatibility_agent: string | null
  blocked_reason: string | null
  updated_at: string
}

type EnvelopeInput = {
  metadata?: string | Record<string, unknown> | null
  assignee?: string | null
  routeKind?: HabiRouteKind
  sessionKey?: string | null
  compatibilityAgent?: string | null
  blockedReason?: string | null
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function detectSessionScope(sessionKey?: string | null): HabiSessionScope {
  const normalized = String(sessionKey || '').trim()
  if (!normalized) return 'unknown'
  if (normalized.includes(':task:')) return 'task'
  if (normalized.includes(':probe:')) return 'probe'
  if (isMainAgentSessionKey(normalized)) return 'main'
  return 'unknown'
}

export function deriveApprovalState(metadata?: string | Record<string, unknown> | null): HabiApprovalState {
  const parsed = parseHabiTaskMetadata(metadata)
  const mutationMode = String(parsed.mutation_mode || '').trim().toLowerCase()
  const executionMode = String(parsed.execution_mode || '').trim().toLowerCase()
  const gateRequired = String(parsed.gate_required || '').trim().toUpperCase()
  const requiresApproval =
    mutationMode === 'repo_write' ||
    executionMode === 'draft_pr' ||
    gateRequired === 'G2' ||
    gateRequired === 'G3' ||
    gateRequired === 'G4'

  if (!requiresApproval) return 'not_required'
  return hasFounderApproval(parsed) ? 'approved' : 'pending'
}

export function deriveEvidenceState(metadata?: string | Record<string, unknown> | null): HabiEvidenceState {
  const parsed = parseHabiTaskMetadata(metadata)
  if (String(parsed.blocked_reason || '').trim()) return 'blocked'

  const evidencePath = String(parsed.evidence_path || '').trim()
  const handoffArtifact = String(parsed.handoff_artifact || '').trim()
  const mutationMode = String(parsed.mutation_mode || '').trim().toLowerCase()

  if (!evidencePath) return 'missing'
  if (mutationMode === 'repo_write' && !handoffArtifact) return 'partial'
  return 'ready'
}

export function buildExecutionEnvelope(input: EnvelopeInput): HabiExecutionEnvelope {
  const parsed = parseHabiTaskMetadata(input.metadata)
  const inferredAgentJob = inferAgentJob({
    lane: typeof parsed.origin_lane === 'string' ? parsed.origin_lane : undefined,
    assignee: input.assignee,
    agentJob: typeof parsed.agent_job === 'string' ? parsed.agent_job : undefined,
    executionMode: typeof parsed.execution_mode === 'string' ? parsed.execution_mode : undefined,
    mutationMode: typeof parsed.mutation_mode === 'string' ? parsed.mutation_mode : undefined,
  })
  const compatibilityAgent =
    input.compatibilityAgent ||
    (input.routeKind === 'compatibility'
      ? getCompatibilityLaneAgentIdForAssignee(input.assignee)
      : null)
  return {
    agent_job: inferredAgentJob || null,
    route_kind: input.routeKind || (input.blockedReason ? 'blocked' : compatibilityAgent ? 'compatibility' : 'direct'),
    session_scope: detectSessionScope(input.sessionKey),
    mutation_mode: String(parsed.mutation_mode || '').trim() || null,
    approval_state: deriveApprovalState(parsed),
    evidence_state: deriveEvidenceState({
      ...parsed,
      blocked_reason: input.blockedReason || parsed.blocked_reason || null,
    }),
    runtime_model_policy: normalizeRecord(parsed.runtime_model_policy),
    compatibility_agent: compatibilityAgent,
    blocked_reason: String(input.blockedReason || parsed.blocked_reason || '').trim() || null,
    updated_at: new Date().toISOString(),
  }
}

export function withExecutionEnvelope(
  metadata: string | Record<string, unknown> | null | undefined,
  input: Omit<EnvelopeInput, 'metadata'>
): Record<string, unknown> {
  const parsed = parseHabiTaskMetadata(metadata)
  return {
    ...parsed,
    execution_envelope: buildExecutionEnvelope({
      ...input,
      metadata: parsed,
    }),
  }
}

export function evaluateExecutionGovernance(input: {
  metadata?: string | Record<string, unknown> | null
  assignee?: string | null
}) {
  const parsed = parseHabiTaskMetadata(input.metadata)
  const assignee = String(input.assignee || '').trim()
  const mutationMode = String(parsed.mutation_mode || '').trim().toLowerCase()
  const executionMode = String(parsed.execution_mode || '').trim().toLowerCase()
  const branchName = String(parsed.branch_name || '').trim()
  const worktreePath = String(parsed.worktree_path || '').trim()
  const evidencePath = String(parsed.evidence_path || '').trim()
  const handoffArtifact = String(parsed.handoff_artifact || '').trim()
  const routeCompatibilityOnly = isLegacyLaneAgentId(assignee)

  if (!evidencePath) {
    return { ok: false as const, reason: 'Missing evidence_path blocks execution start.' }
  }
  if (routeCompatibilityOnly) {
    return { ok: false as const, reason: 'Execution start blocked: legacy compatibility agents cannot own new direct execution starts.' }
  }
  if (mutationMode === 'repo_write' || executionMode === 'draft_pr') {
    if (!hasFounderApproval(parsed)) {
      return { ok: false as const, reason: 'Founder approval is required before repo-write execution can start.' }
    }
    if (!branchName) {
      return { ok: false as const, reason: 'Missing branch_name blocks repo-write execution start.' }
    }
    if (!worktreePath) {
      return { ok: false as const, reason: 'Missing worktree_path blocks repo-write execution start.' }
    }
    if (!handoffArtifact) {
      return { ok: false as const, reason: 'Missing handoff_artifact blocks repo-write execution start.' }
    }
  }

  return { ok: true as const }
}
