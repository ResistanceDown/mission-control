'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSmartPoll } from '@/lib/use-smart-poll'

type GrowthAction =
  | 'refresh_research'
  | 'generate_drafts'
  | 'refresh_research_and_generate'
  | 'rewrite_draft'
  | 'update_draft_text'
  | 'approve_draft'
  | 'reject_draft'
  | 'archive_draft'
  | 'clear_current_drafts'
  | 'schedule_draft'
  | 'unschedule_draft'
  | 'mark_published'
  | 'reopen_published'
  | 'set_account_target_state'

interface GrowthApiResponse {
  hasPacket: boolean
  growth: {
    week: string | null
    researchBriefPath: string | null
    draftPackPath: string | null
    scorecardPath: string | null
    researchGeneratedAt?: string | null
    draftPackGeneratedAt?: string | null
    externalStatus: string
    freshness?: {
      lastXPullAt?: string | null
      sampleSize?: number
      queryCount?: number
      lowConfidenceClusters?: Array<{ id: string; label: string; tweetCount: number; reason: string }>
    } | null
    strategy: {
      accountStage?: string
      cadenceModel?: string
      distributionPriority: string[]
      primaryGoal: string
      contentMix: string[]
      engagementTactics: string[]
      editorialBias: string[]
      followerGrowthLoop: string[]
      targetAccountStrategy: string[]
      prioritizedAccounts: string[]
      todayBestMove?: {
        title: string
        distributionType: string
        primaryAction: string
        why: string
        sourceUrl: string
        sourceAccount: string
        clusterLabel: string
        confidence: string
      } | null
      weeklyMixRecommendation?: {
        targetMix: Array<{ type: string; share: string; reason: string }>
        availableOpportunityBalance: { reply: number; quote: number; original: number }
        currentBias: string
      } | null
      scheduleGuidance?: {
        recommendation: string
        timing: string
      } | null
      whyThisWeek: string[]
    } | null
    engagementTargets: {
      quoteTargets: Array<{ clusterLabel: string; why: string; url: string; text: string; author: string; likes: number; replies: number; followers: number }>
      replyTargets: Array<{ clusterLabel: string; why: string; url: string; text: string; author: string; likes: number; replies: number; followers: number }>
    }
    sourceCandidates: Array<{ clusterLabel: string; url: string; text: string; author: string; likes: number; replies: number; followers: number; score: number }>
    accountTargets: Array<{ username: string; followers: number; verified: boolean; why: string; sourceUrl: string; clusterLabel: string; state?: string; stateNote?: string }>
    watchlistRecommendations: Array<{ username: string; clusterLabel: string; why: string; state: string; stateUpdatedAt: string | null; sourceUrl: string; reason: string }>
    editorialOpportunities: Array<{ id: string; title: string; archetype: string; sourceType: string; whyNow: string; brandFit: string; supportingSignals: string[] }>
    listeningDiagnostics?: {
      queryCount?: number
      sampleSize?: number
      dedupeRate?: number
      noiseRejectionSummary?: { rawSampleSize?: number; keptSampleSize?: number; rejectedSamples?: number }
      coverageByZone?: Array<{ zoneId: string; label: string; queryCount: number; keptTweets: number }>
    } | null
    trendClusters: Array<{
      id: string
      label: string
      confidence: string
      tweetCount: number
      repeatedPains: string[]
      repeatedPhrases: string[]
      conversationThemes: string[]
      representativeExample: string | null
      contrarianTake: string | null
      fatigueSignal: string | null
      sampleTweets: string[]
      whyItMatters: string
    }>
    sourceSamples: string[]
    draftCandidates: Array<{
      id: string
      pillar: string
      angle: string
      source: string
      rationale: string
      text: string
      status: string
      approval: string
      source_account?: string | null
      source_type?: string
      distribution_type?: string
      cluster_id?: string | null
      why_now?: string
      brand_fit?: string
      supporting_signals?: string[]
      follower_growth_score?: number
      brand_building_score?: number
      timeliness_score?: number
      selection_reason?: string
      feedback_applied?: string[]
      changed_since_last_run?: string
      confidence?: string
      source_metrics?: Record<string, unknown>
      source_quality_note?: string
      variant_family_id?: string
      variant_group_label?: string
      variant_label?: string
      variant_position?: number
      variant_count?: number
      source_tweet?: {
        id?: string
        text?: string
        url?: string | null
        author?: {
          username?: string
          name?: string
          verified?: boolean
        } | null
        author_metrics?: {
          followers_count?: number
          following_count?: number
          tweet_count?: number
        } | null
      } | null
    }>
    recommendations?: {
      bestForFollowerGrowth: string | null
      bestForBrandBuilding: string | null
      bestOriginalPost: string | null
    } | null
    changesSummary?: {
      newCount: number
      retainedCount: number
      changedDraftIds: string[]
      feedbackEffects: string[]
    } | null
    approvedPosts: Array<{
      id: string
      text: string
      pillar: string
      angle: string
      status: string
      approvedAtPt: string
      scheduledAt?: string | null
      scheduledAtPt?: string | null
      scheduleSource?: string | null
      scheduleNote?: string | null
      distributionType?: string
      sourceType?: string
      selectionReason?: string
      tweetId?: string
      tweetUrl?: string | null
    }>
    publishLog?: Array<{ id?: string; tweet_url?: string | null; posted_at_pt?: string; distribution_type?: string; source_type?: string; pillar?: string; angle?: string }>
    resultsSummary?: {
      postedCount: number
      syncedPostCount?: number
      publishAttempts?: number
      winningPillars: string[]
      winningSourceTypes: string[]
      winningDistributionTypes: string[]
      winningSourceAccounts?: string[]
      winningArchetypes?: string[]
      timingBias?: string[]
      strategyNotes: string[]
      topPosts: Array<{ id: string; pillar: string; tweetUrl: string | null; engagementScore: number; distributionType?: string; sourceType?: string; sourceAccount?: string | null }>
    } | null
    strategyMemory?: {
      strategyNotes?: string[]
      accountStage?: string
      performance?: {
        postedCount?: number
        syncedPostCount?: number
        publishAttempts?: number
      }
      winningSourceTypes?: string[]
      winningDistributionTypes?: string[]
      winningSourceAccounts?: string[]
      winningArchetypes?: string[]
      timingBias?: string[]
    } | null
    editorialMemory?: {
      updatedAt?: string | null
      recentFeedback: Array<{
        decision: string
        feedback: string
        archetype: string
        reviewedAtPt: string
      }>
      archetypeStats: Record<string, { approved?: number; rejected?: number; archived?: number }>
    } | null
    sourceMemory?: {
      updatedAt?: string | null
      rejectedSources: string[]
      rejectedClusters: string[]
      rejectedPhrases: string[]
      negativeStyleMarkers: string[]
      positiveStyleMarkers: string[]
      accounts: Array<{ username: string; state: string; updatedAt: string | null; note: string }>
    } | null
  }
}

const PT_DATE_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

function formatPacificTime(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return 'n/a'
  if (/\bPT\b/.test(raw)) return raw
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return `${PT_DATE_TIME.format(parsed)} PT`
}

function useGrowthData() {
  const [data, setData] = useState<GrowthApiResponse | null>(null)
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
  return { data, setData, loading, reload: load }
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function MetricCard({ label, value, subtitle, accent = 'cyan' }: { label: string; value: string | number; subtitle?: string; accent?: 'cyan' | 'emerald' | 'amber' | 'violet' | 'rose' }) {
  const accentMap = {
    cyan: 'border-cyan-500/20 bg-cyan-500/8 text-cyan-100',
    emerald: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-100',
    amber: 'border-amber-500/20 bg-amber-500/8 text-amber-100',
    violet: 'border-violet-500/20 bg-violet-500/8 text-violet-100',
    rose: 'border-rose-500/20 bg-rose-500/8 text-rose-100',
  }
  return (
    <div className={cx('rounded-xl border px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]', accentMap[accent])}>
      <div className="text-[11px] uppercase tracking-[0.12em] text-current/70">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      {subtitle ? <div className="mt-1 text-[11px] text-foreground/60">{subtitle}</div> : null}
    </div>
  )
}

function FieldChip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-muted-foreground">{children}</span>
}

function displayUsername(username: string) {
  return username.startsWith('@') ? username : `@${username}`
}

function CollapsibleSection({ title, subtitle, defaultOpen = true, children }: { title: string; subtitle?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-white/10 bg-[#0f141b] shadow-[0_18px_45px_rgba(0,0,0,0.28)] group">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground group-open:rotate-0">Open</span>
      </summary>
      <div className="border-t border-white/8 px-4 py-4">{children}</div>
    </details>
  )
}

function getSourceMetric(draft: GrowthApiResponse['growth']['draftCandidates'][number], key: string) {
  const sourceMetrics = draft.source_metrics && typeof draft.source_metrics === 'object' ? draft.source_metrics as Record<string, unknown> : {}
  const value = sourceMetrics[key]
  return typeof value === 'number' ? value : 0
}

function getSourceMetricNumber(draft: GrowthApiResponse['growth']['draftCandidates'][number], key: string) {
  const value = getSourceMetric(draft, key)
  return typeof value === 'number' ? value : 0
}

function getSourceAuthorFollowers(draft: GrowthApiResponse['growth']['draftCandidates'][number]) {
  const followers = draft.source_tweet?.author_metrics?.followers_count
  return typeof followers === 'number' ? followers : 0
}

function toScheduleInputValue(date: Date) {
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
  return local.toISOString().slice(0, 16)
}

function buildSuggestedSchedule(post: GrowthApiResponse['growth']['approvedPosts'][number]) {
  const now = new Date()
  const suggestion = new Date(now)
  const distribution = String(post.distributionType || '')

  if (distribution === 'reply') {
    suggestion.setMinutes(now.getMinutes() + 20)
  } else if (distribution === 'quote') {
    suggestion.setHours(now.getHours() + 2, 15, 0, 0)
  } else {
    suggestion.setHours(10, 30, 0, 0)
    if (suggestion <= now) suggestion.setDate(suggestion.getDate() + 1)
  }

  return {
    when: toScheduleInputValue(suggestion),
    note:
      distribution === 'reply'
        ? 'Reply while the conversation is still warm.'
        : distribution === 'quote'
          ? 'Quote after the source has some traction but before the thread cools.'
          : 'Use a calmer standalone window with less reactive noise.',
    source: 'machine_suggested' as const,
  }
}

function DraftCard({
  draft,
  feedbackValue,
  onFeedbackChange,
  onAction,
  saving,
}: {
  draft: GrowthApiResponse['growth']['draftCandidates'][number]
  feedbackValue: string
  onFeedbackChange: (value: string) => void
  onAction: (action: GrowthAction, draftId: string, extra?: Record<string, unknown>) => void
  saving: boolean
}) {
  const feedbackPresets = ['Too generic', 'Weak source', 'Too product-y', 'Wrong audience', 'Too abstract', 'Too founder-theater', 'Good direction, rewrite']
  const [draftText, setDraftText] = useState(draft.text)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraftText(draft.text)
    setDirty(false)
  }, [draft.id, draft.text])

  return (
    <article className="rounded-2xl border border-white/10 bg-[#10161f] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{draft.pillar}: {draft.angle}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {draft.distribution_type ? <FieldChip>{draft.distribution_type}</FieldChip> : null}
            {draft.source_type ? <FieldChip>{draft.source_type}</FieldChip> : null}
            {draft.cluster_id ? <FieldChip>{draft.cluster_id}</FieldChip> : null}
            {draft.confidence ? <FieldChip>confidence {draft.confidence}</FieldChip> : null}
            {typeof draft.follower_growth_score === 'number' ? <FieldChip>growth {draft.follower_growth_score}</FieldChip> : null}
            {typeof draft.brand_building_score === 'number' ? <FieldChip>brand {draft.brand_building_score}</FieldChip> : null}
            {typeof draft.timeliness_score === 'number' ? <FieldChip>timeliness {draft.timeliness_score}</FieldChip> : null}
          </div>
        </div>
        <span className={cx(
          'rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em]',
          draft.approval === 'approved' && 'border-emerald-500/25 text-emerald-300 bg-emerald-500/10',
          draft.approval === 'rejected' && 'border-rose-500/25 text-rose-300 bg-rose-500/10',
          draft.approval === 'archived' && 'border-amber-500/25 text-amber-300 bg-amber-500/10',
          !['approved', 'rejected', 'archived'].includes(draft.approval) && 'border-white/10 text-muted-foreground bg-black/20',
        )}>{draft.approval || 'candidate'}</span>
      </div>

      <div className="mt-4 rounded-xl border border-cyan-500/15 bg-[#0c1219] px-4 py-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/70">Exact post text</div>
          {dirty ? <FieldChip>Edited locally</FieldChip> : null}
        </div>
        <textarea
          className="min-h-36 w-full resize-y rounded-xl border border-white/8 bg-black/15 px-4 py-4 text-[15px] leading-7 text-foreground outline-none transition-smooth focus:border-cyan-500/30"
          value={draftText}
          onChange={(event) => {
            setDraftText(event.target.value)
            setDirty(event.target.value !== draft.text)
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onAction('update_draft_text', draft.id, { draftText })}
            disabled={saving || !dirty || !draftText.trim()}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60"
          >
            Save Edit
          </button>
          <button
            onClick={() => onAction('rewrite_draft', draft.id)}
            disabled={saving}
            className="rounded-lg border border-cyan-500/20 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/10 disabled:opacity-60"
          >
            Rewrite From Feedback
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          {draft.selection_reason ? (
            <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Selection reason</div>
              <div className="mt-1 text-sm text-foreground/90">{draft.selection_reason}</div>
            </div>
          ) : null}
          {draft.why_now ? (
            <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Why now</div>
              <div className="mt-1 text-sm text-foreground/90">{draft.why_now}</div>
            </div>
          ) : null}
          {draft.supporting_signals?.length ? (
            <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Supporting signals</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.supporting_signals.map((signal, index) => <FieldChip key={`${draft.id}-signal-${index}`}>{signal}</FieldChip>)}
              </div>
            </div>
          ) : null}
          {draft.feedback_applied?.length || draft.changed_since_last_run ? (
            <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Learning applied</div>
              {draft.changed_since_last_run ? <div className="mt-1 text-sm text-foreground/90">{draft.changed_since_last_run}</div> : null}
              {draft.feedback_applied?.length ? <div className="mt-2 text-xs text-amber-100/85">{draft.feedback_applied.join(' • ')}</div> : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          {draft.source_tweet?.url ? (
            <div className="rounded-xl border border-cyan-500/15 bg-black/20 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Source context</div>
              {draft.source_tweet.text ? <div className="mt-2 text-sm text-foreground/85">{draft.source_tweet.text}</div> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.source_account ? <FieldChip>{draft.source_account}</FieldChip> : null}
                <FieldChip>{getSourceMetric(draft, 'like_count')} likes</FieldChip>
                <FieldChip>{getSourceMetric(draft, 'reply_count')} replies</FieldChip>
                <FieldChip>{getSourceMetric(draft, 'retweet_count')} reposts</FieldChip>
                <FieldChip>{getSourceMetric(draft, 'bookmark_count')} bookmarks</FieldChip>
                {getSourceMetricNumber(draft, 'engagement_rate_pct') > 0 ? <FieldChip>{getSourceMetricNumber(draft, 'engagement_rate_pct').toFixed(2)}% engagement</FieldChip> : null}
                {getSourceAuthorFollowers(draft) ? <FieldChip>{getSourceAuthorFollowers(draft).toLocaleString()} followers</FieldChip> : null}
              </div>
              {draft.source_quality_note ? <div className="mt-3 rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-xs text-foreground/80">{draft.source_quality_note}</div> : null}
              <a href={draft.source_tweet.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-cyan-200 hover:text-cyan-100">Open source post</a>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Feedback for next pass</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {feedbackPresets.map((preset) => (
            <button
              key={`${draft.id}-${preset}`}
              type="button"
              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground transition-smooth hover:bg-surface-2"
              onClick={() => {
                const next = feedbackValue
                  ? feedbackValue.includes(preset)
                    ? feedbackValue
                    : `${feedbackValue} | ${preset}`
                  : preset
                onFeedbackChange(next)
              }}
            >
              {preset}
            </button>
          ))}
        </div>
        <textarea
          className="mt-3 min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          placeholder="Examples: better as a reply, weak source, too abstract, stronger hook, wrong audience, good direction but rewrite sharper."
          value={feedbackValue}
          onChange={(event) => onFeedbackChange(event.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => onAction('approve_draft', draft.id)} disabled={saving || dirty || draft.approval === 'approved'} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition-smooth hover:bg-emerald-500/20 disabled:opacity-60">Approve This Post</button>
        <button onClick={() => onAction('reject_draft', draft.id)} disabled={saving || draft.approval === 'rejected'} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-muted-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60">Reject</button>
        <button onClick={() => onAction('archive_draft', draft.id)} disabled={saving || draft.approval === 'archived'} className="rounded-lg border border-amber-500/20 px-3 py-2 text-xs font-medium text-amber-200 transition-smooth hover:bg-amber-500/10 disabled:opacity-60">Archive Angle</button>
      </div>
    </article>
  )
}

function SourceVariantGroup({
  familyLabel,
  sourceLabel,
  drafts,
  feedbackDrafts,
  onFeedbackChange,
  onAction,
  saving,
  defaultOpen,
}: {
  familyLabel: string
  sourceLabel: string
  drafts: GrowthApiResponse['growth']['draftCandidates']
  feedbackDrafts: Record<string, string>
  onFeedbackChange: (draftId: string, value: string) => void
  onAction: (action: GrowthAction, draftId: string, extra?: Record<string, unknown>) => void
  saving: boolean
  defaultOpen?: boolean
}) {
  if (!drafts.length) return null
  const leader = drafts[0]
  const sourceLikes = getSourceMetric(leader, 'like_count')
  const sourceReplies = getSourceMetric(leader, 'reply_count')
  const sourceReposts = getSourceMetric(leader, 'retweet_count')
  const sourceFollowers = getSourceAuthorFollowers(leader)
  return (
    <details
      open={defaultOpen}
      className="rounded-2xl border border-cyan-500/15 bg-[#0f151d] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.26)] group"
    >
      <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">{familyLabel}</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{sourceLabel}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {drafts.length} variants from the same live source. Expand to compare angles, refine one, and approve the exact text.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {leader.distribution_type ? <FieldChip>{leader.distribution_type}</FieldChip> : null}
          {leader.source_account ? <FieldChip>{leader.source_account}</FieldChip> : null}
          {leader.source_tweet?.url ? <FieldChip>live source</FieldChip> : null}
          {sourceLikes ? <FieldChip>{sourceLikes} likes</FieldChip> : null}
          {sourceReplies ? <FieldChip>{sourceReplies} replies</FieldChip> : null}
          {sourceReposts ? <FieldChip>{sourceReposts} reposts</FieldChip> : null}
          {sourceFollowers ? <FieldChip>{sourceFollowers.toLocaleString()} followers</FieldChip> : null}
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Expand
          </span>
        </div>
      </summary>
      {leader.source_quality_note ? (
        <div className="mt-3 rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-xs text-foreground/80">
          {leader.source_quality_note}
        </div>
      ) : null}
      {leader.why_now ? (
        <div className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Why this source matters now</div>
          <div className="mt-1 text-sm text-foreground/85">{leader.why_now}</div>
        </div>
      ) : null}
      <div className="mt-4 space-y-4">
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-2xl border border-white/8 bg-black/15 p-3">
            {draft.variant_label ? <div className="mb-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{draft.variant_label}</div> : null}
            <DraftCard
              draft={draft}
              feedbackValue={feedbackDrafts[draft.id] || ''}
              onFeedbackChange={(value) => onFeedbackChange(draft.id, value)}
              onAction={onAction}
              saving={saving}
            />
          </div>
        ))}
      </div>
    </details>
  )
}

export function GrowthReviewPanel() {
  const { data, setData, loading, reload } = useGrowthData()
  const [actionState, setActionState] = useState<{ status: 'idle' | 'saving' | 'error' | 'saved'; message?: string }>({ status: 'idle' })
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({})
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, { when: string; note: string }>>({})
  const [publishDrafts, setPublishDrafts] = useState<Record<string, { tweetUrl: string; tweetId: string }>>({})

  const growth = data?.growth
  const byId = useMemo(() => new Map((growth?.draftCandidates || []).map((draft) => [draft.id, draft])), [growth?.draftCandidates])
  const sortedForGrowth = useMemo(
    () => [...(growth?.draftCandidates || [])].sort((left, right) => Number(right.follower_growth_score || 0) - Number(left.follower_growth_score || 0)),
    [growth?.draftCandidates],
  )
  const sortedForBrand = useMemo(
    () => [...(growth?.draftCandidates || [])].sort((left, right) => Number(right.brand_building_score || 0) - Number(left.brand_building_score || 0)),
    [growth?.draftCandidates],
  )
  const originalCandidates = useMemo(
    () => (growth?.draftCandidates || []).filter((draft) => String(draft.distribution_type || '').trim() === 'original'),
    [growth?.draftCandidates],
  )
  const sortedOriginals = useMemo(
    () => [...originalCandidates].sort((left, right) => Number(right.timeliness_score || 0) - Number(left.timeliness_score || 0)),
    [originalCandidates],
  )
  const groupedDraftCandidates = useMemo(() => {
    const groups = new Map<string, GrowthApiResponse['growth']['draftCandidates']>()
    for (const draft of growth?.draftCandidates || []) {
      const key = String(draft.variant_family_id || draft.id || '').trim()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(draft)
    }
    return Array.from(groups.values()).map((group) =>
      [...group].sort((left, right) => Number(left.variant_position || 999) - Number(right.variant_position || 999)),
    )
  }, [growth?.draftCandidates])
  const bestForFollowerGrowth = growth?.recommendations?.bestForFollowerGrowth
    ? byId.get(growth.recommendations.bestForFollowerGrowth) || sortedForGrowth[0]
    : sortedForGrowth[0]
  const bestForBrandBuilding = growth?.recommendations?.bestForBrandBuilding
    ? byId.get(growth.recommendations.bestForBrandBuilding) || sortedForBrand[0]
    : sortedForBrand[0]
  const bestOriginalPost = growth?.recommendations?.bestOriginalPost
    ? byId.get(growth.recommendations.bestOriginalPost) || sortedOriginals[0]
    : sortedOriginals[0]
  const approvedPosts = growth?.approvedPosts || []
  const readyPosts = approvedPosts.filter((post) => post.status !== 'published')
  const publishedPosts = approvedPosts.filter((post) => post.status === 'published')

  const patchAccountTargetState = useCallback((usernameInput: string, nextState: 'watch' | 'prioritize' | 'mute' | 'engage_this_week', note: string) => {
    const normalized = displayUsername(usernameInput).replace(/^@/, '').trim().toLowerCase()
    if (!normalized) return
    setData((current) => {
      if (!current?.growth) return current
      const next = structuredClone(current) as GrowthApiResponse
      const updatedAt = new Date().toISOString()

      next.growth.accountTargets = next.growth.accountTargets.map((account) => {
        const key = String(account.username || '').replace(/^@/, '').trim().toLowerCase()
        if (key !== normalized) return account
        return {
          ...account,
          state: nextState,
          stateNote: note || account.stateNote,
        }
      })

      next.growth.watchlistRecommendations = next.growth.watchlistRecommendations.map((account) => {
        const key = String(account.username || '').replace(/^@/, '').trim().toLowerCase()
        if (key !== normalized) return account
        return {
          ...account,
          state: nextState,
          stateUpdatedAt: updatedAt,
          reason: note || account.reason,
        }
      })

      const accounts = Array.isArray(next.growth.sourceMemory?.accounts)
        ? [...next.growth.sourceMemory.accounts]
        : []
      const existingIndex = accounts.findIndex((entry) => String(entry.username || '').replace(/^@/, '').trim().toLowerCase() === normalized)
      const accountValue = {
        username: normalized,
        state: nextState,
        updatedAt,
        note,
      }
      if (existingIndex >= 0) {
        accounts[existingIndex] = accountValue
      } else {
        accounts.unshift(accountValue)
      }
      next.growth.sourceMemory = {
        ...(next.growth.sourceMemory || { updatedAt: null, rejectedSources: [], rejectedClusters: [], rejectedPhrases: [], negativeStyleMarkers: [], positiveStyleMarkers: [], accounts: [] }),
        updatedAt,
        accounts: accounts.slice(0, 12),
      }

      return next
    })
  }, [setData])

  const runGrowthAction = useCallback(async (action: GrowthAction, draftId?: string, extra: Record<string, unknown> = {}) => {
    const growthWeek = growth?.week ?? null
    const feedback = draftId ? String(feedbackDrafts[draftId] || '').trim() : String(extra.feedback || '').trim()
    setActionState({ status: 'saving' })
    try {
      const response = await fetch('/api/founder/growth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, draftId, week: growthWeek, feedback, ...extra }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setActionState({ status: 'error', message: payload.error || 'Growth update failed.' })
        return
      }
      if (action === 'set_account_target_state') {
        const username = String(extra.accountUsername || '').trim()
        const accountState = String(extra.accountState || '').trim() as 'watch' | 'prioritize' | 'mute' | 'engage_this_week'
        const note = String(extra.feedback || '').trim()
        if (username && accountState) {
          patchAccountTargetState(username, accountState, note)
        }
      }
      await reload()
      const messageMap: Partial<Record<GrowthAction, string>> = {
        refresh_research: 'Research refreshed.',
        generate_drafts: 'Draft candidates generated.',
        refresh_research_and_generate: 'Research refreshed and a new candidate pack generated.',
        rewrite_draft: 'Draft rewritten from the current research snapshot.',
        update_draft_text: 'Draft text saved.',
        approve_draft: 'Post approved and moved to Ready to schedule.',
        reject_draft: 'Draft rejected. The system will learn from that.',
        archive_draft: 'Angle archived without poisoning the whole source family.',
        clear_current_drafts: 'Current drafts cleared. Learning memory was preserved.',
        schedule_draft: 'Post scheduled in the editorial desk.',
        unschedule_draft: 'Post moved back to Ready to schedule without a publish time.',
        mark_published: 'Post marked published and the results loop was triggered.',
        reopen_published: 'Published state cleared and the post moved back into the scheduling lane.',
        set_account_target_state: 'Account target updated.',
      }
      if (draftId) {
        setFeedbackDrafts((current) => ({ ...current, [draftId]: '' }))
      }
      setActionState({ status: 'saved', message: messageMap[action] || 'Growth updated.' })
    } catch {
      setActionState({ status: 'error', message: 'Growth update failed.' })
    }
  }, [feedbackDrafts, growth?.week, patchAccountTargetState, reload])

  if (loading) {
    return <div className="panel"><div className="panel-body"><div className="h-36 rounded-lg shimmer" /></div></div>
  }

  if (!growth) {
    return <div className="panel"><div className="panel-body text-sm text-muted-foreground">Growth data is not available yet.</div></div>
  }

  const candidateCount = growth.draftCandidates.length
  const readyToSchedule = readyPosts.length
  const lowConfidenceCount = growth.freshness?.lowConfidenceClusters?.length ?? 0
  const topReplyCount = growth.engagementTargets.replyTargets.length
  const publishedCount = publishedPosts.length || growth.resultsSummary?.postedCount || 0
  const syncedPublishedCount = Number(growth.resultsSummary?.syncedPostCount || growth.strategyMemory?.performance?.syncedPostCount || 0)
  const publishAttempts = Number(growth.resultsSummary?.publishAttempts || growth.strategyMemory?.performance?.publishAttempts || 0)
  const todayBestMove = growth.strategy?.todayBestMove || null
  const bestForFollowerGrowthCard = bestForFollowerGrowth ?? (todayBestMove
    ? {
        distribution_type: todayBestMove.distributionType || 'reply',
        follower_growth_score: null,
        text: todayBestMove.why || todayBestMove.title || 'The strongest live opportunity is in the current conversation queue.',
      }
    : null)
  const weeklyMix = growth.strategy?.weeklyMixRecommendation || null
  const distributionPriority = growth.strategy?.distributionPriority?.length ? growth.strategy.distributionPriority.join(' → ') : 'reply → quote → original'

  return (
    <div className="space-y-5 p-5">
      <div className="rounded-2xl border border-white/10 bg-[#0f141b] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Growth</div>
            <div className="mt-1 max-w-3xl text-sm text-muted-foreground">Use this page like an editorial desk: refresh listening, choose the right participation move, approve exact post text, schedule it, then learn from outcomes.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void runGrowthAction('refresh_research_and_generate')} disabled={actionState.status === 'saving'} className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/20 disabled:opacity-60">Refresh Research + Generate</button>
            <button onClick={() => void runGrowthAction('refresh_research')} disabled={actionState.status === 'saving'} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60">Refresh Research Only</button>
            <button onClick={() => void runGrowthAction(candidateCount ? 'clear_current_drafts' : 'generate_drafts')} disabled={actionState.status === 'saving'} className="rounded-lg border border-amber-500/20 bg-black/20 px-3 py-2 text-xs font-medium text-amber-200 transition-smooth hover:bg-amber-500/10 disabled:opacity-60">{candidateCount ? 'Clear Current Drafts' : 'Generate Drafts'}</button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Research" value={growth.externalStatus} subtitle={formatPacificTime(growth.freshness?.lastXPullAt || growth.researchGeneratedAt || null)} accent="cyan" />
          <MetricCard label="Candidates" value={candidateCount} subtitle="Current review pack" accent="violet" />
          <MetricCard label="Ready to schedule" value={readyToSchedule} subtitle="Approved exact posts" accent="emerald" />
          <MetricCard label="Reply opportunities" value={topReplyCount} subtitle="Best for follower growth" accent="amber" />
          <MetricCard label="Published" value={publishedCount} subtitle={growth.strategy?.accountStage || 'Tracked in results loop'} accent={publishedCount ? 'emerald' : lowConfidenceCount ? 'rose' : 'cyan'} />
        </div>

        <div className="mt-4 rounded-xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/8 via-surface-2/80 to-surface-2/80 p-4">
          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="max-w-3xl">
              <div className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">Today’s best move</div>
              <div className="mt-1 text-base font-semibold text-foreground">
                {todayBestMove?.title || (bestForFollowerGrowth ? `${bestForFollowerGrowth.distribution_type || 'opportunity'} first: ${bestForFollowerGrowth.pillar}` : 'Refresh research before choosing the next move.')}
              </div>
              <div className="mt-2 text-sm text-foreground/85">
                {todayBestMove?.why || bestForFollowerGrowth?.selection_reason || 'The system should choose the highest-quality conversation to enter before it falls back to generic originals.'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {todayBestMove?.distributionType ? <FieldChip>{todayBestMove.distributionType}</FieldChip> : null}
                {growth.strategy?.accountStage ? <FieldChip>{growth.strategy.accountStage}</FieldChip> : null}
                {todayBestMove?.clusterLabel ? <FieldChip>{todayBestMove.clusterLabel}</FieldChip> : null}
                {todayBestMove?.sourceAccount ? <FieldChip>{todayBestMove.sourceAccount}</FieldChip> : null}
                {todayBestMove?.confidence ? <FieldChip>{todayBestMove.confidence}</FieldChip> : null}
              </div>
              {todayBestMove?.sourceUrl ? <a href={todayBestMove.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-cyan-200 hover:text-cyan-100">Open source context</a> : null}
            </div>
            <div className="grid gap-3">
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-xs text-muted-foreground">
                {actionState.message || todayBestMove?.primaryAction || 'The desk should prioritize credible replies, selective quotes, then originals only when they sharpen positioning.'}
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Strategy lane</div>
                <div className="mt-2 space-y-2 text-xs text-foreground/85">
                  {growth.strategy?.cadenceModel ? <div>Cadence: {growth.strategy.cadenceModel}</div> : null}
                  <div>Priority: {distributionPriority}</div>
                  {growth.strategy?.prioritizedAccounts?.length ? <div>Focus accounts: {growth.strategy.prioritizedAccounts.join(' • ')}</div> : null}
                </div>
              </div>
            </div>
          </div>
          {growth.changesSummary ? (
            <div className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">What changed since last run</div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-foreground/85">
                <span>{growth.changesSummary.newCount} new</span>
                <span>{growth.changesSummary.retainedCount} retained</span>
                <span>{growth.changesSummary.changedDraftIds.length} materially changed</span>
              </div>
              {growth.changesSummary.feedbackEffects?.length ? (
                <div className="mt-2 space-y-1 text-xs text-amber-100/85">
                  {growth.changesSummary.feedbackEffects.map((effect, index) => <div key={`effect-${index}`} className="flex gap-2"><span>•</span><span>{effect}</span></div>)}
                </div>
              ) : null}
            </div>
          ) : null}
          {weeklyMix?.targetMix?.length || growth.strategy?.scheduleGuidance ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Recommended weekly mix</div>
                {weeklyMix?.targetMix?.length ? (
                  <div className="mt-2 space-y-2">
                    {weeklyMix.targetMix.map((item) => (
                      <div key={`mix-${item.type}`} className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-foreground capitalize">{item.type}</div>
                          <FieldChip>{item.share}</FieldChip>
                        </div>
                        <div className="mt-1 text-xs text-foreground/80">{item.reason}</div>
                      </div>
                    ))}
                    <div className="text-xs text-muted-foreground">
                      Available now: replies {weeklyMix.availableOpportunityBalance.reply} • quotes {weeklyMix.availableOpportunityBalance.quote} • originals {weeklyMix.availableOpportunityBalance.original}
                    </div>
                    <div className="text-xs text-foreground/80">{weeklyMix.currentBias}</div>
                  </div>
                ) : <div className="mt-2 text-sm text-muted-foreground">No weekly mix guidance yet.</div>}
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Scheduling guidance</div>
                {growth.strategy?.scheduleGuidance ? (
                  <div className="mt-2 space-y-2 text-sm text-foreground/85">
                    <div>{growth.strategy.scheduleGuidance.recommendation}</div>
                    <div className="text-xs text-muted-foreground">{growth.strategy.scheduleGuidance.timing}</div>
                  </div>
                ) : <div className="mt-2 text-sm text-muted-foreground">No scheduling guidance generated yet.</div>}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-3">
            <div className="rounded-xl border border-cyan-500/15 bg-[#10161f] p-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Best for follower growth</div>
              {bestForFollowerGrowthCard ? (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">{bestForFollowerGrowthCard.distribution_type ? <FieldChip>{bestForFollowerGrowthCard.distribution_type}</FieldChip> : null}{typeof bestForFollowerGrowthCard.follower_growth_score === 'number' ? <FieldChip>growth {bestForFollowerGrowthCard.follower_growth_score}</FieldChip> : null}</div>
                  <div className="mt-3 text-sm font-medium text-foreground whitespace-pre-wrap">{bestForFollowerGrowthCard.text}</div>
                </>
              ) : <div className="mt-3 text-sm text-muted-foreground">No recommendation yet.</div>}
            </div>
            <div className="rounded-xl border border-violet-500/15 bg-[#10161f] p-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Best for brand building</div>
              {bestForBrandBuilding ? (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">{bestForBrandBuilding.distribution_type ? <FieldChip>{bestForBrandBuilding.distribution_type}</FieldChip> : null}{typeof bestForBrandBuilding.brand_building_score === 'number' ? <FieldChip>brand {bestForBrandBuilding.brand_building_score}</FieldChip> : null}</div>
                  <div className="mt-3 text-sm font-medium text-foreground whitespace-pre-wrap">{bestForBrandBuilding.text}</div>
                </>
              ) : <div className="mt-3 text-sm text-muted-foreground">No recommendation yet.</div>}
            </div>
            <div className="rounded-xl border border-amber-500/15 bg-[#10161f] p-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Best original post</div>
              {bestOriginalPost ? (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">{bestOriginalPost.distribution_type ? <FieldChip>{bestOriginalPost.distribution_type}</FieldChip> : null}{typeof bestOriginalPost.timeliness_score === 'number' ? <FieldChip>timeliness {bestOriginalPost.timeliness_score}</FieldChip> : null}</div>
                  <div className="mt-3 text-sm font-medium text-foreground whitespace-pre-wrap">{bestOriginalPost.text}</div>
                </>
              ) : <div className="mt-3 text-sm text-muted-foreground">No original post opportunity is strong enough yet.</div>}
            </div>
          </div>

          <CollapsibleSection title="Draft candidates" subtitle="Review exact post text, source basis, and why the system selected it." defaultOpen>
            <div className="space-y-4">
              {groupedDraftCandidates.length ? groupedDraftCandidates.map((group, groupIndex) => {
                const leader = group[0]
                const familyLabel = leader.variant_group_label || 'Candidate set'
                const sourceLabel =
                  leader.source_account && leader.source_tweet?.url
                    ? `${leader.source_account} • ${leader.angle}`
                    : leader.angle || leader.pillar
                if (group.length > 1 && leader.source_tweet?.url) {
                  return (
                    <SourceVariantGroup
                      key={leader.variant_family_id || leader.id}
                      familyLabel={familyLabel}
                      sourceLabel={sourceLabel}
                      drafts={group}
                      defaultOpen={groupIndex === 0}
                      feedbackDrafts={feedbackDrafts}
                      onFeedbackChange={(draftId, value) => setFeedbackDrafts((current) => ({ ...current, [draftId]: value }))}
                      onAction={(action, draftId, extra) => void runGrowthAction(action, draftId, extra || {})}
                      saving={actionState.status === 'saving'}
                    />
                  )
                }
                const draft = leader
                return (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    feedbackValue={feedbackDrafts[draft.id] || ''}
                    onFeedbackChange={(value) => setFeedbackDrafts((current) => ({ ...current, [draft.id]: value }))}
                    onAction={(action, draftId, extra) => void runGrowthAction(action, draftId, extra || {})}
                    saving={actionState.status === 'saving'}
                  />
                )
              }) : <div className="rounded-xl border border-white/10 bg-[#10161f] px-4 py-4 text-sm text-muted-foreground">Research is ready. Generate a fresh candidate pack when you want posts to review.</div>}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Ready to schedule" subtitle="Approved exact posts stay here until you schedule them or mark them published." defaultOpen>
            <div className="space-y-3">
              {readyPosts.length ? readyPosts.map((post) => {
                const suggested = buildSuggestedSchedule(post)
                const scheduleState = scheduleDrafts[post.id] || { when: post.scheduledAt || suggested.when, note: post.scheduleNote || suggested.note }
                const publishState = publishDrafts[post.id] || { tweetUrl: post.tweetUrl || '', tweetId: post.tweetId || '' }
                return (
                  <div key={post.id} className="rounded-2xl border border-emerald-500/15 bg-[#10161f] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.24)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{post.pillar || 'Approved post'}{post.angle ? `: ${post.angle}` : ''}</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <FieldChip>{post.status}</FieldChip>
                          {post.distributionType ? <FieldChip>{post.distributionType}</FieldChip> : null}
                          {post.sourceType ? <FieldChip>{post.sourceType}</FieldChip> : null}
                          {post.approvedAtPt ? <FieldChip>approved {formatPacificTime(post.approvedAtPt)}</FieldChip> : null}
                        {post.scheduledAtPt ? <FieldChip>scheduled {formatPacificTime(post.scheduledAtPt)}</FieldChip> : post.scheduledAt ? <FieldChip>scheduled {formatPacificTime(post.scheduledAt)}</FieldChip> : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-emerald-500/15 bg-black/20 px-4 py-4 text-[15px] leading-7 text-foreground whitespace-pre-wrap">{post.text}</div>
                    {post.selectionReason ? <div className="mt-3 text-sm text-foreground/80">{post.selectionReason}</div> : null}
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Schedule</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
                          <label className="text-xs text-muted-foreground">When
                            <input type="datetime-local" value={scheduleState.when} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [post.id]: { ...scheduleState, when: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                          </label>
                          <label className="text-xs text-muted-foreground">Note
                            <input value={scheduleState.note} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [post.id]: { ...scheduleState, note: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="optional schedule note" />
                          </label>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {post.distributionType === 'reply'
                            ? 'Suggested while the conversation is still warm.'
                            : post.distributionType === 'quote'
                              ? 'Suggested after the source has traction but before the thread cools.'
                              : 'Suggested for a calmer standalone slot.'}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => void runGrowthAction('schedule_draft', post.id, { scheduledAt: scheduleState.when, scheduleNote: scheduleState.note, scheduleSource: scheduleState.when === suggested.when ? 'machine_suggested' : 'user_selected' })} disabled={actionState.status === 'saving' || !scheduleState.when} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition-smooth hover:bg-emerald-500/20 disabled:opacity-60">Schedule</button>
                          {post.status === 'scheduled' ? (
                            <button onClick={() => void runGrowthAction('unschedule_draft', post.id)} disabled={actionState.status === 'saving'} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60">Unschedule</button>
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Mark published</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
                          <label className="text-xs text-muted-foreground">Tweet URL
                            <input value={publishState.tweetUrl} onChange={(event) => setPublishDrafts((current) => ({ ...current, [post.id]: { ...publishState, tweetUrl: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="https://x.com/.../status/..." />
                          </label>
                          <label className="text-xs text-muted-foreground">Tweet ID
                            <input value={publishState.tweetId} onChange={(event) => setPublishDrafts((current) => ({ ...current, [post.id]: { ...publishState, tweetId: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="optional if URL is present" />
                          </label>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => void runGrowthAction('mark_published', post.id, { tweetUrl: publishState.tweetUrl, tweetId: publishState.tweetId })} disabled={actionState.status === 'saving' || (!publishState.tweetUrl && !publishState.tweetId)} className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/20 disabled:opacity-60">Mark Published</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }) : <div className="rounded-xl border border-white/10 bg-[#10161f] px-4 py-4 text-sm text-muted-foreground">No approved posts are waiting for scheduling right now.</div>}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Published + learning" subtitle="Once a post is live, results sync should update strategy memory and ranking bias." defaultOpen={false}>
            <div className="space-y-4">
              {growth.resultsSummary?.postedCount ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{syncedPublishedCount ? 'What is working' : 'Published state'}</div>
                    {syncedPublishedCount ? (
                      <div className="mt-2 space-y-1 text-sm text-foreground/90">
                        {growth.resultsSummary.winningDistributionTypes?.length ? <div>Winning distribution: {growth.resultsSummary.winningDistributionTypes.join(' • ')}</div> : null}
                        {growth.resultsSummary.winningSourceTypes?.length ? <div>Winning sources: {growth.resultsSummary.winningSourceTypes.join(' • ')}</div> : null}
                        {growth.resultsSummary.winningPillars?.length ? <div>Winning pillars: {growth.resultsSummary.winningPillars.join(' • ')}</div> : null}
                        {growth.resultsSummary.winningArchetypes?.length ? <div>Winning archetypes: {growth.resultsSummary.winningArchetypes.join(' • ')}</div> : null}
                        {growth.resultsSummary.timingBias?.length ? <div>Timing bias: {growth.resultsSummary.timingBias.join(' • ')}</div> : null}
                      </div>
                    ) : (
                      <div className="mt-2 space-y-1 text-sm text-foreground/85">
                        <div>{publishedCount} post{publishedCount === 1 ? '' : 's'} marked published.</div>
                        <div>Waiting on live X metrics before the engine promotes any format, source, or timing pattern as a winner.</div>
                        {publishAttempts ? <div className="text-xs text-muted-foreground">{publishAttempts} publish update{publishAttempts === 1 ? '' : 's'} recorded so far.</div> : null}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Strategy notes</div>
                    <div className="mt-2 space-y-1 text-sm text-foreground/90">
                      {growth.resultsSummary.strategyNotes.map((note, index) => <div key={`result-note-${index}`} className="flex gap-2"><span>•</span><span>{note}</span></div>)}
                    </div>
                  </div>
                </div>
              ) : <div className="rounded-xl border border-white/10 bg-[#10161f] px-4 py-4 text-sm text-muted-foreground">No published post results yet. Once you mark one post published, the results loop should start influencing future ranking.</div>}
              {publishedPosts.length ? (
                <div className="space-y-3">
                  {publishedPosts.map((post) => (
                    <div key={`published-${post.id}`} className="rounded-2xl border border-cyan-500/15 bg-[#10161f] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.24)]">
                      <div className="flex flex-wrap gap-2">
                        <FieldChip>{post.status}</FieldChip>
                        {post.distributionType ? <FieldChip>{post.distributionType}</FieldChip> : null}
                        {post.sourceType ? <FieldChip>{post.sourceType}</FieldChip> : null}
                        {post.scheduledAtPt ? <FieldChip>scheduled {formatPacificTime(post.scheduledAtPt)}</FieldChip> : null}
                      </div>
                      <div className="mt-4 rounded-xl border border-cyan-500/15 bg-black/20 px-4 py-4 text-[15px] leading-7 text-foreground whitespace-pre-wrap">{post.text}</div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {post.selectionReason ? <span>{post.selectionReason}</span> : null}
                        {post.tweetId ? <span>tweet {post.tweetId}</span> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {post.tweetUrl ? <a href={post.tweetUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-cyan-200 hover:text-cyan-100">Open published post</a> : null}
                        <button
                          onClick={() => void runGrowthAction('reopen_published', post.id)}
                          disabled={actionState.status === 'saving'}
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60"
                        >
                          Reopen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {growth.publishLog?.length ? (
                <div className="space-y-2">
                  {growth.publishLog.map((entry, index) => (
                    <div key={`publish-log-${index}`} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {entry.pillar ? <FieldChip>{String(entry.pillar)}</FieldChip> : null}
                        {entry.distribution_type ? <FieldChip>{String(entry.distribution_type)}</FieldChip> : null}
                        {entry.posted_at_pt ? <FieldChip>{formatPacificTime(String(entry.posted_at_pt))}</FieldChip> : null}
                      </div>
                      {entry.tweet_url ? <a href={String(entry.tweet_url)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-cyan-200 hover:text-cyan-100">Open published post</a> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </CollapsibleSection>
        </div>

        <div className="space-y-4">
          <CollapsibleSection title="Listening" subtitle="Market signal, research diagnostics, and live conversation quality." defaultOpen={false}>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-sm text-foreground/85">
                <div><strong className="text-foreground">Primary goal:</strong> {growth.strategy?.primaryGoal || 'No strategy generated yet.'}</div>
                <div className="mt-2 text-xs text-muted-foreground">Last pull {formatPacificTime(growth.freshness?.lastXPullAt || growth.researchGeneratedAt || null)} • {growth.freshness?.queryCount ?? 0} queries • {growth.freshness?.sampleSize ?? 0} samples</div>
              </div>
              {growth.trendClusters.length ? growth.trendClusters.map((cluster) => (
                <div key={cluster.id} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-foreground">{cluster.label}</div>
                    <FieldChip>{cluster.confidence}</FieldChip>
                  </div>
                  <div className="mt-2 text-sm text-foreground/85">{cluster.whyItMatters}</div>
                  {cluster.conversationThemes.length ? <div className="mt-2 text-xs text-cyan-100/80">{cluster.conversationThemes.join(' • ')}</div> : null}
                  {cluster.representativeExample ? <div className="mt-2 text-xs text-foreground/70">{cluster.representativeExample}</div> : null}
                </div>
              )) : <div className="text-sm text-muted-foreground">No high-confidence clusters yet.</div>}
              {growth.listeningDiagnostics?.coverageByZone?.length ? (
                <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Diagnostics</div>
                  <div className="mt-2 space-y-1 text-xs text-foreground/80">
                    {growth.listeningDiagnostics.coverageByZone.map((zone) => (
                      <div key={zone.zoneId} className="flex items-center justify-between gap-2"><span>{zone.label}</span><span className="text-muted-foreground">{zone.queryCount} queries • {zone.keptTweets} kept</span></div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Signals" subtitle="Source quality, account targets, and watchlist actions." defaultOpen={false}>
            <div className="space-y-3">
              {growth.watchlistRecommendations?.length ? (
                <div className="space-y-2">
                  {growth.watchlistRecommendations.map((account) => (
                    <div key={account.username} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{displayUsername(account.username)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{account.clusterLabel} • {account.state}</div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(['watch', 'prioritize', 'mute', 'engage_this_week'] as const).map((state) => (
                            <button key={`${account.username}-${state}`} onClick={() => void runGrowthAction('set_account_target_state', undefined, { accountUsername: account.username, accountState: state, feedback: account.reason })} disabled={actionState.status === 'saving'} className={cx('rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] transition-smooth', account.state === state ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200' : 'border-white/10 text-muted-foreground hover:bg-surface-2')}>{state.replaceAll('_', ' ')}</button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-foreground/80">{account.reason}</div>
                      {account.sourceUrl ? <a href={account.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-cyan-200 hover:text-cyan-100">Open source</a> : null}
                    </div>
                  ))}
                </div>
              ) : <div className="text-sm text-muted-foreground">No watchlist recommendations yet.</div>}

              {growth.sourceCandidates.length ? (
                <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Top source candidates</div>
                  <div className="mt-2 space-y-2">
                    {growth.sourceCandidates.slice(0, 4).map((candidate, index) => (
                      <div key={`candidate-${index}`} className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-foreground">{candidate.clusterLabel}</div>
                          <FieldChip>score {candidate.score}</FieldChip>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{candidate.author} • {candidate.followers.toLocaleString()} followers • {candidate.likes} likes • {candidate.replies} replies</div>
                        <div className="mt-2 text-xs text-foreground/80">{candidate.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {growth.accountTargets.length ? (
                <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Account targets</div>
                  <div className="mt-2 space-y-2">
                    {growth.accountTargets.slice(0, 5).map((account) => (
                      <div key={`account-target-${account.username}`} className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-foreground">{displayUsername(account.username)}</div>
                          <div className="flex flex-wrap gap-2">
                            {account.clusterLabel ? <FieldChip>{account.clusterLabel}</FieldChip> : null}
                            <FieldChip>{account.followers.toLocaleString()} followers</FieldChip>
                            {account.verified ? <FieldChip>verified</FieldChip> : null}
                            {account.state ? <FieldChip>{account.state}</FieldChip> : null}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-foreground/80">{account.why}</div>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {(['watch', 'prioritize', 'mute', 'engage_this_week'] as const).map((state) => (
                            <button
                              key={`${account.username}-target-${state}`}
                              onClick={() => void runGrowthAction('set_account_target_state', undefined, { accountUsername: account.username, accountState: state, feedback: account.why })}
                              disabled={actionState.status === 'saving'}
                              className={cx(
                                'rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] transition-smooth',
                                account.state === state
                                  ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200'
                                  : 'border-white/10 text-muted-foreground hover:bg-surface-2',
                              )}
                            >
                              {state.replaceAll('_', ' ')}
                            </button>
                          ))}
                        </div>
                        {account.stateNote ? <div className="mt-2 text-[11px] text-muted-foreground">{account.stateNote}</div> : null}
                        {account.sourceUrl ? <a href={account.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-cyan-200 hover:text-cyan-100">Open source context</a> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Strategy memory" subtitle="What the system has learned from your feedback and live results." defaultOpen={false}>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Editorial memory</div>
                {growth.editorialMemory?.recentFeedback?.length ? (
                  <div className="mt-2 space-y-2">
                    {growth.editorialMemory.recentFeedback.map((entry, index) => (
                      <div key={`feedback-${index}`} className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{entry.decision} • {entry.archetype || 'unknown'} • {formatPacificTime(entry.reviewedAtPt)}</div>
                        <div className="mt-1 text-sm text-foreground/85">{entry.feedback}</div>
                      </div>
                    ))}
                  </div>
                ) : <div className="mt-2 text-sm text-muted-foreground">No editorial memory yet.</div>}
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Source memory</div>
                {growth.sourceMemory ? (
                  <div className="mt-2 space-y-2 text-xs text-foreground/85">
                    {growth.sourceMemory.negativeStyleMarkers.length ? <div>Negative style markers: {growth.sourceMemory.negativeStyleMarkers.join(' • ')}</div> : null}
                    {growth.sourceMemory.rejectedPhrases.length ? <div>Rejected phrase patterns: {growth.sourceMemory.rejectedPhrases.join(' • ')}</div> : null}
                    {growth.sourceMemory.accounts.length ? <div>Tracked accounts: {growth.sourceMemory.accounts.slice(0, 5).map((account) => `${displayUsername(account.username)} (${account.state})`).join(' • ')}</div> : null}
                    {!growth.sourceMemory.negativeStyleMarkers.length && !growth.sourceMemory.rejectedPhrases.length && !growth.sourceMemory.accounts.length ? <div className="text-muted-foreground">No source memory stored yet.</div> : null}
                  </div>
                ) : <div className="mt-2 text-sm text-muted-foreground">No source memory stored yet.</div>}
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Strategy memory</div>
                {growth.strategyMemory ? (
                  <div className="mt-2 space-y-2 text-xs text-foreground/85">
                    {growth.strategyMemory.accountStage ? <div>Account stage: {growth.strategyMemory.accountStage}</div> : null}
                    {growth.strategyMemory.performance?.postedCount && !growth.strategyMemory.performance?.syncedPostCount ? (
                      <div className="space-y-1">
                        <div>Published posts exist, but live metrics have not synced yet.</div>
                        {growth.strategyMemory.performance?.publishAttempts ? <div className="text-muted-foreground">{growth.strategyMemory.performance.publishAttempts} publish update{growth.strategyMemory.performance.publishAttempts === 1 ? '' : 's'} recorded.</div> : null}
                      </div>
                    ) : (
                      <>
                        {growth.strategyMemory.winningDistributionTypes?.length ? <div>Winning distribution types: {growth.strategyMemory.winningDistributionTypes.join(' • ')}</div> : null}
                        {growth.strategyMemory.winningSourceTypes?.length ? <div>Winning source types: {growth.strategyMemory.winningSourceTypes.join(' • ')}</div> : null}
                        {growth.strategyMemory.winningSourceAccounts?.length ? <div>Winning source accounts: {growth.strategyMemory.winningSourceAccounts.map((account) => displayUsername(account)).join(' • ')}</div> : null}
                        {growth.strategyMemory.winningArchetypes?.length ? <div>Winning archetypes: {growth.strategyMemory.winningArchetypes.join(' • ')}</div> : null}
                        {growth.strategyMemory.timingBias?.length ? <div>Timing bias: {growth.strategyMemory.timingBias.join(' • ')}</div> : null}
                      </>
                    )}
                    {growth.strategyMemory.strategyNotes?.length ? <div className="space-y-1">{growth.strategyMemory.strategyNotes.map((note, index) => <div key={`strategy-note-${index}`} className="flex gap-2"><span>•</span><span>{note}</span></div>)}</div> : null}
                  </div>
                ) : <div className="mt-2 text-sm text-muted-foreground">No strategy memory yet.</div>}
              </div>
              {growth.resultsSummary?.topPosts?.length ? (
                <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Top published signals</div>
                  <div className="mt-2 space-y-2">
                    {growth.resultsSummary.topPosts.map((post) => (
                      <div key={`top-post-${post.id}`} className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{post.pillar}</span>
                          <FieldChip>score {post.engagementScore}</FieldChip>
                          {post.distributionType ? <FieldChip>{post.distributionType}</FieldChip> : null}
                          {post.sourceType ? <FieldChip>{post.sourceType}</FieldChip> : null}
                          {post.sourceAccount ? <FieldChip>{displayUsername(post.sourceAccount)}</FieldChip> : null}
                        </div>
                        {post.tweetUrl ? <a href={post.tweetUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-cyan-200 hover:text-cyan-100">Open published post</a> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  )
}
