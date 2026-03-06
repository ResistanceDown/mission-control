'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { useNavigateToPanel } from '@/lib/navigation'

interface FounderApiResponse {
  hasPacket: boolean
  latestPacketPath: string | null
  packet: {
    generatedAt: string
    packetDatePt: string
    window: string
    summary: string
    topPriorities: string[]
    blockers: string[]
    approvalsNeeded: string[]
    evidenceLinks: string[]
  } | null
  adoption: {
    founderConversations: number
    signups: number
    activatedUsers: number
    weeklyActiveUsers: number
    retentionRisks: number
    upgradeSignals: number
  } | null
  signals: {
    total: number
    repeatedPainCount: number
    repeatedPains: string[]
    latest: Array<{ id: string; persona: string; problem: string; nextAction: string; capturedAt: string }>
    ledgerPath: string
  }
  productProof: {
    total: number
    latest: Array<{ id: string; title: string; publicStoryAngle: string; stage: string; capturedAt: string }>
    ledgerPath: string
  }
  tasks: {
    totalActive: number
    awaitingReview: number
    byStatus: Record<string, number>
    topActive: Array<{ id: number; title: string; status: string; assigned_to: string | null; priority: string; updated_at: number }>
    reviewQueue: Array<{ id: number; title: string; status: string; assigned_to: string | null; priority: string; updated_at: number; aegisApproved: boolean }>
    appFinishQueue: Array<{ id: number; title: string; status: string; assigned_to: string | null; priority: string; updated_at: number }>
    appFinishCounts: {
      active: number
      blockedByFounder: number
      blockedByEvidence: number
    }
  }
}

function useFounderData() {
  const [data, setData] = useState<FounderApiResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/founder/packet')
      if (!response.ok) return
      const payload = await response.json()
      setData(payload)
    } finally {
      setLoading(false)
    }
  }, [])

  useSmartPoll(load, 60000, { pauseWhenConnected: true })

  return { data, loading, reload: load }
}

function Metric({ label, value, subtitle }: { label: string; value: string | number; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1/70 px-3 py-3">
      <div className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      {subtitle ? <div className="mt-1 text-2xs text-muted-foreground">{subtitle}</div> : null}
    </div>
  )
}

function SectionList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1/70 p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3 space-y-2 text-sm text-foreground">
        {items.length
          ? items.map((item, index) => (
              <div key={`${title}-${index}`} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{item}</span>
              </div>
            ))
          : <div className="text-muted-foreground">{empty}</div>}
      </div>
    </div>
  )
}

function FocusCard({
  title,
  tone = 'neutral',
  items,
  empty,
}: {
  title: string
  tone?: 'neutral' | 'attention' | 'progress'
  items: string[]
  empty: string
}) {
  const toneClass =
    tone === 'attention'
      ? 'border-amber-500/30 bg-amber-500/10'
      : tone === 'progress'
        ? 'border-emerald-500/30 bg-emerald-500/10'
        : 'border-border bg-surface-1/70'

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</div>
      <div className="mt-3 space-y-2 text-sm text-foreground">
        {items.length
          ? items.map((item, index) => (
              <div key={`${title}-${index}`} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{item}</span>
              </div>
            ))
          : <div className="text-muted-foreground">{empty}</div>}
      </div>
    </div>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-muted-foreground">
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EmptyState() {
  const navigateToPanel = useNavigateToPanel()
  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="text-sm font-semibold text-foreground">Founder Cockpit</h3>
      </div>
      <div className="panel-body space-y-3">
        <p className="text-sm text-muted-foreground">No founder packet is available yet.</p>
        <button onClick={() => navigateToPanel('tasks')} className="px-3 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/20 transition-smooth">
          Open Task Board
        </button>
      </div>
    </div>
  )
}

export function FounderSnapshotCard() {
  const navigateToPanel = useNavigateToPanel()
  const { data, loading } = useFounderData()

  if (loading) {
    return <div className="panel"><div className="panel-body"><div className="h-28 rounded-lg shimmer" /></div></div>
  }

  if (!data?.hasPacket || !data.packet) {
    return <EmptyState />
  }

  const packet = data.packet

  return (
    <div className="panel">
      <div className="panel-header flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Founder Snapshot</h2>
          <p className="mt-1 text-xs text-muted-foreground">What matters right now.</p>
        </div>
        <div className="text-right text-2xs text-muted-foreground">
          <div>{packet.packetDatePt}</div>
          <div className="uppercase tracking-wide">{packet.window}</div>
        </div>
      </div>
      <div className="panel-body space-y-4">
        <div className="rounded-xl border border-border bg-surface-1/70 p-4 text-sm leading-6 text-foreground">
          {packet.summary}
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric label="Active Tasks" value={data.tasks.totalActive} subtitle={`${data.tasks.awaitingReview} awaiting review`} />
          <Metric label="Approvals" value={packet.approvalsNeeded.length} subtitle="Need your call" />
          <Metric label="Signals" value={data.signals.total} subtitle={`${data.signals.repeatedPainCount} repeated pains`} />
          <Metric label="Activated Users" value={data.adoption?.activatedUsers ?? 0} subtitle={`${data.adoption?.weeklyActiveUsers ?? 0} weekly active`} />
        </div>

        <div className="grid xl:grid-cols-2 gap-3">
          <SectionList title="Top Priorities" items={packet.topPriorities.slice(0, 2)} empty="No priorities listed." />
          <SectionList title="Blockers" items={packet.blockers.slice(0, 2)} empty="No blockers listed." />
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigateToPanel('founder')} className="px-3 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/20 transition-smooth">Open Founder</button>
          <button onClick={() => navigateToPanel('tasks')} className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-smooth">Open Tasks</button>
        </div>
      </div>
    </div>
  )
}

export function FounderCockpitPanel() {
  const router = useRouter()
  const navigateToPanel = useNavigateToPanel()
  const { data, loading, reload } = useFounderData()
  const [taskActionState, setTaskActionState] = useState<Record<number, { status: 'idle' | 'saving' | 'error'; message?: string }>>({})
  const [sendBackDrafts, setSendBackDrafts] = useState<Record<number, string>>({})
  const [expandedSendBack, setExpandedSendBack] = useState<Record<number, boolean>>({})
  const [signalForm, setSignalForm] = useState({
    persona: '',
    problem: '',
    urgency: '',
    workaround: '',
    willingnessToPay: '',
    objection: '',
    nextAction: '',
    source: 'founder-page',
  })
  const [signalState, setSignalState] = useState<{ status: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({ status: 'idle' })
  const [signalExpanded, setSignalExpanded] = useState(false)
  const [lastSavedSignal, setLastSavedSignal] = useState<string | null>(null)

  if (loading) {
    return <div className="panel"><div className="panel-body"><div className="h-36 rounded-lg shimmer" /></div></div>
  }

  if (!data?.hasPacket || !data.packet) {
    return <EmptyState />
  }

  const packet = data.packet

  const needsAttention = [
    ...packet.approvalsNeeded.map((item) => `Approval: ${item}`),
    ...packet.blockers.map((item) => `Blocker: ${item}`),
  ].slice(0, 4)

  const canWait = [
    ...(data.signals.repeatedPains.length
      ? [`Repeated pain review can wait until the next founder conversation block: ${data.signals.repeatedPains[0]}.`]
      : []),
    ...(data.productProof.latest.length
      ? [`Narrative follow-up can wait until after product work: ${data.productProof.latest[0].title}.`]
      : ['Narrative work can wait if today still has product or customer blockers.']),
    ...(data.tasks.awaitingReview > 0
      ? [`Review queue has ${data.tasks.awaitingReview} item(s), but it can wait until the current top priorities are clear.`]
      : ['Nothing is piling up in review right now.']),
  ].slice(0, 3)

  const botActivity = data.tasks.topActive.length
    ? data.tasks.topActive.slice(0, 4).map((task) => {
        const owner = task.assigned_to || 'unassigned'
        return `${owner} is moving #${task.id} (${task.status}): ${task.title}`
      })
    : ['No active Habi task movement is visible yet.']

  const founderActionStats = [
    { label: 'App Finish Queue', value: data.tasks.appFinishCounts.active, subtitle: 'Planned product work in motion' },
    { label: 'Waiting For Review', value: data.tasks.awaitingReview, subtitle: 'Items waiting for your call' },
    { label: 'Blocked By Founder', value: data.tasks.appFinishCounts.blockedByFounder, subtitle: 'Needs a decision or approval' },
    { label: 'Blocked By Evidence', value: data.tasks.appFinishCounts.blockedByEvidence, subtitle: 'Missing clean proof or validation' },
  ]

  const openTaskReviewItem = (taskId: number) => {
    router.push(`/tasks?taskId=${taskId}`)
  }

  async function updateTaskStatus(taskId: number, status: 'in_progress' | 'quality_review' | 'done', options?: { comment?: string }) {
    setTaskActionState((current) => ({
      ...current,
      [taskId]: { status: 'saving' },
    }))

    try {
      if (options?.comment?.trim()) {
        const commentResponse = await fetch(`/api/tasks/${taskId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: 'jeremy',
            content: options.comment.trim(),
          }),
        })
        const commentPayload = await commentResponse.json().catch(() => ({}))
        if (!commentResponse.ok) {
          setTaskActionState((current) => ({
            ...current,
            [taskId]: { status: 'error', message: commentPayload.error || 'Comment save failed.' },
          }))
          return
        }
      }

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setTaskActionState((current) => ({
          ...current,
          [taskId]: { status: 'error', message: payload.error || 'Task update failed.' },
        }))
        return
      }
      setTaskActionState((current) => ({
        ...current,
        [taskId]: { status: 'idle' },
      }))
      setExpandedSendBack((current) => ({ ...current, [taskId]: false }))
      setSendBackDrafts((current) => ({ ...current, [taskId]: '' }))
      await reload()
    } catch {
      setTaskActionState((current) => ({
        ...current,
        [taskId]: { status: 'error', message: 'Task update failed.' },
      }))
    }
  }

  async function submitSignal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSignalState({ status: 'saving' })
    try {
      const response = await fetch('/api/founder/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signalForm),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSignalState({ status: 'error', message: payload.error || 'Failed to save signal.' })
        return
      }
      const preservedSource = signalForm.source || 'founder-page'
      setSignalForm({
        persona: '',
        problem: '',
        urgency: '',
        workaround: '',
        willingnessToPay: '',
        objection: '',
        nextAction: '',
        source: preservedSource,
      })
      setLastSavedSignal(`${signalForm.persona || 'Signal'} saved${signalForm.problem ? `: ${signalForm.problem.slice(0, 72)}` : '.'}`)
      setSignalState({ status: 'saved', message: 'Customer signal saved.' })
      setSignalExpanded(false)
      await reload()
    } catch {
      setSignalState({ status: 'error', message: 'Failed to save signal.' })
    }
  }

  return (
    <div className="space-y-4 p-5">
      <div className="panel">
        <div className="panel-header flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Founder Cockpit</h2>
            <p className="mt-1 text-xs text-muted-foreground">Use this page as the single control surface for priorities, approvals, customer truth, and freemium adoption.</p>
          </div>
          <div className="text-right text-2xs text-muted-foreground">
            <div>{packet.packetDatePt}</div>
            <div className="uppercase tracking-wide">{packet.window}</div>
          </div>
        </div>
        <div className="panel-body space-y-4">
          <div className="grid xl:grid-cols-3 gap-3">
            <FocusCard
              title="What Needs My Attention Now"
              tone="attention"
              items={needsAttention}
              empty="No approvals or blockers need you right now."
            />
            <FocusCard
              title="What Can Wait"
              items={canWait}
              empty="No deferred items are queued right now."
            />
            <FocusCard
              title="What The Bots Are Doing"
              tone="progress"
              items={botActivity}
              empty="No active bot work is visible right now."
            />
          </div>

          <div className="grid xl:grid-cols-[1.15fr_0.85fr] gap-3">
            <div className="rounded-xl border border-border bg-surface-1/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Founder Actions</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Approve from this queue. Use Open Tasks only when you need full task detail or comments.</p>
                </div>
                <button onClick={() => navigateToPanel('tasks')} className="px-3 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/20 transition-smooth">
                  Open Tasks
                </button>
              </div>
              <div className="mt-4 grid sm:grid-cols-3 gap-3">
                {founderActionStats.map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-border/70 p-3">
                    <div className="text-2xs uppercase tracking-wide text-muted-foreground">{stat.label}</div>
                    <div className="mt-2 text-lg font-semibold text-foreground">{stat.value}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{stat.subtitle}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review Queue</div>
                  <div className="mt-1 text-sm text-foreground">These are the Habi items currently waiting on your decision.</div>
                </div>
                <div className="text-xs text-muted-foreground">{data.tasks.reviewQueue.length} visible now</div>
              </div>
              <div className="mt-4 space-y-2">
                {data.tasks.reviewQueue.length ? data.tasks.reviewQueue.map((task) => (
                  <div key={task.id} className="rounded-lg border border-border/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">#{task.id} {task.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {task.assigned_to || 'unassigned'} • {task.status} • {task.priority}
                          {task.status === 'quality_review' ? ` • Aegis ${task.aegisApproved ? 'approved' : 'pending'}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => openTaskReviewItem(task.id)}
                        className="shrink-0 px-3 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/20 transition-smooth"
                      >
                        Open
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {task.status === 'review' ? (
                        <button
                          onClick={() => updateTaskStatus(task.id, 'quality_review')}
                          disabled={taskActionState[task.id]?.status === 'saving'}
                          className="px-3 py-2 rounded-lg bg-indigo-500/15 text-indigo-300 text-sm font-medium hover:bg-indigo-500/20 transition-smooth disabled:opacity-60"
                        >
                          {taskActionState[task.id]?.status === 'saving' ? 'Updating...' : 'Move To Quality Review'}
                        </button>
                      ) : null}
                      {task.status === 'quality_review' && task.aegisApproved ? (
                        <button
                          onClick={() => updateTaskStatus(task.id, 'done')}
                          disabled={taskActionState[task.id]?.status === 'saving'}
                          className="px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 text-sm font-medium hover:bg-emerald-500/20 transition-smooth disabled:opacity-60"
                        >
                          {taskActionState[task.id]?.status === 'saving' ? 'Updating...' : 'Approve And Mark Done'}
                        </button>
                      ) : null}
                      <button
                        onClick={() => setExpandedSendBack((current) => ({ ...current, [task.id]: !current[task.id] }))}
                        disabled={taskActionState[task.id]?.status === 'saving'}
                        className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-smooth disabled:opacity-60"
                      >
                        Send Back
                      </button>
                      {task.status === 'quality_review' && !task.aegisApproved ? (
                        <div className="px-3 py-2 rounded-lg border border-border/70 text-xs text-muted-foreground">
                          Waiting on Aegis approval before done.
                        </div>
                      ) : null}
                    </div>
                    {expandedSendBack[task.id] ? (
                      <div className="mt-3 rounded-lg border border-border/70 p-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Send Back Reason</div>
                        <textarea
                          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-20"
                          placeholder="Add the reason this needs more work."
                          value={sendBackDrafts[task.id] || ''}
                          onChange={(event) => setSendBackDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => updateTaskStatus(task.id, 'in_progress', { comment: sendBackDrafts[task.id] || 'Founder sent this back for more work. Please review the task details, address the gap, and return it to review with updated evidence.' })}
                            disabled={taskActionState[task.id]?.status === 'saving'}
                            className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-smooth disabled:opacity-60"
                          >
                            {taskActionState[task.id]?.status === 'saving' ? 'Updating...' : 'Send Back To In Progress'}
                          </button>
                          <button
                            onClick={() => setExpandedSendBack((current) => ({ ...current, [task.id]: false }))}
                            disabled={taskActionState[task.id]?.status === 'saving'}
                            className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-surface-2 transition-smooth disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {taskActionState[task.id]?.status === 'error' ? (
                      <div className="mt-2 text-xs text-rose-300">{taskActionState[task.id]?.message}</div>
                    ) : null}
                  </div>
                )) : (
                  <div className="rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">
                    No Habi tasks are waiting in review right now.
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">App Finish Queue</div>
                  <div className="mt-1 text-sm text-foreground">Planned product-completion work the bots should be pushing through next.</div>
                </div>
                <div className="text-xs text-muted-foreground">{data.tasks.appFinishQueue.length} visible now</div>
              </div>
              <div className="mt-4 space-y-2">
                {data.tasks.appFinishQueue.length ? data.tasks.appFinishQueue.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => openTaskReviewItem(task.id)}
                    className="w-full rounded-lg border border-border/70 p-3 text-left transition-smooth hover:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">#{task.id} {task.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {task.assigned_to || 'unassigned'} • {task.status} • {task.priority}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-primary">Open</span>
                    </div>
                  </button>
                )) : (
                  <div className="rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">
                    No planned app-finish work is visible yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface-1/70 p-4">
              <button
                type="button"
                onClick={() => setSignalExpanded((current) => !current)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Log Customer Signal</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Capture a conversation, waitlist reply, or beta comment without leaving this page.</p>
                </div>
                <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                  <span>Stored in founder ledger</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-1">
                    <span>{signalExpanded ? 'Collapse' : 'Expand'}</span>
                    <span className={`transition-transform ${signalExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDownIcon />
                    </span>
                  </span>
                </div>
              </button>
              {lastSavedSignal ? (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  {lastSavedSignal}
                </div>
              ) : null}
              {signalExpanded ? (
              <form className="mt-4 space-y-3" onSubmit={submitSignal}>
                <div className="grid xl:grid-cols-2 gap-3">
                  <label className="space-y-1 text-sm text-foreground">
                    <span>Persona</span>
                    <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={signalForm.persona} onChange={(event) => setSignalForm((current) => ({ ...current, persona: event.target.value }))} />
                  </label>
                  <label className="space-y-1 text-sm text-foreground">
                    <span>Urgency</span>
                    <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={signalForm.urgency} onChange={(event) => setSignalForm((current) => ({ ...current, urgency: event.target.value }))} />
                  </label>
                </div>
                <label className="space-y-1 text-sm text-foreground block">
                  <span>Problem</span>
                  <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-20" value={signalForm.problem} onChange={(event) => setSignalForm((current) => ({ ...current, problem: event.target.value }))} />
                </label>
                <label className="space-y-1 text-sm text-foreground block">
                  <span>Current workaround</span>
                  <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-16" value={signalForm.workaround} onChange={(event) => setSignalForm((current) => ({ ...current, workaround: event.target.value }))} />
                </label>
                <div className="grid xl:grid-cols-2 gap-3">
                  <label className="space-y-1 text-sm text-foreground">
                    <span>Willingness to pay / upgrade</span>
                    <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={signalForm.willingnessToPay} onChange={(event) => setSignalForm((current) => ({ ...current, willingnessToPay: event.target.value }))} />
                  </label>
                  <label className="space-y-1 text-sm text-foreground">
                    <span>Source</span>
                    <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={signalForm.source} onChange={(event) => setSignalForm((current) => ({ ...current, source: event.target.value }))} />
                  </label>
                </div>
                <label className="space-y-1 text-sm text-foreground block">
                  <span>Objection / hesitation</span>
                  <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-16" value={signalForm.objection} onChange={(event) => setSignalForm((current) => ({ ...current, objection: event.target.value }))} />
                </label>
                <label className="space-y-1 text-sm text-foreground block">
                  <span>Next action</span>
                  <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-16" value={signalForm.nextAction} onChange={(event) => setSignalForm((current) => ({ ...current, nextAction: event.target.value }))} />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {signalState.status === 'saved' ? signalState.message : signalState.status === 'error' ? signalState.message : 'This updates the founder signal ledger used by the Founder page.'}
                  </div>
                  <button type="submit" disabled={signalState.status === 'saving'} className="px-3 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/20 transition-smooth disabled:opacity-60">
                    {signalState.status === 'saving' ? 'Saving...' : 'Save Signal'}
                  </button>
                </div>
              </form>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-1/70 p-4">
            <div className="text-xs font-medium text-foreground">Summary</div>
            <div className="mt-2 text-sm leading-6 text-foreground">{packet.summary}</div>
          </div>

          <details className="rounded-xl border border-border bg-surface-1/70 p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">Founder SOP</summary>
            <div className="mt-4 grid xl:grid-cols-3 gap-3 text-sm text-foreground">
              <div className="rounded-lg border border-border/70 p-3">
                <div className="font-medium">Morning</div>
                <div className="mt-2 space-y-2 text-muted-foreground">
                  <div>1. Read this page.</div>
                  <div>2. Approve the top 3 tasks.</div>
                  <div>3. Check blockers and approvals.</div>
                </div>
              </div>
              <div className="rounded-lg border border-border/70 p-3">
                <div className="font-medium">During The Day</div>
                <div className="mt-2 space-y-2 text-muted-foreground">
                  <div>1. Do 1 real founder action: conversation, outreach, beta follow-up, or reply block.</div>
                  <div>2. Log what you learned into customer signals.</div>
                  <div>3. Only step in when a task needs a decision.</div>
                </div>
              </div>
              <div className="rounded-lg border border-border/70 p-3">
                <div className="font-medium">Closeout</div>
                <div className="mt-2 space-y-2 text-muted-foreground">
                  <div>1. Confirm what shipped.</div>
                  <div>2. Confirm what got stuck.</div>
                  <div>3. Confirm what needs your approval tomorrow.</div>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">
              Your job is to choose priorities, talk to users, and approve risky or public actions. The bots should do the digging, drafting, evidence collection, and task movement.
            </div>
          </details>

          <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
            <Metric label="Active Habi Tasks" value={data.tasks.totalActive} subtitle={`${data.tasks.awaitingReview} awaiting review`} />
            <Metric label="Approvals Needed" value={packet.approvalsNeeded.length} subtitle="Founder gate queue" />
            <Metric label="Founder Conversations" value={data.adoption?.founderConversations ?? 0} subtitle="Logged in scorecard" />
            <Metric label="Signups" value={data.adoption?.signups ?? 0} subtitle={`Activated ${data.adoption?.activatedUsers ?? 0}`} />
            <Metric label="Weekly Active Users" value={data.adoption?.weeklyActiveUsers ?? 0} subtitle="Usage signal" />
            <Metric label="Upgrade Signals" value={data.adoption?.upgradeSignals ?? 0} subtitle={`Retention risks ${data.adoption?.retentionRisks ?? 0}`} />
          </div>

          <div className="grid xl:grid-cols-3 gap-3">
            <SectionList title="Top Priorities" items={packet.topPriorities} empty="No priorities listed." />
            <SectionList title="Blockers" items={packet.blockers} empty="No blockers listed." />
            <SectionList title="Approvals Needed" items={packet.approvalsNeeded} empty="No approvals pending." />
          </div>

          <div className="grid xl:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-surface-1/70 p-4">
              <h3 className="text-sm font-semibold text-foreground">Task Queue</h3>
              <div className="mt-3 space-y-2 text-sm">
                {data.tasks.topActive.length ? data.tasks.topActive.map((task) => (
                  <div key={task.id} className="rounded-lg border border-border/70 px-3 py-2">
                    <div className="font-medium text-foreground">#{task.id} {task.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{task.assigned_to || 'unassigned'} • {task.status} • {task.priority}</div>
                  </div>
                )) : <div className="text-muted-foreground">No active Habi tasks.</div>}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface-1/70 p-4">
              <h3 className="text-sm font-semibold text-foreground">Customer Signals</h3>
              <div className="mt-2 text-xs text-muted-foreground">{data.signals.total} logged • {data.signals.repeatedPainCount} repeated pain patterns</div>
              <div className="mt-3 space-y-2 text-sm">
                {data.signals.latest.length ? data.signals.latest.slice(0, 4).map((signal) => (
                  <div key={signal.id} className="rounded-lg border border-border/70 px-3 py-2">
                    <div className="font-medium text-foreground">{signal.persona}</div>
                    <div className="mt-1 text-muted-foreground">{signal.problem}</div>
                    <div className="mt-1 text-xs text-primary">Next: {signal.nextAction}</div>
                  </div>
                )) : <div className="text-muted-foreground">No signals logged yet.</div>}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface-1/70 p-4">
              <h3 className="text-sm font-semibold text-foreground">Product Proof</h3>
              <div className="mt-2 text-xs text-muted-foreground">{data.productProof.total} proof item(s) logged</div>
              <div className="mt-3 space-y-2 text-sm">
                {data.productProof.latest.length ? data.productProof.latest.slice(0, 4).map((proof) => (
                  <div key={proof.id} className="rounded-lg border border-border/70 px-3 py-2">
                    <div className="font-medium text-foreground">{proof.title}</div>
                    <div className="mt-1 text-muted-foreground">{proof.publicStoryAngle}</div>
                    <div className="mt-1 text-xs text-primary">{proof.stage}</div>
                  </div>
                )) : <div className="text-muted-foreground">No product proof logged yet.</div>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigateToPanel('tasks')} className="px-3 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/20 transition-smooth">Open Tasks</button>
            <button onClick={() => navigateToPanel('office')} className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-smooth">Open Office</button>
            <button onClick={() => navigateToPanel('cron')} className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-smooth">Open Cron</button>
          </div>
        </div>
      </div>
    </div>
  )
}
