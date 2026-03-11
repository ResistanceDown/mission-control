export function isLocalHost(host: string): boolean {
  const normalized = host.toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.local')
  )
}

function normalizeProtocol(protocol: string): 'ws:' | 'wss:' {
  if (protocol === 'https:' || protocol === 'wss:') return 'wss:'
  return 'ws:'
}

function preserveTokenQuery(parsed: URL): void {
  const token = parsed.searchParams.get('token')
  parsed.search = ''
  if (token) {
    parsed.searchParams.set('token', token)
  }
}

function normalizeGatewayPath(pathname: string): string {
  const path = String(pathname || '/').trim() || '/'
  if (
    path === '/sessions' ||
    path === '/sessions/' ||
    path.startsWith('/sessions/')
  ) {
    return '/'
  }
  return path === '/' ? '/' : path.replace(/\/+$/, '')
}

function formatWebSocketUrl(parsed: URL): string {
  return parsed.toString().replace(/\/$/, '').replace('/?', '?')
}

export function buildGatewayWebSocketUrl(input: {
  host: string
  port: number
  browserProtocol?: string
}): string {
  const rawHost = String(input.host || '').trim()
  const port = Number(input.port)
  const browserProtocol = input.browserProtocol === 'https:' ? 'https:' : 'http:'

  if (!rawHost) {
    return `ws://127.0.0.1:${port || 18789}`
  }

  const prefixed =
    rawHost.startsWith('ws://') ||
    rawHost.startsWith('wss://') ||
    rawHost.startsWith('http://') ||
    rawHost.startsWith('https://')
      ? rawHost
      : null

  if (prefixed) {
    try {
      const parsed = new URL(prefixed)
      parsed.protocol = isLocalHost(parsed.hostname) ? 'ws:' : normalizeProtocol(parsed.protocol)
      // Keep explicit proxy paths (e.g. /gateway), but collapse known dashboard/session routes to root.
      parsed.pathname = normalizeGatewayPath(parsed.pathname)
      preserveTokenQuery(parsed)
      parsed.hash = ''
      return formatWebSocketUrl(parsed)
    } catch {
      return prefixed
    }
  }

  const wsProtocol = isLocalHost(rawHost) ? 'ws' : (browserProtocol === 'https:' ? 'wss' : 'ws')
  const shouldOmitPort =
    wsProtocol === 'wss' &&
    !isLocalHost(rawHost) &&
    port === 18789

  return shouldOmitPort
    ? `${wsProtocol}://${rawHost}`
    : `${wsProtocol}://${rawHost}:${port || 18789}`
}
