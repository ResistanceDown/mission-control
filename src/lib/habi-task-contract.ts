type TaskLike = {
  assigned_to?: string | null
  metadata?: string | Record<string, unknown> | null
}

export const REQUIRED_HABI_TASK_FIELDS = ['objective', 'scope', 'acceptance', 'evidence_path', 'gate_required', 'rollback'] as const
export const ALLOWED_HABI_GATES = new Set(['G1', 'G2', 'G3', 'G4'])

export function parseHabiTaskMetadata(metadata: TaskLike['metadata']): Record<string, unknown> {
  if (!metadata) return {}
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return metadata
}

export function isHabiTask(task: TaskLike): boolean {
  return String(task.assigned_to || '').toLowerCase().startsWith('habi-')
}

export function validateHabiTaskContract(task: TaskLike): { ok: boolean; missing: string[]; invalidGate?: string } {
  const metadata = parseHabiTaskMetadata(task.metadata)
  const missing: string[] = []
  for (const key of REQUIRED_HABI_TASK_FIELDS) {
    const value = metadata[key]
    if (!String(value ?? '').trim()) {
      missing.push(key)
    }
  }
  const gate = String(metadata.gate_required || '').trim()
  const invalidGate = gate && !ALLOWED_HABI_GATES.has(gate) ? gate : undefined
  return {
    ok: missing.length === 0 && !invalidGate,
    missing,
    invalidGate,
  }
}

export function habiTaskContractErrorMessage(missing: string[], invalidGate?: string): string {
  const parts: string[] = []
  if (missing.length > 0) {
    parts.push(`missing metadata fields: ${missing.join(', ')}`)
  }
  if (invalidGate) {
    parts.push(`invalid gate_required: ${invalidGate} (expected one of G1,G2,G3,G4)`)
  }
  return `Habi task contract validation failed (${parts.join('; ')})`
}
