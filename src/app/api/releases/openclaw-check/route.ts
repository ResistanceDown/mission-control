import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const execFileAsync = promisify(execFile)

interface OpenclawDryRunResult {
  currentVersion?: string
  targetVersion?: string
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

function resolveOpenclawBin(): string {
  const envBin = process.env.OPENCLAW_BIN?.trim()
  if (envBin && fs.existsSync(envBin)) return envBin

  const home = os.homedir()
  const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node')
  if (fs.existsSync(nvmVersionsDir)) {
    const candidates = fs
      .readdirSync(nvmVersionsDir)
      .map((version) => path.join(nvmVersionsDir, version, 'bin', 'openclaw'))
      .filter((candidate) => fs.existsSync(candidate))
      .sort()
    if (candidates.length > 0) return candidates[candidates.length - 1]
  }

  return '/opt/homebrew/bin/openclaw'
}

function parseInstalledVersion(stdout: string): string {
  const match = stdout.match(/OpenClaw\s+([0-9]+\.[0-9]+\.[0-9]+)/i)
  return match?.[1] || ''
}

export async function GET(request: Request) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const openclawBin = resolveOpenclawBin()
    const safeCwd = process.env.OPENCLAW_WORKDIR || os.homedir()

    const versionResult = await execFileAsync(openclawBin, ['--version'], {
      cwd: safeCwd,
      timeout: 6000,
      maxBuffer: 256 * 1024,
    })
    const currentVersion = parseInstalledVersion(versionResult.stdout || '')

    const { stdout } = await execFileAsync(openclawBin, ['update', '--dry-run', '--json'], {
      cwd: safeCwd,
      timeout: 12000,
      maxBuffer: 1024 * 1024,
    })
    const parsed = JSON.parse(stdout) as OpenclawDryRunResult
    const latestVersion = String(parsed.targetVersion || '').trim()

    if (!currentVersion || !latestVersion) {
      return NextResponse.json(
        { updateAvailable: false, currentVersion, latestVersion },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return NextResponse.json(
      {
        updateAvailable: compareSemver(latestVersion, currentVersion) > 0,
        currentVersion,
        latestVersion,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        updateAvailable: false,
        currentVersion: '',
        latestVersion: '',
        error: String(error?.message || 'openclaw_check_failed'),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
