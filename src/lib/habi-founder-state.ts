import { parseHabiTaskMetadata } from './habi-task-contract'

export type FounderTaskState =
  | 'needs_founder_approval'
  | 'queued_for_execution'
  | 'in_execution'
  | 'waiting_on_qc'
  | 'ready_to_merge'
  | 'ready_for_founder_closeout'
  | 'background_work'

type FounderTaskInput = {
  status?: string | null
  assigned_to?: string | null
  metadata?: string | Record<string, unknown> | null
  aegisApproved?: boolean
}

export function hasFounderApproval(metadata: string | Record<string, unknown> | null | undefined): boolean {
  const parsed = parseHabiTaskMetadata(metadata)
  return Boolean(parsed.founder_approved_at || parsed.founder_approved_for_execution)
}

export function isWaitingOnQc(metadata: string | Record<string, unknown> | null | undefined): boolean {
  const parsed = parseHabiTaskMetadata(metadata)
  return Boolean(parsed.waiting_on_qc)
}

export function isLiveInMain(metadata: string | Record<string, unknown> | null | undefined): boolean {
  const parsed = parseHabiTaskMetadata(metadata)
  return parsed.live_in_main === true
}

export function isLiveApprovalExempt(metadata: string | Record<string, unknown> | null | undefined): boolean {
  const parsed = parseHabiTaskMetadata(metadata)
  return parsed.live_approval_exempt === true
}

export function requiresLiveApproval(metadata: string | Record<string, unknown> | null | undefined): boolean {
  const parsed = parseHabiTaskMetadata(metadata)
  if (parsed.live_approval_exempt === true) return false
  return String(parsed.execution_mode || '').trim().toLowerCase() === 'draft_pr'
}

export function classifyFounderTaskState(input: FounderTaskInput): FounderTaskState {
  const metadata = parseHabiTaskMetadata(input.metadata)
  const status = String(input.status || '').trim()
  const originLane = String(metadata.origin_lane || '').trim().toLowerCase()
  const executionMode = String(metadata.execution_mode || '').trim().toLowerCase()
  const disposition = String(metadata.disposition || '').trim().toLowerCase()
  const founderApproved = hasFounderApproval(metadata)
  const waitingOnQc = isWaitingOnQc(metadata)
  const aegisApproved = input.aegisApproved === true
  const liveInMain = isLiveInMain(metadata)
  const liveApprovalExempt = isLiveApprovalExempt(metadata)

  if (status === 'quality_review') {
    if (!aegisApproved || waitingOnQc) return 'waiting_on_qc'
    if (liveInMain || liveApprovalExempt || !requiresLiveApproval(metadata)) return 'ready_for_founder_closeout'
    return 'ready_to_merge'
  }

  if (status === 'review') {
    if (waitingOnQc) return 'waiting_on_qc'
    return 'needs_founder_approval'
  }

  if (status === 'in_progress') {
    return 'in_execution'
  }

  if (status === 'assigned') {
    if (founderApproved) return 'queued_for_execution'
    if (originLane === 'growth') return 'background_work'
    if (
      originLane === 'readiness' ||
      originLane === 'control' ||
      executionMode === 'draft_pr' ||
      executionMode === 'audit_only' ||
      disposition === 'execute_now' ||
      disposition === 'founder_decision_needed'
    ) {
      return 'needs_founder_approval'
    }
  }

  return 'background_work'
}

export function founderStateReviewLabel(input: FounderTaskInput): string {
  const metadata = parseHabiTaskMetadata(input.metadata)
  const founderState = classifyFounderTaskState(input)

  switch (founderState) {
    case 'needs_founder_approval':
      if (String(input.status || '') === 'review') {
        return 'Implementation is complete enough for your QC decision. Queue it for QC or send it back with a concrete note.'
      }
      return 'This task is waiting on founder approval before execution begins.'
    case 'queued_for_execution':
      return 'Founder approval is recorded. This is queued for execution pickup.'
    case 'in_execution':
      return 'Execution is active. Review the latest evidence before changing state.'
    case 'waiting_on_qc':
      return 'QC is still running. This is not ready for founder approval yet.'
    case 'ready_to_merge':
      return 'QC passed. This branch preview is ready to merge into main once you approve delivery.'
    case 'ready_for_founder_closeout':
      return 'QC passed and delivery is live. This is ready for your final approval.'
    default:
      if (String(metadata.blocked_reason || '').trim()) {
        return 'This task is active, but currently blocked. Review the blocker summary before deciding what to do next.'
      }
      return 'Use the evidence and validation below to make the next decision.'
  }
}

export function founderStateJudgmentLabel(input: FounderTaskInput): string {
  const founderState = classifyFounderTaskState(input)
  switch (founderState) {
    case 'needs_founder_approval':
      if (String(input.status || '') === 'review') {
        return 'Queue this for QC if the evidence looks complete, or send it back with a concrete note.'
      }
      return 'Approve execution if this should start now, or leave it queued.'
    case 'queued_for_execution':
      return 'No founder action is needed right now. Execution pickup should start this automatically.'
    case 'in_execution':
      return 'Confirm the evidence matches the scope before changing the task state.'
    case 'waiting_on_qc':
      return 'Wait for QC to finish before making a founder approval decision, or send it back if you already know the work is incomplete.'
    case 'ready_to_merge':
      return 'Approve merge to main. Final founder closeout unlocks automatically after the merge succeeds.'
    case 'ready_for_founder_closeout':
      return 'Approve and mark done, or send it back if the result does not meet the bar.'
    default:
      return 'Open the task for context and use the evidence to decide the next step.'
  }
}
