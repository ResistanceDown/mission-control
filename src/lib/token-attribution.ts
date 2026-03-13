import { getDatabase } from '@/lib/db'

export type TokenAttributionKind = 'task' | 'background' | 'unattributed'

export type TokenAttributionRecord<T extends { taskId?: number | null; agentName: string; sessionId: string; operation?: string; label?: string }> = T & {
  taskId: number | null
  attributionKind: TokenAttributionKind
  attributionReason: string
}

const BACKGROUND_AGENTS = new Set([
  'ops-cron',
  'habi-foreman',
  'ops-heartbeat',
  'habi-qc',
  'voice-fast',
  'discord-mlx',
])

const BACKGROUND_AGENT_PATTERNS = [
  /^canary\d+$/i,
  /^main-canary$/i,
  /^q\d+bench-/i,
]

const BACKGROUND_AGENT_OPERATIONS = new Map<string, Set<string>>([
  ['habi-control', new Set(['cron', 'channel'])],
])

const BACKGROUND_LABEL_PATTERNS = [
  /^Cron:\s*habi-task-ingest-/i,
  /^Cron:\s*habi-readiness-ui-audit-/i,
  /^Cron:\s*habi-readiness-flow-smoke-/i,
]

const INFER_FROM_ACTIVE_ASSIGNMENT_AGENTS = new Set([
  'habi-control',
])

function parseGrowthWeek(title: string): number | null {
  const match = String(title).match(/\(week-(\d+)\)/i)
  if (!match) return null
  const week = Number(match[1])
  return Number.isFinite(week) ? week : null
}

function normalizeTaskId(value: number | null | undefined): number | null {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : null
}

function loadActiveAssignments(workspaceId: number): Map<string, number[]> {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT assigned_to, id
    FROM tasks
    WHERE workspace_id = ?
      AND status IN ('assigned', 'in_progress')
      AND assigned_to IS NOT NULL
      AND assigned_to != ''
  `).all(workspaceId) as Array<{ assigned_to: string; id: number }>

  const out = new Map<string, number[]>()
  for (const row of rows) {
    const key = String(row.assigned_to)
    const existing = out.get(key) || []
    existing.push(Number(row.id))
    out.set(key, existing)
  }
  return out
}

function loadCurrentGrowthAssignment(workspaceId: number): number | null {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT id, title, created_at, updated_at
    FROM tasks
    WHERE workspace_id = ?
      AND assigned_to = 'habi-growth'
      AND status IN ('assigned', 'in_progress')
    ORDER BY updated_at DESC, created_at DESC, id DESC
  `).all(workspaceId) as Array<{ id: number; title: string; created_at: number; updated_at: number }>

  if (rows.length === 0) return null

  const ranked = rows
    .map((row) => ({
      id: Number(row.id),
      week: parseGrowthWeek(row.title),
      updatedAt: Number(row.updated_at),
      createdAt: Number(row.created_at),
    }))
    .sort((a, b) => {
      const weekA = a.week ?? -1
      const weekB = b.week ?? -1
      if (weekA !== weekB) return weekB - weekA
      if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
      if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt
      return b.id - a.id
    })

  return ranked[0]?.id ?? null
}

export function classifyTokenAttribution<T extends { taskId?: number | null; agentName: string; sessionId: string; operation?: string; label?: string }>(
  records: T[],
  workspaceId: number,
): Array<TokenAttributionRecord<T>> {
  const activeAssignments = loadActiveAssignments(workspaceId)
  const currentGrowthAssignment = loadCurrentGrowthAssignment(workspaceId)

  return records.map((record) => {
    const explicitTaskId = normalizeTaskId(record.taskId ?? null)
    if (explicitTaskId) {
      return {
        ...record,
        taskId: explicitTaskId,
        attributionKind: 'task' as const,
        attributionReason: 'explicit_task_id',
      }
    }

    if (BACKGROUND_AGENTS.has(record.agentName)) {
      return {
        ...record,
        taskId: null,
        attributionKind: 'background' as const,
        attributionReason: 'background_agent',
      }
    }

    if (BACKGROUND_AGENT_PATTERNS.some((pattern) => pattern.test(record.agentName))) {
      return {
        ...record,
        taskId: null,
        attributionKind: 'background' as const,
        attributionReason: 'background_agent_pattern',
      }
    }

    const backgroundOps = BACKGROUND_AGENT_OPERATIONS.get(record.agentName)
    if (backgroundOps && backgroundOps.has(String(record.operation || '').trim())) {
      return {
        ...record,
        taskId: null,
        attributionKind: 'background' as const,
        attributionReason: 'background_agent_operation',
      }
    }

    const label = String(record.label || '').trim()
    if (label && BACKGROUND_LABEL_PATTERNS.some((pattern) => pattern.test(label))) {
      return {
        ...record,
        taskId: null,
        attributionKind: 'background' as const,
        attributionReason: 'background_label_pattern',
      }
    }

    if (INFER_FROM_ACTIVE_ASSIGNMENT_AGENTS.has(record.agentName)) {
      const active = activeAssignments.get(record.agentName) || []
      if (active.length === 1) {
        return {
          ...record,
          taskId: active[0],
          attributionKind: 'task' as const,
          attributionReason: 'single_active_assignment',
        }
      }
      if (active.length > 1) {
        return {
          ...record,
          taskId: null,
          attributionKind: 'unattributed' as const,
          attributionReason: 'multiple_active_assignments',
        }
      }
    }

    if (record.agentName === 'habi-growth' && currentGrowthAssignment) {
      return {
        ...record,
        taskId: currentGrowthAssignment,
        attributionKind: 'task' as const,
        attributionReason: 'current_growth_assignment',
      }
    }

    return {
      ...record,
      taskId: null,
      attributionKind: 'unattributed' as const,
      attributionReason: 'missing_task_id',
    }
  })
}
