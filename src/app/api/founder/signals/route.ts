import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'

const HABI_ROOT = process.env.HABI_ROOT || '/Users/kokoro/Coding/Habi'
const SIGNAL_LEDGER_JSON = path.join(HABI_ROOT, 'output', 'founder', 'customer-signal-ledger.json')
const SIGNAL_LEDGER_MD = path.join(HABI_ROOT, 'output', 'founder', 'customer-signal-ledger.md')

function toSlug(value: string) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entry'
}

function nowPt() {
  const now = new Date()
  const human = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now).replace(',', '') + ' PT'
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')
  return { human, timestamp }
}

function renderMarkdown(entries: Array<Record<string, string>>) {
  const lines = [
    '# Customer Signal Ledger',
    '',
    'Signals captured from founder calls, waitlist conversations, objections, and beta feedback.',
    '',
    '| Captured At | Persona | Problem | Urgency | Workaround | Willingness To Pay | Objection | Next Action | Source |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]

  for (const entry of entries) {
    lines.push(
      `| ${entry.capturedAt} | ${entry.persona} | ${entry.problem} | ${entry.urgency} | ${entry.workaround} | ${entry.willingnessToPay} | ${entry.objection} | ${entry.nextAction} | ${entry.source} |`,
    )
  }

  return `${lines.join('\n')}\n`
}

async function readLedger() {
  try {
    const raw = await fs.readFile(SIGNAL_LEDGER_JSON, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json() as Record<string, string>
    const required = ['persona', 'problem', 'urgency', 'workaround', 'willingnessToPay', 'objection', 'nextAction', 'source']
    for (const key of required) {
      if (!String(body[key] || '').trim()) {
        return NextResponse.json({ error: `Missing required field: ${key}` }, { status: 400 })
      }
    }

    await fs.mkdir(path.dirname(SIGNAL_LEDGER_JSON), { recursive: true })
    const existing = await readLedger()
    const { human, timestamp } = nowPt()
    const entry = {
      id: `${timestamp}-${toSlug(body.persona)}`,
      capturedAt: human,
      source: body.source.trim(),
      persona: body.persona.trim(),
      problem: body.problem.trim(),
      urgency: body.urgency.trim(),
      workaround: body.workaround.trim(),
      willingnessToPay: body.willingnessToPay.trim(),
      objection: body.objection.trim(),
      nextAction: body.nextAction.trim(),
    }

    const next = [...existing, entry]
    await fs.writeFile(SIGNAL_LEDGER_JSON, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    await fs.writeFile(SIGNAL_LEDGER_MD, renderMarkdown(next), 'utf8')

    return NextResponse.json({
      status: 'ok',
      entry,
      ledgerPath: SIGNAL_LEDGER_JSON,
    })
  } catch (error) {
    logger.error({ err: error }, 'Founder signal log API error')
    return NextResponse.json({ error: 'Failed to log customer signal' }, { status: 500 })
  }
}
