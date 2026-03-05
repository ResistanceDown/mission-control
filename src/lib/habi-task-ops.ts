import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { db_helpers } from './db'
import { parseHabiTaskMetadata } from './habi-task-contract'

const HABI_DEFAULT_SUBSCRIBERS = (process.env.MISSION_CONTROL_HABI_DEFAULT_SUBSCRIBERS || 'jeremy')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const LANE_TO_ASSIGNEE: Record<string, string> = {
  control: 'habi-control',
  readiness: 'habi-readiness',
  growth: 'habi-growth',
}

export function inferHabiAssignee(lane?: string, fallback?: string | null): string {
  const normalizedLane = String(lane || '').trim().toLowerCase()
  if (fallback && String(fallback).trim()) return String(fallback).trim()
  return LANE_TO_ASSIGNEE[normalizedLane] || 'habi-control'
}

export function ensureHabiTaskSubscriptions(
  taskId: number,
  workspaceId: number,
  assignee?: string | null,
  actor?: string | null
) {
  const targets = new Set<string>()
  if (assignee) targets.add(String(assignee).trim())
  if (actor) targets.add(String(actor).trim())
  for (const subscriber of HABI_DEFAULT_SUBSCRIBERS) targets.add(subscriber)
  for (const recipient of targets) {
    if (!recipient) continue
    db_helpers.ensureTaskSubscription(taskId, recipient, workspaceId)
  }
}

export function mergeHabiMetadata(
  currentMetadata: string | Record<string, unknown> | null | undefined,
  updates: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...parseHabiTaskMetadata(currentMetadata || null),
    ...updates,
  }
}

export function computeHabiFingerprint(input: { lane: string; title: string; scope: string }): string {
  return createHash('sha256')
    .update(`${input.lane}::${input.title}::${input.scope}`)
    .digest('hex')
}

export function mapSeverityToPriority(severity?: string | null): 'critical' | 'high' | 'medium' | 'low' {
  const normalized = String(severity || '').trim().toUpperCase()
  if (normalized === 'P0') return 'critical'
  if (normalized === 'P1') return 'high'
  if (normalized === 'P2') return 'medium'
  return 'low'
}

export function evidencePathExists(evidencePath?: string | null): boolean {
  const target = String(evidencePath || '').trim()
  if (!target) return false
  try {
    return existsSync(target)
  } catch {
    return false
  }
}
