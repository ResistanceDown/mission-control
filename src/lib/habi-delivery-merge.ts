import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseHabiTaskMetadata } from './habi-task-contract'

const HABI_ROOT = process.env.HABI_ROOT || '/Users/kokoro/Coding/Habi'
const DELIVERY_WORKTREE = path.join(HABI_ROOT, '.worktrees', 'main-delivery')

type MergeSuccess = {
  ok: true
  alreadyMerged: boolean
  commitSha: string | null
  validationCommands: string[]
  validationSummary: string[]
  worktreePath: string
}

type MergeFailure = {
  ok: false
  error: string
  validationCommands: string[]
  validationSummary: string[]
  worktreePath: string
}

export type MergeTaskBranchResult = MergeSuccess | MergeFailure

function runCommand(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  })
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(output || `${command} ${args.join(' ')} failed`)
  }
  return (result.stdout || '').trim()
}

function runShell(command: string, cwd: string) {
  const shell = process.env.SHELL || '/bin/zsh'
  const result = spawnSync(shell, ['-lc', command], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  })
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(output || command)
  }
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
}

function commandOutput(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  })
  return {
    ok: result.status === 0,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
  }
}

function ensureDeliveryWorktree() {
  if (!fs.existsSync(path.join(HABI_ROOT, '.git'))) {
    throw new Error(`Habi repository not found at ${HABI_ROOT}`)
  }

  if (!fs.existsSync(DELIVERY_WORKTREE)) {
    fs.mkdirSync(path.dirname(DELIVERY_WORKTREE), { recursive: true })
    runCommand('git', ['-C', HABI_ROOT, 'worktree', 'add', '--detach', DELIVERY_WORKTREE, 'main'], HABI_ROOT)
  }

  const status = runCommand('git', ['status', '--porcelain'], DELIVERY_WORKTREE)
  if (status.trim()) {
    throw new Error('Delivery worktree has local changes. Clean it before automated merges can run.')
  }

  runCommand('git', ['checkout', '--detach', 'main'], DELIVERY_WORKTREE)

  return DELIVERY_WORKTREE
}

function normalizeValidationCommands(metadata: Record<string, unknown>) {
  const raw = metadata.validation_commands
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value || '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
  return []
}

export function mergeTaskBranchToMain(input: {
  taskId: number
  branchName: string
  actor: string
  metadata: string | Record<string, unknown> | null | undefined
}): MergeTaskBranchResult {
  const metadata = parseHabiTaskMetadata(input.metadata)
  const validationCommands = normalizeValidationCommands(metadata)
  const validationSummary: string[] = []

  try {
    runCommand('git', ['-C', HABI_ROOT, 'rev-parse', '--verify', input.branchName], HABI_ROOT)
  } catch (error) {
    return {
      ok: false,
      error: `Branch ${input.branchName} does not exist locally.`,
      validationCommands,
      validationSummary,
      worktreePath: DELIVERY_WORKTREE,
    }
  }

  const alreadyMerged = commandOutput('git', ['-C', HABI_ROOT, 'merge-base', '--is-ancestor', input.branchName, 'main'], HABI_ROOT).ok
  if (alreadyMerged) {
    return {
      ok: true,
      alreadyMerged: true,
      commitSha: runCommand('git', ['-C', HABI_ROOT, 'rev-parse', 'main'], HABI_ROOT),
      validationCommands,
      validationSummary,
      worktreePath: DELIVERY_WORKTREE,
    }
  }

  let worktreePath = DELIVERY_WORKTREE
  try {
    worktreePath = ensureDeliveryWorktree()
    const previousMainSha = runCommand('git', ['-C', HABI_ROOT, 'rev-parse', 'refs/heads/main'], HABI_ROOT)
    runCommand('git', ['merge', '--no-ff', '--no-commit', input.branchName], worktreePath)

    for (const command of validationCommands) {
      const output = runShell(command, worktreePath)
      validationSummary.push(`${command}\n${output}`.trim())
    }

    runCommand(
      'git',
      ['commit', '-m', `Merge ${input.branchName} for task #${input.taskId} (${input.actor})`],
      worktreePath,
    )
    const newMainSha = runCommand('git', ['rev-parse', 'HEAD'], worktreePath)
    runCommand('git', ['-C', HABI_ROOT, 'update-ref', 'refs/heads/main', newMainSha, previousMainSha], HABI_ROOT)

    return {
      ok: true,
      alreadyMerged: false,
      commitSha: newMainSha,
      validationCommands,
      validationSummary,
      worktreePath,
    }
  } catch (error) {
    commandOutput('git', ['merge', '--abort'], worktreePath)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Merge to main failed.',
      validationCommands,
      validationSummary,
      worktreePath,
    }
  }
}
