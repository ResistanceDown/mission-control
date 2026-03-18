import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { config } from '@/lib/config'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { heavyLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { validateBody, spawnAgentSchema } from '@/lib/validation'
import { callOpenClawGateway, parseGatewayJsonOutput } from '@/lib/openclaw-gateway'
import { runOpenClaw } from '@/lib/command'

function getPreferredToolsProfile(): string {
  return String(process.env.OPENCLAW_TOOLS_PROFILE || 'coding').trim() || 'coding'
}

export function buildSpawnPayload(input: {
  task: string
  label: string
  timeoutSeconds: number
  model?: string | null
}) {
  const spawnPayload: Record<string, unknown> = {
    task: input.task,
    label: input.label,
    runTimeoutSeconds: input.timeoutSeconds,
    tools: {
      profile: getPreferredToolsProfile(),
    },
  }

  const model = typeof input.model === 'string' ? input.model.trim() : ''
  if (model) {
    spawnPayload.model = model
  }

  return spawnPayload
}

async function runSpawnWithCompatibility(spawnPayload: Record<string, unknown>) {
  try {
    return await callOpenClawGateway('sessions_spawn', spawnPayload, 15000)
  } catch (error: any) {
    const rawErr = String(error?.message || error?.stderr || '').toLowerCase()
    const isUnknownMethod = rawErr.includes('unknown method') && rawErr.includes('sessions_spawn')
    if (!isUnknownMethod) throw error

    const agentId = String(process.env.OPENCLAW_SPAWN_AGENT || 'main').trim() || 'main'
    try {
      const result = await runOpenClaw(
        [
          'agent',
          '--agent',
          agentId,
          '--message',
          String(spawnPayload.task || ''),
          '--timeout',
          String(Math.max(10, Number(spawnPayload.runTimeoutSeconds) || 300)),
          '--json',
        ],
        { timeoutMs: 20000 },
      )

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        compatibility: { spawnFallback: 'openclaw-agent', agentId },
      }
    } catch (fallbackError: any) {
      const fallbackStdout = String(fallbackError?.stdout || '')
      const fallbackStderr = String(fallbackError?.stderr || fallbackError?.message || '')
      const parsed = parseGatewayJsonOutput(fallbackStdout) || parseGatewayJsonOutput(fallbackStderr)
      if (parsed && typeof parsed === 'object') {
        const parsedAny = parsed as any
        if (parsedAny.status === 'ok' || parsedAny.runId || parsedAny.result) {
          return {
            stdout: fallbackStdout || JSON.stringify(parsedAny),
            stderr: fallbackStderr,
            compatibility: { spawnFallback: 'openclaw-agent', agentId, exitStatus: 'nonzero-json-ok' },
          }
        }
      }
      throw fallbackError
    }
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = heavyLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const result = await validateBody(request, spawnAgentSchema)
    if ('error' in result) return result.error
    const { task, model, label, timeoutSeconds } = result.data

    const timeout = timeoutSeconds

    // Generate spawn ID
    const spawnId = `spawn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Construct the spawn command
    // Using OpenClaw's sessions_spawn function via clawdbot CLI
    const spawnPayload = buildSpawnPayload({
      task,
      model,
      label,
      timeoutSeconds: timeout,
    })

    try {
      // Execute the spawn command through the gateway. Try with tools.profile first,
      // fall back without it for older gateways that don't support the field.
      let stdout = ''
      let stderr = ''
      let compatibilityFallbackUsed = false
      try {
        const result = await runSpawnWithCompatibility(spawnPayload) as any
        stdout = typeof result?.stdout === 'string' ? result.stdout : JSON.stringify(result)
      } catch (firstError: any) {
        const rawErr = String(firstError?.stderr || firstError?.message || '').toLowerCase()
        const likelySchemaMismatch =
          rawErr.includes('unknown field') ||
          rawErr.includes('unknown key') ||
          rawErr.includes('invalid argument') ||
          rawErr.includes('tools') ||
          rawErr.includes('profile')
        if (!likelySchemaMismatch) throw firstError

        const fallbackPayload = { ...spawnPayload }
        delete (fallbackPayload as any).tools
        const fallback = await runSpawnWithCompatibility(fallbackPayload) as any
        stdout = typeof fallback?.stdout === 'string' ? fallback.stdout : JSON.stringify(fallback)
        compatibilityFallbackUsed = true
      }

      // Parse the response to extract session info
      let sessionInfo = null
      try {
        const parsed = JSON.parse(stdout)
        sessionInfo =
          parsed?.sessionId ||
          parsed?.session_id ||
          parsed?.sessionInfo ||
          parsed?.result?.meta?.agentMeta?.sessionId ||
          parsed?.result?.meta?.session_id ||
          null
      } catch (parseError) {
        logger.error({ err: parseError }, 'Failed to parse session info')
      }

      return NextResponse.json({
        success: true,
        spawnId,
        sessionInfo,
        task,
        model,
        label,
        timeoutSeconds: timeout,
        createdAt: Date.now(),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        compatibility: {
          toolsProfile: getPreferredToolsProfile(),
          fallbackUsed: compatibilityFallbackUsed,
        },
      })

    } catch (execError: any) {
      logger.error({ err: execError }, 'Spawn execution error')
      
      return NextResponse.json({
        success: false,
        spawnId,
        error: execError.message || 'Failed to spawn agent',
        task,
        model,
        label,
        timeoutSeconds: timeout,
        createdAt: Date.now()
      }, { status: 500 })
    }

  } catch (error) {
    logger.error({ err: error }, 'Spawn API error')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Get spawn history
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

    // In a real implementation, you'd store spawn history in a database
    // For now, we'll try to read recent spawn activity from logs
    
    try {
      if (!config.logsDir) {
        return NextResponse.json({ history: [] })
      }

      const files = await readdir(config.logsDir)
      const logFiles = await Promise.all(
        files
          .filter((file) => file.endsWith('.log'))
          .map(async (file) => {
            const fullPath = join(config.logsDir, file)
            const stats = await stat(fullPath)
            return { file, fullPath, mtime: stats.mtime.getTime() }
          })
      )

      const recentLogs = logFiles
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 5)

      const lines: string[] = []

      for (const log of recentLogs) {
        const content = await readFile(log.fullPath, 'utf-8')
        const matched = content
          .split('\n')
          .filter((line) => line.includes('sessions_spawn'))
        lines.push(...matched)
      }

      const spawnHistory = lines
        .slice(-limit)
        .map((line, index) => {
          try {
            const timestampMatch = line.match(
              /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/
            )
            const modelMatch = line.match(/model[:\s]+"([^"]+)"/)
            const taskMatch = line.match(/task[:\s]+"([^"]+)"/)

            return {
              id: `history-${Date.now()}-${index}`,
              timestamp: timestampMatch
                ? new Date(timestampMatch[1]).getTime()
                : Date.now(),
              model: modelMatch ? modelMatch[1] : 'unknown',
              task: taskMatch ? taskMatch[1] : 'unknown',
              status: 'completed',
              line: line.trim()
            }
          } catch (parseError) {
            return null
          }
        })
        .filter(Boolean)

      return NextResponse.json({ history: spawnHistory })

    } catch (logError) {
      // If we can't read logs, return empty history
      return NextResponse.json({ history: [] })
    }

  } catch (error) {
    logger.error({ err: error }, 'Spawn history API error')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
