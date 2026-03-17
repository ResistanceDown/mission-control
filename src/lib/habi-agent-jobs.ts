export type HabiLane = 'control' | 'readiness' | 'growth'
export type MutationMode = 'audit_only' | 'artifact_only' | 'repo_write'
export type RuntimeModelPolicyClass = 'local' | 'trinity' | 'frontier'

export type RuntimeModelPolicy = {
  class: RuntimeModelPolicyClass
  fallbacks: string[]
  reason: string
}

export type HabiAgentJobSpec = {
  lane: `habi-${HabiLane}`
  allowed_tools: string[]
  mutation_mode: MutationMode
  input_artifacts: string[]
  output_artifacts: string[]
  runtime_model_policy: RuntimeModelPolicy
}

export const HABI_AGENT_JOB_REGISTRY: Record<string, HabiAgentJobSpec> = {
  'readiness-auditor': {
    lane: 'habi-readiness',
    allowed_tools: ['playwright', 'rg', 'vitest'],
    mutation_mode: 'audit_only',
    input_artifacts: [],
    output_artifacts: ['readiness report', 'audit artifact'],
    runtime_model_policy: {
      class: 'local',
      fallbacks: ['trinity'],
      reason: 'deterministic audits should use the cheapest acceptable model first',
    },
  },
  'ui-issue-packager': {
    lane: 'habi-readiness',
    allowed_tools: ['playwright', 'rg'],
    mutation_mode: 'artifact_only',
    input_artifacts: ['ui audit report'],
    output_artifacts: ['issue pack'],
    runtime_model_policy: {
      class: 'local',
      fallbacks: ['trinity'],
      reason: 'issue packaging is structured synthesis and should stay low-cost when possible',
    },
  },
  'ui-fix-implementer': {
    lane: 'habi-readiness',
    allowed_tools: ['rg', 'vitest', 'playwright'],
    mutation_mode: 'repo_write',
    input_artifacts: ['issue pack'],
    output_artifacts: ['patch', 'validation evidence'],
    runtime_model_policy: {
      class: 'trinity',
      fallbacks: ['frontier'],
      reason: 'bounded UI implementation may need stronger reasoning than local defaults',
    },
  },
  'control-packet-synthesizer': {
    lane: 'habi-control',
    allowed_tools: ['rg'],
    mutation_mode: 'artifact_only',
    input_artifacts: ['readiness artifacts', 'growth artifacts'],
    output_artifacts: ['control packet'],
    runtime_model_policy: {
      class: 'local',
      fallbacks: ['trinity'],
      reason: 'control packet synthesis is evidence-based and cost-sensitive',
    },
  },
  'task-contract-validator': {
    lane: 'habi-control',
    allowed_tools: ['rg'],
    mutation_mode: 'audit_only',
    input_artifacts: ['task contract'],
    output_artifacts: ['validation result'],
    runtime_model_policy: {
      class: 'local',
      fallbacks: [],
      reason: 'contract validation should be deterministic and cheap',
    },
  },
  'founder-signal-extractor': {
    lane: 'habi-control',
    allowed_tools: ['rg'],
    mutation_mode: 'artifact_only',
    input_artifacts: ['conversation notes', 'founder artifacts'],
    output_artifacts: ['signal ledger entry'],
    runtime_model_policy: {
      class: 'trinity',
      fallbacks: [],
      reason: 'signal extraction benefits from stronger synthesis while staying free/low-cost',
    },
  },
  'growth-draft-generator': {
    lane: 'habi-growth',
    allowed_tools: ['rg'],
    mutation_mode: 'artifact_only',
    input_artifacts: ['signal ledger', 'proof artifacts'],
    output_artifacts: ['draft queue item'],
    runtime_model_policy: {
      class: 'trinity',
      fallbacks: [],
      reason: 'draft generation benefits from a stronger generalist model with low cost',
    },
  },
  'publish-gate-checker': {
    lane: 'habi-growth',
    allowed_tools: ['rg'],
    mutation_mode: 'audit_only',
    input_artifacts: ['draft artifact', 'gate record'],
    output_artifacts: ['publish gate check'],
    runtime_model_policy: {
      class: 'local',
      fallbacks: ['trinity'],
      reason: 'gate checks should remain deterministic and inexpensive',
    },
  },
  'ops-runtime-certifier': {
    lane: 'habi-control',
    allowed_tools: ['rg', 'vitest'],
    mutation_mode: 'audit_only',
    input_artifacts: ['runtime config', 'manifests', 'dispatch logs'],
    output_artifacts: ['runtime certification report'],
    runtime_model_policy: {
      class: 'trinity',
      fallbacks: ['frontier'],
      reason: 'cross-surface runtime verification may need stronger synthesis',
    },
  },
  'cross-repo-ingest-sync': {
    lane: 'habi-control',
    allowed_tools: ['rg'],
    mutation_mode: 'artifact_only',
    input_artifacts: ['paired repo artifacts'],
    output_artifacts: ['normalized sync artifact'],
    runtime_model_policy: {
      class: 'local',
      fallbacks: ['trinity'],
      reason: 'structured cross-repo sync should stay cheap unless synthesis quality degrades',
    },
  },
}

const LEGACY_LANE_AGENT_IDS: Record<HabiLane, string> = {
  control: 'habi-control',
  readiness: 'habi-readiness',
  growth: 'habi-growth',
}

const DEFAULT_JOB_BY_LANE: Record<HabiLane, string> = {
  control: 'task-contract-validator',
  readiness: 'readiness-auditor',
  growth: 'growth-draft-generator',
}

export function normalizeLane(value: unknown): HabiLane {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'readiness' || normalized === 'growth') return normalized
  return 'control'
}

export function isLegacyLaneAgentId(agentId: unknown) {
  const normalized = String(agentId || '').trim().toLowerCase()
  return Object.values(LEGACY_LANE_AGENT_IDS).includes(normalized)
}

export function getLegacyLaneAgentId(lane?: string | null) {
  const normalized = String(lane || '').trim().toLowerCase().replace(/^habi-/, '')
  return LEGACY_LANE_AGENT_IDS[normalizeLane(normalized)]
}

export function getAgentIdForJob(agentJob: string) {
  return `habi-${String(agentJob || '').trim()}`
}

export function getCompatibilityLaneAgentIdForAssignee(assignee?: string | null) {
  const normalized = String(assignee || '').trim().toLowerCase()
  if (!normalized.startsWith('habi-')) return null
  if (isLegacyLaneAgentId(normalized)) return null

  const explicitJob = normalized.replace(/^habi-/, '')
  if (HABI_AGENT_JOB_REGISTRY[explicitJob]) {
    return getLegacyLaneAgentId(HABI_AGENT_JOB_REGISTRY[explicitJob].lane)
  }

  return null
}

export function getJobLabel(agentJob?: string | null) {
  const normalized = String(agentJob || '').trim()
  if (!normalized) return 'Unknown job'
  return normalized.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export function getAgentJobSpec(agentJob?: string | null): HabiAgentJobSpec {
  const normalized = String(agentJob || '').trim()
  return HABI_AGENT_JOB_REGISTRY[normalized] || HABI_AGENT_JOB_REGISTRY['task-contract-validator']
}

export function inferAgentJob(input: {
  lane?: string | null
  executionMode?: string | null
  mutationMode?: string | null
  agentJob?: string | null
  assignee?: string | null
}) {
  const explicitJob = String(input.agentJob || '').trim()
  if (explicitJob && HABI_AGENT_JOB_REGISTRY[explicitJob]) return explicitJob

  const explicitAssignee = String(input.assignee || '').trim()
  if (explicitAssignee.startsWith('habi-')) {
    const candidate = explicitAssignee.replace(/^habi-/, '')
    if (HABI_AGENT_JOB_REGISTRY[candidate]) return candidate
  }

  const lane = normalizeLane(input.lane)
  const executionMode = String(input.executionMode || '').trim().toLowerCase()
  const mutationMode = String(input.mutationMode || '').trim().toLowerCase()

  if (lane === 'readiness') {
    if (mutationMode === 'repo_write' || executionMode === 'draft_pr') return 'ui-fix-implementer'
    if (mutationMode === 'artifact_only') return 'ui-issue-packager'
    return 'readiness-auditor'
  }

  if (lane === 'growth') {
    if (executionMode === 'audit_only' || mutationMode === 'audit_only') return 'publish-gate-checker'
    return 'growth-draft-generator'
  }

  if (mutationMode === 'artifact_only') return 'control-packet-synthesizer'
  return DEFAULT_JOB_BY_LANE[lane]
}

export function inferHabiAssignee(input: {
  lane?: string | null
  fallback?: string | null
  agentJob?: string | null
  executionMode?: string | null
  mutationMode?: string | null
}): string {
  const fallback = String(input.fallback || '').trim()
  if (fallback && !isLegacyLaneAgentId(fallback)) return fallback
  const job = inferAgentJob({
    lane: input.lane,
    assignee: fallback,
    agentJob: input.agentJob,
    executionMode: input.executionMode,
    mutationMode: input.mutationMode,
  })
  return getAgentIdForJob(job)
}

export function normalizeRuntimeModelPolicy(value: unknown, agentJob?: string | null): RuntimeModelPolicy {
  const fallback = getAgentJobSpec(agentJob).runtime_model_policy
  if (!value || typeof value !== 'object') return fallback
  const record = value as Record<string, unknown>
  const modelClass = String(record.class || '').trim() as RuntimeModelPolicyClass
  const fallbacks = Array.isArray(record.fallbacks)
    ? record.fallbacks.map((entry) => String(entry || '').trim()).filter(Boolean)
    : fallback.fallbacks
  const reason = String(record.reason || '').trim() || fallback.reason
  if (!['local', 'trinity', 'frontier'].includes(modelClass)) {
    return { ...fallback, fallbacks, reason: reason || fallback.reason }
  }
  return {
    class: modelClass,
    fallbacks,
    reason,
  }
}
