'use client'

import { useMissionControl } from '@/store'
import { useEffect, useMemo, useState } from 'react'

type FeedLevel = 'info' | 'warn' | 'error' | 'debug'
type FeedSection = 'work' | 'warnings' | 'system'
type FeedItemShape = {
  id: string
  type: 'activity' | 'log' | 'session'
  level: FeedLevel
  message: string
  source: string
  timestamp: number
  section: FeedSection
  critical?: boolean
  count?: number
}

function normalizeSource(source: string) {
  const value = String(source || '').trim()
  if (!value) return 'system'
  if (value.startsWith('ops-run_habi_task_ingest')) return 'habi-ingest'
  if (value === 'api') return 'mission-control'
  if (value === 'heartbeat') return 'heartbeat'
  return value
}

function compactTaskTitle(message: string) {
  const match = message.match(/"([^"]+)"/)
  return match?.[1] || message
}

function formatActivityItem(activity: any): FeedItemShape | null {
  const source = normalizeSource(activity.actor)
  const ts = activity.created_at * 1000
  const message = String(activity.description || '').trim()
  const type = String(activity.type || '')

  if (!message) return null

  if (type === 'task_execution_started') {
    return {
      id: `act-${activity.id}`,
      type: 'activity',
      level: 'info',
      message,
      source,
      timestamp: ts,
      section: 'work',
    }
  }

  if (type === 'task_dispatch_failed') {
    return {
      id: `act-${activity.id}`,
      type: 'activity',
      level: 'warn',
      message,
      source,
      timestamp: ts,
      section: 'warnings',
      critical: true,
    }
  }

  if (type === 'task_ingested') {
    if (!message.includes('created task')) return null
    return {
      id: `act-${activity.id}`,
      type: 'activity',
      level: 'info',
      message: `Queued: ${compactTaskTitle(message)}`,
      source,
      timestamp: ts,
      section: 'work',
    }
  }

  if (type === 'task_created') {
    return {
      id: `act-${activity.id}`,
      type: 'activity',
      level: 'info',
      message,
      source,
      timestamp: ts,
      section: 'work',
    }
  }

  if (type === 'task_updated') {
    if (!/status: .*→ (review|quality_review|done|cancelled|in_progress)/.test(message)) return null
    const movedToInProgress = message.includes('status: assigned → in_progress')
    const movedToReview = /→ (review|quality_review)/.test(message)
    const movedToDone = message.includes('→ done')
    const movedToCancelled = message.includes('→ cancelled')
    return {
      id: `act-${activity.id}`,
      type: 'activity',
      level: movedToCancelled ? 'warn' : 'info',
      message,
      source,
      timestamp: ts,
      section: movedToInProgress || movedToReview || movedToDone ? 'work' : 'warnings',
    }
  }

  if (type === 'task_dispatch_ping') {
    return null
  }

  if (type === 'agent_status_change') {
    if (!/habi-|ops-cron/.test(message)) return null
    const entityStatus = String(activity.entity?.status || '')
    const isOfflineWarning = /offline/i.test(message)
    if (isOfflineWarning && entityStatus && entityStatus !== 'offline') return null
    return {
      id: `act-${activity.id}`,
      type: 'activity',
      level: /offline|error/i.test(message) ? 'warn' : 'info',
      message,
      source,
      timestamp: ts,
      section: /offline|error/i.test(message) ? 'warnings' : 'system',
      critical: /offline|error/i.test(message),
    }
  }

  return null
}

function shouldIncludeLog(log: any) {
  const source = String(log.source || '')
  const message = String(log.message || '')
  if (log.level === 'error' || log.level === 'warn') return true
  if (/gateway disconnected|pairing required|dispatch|failed|error/i.test(message)) return true
  if (/habi-|mission-control|gateway/i.test(source) && /review|quality|approval|blocked|started/i.test(message)) return true
  return false
}

function classifyLogSection(log: any): FeedSection {
  const source = String(log.source || '')
  const message = String(log.message || '')
  if (log.level === 'error' || log.level === 'warn') return 'warnings'
  if (/dispatch|failed|error|gateway disconnected|pairing required/i.test(message)) return 'warnings'
  if (/review|quality|approval|blocked|started|queued|done|cancelled|in_progress/i.test(message)) return 'work'
  if (/habi-|mission-control|gateway|session/i.test(source) || /session|gateway|mission control/i.test(message)) return 'system'
  return 'system'
}

function isCriticalItem(item: FeedItemShape) {
  if (item.level === 'error') return true
  if (!item.critical) return false
  return Date.now() - item.timestamp <= 5 * 60_000
}

function warningSignature(item: FeedItemShape) {
  return `${item.section}|${item.level}|${item.source}|${item.message
    .replace(/#\d+/g, '#')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()}`
}

function groupRepeatedWarnings(items: FeedItemShape[]) {
  const grouped: FeedItemShape[] = []
  const warningBuckets = new Map<string, FeedItemShape>()

  for (const item of items) {
    if (item.section !== 'warnings') {
      grouped.push(item)
      continue
    }

    const key = warningSignature(item)
    const existing = warningBuckets.get(key)
    if (!existing) {
      warningBuckets.set(key, { ...item, count: 1 })
      continue
    }

    existing.count = (existing.count || 1) + 1
    if (item.timestamp > existing.timestamp) {
      existing.timestamp = item.timestamp
    }
    existing.critical = existing.critical || item.critical
  }

  return [
    ...grouped,
    ...Array.from(warningBuckets.values()).map((item) =>
      item.count && item.count > 1
        ? { ...item, message: `${item.message} (${item.count} similar events)` }
        : item,
    ),
  ]
}

function sortFeedItems(items: FeedItemShape[]) {
  return [...items].sort((a, b) => {
    const aPinned = isCriticalItem(a) ? 1 : 0
    const bPinned = isCriticalItem(b) ? 1 : 0
    if (aPinned !== bPinned) return bPinned - aPinned
    return b.timestamp - a.timestamp
  })
}

function sectionLabel(section: FeedSection) {
  if (section === 'work') return 'Work'
  if (section === 'warnings') return 'Warnings'
  return 'System'
}

export function LiveFeed() {
  const { logs, sessions, activities, dashboardMode, toggleLiveFeed, setActivities, setLogs } = useMissionControl()
  const isLocal = dashboardMode === 'local'
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function hydrateFeed() {
      try {
        if (activities.length === 0) {
          const activityResponse = await fetch('/api/activities?limit=30')
          if (activityResponse.ok) {
            const payload = await activityResponse.json()
            if (!cancelled) setActivities(payload.activities || [])
          }
        }

        if (logs.length === 0) {
          const logResponse = await fetch('/api/logs?limit=30')
          if (logResponse.ok) {
            const payload = await logResponse.json()
            if (!cancelled) setLogs(payload.logs || [])
          }
        }
      } catch {
        // Keep live feed best-effort; SSE/websocket updates still continue.
      }
    }

    void hydrateFeed()
    return () => {
      cancelled = true
    }
  }, [activities.length, logs.length, setActivities, setLogs])

  const sessionItems = useMemo<FeedItemShape[]>(
    () =>
      isLocal
        ? sessions
            .filter((s) => s.active && /habi-|ops-cron/.test(`${s.key || s.id}`))
            .slice(0, 6)
            .map((s) => ({
              id: `sess-${s.id}`,
              type: 'session' as const,
              level: 'info' as const,
              message: `Active session: ${s.key || s.id}`,
              source: s.model?.split('/').pop()?.split('-').slice(0, 2).join('-') || 'session',
              timestamp: s.lastActivity || s.startTime || Date.now(),
              section: 'system' as const,
            }))
        : [],
    [isLocal, sessions],
  )

  const feedItems = useMemo(() => {
    const items: FeedItemShape[] = [
      ...logs
        .filter(shouldIncludeLog)
        .slice(0, 20)
        .map((log) => ({
          id: `log-${log.id}`,
          type: 'log' as const,
          level: log.level,
          message: log.message,
          source: normalizeSource(log.source),
          timestamp: log.timestamp,
          section: classifyLogSection(log),
          critical:
            log.level === 'error' ||
            /dispatch failure threshold hit|gateway disconnected|pairing required|critical/i.test(String(log.message || '')),
        })),
      ...(activities.map(formatActivityItem).filter(Boolean) as FeedItemShape[]),
      ...sessionItems,
    ]

    return sortFeedItems(groupRepeatedWarnings(items)).slice(0, 40)
  }, [activities, logs, sessionItems])

  const feedSections = useMemo(
    () =>
      (['work', 'warnings', 'system'] as FeedSection[]).map((section) => ({
        section,
        items: feedItems.filter((item) => item.section === section),
      })),
    [feedItems],
  )

  if (!expanded) {
    return (
      <div className="w-10 bg-card border-l border-border flex flex-col items-center py-3 shrink-0">
        <button
          onClick={() => setExpanded(true)}
          className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth flex items-center justify-center"
          title="Show live feed"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {/* Mini indicators */}
        <div className="mt-4 flex flex-col gap-2 items-center">
          {feedItems.slice(0, 5).map((item) => (
            <div
              key={item.id}
              className={`w-1.5 h-1.5 rounded-full ${
                item.level === 'error' ? 'bg-red-500' :
                item.level === 'warn' ? 'bg-amber-500' :
                'bg-blue-500/40'
              }`}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-72 h-full bg-card border-l border-border flex flex-col shrink-0 slide-in-right">
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-dot" />
          <span className="text-xs font-semibold text-foreground">Live Feed</span>
          <span className="text-2xs text-muted-foreground font-mono-tight">{feedItems.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setExpanded(false)}
            className="w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth flex items-center justify-center"
            title="Collapse feed"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={toggleLiveFeed}
            className="w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth flex items-center justify-center"
            title="Close feed"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Feed items */}
      <div className="flex-1 overflow-y-auto">
        {feedItems.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-muted-foreground">No activity yet</p>
            <p className="text-2xs text-muted-foreground/60 mt-1">
              {isLocal
                ? 'Important Habi execution, approval, and warning events show up here'
                : 'Important gateway and local execution events show up here'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 px-2 py-2">
            {feedSections.map(({ section, items }) =>
              items.length ? (
                <div key={section} className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="flex items-center justify-between bg-surface-2/80 px-3 py-2">
                    <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{sectionLabel(section)}</div>
                    <div className="text-2xs text-muted-foreground">{items.length}</div>
                  </div>
                  <div className="divide-y divide-border/50">
                    {items.map((item) => (
                      <FeedItem key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>

      {/* Active sessions mini-list */}
      <div className="border-t border-border px-3 py-2 shrink-0">
        <div className="text-2xs font-medium text-muted-foreground mb-1.5">Active Sessions</div>
        <div className="space-y-1">
          {sessions.filter(s => s.active).slice(0, 4).map(session => (
            <div key={session.id} className="flex items-center gap-1.5 text-2xs">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-foreground truncate flex-1 font-mono-tight">{session.key || session.id}</span>
              <span className="text-muted-foreground">{session.model?.split('/').pop()?.slice(0, 8)}</span>
            </div>
          ))}
          {sessions.filter(s => s.active).length === 0 && (
            <div className="text-2xs text-muted-foreground">No active sessions</div>
          )}
        </div>
      </div>
    </div>
  )
}

function FeedItem({ item }: { item: FeedItemShape }) {
  const levelIndicator = item.level === 'error'
    ? 'bg-red-500'
    : item.level === 'warn'
    ? 'bg-amber-500'
    : item.level === 'debug'
    ? 'bg-gray-500'
    : 'bg-blue-500/50'

  const timeStr = formatRelativeTime(item.timestamp)

  return (
    <div className="px-3 py-2 hover:bg-secondary/50 transition-smooth group">
      <div className="flex items-start gap-2">
        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${levelIndicator}`} />
        <div className="flex-1 min-w-0">
          {isCriticalItem(item) ? (
            <div className="mb-1 inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-200">
              Critical
            </div>
          ) : null}
          <p className="text-xs text-foreground/90 leading-relaxed break-words">
            {item.message.length > 120 ? item.message.slice(0, 120) + '...' : item.message}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-2xs text-muted-foreground font-mono-tight">{item.source}</span>
            <span className="text-2xs text-muted-foreground/50">·</span>
            <span className="text-2xs text-muted-foreground">{timeStr}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}
