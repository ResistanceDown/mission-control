import fs from 'node:fs/promises'
import path from 'node:path'
import { runCommand } from './command'
import { parseHabiTaskMetadata } from './habi-task-contract'

const DEFAULT_HABI_ROOT = process.env.HABI_ROOT || '/Users/kokoro/Coding/Habi'
const PT_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

export type HabiExecutionMetadata = {
  objective?: string
  scope?: string
  acceptance?: string
  evidence_path?: string
  gate_required?: string
  rollback?: string
  execution_mode?: string
  branch_name?: string
  worktree_path?: string
  validation_commands?: string[]
  handoff_artifact?: string
  blocked_reason?: string
  execution_context_ready?: boolean
  execution_last_prepared_at?: string
  execution_last_prepared_by?: string
  execution_next_update_due?: string
  [key: string]: unknown
}

type PrepareExecutionInput = {
  taskId: number
  title: string
  assignee: string
  actor: string
  metadata: string | Record<string, unknown> | null | undefined
}

type PrepareExecutionResult =
  | {
      ok: true
      metadata: HabiExecutionMetadata
      kickoffComment: string
      dispatchDetails: string[]
    }
  | {
      ok: false
      metadata: HabiExecutionMetadata
      failureComment: string
      failureReason: string
    }

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function commandSucceeds(command: string, args: string[], cwd?: string) {
  try {
    await runCommand(command, args, { cwd, timeoutMs: 120_000 })
    return true
  } catch {
    return false
  }
}

async function resolveBaseRef(repoRoot: string) {
  if (await commandSucceeds('git', ['-C', repoRoot, 'rev-parse', '--verify', 'main'])) {
    return 'main'
  }
  return 'origin/main'
}

function formatPtLabel(date: Date) {
  return `${PT_FORMATTER.format(date)} PT`
}

function buildKickoffComment(input: {
  taskId: number
  title: string
  assignee: string
  metadata: HabiExecutionMetadata
  nextUpdateDue: string
}) {
  const validation = Array.isArray(input.metadata.validation_commands) && input.metadata.validation_commands.length > 0
    ? input.metadata.validation_commands.join(' | ')
    : 'not set'
  return [
    'Execution kickoff',
    `Task: #${input.taskId} ${input.title}`,
    `Assignee: ${input.assignee}`,
    `Mode: ${String(input.metadata.execution_mode || 'audit_only')}`,
    `Branch: ${String(input.metadata.branch_name || 'not set')}`,
    `Worktree: ${String(input.metadata.worktree_path || 'not set')}`,
    `Evidence: ${String(input.metadata.evidence_path || 'not set')}`,
    `Handoff: ${String(input.metadata.handoff_artifact || 'not set')}`,
    `Validation: ${validation}`,
    `Next update due: ${input.nextUpdateDue}`,
    'Required updates: Progress update | Execution blocked | Ready for review',
  ].join('\n')
}

function buildFailureComment(input: {
  taskId: number
  title: string
  assignee: string
  reason: string
  metadata: HabiExecutionMetadata
}) {
  return [
    'Execution blocked',
    `Task: #${input.taskId} ${input.title}`,
    `Assignee: ${input.assignee}`,
    `Reason: ${input.reason}`,
    `Mode: ${String(input.metadata.execution_mode || 'audit_only')}`,
    `Branch: ${String(input.metadata.branch_name || 'not set')}`,
    `Worktree: ${String(input.metadata.worktree_path || 'not set')}`,
    `Evidence: ${String(input.metadata.evidence_path || 'not set')}`,
    'Action: repair execution context before treating this task as active work.',
  ].join('\n')
}

async function writeTemplateIfMissing(targetPath: string, content: string) {
  if (!targetPath) return
  if (await pathExists(targetPath)) return
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, content, 'utf8')
}

async function ensureDraftPrWorktree(repoRoot: string, branchName: string, worktreePath: string) {
  if (!branchName.trim()) {
    throw new Error('branch_name is required for draft_pr execution')
  }
  if (!worktreePath.trim()) {
    throw new Error('worktree_path is required for draft_pr execution')
  }

  const worktreeGitPath = path.join(worktreePath, '.git')
  if (await pathExists(worktreeGitPath)) {
    return
  }

  if (await pathExists(worktreePath)) {
    throw new Error(`worktree_path already exists but is not a git worktree: ${worktreePath}`)
  }

  await fs.mkdir(path.dirname(worktreePath), { recursive: true })
  const baseRef = await resolveBaseRef(repoRoot)
  const branchExists = await commandSucceeds('git', ['-C', repoRoot, 'rev-parse', '--verify', branchName])
  if (branchExists) {
    await runCommand('git', ['-C', repoRoot, 'worktree', 'add', worktreePath, branchName], { timeoutMs: 120_000 })
  } else {
    await runCommand('git', ['-C', repoRoot, 'worktree', 'add', '-b', branchName, worktreePath, baseRef], {
      timeoutMs: 120_000,
    })
  }

  await runCommand('git', ['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 30_000 })
}

async function ensureEvidenceArtifacts(
  taskId: number,
  title: string,
  assignee: string,
  metadata: HabiExecutionMetadata,
  nextUpdateDue: string,
) {
  const validation = Array.isArray(metadata.validation_commands) && metadata.validation_commands.length > 0
    ? metadata.validation_commands.map((command) => `- ${command}`).join('\n')
    : '- not set'

  if (metadata.evidence_path) {
    await writeTemplateIfMissing(
      metadata.evidence_path,
      [
        `# Execution Evidence: #${taskId} ${title}`,
        '',
        `- Status: Kickoff created`,
        `- Assignee: ${assignee}`,
        `- Mode: ${String(metadata.execution_mode || 'audit_only')}`,
        `- Branch: ${String(metadata.branch_name || 'not set')}`,
        `- Worktree: ${String(metadata.worktree_path || 'not set')}`,
        `- Next Update Due: ${nextUpdateDue}`,
        '',
        '## Objective',
        String(metadata.objective || ''),
        '',
        '## Scope',
        String(metadata.scope || ''),
        '',
        '## Validation Commands',
        validation,
        '',
        '## Progress Updates',
        '- Kickoff complete. Add evidence updates here.',
        '',
      ].join('\n'),
    )
  }

  if (metadata.handoff_artifact) {
    await writeTemplateIfMissing(
      metadata.handoff_artifact,
      [
        `# Handoff: #${taskId} ${title}`,
        '',
        `- Assignee: ${assignee}`,
        `- Mode: ${String(metadata.execution_mode || 'audit_only')}`,
        `- Evidence: ${String(metadata.evidence_path || 'not set')}`,
        '',
        '## Summary',
        '- Pending',
        '',
        '## Validation',
        validation,
        '',
        '## Review Notes',
        '- Pending',
        '',
      ].join('\n'),
    )
  }
}

export function isKickoffComment(content?: string | null) {
  const firstLine = String(content || '').split('\n', 1)[0].trim().toLowerCase()
  return firstLine === 'execution kickoff' || firstLine === 'execution started.'
}

export function isExecutionProgressComment(content?: string | null) {
  const firstLine = String(content || '').split('\n', 1)[0].trim().toLowerCase()
  return firstLine === 'progress update' || firstLine === 'execution blocked' || firstLine === 'ready for review'
}

export async function prepareHabiTaskExecution(input: PrepareExecutionInput): Promise<PrepareExecutionResult> {
  const metadata = parseHabiTaskMetadata(input.metadata) as HabiExecutionMetadata
  const executionMode = String(metadata.execution_mode || 'audit_only').trim()
  const nextUpdateDue = formatPtLabel(new Date(Date.now() + 2 * 60 * 60 * 1000))

  try {
    if (executionMode === 'draft_pr') {
      await ensureDraftPrWorktree(
        DEFAULT_HABI_ROOT,
        String(metadata.branch_name || ''),
        String(metadata.worktree_path || ''),
      )
    }

    await ensureEvidenceArtifacts(input.taskId, input.title, input.assignee, metadata, nextUpdateDue)

    const preparedMetadata: HabiExecutionMetadata = {
      ...metadata,
      blocked_reason: '',
      execution_context_ready: true,
      execution_last_prepared_at: new Date().toISOString(),
      execution_last_prepared_by: input.actor,
      execution_next_update_due: nextUpdateDue,
    }

    return {
      ok: true,
      metadata: preparedMetadata,
      kickoffComment: buildKickoffComment({
        taskId: input.taskId,
        title: input.title,
        assignee: input.assignee,
        metadata: preparedMetadata,
        nextUpdateDue,
      }),
      dispatchDetails: [
        `Mode: ${executionMode || 'audit_only'}`,
        `Branch: ${String(preparedMetadata.branch_name || 'not set')}`,
        `Worktree: ${String(preparedMetadata.worktree_path || 'not set')}`,
        `Evidence: ${String(preparedMetadata.evidence_path || 'not set')}`,
        `Handoff: ${String(preparedMetadata.handoff_artifact || 'not set')}`,
        `Validation: ${
          Array.isArray(preparedMetadata.validation_commands) && preparedMetadata.validation_commands.length > 0
            ? preparedMetadata.validation_commands.join(' | ')
            : 'not set'
        }`,
        `Next update due: ${nextUpdateDue}`,
        'Reply with one of: Progress update | Execution blocked | Ready for review',
      ],
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const blockedMetadata: HabiExecutionMetadata = {
      ...metadata,
      blocked_reason: reason,
      execution_context_ready: false,
      execution_last_prepared_at: new Date().toISOString(),
      execution_last_prepared_by: input.actor,
    }
    return {
      ok: false,
      metadata: blockedMetadata,
      failureReason: reason,
      failureComment: buildFailureComment({
        taskId: input.taskId,
        title: input.title,
        assignee: input.assignee,
        reason,
        metadata: blockedMetadata,
      }),
    }
  }
}
