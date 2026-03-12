'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSmartPoll } from '@/lib/use-smart-poll'

type GrowthAction =
  | 'refresh_research'
  | 'select_opportunities'
  | 'refresh_research_and_select'
  | 'reject_opportunity'
  | 'archive_opportunity'
  | 'generate_drafts'
  | 'refresh_research_and_generate'
  | 'expand_family_variants'
  | 'rewrite_draft'
  | 'update_draft_text'
  | 'approve_draft'
  | 'reject_draft'
  | 'archive_draft'
  | 'clear_current_drafts'
  | 'schedule_draft'
  | 'post_now'
  | 'unschedule_draft'
  | 'mark_published'
  | 'link_manual_publish'
  | 'reopen_published'
  | 'set_account_target_state'

interface GrowthApiResponse {
  hasPacket: boolean
  growth: {
    week: string | null
    researchBriefPath: string | null
    opportunityPackPath?: string | null
    researchHistoryPath?: string | null
    draftPackPath: string | null
    scorecardPath: string | null
    researchGeneratedAt?: string | null
    draftPackGeneratedAt?: string | null
    externalStatus: string
    freshness?: {
      lastXPullAt?: string | null
      sampleSize?: number
      queryCount?: number
      cacheUsed?: boolean
      cacheAgeMinutes?: number
      forcedRefresh?: boolean
      discoveryTriggered?: boolean
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
    researchHistory?: {
      updatedAt?: string | null
      runs?: Array<{ generatedAt?: string | null }>
      sources?: Record<string, { seenCount?: number }>
      clusters?: Record<string, { seenCount?: number }>
      accounts?: Record<string, { seenCount?: number }>
    } | null
    selectedOpportunities: Array<{
      id: string
      opportunityId: string
      title: string
      distributionType: string
      sourceType: string
      sourceState: string
      sourceFamilyKey: string
      sourceUrl: string | null
      sourceAccount: string
      sourceText: string
      clusterId: string | null
      clusterLabel: string
      whyNow: string
      audienceFit: string
      brandFit: string
      growthScore: number
      brandScore: number
      timelinessScore: number
      confidence: string
      selectionReason: string
      selectionFactors: string[]
      sourceSeenCount: number
      accountSeenCount: number
      clusterSeenCount: number
      accountState: string
      replyEligible: boolean
      blockedReason?: string
      suppressionReason?: string
      supportingSignals: string[]
    }>
    blockedOpportunities: Array<{
      id: string
      opportunityId: string
      title: string
      distributionType: string
      sourceType: string
      sourceState: string
      sourceFamilyKey: string
      sourceUrl: string | null
      sourceAccount: string
      sourceText: string
      clusterId: string | null
      clusterLabel: string
      whyNow: string
      audienceFit: string
      brandFit: string
      growthScore: number
      brandScore: number
      timelinessScore: number
      confidence: string
      selectionReason: string
      selectionFactors: string[]
      sourceSeenCount: number
      accountSeenCount: number
      clusterSeenCount: number
      accountState: string
      replyEligible: boolean
      blockedReason?: string
      suppressionReason?: string
      supportingSignals: string[]
    }>
    watchOnlyOpportunities: Array<{
      id: string
      opportunityId: string
      title: string
      distributionType: string
      sourceType: string
      sourceState: string
      sourceFamilyKey: string
      sourceUrl: string | null
      sourceAccount: string
      sourceText: string
      clusterId: string | null
      clusterLabel: string
      whyNow: string
      audienceFit: string
      brandFit: string
      growthScore: number
      brandScore: number
      timelinessScore: number
      confidence: string
      selectionReason: string
      selectionFactors: string[]
      sourceSeenCount: number
      accountSeenCount: number
      clusterSeenCount: number
      accountState: string
      replyEligible: boolean
      blockedReason?: string
      suppressionReason?: string
      supportingSignals: string[]
    }>
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
      orphanCount?: number
      reconciledCount?: number
      whatChangedSinceLastRun?: string[]
    } | null
    stateIntegrity?: {
      selectedOpportunityCount: number
      draftCandidateCount: number
      orphanDraftCount: number
      consumedDraftCount: number
      prunedVariantCount: number
    } | null
    noOpportunityReason?: string | null
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
      publishError?: string | null
    }>
    publishLog?: Array<{ id?: string; tweet_url?: string | null; posted_at_pt?: string; distribution_type?: string; source_type?: string; pillar?: string; angle?: string }>
    followQueue?: Array<{
      id: string
      username: string
      accountId?: string | null
      state?: string
      role?: string
      reason?: string
      sourceUrl?: string | null
      clusterLabel?: string
      score?: number
      followType?: 'proactive' | 'engagement' | string
      countsTowardDailyCap?: boolean
      status?: string
      createdAt?: string | null
      updatedAt?: string | null
      followedAt?: string | null
      followError?: string | null
    }>
    followLog?: Array<{
      username: string
      accountId?: string | null
      status?: string
      datePt?: string | null
      createdAt?: string | null
      followType?: 'proactive' | 'engagement' | string
      countsTowardDailyCap?: boolean
    }>
    accountGrowthSummaries?: Array<{
      week: string | null
      generatedAt?: string | null
      researchGeneratedAt?: string | null
      snapshotStatus?: string
      notes?: string[]
      usedCache?: boolean
      cacheAgeMinutes?: number | null
      discoveryTriggered?: boolean
      followerSnapshot?: {
        fetchedAt?: string | null
        username?: string | null
        accountId?: string | null
        followersCount?: number | null
      } | null
      startingFollowerCount?: number | null
      endingFollowerCount?: number | null
      netFollowerGrowth?: number | null
      accountsFollowed?: number
      followsFromEngagement?: number
      followsFromProactiveQueue?: number
      followBudget?: {
        proactiveDailyCap?: number | null
        proactiveUsedThisWeek?: number
        engagementUsedThisWeek?: number
      } | null
      postsPublished?: number
      repliesPublished?: number
      quotesPublished?: number
      originalsPublished?: number
      successfulPublishCount?: number
      failedPublishCount?: number
      selectedOpportunityCount?: number
      draftCount?: number
    }>
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
      blockedSourceCount?: number
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

function formatSignedCount(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a'
  if (value > 0) return `+${value}`
  return String(value)
}

function useGrowthData() {
  const [data, setData] = useState<GrowthApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/founder/packet')
      if (!response.ok) {
        setError(`Growth packet failed to load (${response.status})`)
        return
      }
      const payload = await response.json()
      setData(payload)
      setError(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Growth packet failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useSmartPoll(load, 60000, { pauseWhenConnected: true })
  return { data, setData, loading, error, reload: load }
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function FieldChip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-muted-foreground">{children}</span>
}

function CommandChip({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'live' | 'queue' | 'warning'
}) {
  return (
    <span
      className={cx(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium',
        tone === 'live' && 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100',
        tone === 'queue' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100',
        tone === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-100',
        tone === 'neutral' && 'border-white/10 bg-black/20 text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

function displayUsername(username: string) {
  return username.startsWith('@') ? username : `@${username}`
}

function extractOpportunityUsername(opportunity: {
  sourceAccount?: string | null
  title?: string | null
}) {
  const sourceAccount = String(opportunity.sourceAccount || '').trim()
  if (sourceAccount) return sourceAccount.replace(/^@/, '')
  const match = String(opportunity.title || '').match(/@([A-Za-z0-9_]+)/)
  return match ? match[1] : ''
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

function isNonReplyablePublishError(message?: string | null) {
  const text = String(message || '').toLowerCase()
  return (
    text.includes('not allowed to reply') ||
    text.includes('not permitted to reply') ||
    text.includes('reply to this conversation is not allowed') ||
    text.includes('reply to this conversation is not permitted') ||
    text.includes('not been mentioned or otherwise engaged') ||
    text.includes('only people mentioned') ||
    text.includes('only users mentioned')
  )
}

function scrollToId(id: string) {
  if (typeof document === 'undefined') return
  const element = document.getElementById(id)
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function OpportunityCard({
  opportunity,
  blocked = false,
  feedbackValue = '',
  onFeedbackChange,
  onAction,
  saving = false,
}: {
  opportunity: GrowthApiResponse['growth']['selectedOpportunities'][number]
  blocked?: boolean
  feedbackValue?: string
  onFeedbackChange?: (value: string) => void
  onAction?: (action: GrowthAction, opportunityId: string, extra?: Record<string, unknown>) => void
  saving?: boolean
}) {
  const feedbackPresets = ['Weak source', 'Wrong audience', 'Too generic', 'Already replied', 'Good direction, rewrite']
  const summaryReason = opportunity.selectionReason || opportunity.whyNow || 'Review the source and choose whether this move is worth drafting.'
  const historyChips = [
    opportunity.sourceSeenCount > 1 ? `source seen ${opportunity.sourceSeenCount}x` : '',
    opportunity.accountSeenCount > 1 ? `account seen ${opportunity.accountSeenCount}x` : '',
    opportunity.clusterSeenCount > 1 ? `cluster seen ${opportunity.clusterSeenCount}x` : '',
    opportunity.accountState && opportunity.accountState !== 'available' ? opportunity.accountState.replace(/_/g, ' ') : '',
  ].filter(Boolean)
  return (
    <article className={cx(
      'rounded-2xl border p-4 shadow-[0_16px_36px_rgba(0,0,0,0.24)] transition-smooth',
      blocked ? 'border-rose-500/15 bg-[#171116]' : 'border-cyan-500/15 bg-[#10161f]',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {opportunity.sourceAccount ? <span>{opportunity.sourceAccount}</span> : null}
            {opportunity.distributionType ? <span>{opportunity.distributionType}</span> : null}
            {opportunity.confidence ? <span>{opportunity.confidence}</span> : null}
          </div>
          <div className="mt-2 text-sm font-semibold leading-6 text-foreground">{opportunity.title || 'Opportunity'}</div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-foreground/72">{summaryReason}</div>
        </div>
        <span className={cx(
          'rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em]',
          blocked ? 'border-rose-500/25 bg-rose-500/10 text-rose-200' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
        )}>
          {blocked ? opportunity.sourceState.replace(/_/g, ' ') : 'selected'}
        </span>
      </div>
      {opportunity.sourceText ? (
        <div className="mt-4 rounded-xl border border-white/8 bg-black/20 px-4 py-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100/70">
            <span className="text-cyan-200">Source tweet</span>
            {opportunity.clusterLabel ? <span className="text-muted-foreground">{opportunity.clusterLabel}</span> : null}
          </div>
          <div className="mt-3 border-l-2 border-cyan-500/35 pl-3 text-sm leading-6 text-foreground/88 whitespace-pre-wrap">
            {opportunity.sourceText}
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {!blocked && onAction ? (
          <button
            onClick={() => onAction('generate_drafts', opportunity.id, { opportunityId: opportunity.opportunityId })}
            disabled={saving}
            className="rounded-lg border border-cyan-500/20 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/10 disabled:opacity-60"
          >
            Generate Drafts
          </button>
        ) : null}
        {!blocked && onAction ? (
          <button
            onClick={() => onAction('reject_opportunity', opportunity.id, { feedback: feedbackValue })}
            disabled={saving}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-muted-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60"
          >
            Reject
          </button>
        ) : null}
        {!blocked && onAction ? (
          <button
            onClick={() => onAction('archive_opportunity', opportunity.id, { feedback: feedbackValue })}
            disabled={saving}
            className="rounded-lg border border-amber-500/20 px-3 py-2 text-xs font-medium text-amber-200 transition-smooth hover:bg-amber-500/10 disabled:opacity-60"
          >
            Archive
          </button>
        ) : null}
        {opportunity.sourceUrl ? <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-foreground/80 transition-smooth hover:bg-surface-2">Open source</a> : null}
      </div>
      <details className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
        <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Details</summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-3">
            {opportunity.whyNow ? (
              <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Why now</div>
                <div className="mt-1 text-sm text-foreground/90">{opportunity.whyNow}</div>
              </div>
            ) : null}
            <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Source truth</div>
              <div className="mt-1 text-sm text-foreground/90">
                {blocked
                  ? opportunity.blockedReason || opportunity.suppressionReason || `Blocked because this source is ${opportunity.sourceState.replace(/_/g, ' ')}.`
                  : opportunity.replyEligible || opportunity.distributionType !== 'reply'
                    ? 'Actionable now.'
                    : 'Not actionable until source state changes.'}
              </div>
              {historyChips.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {historyChips.map((chip, index) => <FieldChip key={`${opportunity.id}-history-${index}`}>{chip}</FieldChip>)}
                </div>
              ) : null}
            </div>
          </div>
          <div className="space-y-3">
            {opportunity.selectionFactors?.length ? (
              <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Why it ranked</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {opportunity.selectionFactors.map((factor, index) => <FieldChip key={`${opportunity.id}-factor-${index}`}>{factor}</FieldChip>)}
                </div>
              </div>
            ) : null}
            {opportunity.supportingSignals?.length ? (
              <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Supporting signals</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {opportunity.supportingSignals.map((signal, index) => <FieldChip key={`${opportunity.id}-signal-${index}`}>{signal}</FieldChip>)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </details>
      {!blocked && onAction && onFeedbackChange ? (
        <details className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
          <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Notes and feedback</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {feedbackPresets.map((preset) => (
              <button
                key={`${opportunity.id}-${preset}`}
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
            placeholder="Why this move should be demoted, archived, or learned from."
            value={feedbackValue}
            onChange={(event) => onFeedbackChange(event.target.value)}
          />
        </details>
      ) : null}
    </article>
  )
}

function OpportunityLane({
  title,
  subtitle,
  opportunities,
  feedbackDrafts,
  onFeedbackChange,
  onAction,
  saving,
  defaultOpen = true,
}: {
  title: string
  subtitle: string
  opportunities: GrowthApiResponse['growth']['selectedOpportunities']
  feedbackDrafts: Record<string, string>
  onFeedbackChange: (opportunityId: string, value: string) => void
  onAction: (action: GrowthAction, draftId?: string, extra?: Record<string, unknown>) => void
  saving: boolean
  defaultOpen?: boolean
}) {
  if (!opportunities.length) return null
  return (
    <details open={defaultOpen} className="rounded-xl border border-white/10 bg-[#0f151d] p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
          </div>
          <FieldChip>{opportunities.length}</FieldChip>
        </div>
      </summary>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {opportunities.map((opportunity) => (
          <OpportunityCard
            key={opportunity.id}
            opportunity={opportunity}
            feedbackValue={feedbackDrafts[opportunity.id] || ''}
            onFeedbackChange={(value) => onFeedbackChange(opportunity.id, value)}
            onAction={onAction}
            saving={saving}
          />
        ))}
      </div>
    </details>
  )
}

function OpportunityFamilyGroup({
  sourceLabel,
  opportunities,
  feedbackDrafts,
  onFeedbackChange,
  onAction,
  saving,
}: {
  sourceLabel: string
  opportunities: GrowthApiResponse['growth']['selectedOpportunities']
  feedbackDrafts: Record<string, string>
  onFeedbackChange: (opportunityId: string, value: string) => void
  onAction: (action: GrowthAction, draftId?: string, extra?: Record<string, unknown>) => void
  saving: boolean
}) {
  if (!opportunities.length) return null
  const leader = opportunities[0]
  return (
    <article className="rounded-2xl border border-cyan-500/15 bg-[#0f151d] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.26)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Source family</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{sourceLabel}</div>
          <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{leader.selectionReason || leader.whyNow || 'Review this source before drafting.'}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {leader.distributionType ? <FieldChip>{leader.distributionType}</FieldChip> : null}
          {leader.confidence ? <FieldChip>{leader.confidence}</FieldChip> : null}
          {opportunities.length > 1 ? <FieldChip>{opportunities.length} moves</FieldChip> : null}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {opportunities.map((opportunity) => (
          <OpportunityCard
            key={opportunity.id}
            opportunity={opportunity}
            feedbackValue={feedbackDrafts[opportunity.id] || ''}
            onFeedbackChange={(value) => onFeedbackChange(opportunity.id, value)}
            onAction={onAction}
            saving={saving}
          />
        ))}
      </div>
    </article>
  )
}

function OpportunityFamilyLane({
  title,
  subtitle,
  families,
  feedbackDrafts,
  onFeedbackChange,
  onAction,
  saving,
}: {
  title: string
  subtitle: string
  families: Array<{ key: string; familyLabel: string; sourceLabel: string; opportunities: GrowthApiResponse['growth']['selectedOpportunities'] }>
  feedbackDrafts: Record<string, string>
  onFeedbackChange: (opportunityId: string, value: string) => void
  onAction: (action: GrowthAction, draftId?: string, extra?: Record<string, unknown>) => void
  saving: boolean
}) {
  if (!families.length) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <FieldChip>{families.length} families</FieldChip>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {families.map((family) => (
          <OpportunityFamilyGroup
            key={family.key}
            sourceLabel={family.sourceLabel}
            opportunities={family.opportunities}
            feedbackDrafts={feedbackDrafts}
            onFeedbackChange={onFeedbackChange}
            onAction={onAction}
            saving={saving}
          />
        ))}
      </div>
    </section>
  )
}

function DraftCard({
  draft,
  feedbackValue,
  voiceDirection,
  onVoiceDirectionChange,
  onFeedbackChange,
  onAction,
  saving,
}: {
  draft: GrowthApiResponse['growth']['draftCandidates'][number]
  feedbackValue: string
  voiceDirection: string
  onVoiceDirectionChange: (value: string) => void
  onFeedbackChange: (value: string) => void
  onAction: (action: GrowthAction, draftId: string, extra?: Record<string, unknown>) => void
  saving: boolean
}) {
  const feedbackPresets = ['Too generic', 'Weak source', 'Too product-y', 'Wrong audience', 'Too abstract', 'Too founder-theater', 'Good direction, rewrite']
  const [draftText, setDraftText] = useState(draft.text)
  const [dirty, setDirty] = useState(false)
  const [rewritePrompt, setRewritePrompt] = useState('')

  useEffect(() => {
    setDraftText(draft.text)
    setDirty(false)
    setRewritePrompt('')
  }, [draft.id, draft.text])

  const visibleRationale = draft.selection_reason || draft.why_now || draft.rationale
  const detailSignalCount = draft.supporting_signals?.length || 0

  return (
    <article className="rounded-2xl border border-white/10 bg-[#10161f] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{draft.pillar}: {draft.angle}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {draft.distribution_type ? <FieldChip>{draft.distribution_type}</FieldChip> : null}
            {draft.source_account ? <FieldChip>{draft.source_account}</FieldChip> : null}
            {draft.confidence ? <FieldChip>{draft.confidence}</FieldChip> : null}
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

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-xl border border-cyan-500/15 bg-[#0c1219] px-4 py-4">
          {draft.source_tweet?.text ? (
            <div className="mb-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100/70">
                <span>Source context</span>
                {draft.source_account ? <span className="text-muted-foreground">{draft.source_account}</span> : null}
              </div>
              <div className="mt-2 border-l-2 border-cyan-500/35 pl-3 text-sm leading-6 text-foreground/82">
                {draft.source_tweet.text}
              </div>
            </div>
          ) : null}
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/70">Exact post text</div>
              <div className="mt-1 text-xs text-foreground/65">Edit the exact copy here, or rewrite it before approval.</div>
            </div>
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
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Why this draft</div>
            <div className="mt-1 text-sm text-foreground/88">{visibleRationale}</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Actions</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => onAction('update_draft_text', draft.id, { draftText })}
                disabled={saving || !dirty || !draftText.trim()}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60"
              >
                Save Edit
              </button>
              <button
                onClick={() => onAction('rewrite_draft', draft.id, { feedback: rewritePrompt.trim() || feedbackValue, voiceDirection })}
                disabled={saving}
                className="rounded-lg border border-cyan-500/20 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/10 disabled:opacity-60"
              >
                {saving ? 'Rewriting…' : 'Rewrite With Direction'}
              </button>
              <button onClick={() => onAction('approve_draft', draft.id)} disabled={saving || dirty || draft.approval === 'approved'} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition-smooth hover:bg-emerald-500/20 disabled:opacity-60">Approve</button>
              <button onClick={() => onAction('reject_draft', draft.id)} disabled={saving || draft.approval === 'rejected'} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-muted-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60">Reject</button>
              <button onClick={() => onAction('archive_draft', draft.id)} disabled={saving || draft.approval === 'archived'} className="rounded-lg border border-amber-500/20 px-3 py-2 text-xs font-medium text-amber-200 transition-smooth hover:bg-amber-500/10 disabled:opacity-60">Archive</button>
            </div>
            <textarea
              className="mt-3 min-h-20 w-full rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm text-foreground outline-none transition-smooth focus:border-cyan-500/30"
              placeholder="Rewrite direction: sharpen the hook, lean more contrarian, or reference the source context more directly."
              value={rewritePrompt}
              onChange={(event) => setRewritePrompt(event.target.value)}
            />
            <input
              className="mt-3 w-full rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm text-foreground outline-none transition-smooth focus:border-cyan-500/30"
              placeholder="Voice direction (optional): lean more quietly dangerous, less product-y, more humane."
              value={voiceDirection}
              onChange={(event) => onVoiceDirectionChange(event.target.value)}
            />
          </div>
          {(typeof draft.follower_growth_score === 'number' || typeof draft.brand_building_score === 'number' || typeof draft.timeliness_score === 'number') ? (
            <div className="flex flex-wrap gap-2">
              {typeof draft.follower_growth_score === 'number' ? <FieldChip>growth {draft.follower_growth_score}</FieldChip> : null}
              {typeof draft.brand_building_score === 'number' ? <FieldChip>brand {draft.brand_building_score}</FieldChip> : null}
              {typeof draft.timeliness_score === 'number' ? <FieldChip>timeliness {draft.timeliness_score}</FieldChip> : null}
            </div>
          ) : null}
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
        <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Details {detailSignalCount ? `• ${detailSignalCount} signals` : ''}</summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
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
      </details>

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
    </article>
  )
}

function SourceVariantGroup({
  familyLabel,
  sourceLabel,
  drafts,
  feedbackDrafts,
  voiceDirection,
  onVoiceDirectionChange,
  onFeedbackChange,
  onAction,
  onExpandFamily,
  saving,
  defaultOpen,
}: {
  familyLabel: string
  sourceLabel: string
  drafts: GrowthApiResponse['growth']['draftCandidates']
  feedbackDrafts: Record<string, string>
  voiceDirection: string
  onVoiceDirectionChange: (value: string) => void
  onFeedbackChange: (draftId: string, value: string) => void
  onAction: (action: GrowthAction, draftId: string, extra?: Record<string, unknown>) => void
  onExpandFamily: (draftId: string) => void
  saving: boolean
  defaultOpen?: boolean
}) {
  if (!drafts.length) return null
  const leader = drafts[0]
  return (
    <details
      open={defaultOpen}
      className="rounded-2xl border border-cyan-500/15 bg-[#0f151d] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.26)] group"
    >
      <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">{familyLabel}</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{sourceLabel}</div>
          <div className="mt-1 text-xs text-muted-foreground">{drafts.length} variants from the same source.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {leader.distribution_type ? <FieldChip>{leader.distribution_type}</FieldChip> : null}
          {leader.source_account ? <FieldChip>{leader.source_account}</FieldChip> : null}
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onExpandFamily(leader.id)
            }}
            disabled={saving}
            className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/20 disabled:opacity-60"
          >
            Generate More Options
          </button>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Expand
          </span>
        </div>
      </summary>
      {leader.why_now ? (
        <div className="mt-3 rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-xs text-foreground/80">{leader.why_now}</div>
      ) : null}
      <div className="mt-4 space-y-4">
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-2xl border border-white/8 bg-black/15 p-3">
            {draft.variant_label ? <div className="mb-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{draft.variant_label}</div> : null}
            <DraftCard
              draft={draft}
              feedbackValue={feedbackDrafts[draft.id] || ''}
              voiceDirection={voiceDirection}
              onVoiceDirectionChange={onVoiceDirectionChange}
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
  const { data, setData, loading, error, reload } = useGrowthData()
  const [actionState, setActionState] = useState<{ status: 'idle' | 'saving' | 'error' | 'saved'; message?: string }>({ status: 'idle' })
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({})
  const [opportunityFeedback, setOpportunityFeedback] = useState<Record<string, string>>({})
  const [voiceDirection, setVoiceDirection] = useState('')
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, { when: string; note: string }>>({})
  const [publishDrafts, setPublishDrafts] = useState<Record<string, { tweetUrl: string; tweetId: string }>>({})
  const [deskMode, setDeskMode] = useState<'act' | 'queue' | 'signals'>('act')
  const [activeDrawer, setActiveDrawer] = useState<'queue' | 'signals' | null>(null)
  const [selection, setSelection] = useState<
    | { kind: 'opportunity'; id: string }
    | { kind: 'draft'; familyId: string; draftId: string }
    | { kind: 'queue'; status: 'ready' | 'scheduled' | 'failed' | 'published'; id: string }
    | null
  >(null)

  const growth = data?.growth ?? null
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
  const approvedPosts = useMemo(() => growth?.approvedPosts || [], [growth])
  const selectedOpportunities = useMemo(() => growth?.selectedOpportunities || [], [growth])
  const blockedOpportunities = useMemo(() => growth?.blockedOpportunities || [], [growth])
  const watchOnlyOpportunities = useMemo(() => growth?.watchOnlyOpportunities || [], [growth])
  const followQueue = useMemo(() => growth?.followQueue || [], [growth])
  const followLog = useMemo(() => growth?.followLog || [], [growth])
  const accountGrowthSummaries = useMemo(
    () => [...(growth?.accountGrowthSummaries || [])].filter((summary) => summary.week).sort((left, right) => String(left.week || '').localeCompare(String(right.week || ''), undefined, { numeric: true })),
    [growth],
  )
  const reactiveOpportunities = selectedOpportunities.filter((opportunity) => opportunity.distributionType === 'reply' || opportunity.distributionType === 'quote')
  const standaloneOpportunities = selectedOpportunities.filter((opportunity) => opportunity.distributionType === 'original')
  const reactiveOpportunityFamilies = useMemo(() => {
    const grouped = new Map<string, GrowthApiResponse['growth']['selectedOpportunities']>()
    for (const opportunity of reactiveOpportunities) {
      const key = String(opportunity.sourceFamilyKey || opportunity.sourceUrl || opportunity.id).trim()
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(opportunity)
    }
    return Array.from(grouped.entries()).map(([key, family]) => {
      const sortedFamily = [...family].sort((left, right) => {
        const leftScore = left.growthScore + left.timelinessScore + (left.distributionType === 'reply' ? 6 : 2)
        const rightScore = right.growthScore + right.timelinessScore + (right.distributionType === 'reply' ? 6 : 2)
        return rightScore - leftScore
      })
      const leader = sortedFamily[0]
      return {
        key,
        familyLabel: leader.sourceType === 'x_recent_search' ? 'Reactive source family' : 'Opportunity family',
        sourceLabel: leader.sourceAccount
          ? `${leader.sourceAccount} • ${leader.title || leader.clusterLabel || 'Reactive move'}`
          : leader.title || leader.clusterLabel || 'Reactive move',
        opportunities: sortedFamily,
      }
    })
  }, [reactiveOpportunities])

  const retryableFailedPosts = approvedPosts.filter((post) => post.status === 'failed' && !isNonReplyablePublishError(post.publishError))
  const readyApprovedPosts = approvedPosts.filter((post) => post.status === 'approved')
  const failedPosts = retryableFailedPosts
  const readyPosts = readyApprovedPosts.concat(failedPosts)
  const scheduledPosts = useMemo(() => approvedPosts.filter((post) => post.status === 'scheduled'), [approvedPosts])
  const publishedPosts = approvedPosts.filter((post) => post.status === 'published')
  const candidateCount = growth?.stateIntegrity?.draftCandidateCount ?? growth?.draftCandidates.length ?? 0
  const opportunityCount = growth?.stateIntegrity?.selectedOpportunityCount ?? selectedOpportunities.length
  const readyToSchedule = readyPosts.length
  const scheduledCount = scheduledPosts.length
  const lowConfidenceCount = growth?.freshness?.lowConfidenceClusters?.length ?? 0
  const todayPt = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()), [])
  const pendingFollows = useMemo(
    () => followQueue.filter((entry) => String(entry.status || 'pending').trim().toLowerCase() === 'pending'),
    [followQueue],
  )
  const pendingProactiveFollows = useMemo(
    () => pendingFollows.filter((entry) => entry.countsTowardDailyCap !== false),
    [pendingFollows],
  )
  const pendingEngagementFollows = useMemo(
    () => pendingFollows.filter((entry) => entry.countsTowardDailyCap === false),
    [pendingFollows],
  )
  const completedProactiveFollowsToday = useMemo(
    () => followLog.filter((entry) => String(entry.datePt || '').trim() === todayPt && entry.countsTowardDailyCap !== false).length,
    [followLog, todayPt],
  )
  const completedEngagementFollowsToday = useMemo(
    () => followLog.filter((entry) => String(entry.datePt || '').trim() === todayPt && entry.countsTowardDailyCap === false).length,
    [followLog, todayPt],
  )
  const publishedCount = publishedPosts.length || growth?.resultsSummary?.postedCount || 0
  const syncedPublishedCount = Number(growth?.resultsSummary?.syncedPostCount || growth?.strategyMemory?.performance?.syncedPostCount || 0)
  const publishAttempts = Number(growth?.resultsSummary?.publishAttempts || growth?.strategyMemory?.performance?.publishAttempts || 0)
  const todayBestMove = growth?.strategy?.todayBestMove || null
  const latestAccountGrowthSummary = accountGrowthSummaries[accountGrowthSummaries.length - 1] || null
  const bestGrowthWeek = useMemo(() => {
    const candidates = accountGrowthSummaries.filter((summary) => typeof summary.netFollowerGrowth === 'number')
    return candidates.sort((left, right) => Number(right.netFollowerGrowth || 0) - Number(left.netFollowerGrowth || 0))[0] || null
  }, [accountGrowthSummaries])
  const topOpportunity = useMemo(() => {
    const ranked = [...selectedOpportunities].sort((left, right) => {
      const leftReactiveBoost = left.distributionType === 'reply' ? 8 : left.distributionType === 'quote' ? 4 : 0
      const rightReactiveBoost = right.distributionType === 'reply' ? 8 : right.distributionType === 'quote' ? 4 : 0
      const leftScore = leftReactiveBoost + left.growthScore + left.timelinessScore
      const rightScore = rightReactiveBoost + right.growthScore + right.timelinessScore
      return rightScore - leftScore
    })
    return ranked[0] || null
  }, [selectedOpportunities])
  const topDraft = useMemo(() => {
    if (!growth?.draftCandidates?.length) return null
    if (topOpportunity?.sourceUrl) {
      const matched = growth.draftCandidates.find((draft) => String(draft.source_tweet?.url || '').trim() === String(topOpportunity.sourceUrl || '').trim())
      if (matched) return matched
    }
    return sortedForGrowth[0] || growth.draftCandidates[0] || null
  }, [growth, sortedForGrowth, topOpportunity])
  const nextScheduledPost = useMemo(() => {
    if (!scheduledPosts.length) return null
    return [...scheduledPosts].sort((left, right) => {
      const leftTime = new Date(String(left.scheduledAt || '')).getTime() || Number.MAX_SAFE_INTEGER
      const rightTime = new Date(String(right.scheduledAt || '')).getTime() || Number.MAX_SAFE_INTEGER
      return leftTime - rightTime
    })[0] || null
  }, [scheduledPosts])
  const topMoveTitle = topOpportunity?.title || todayBestMove?.title || 'Refresh research before choosing the next move.'
  const topMoveBody = topOpportunity?.selectionReason || topOpportunity?.whyNow || todayBestMove?.why || 'The desk should rank the best live move before it writes copy.'
  const topMoveActionText =
    readyToSchedule
      ? `${readyToSchedule} approved post${readyToSchedule === 1 ? '' : 's'} waiting to schedule`
      : topDraft
        ? 'Review the top draft candidate'
        : topOpportunity
          ? 'Generate drafts from the current top opportunity'
          : 'Refresh research or select opportunities'
  const growthStatus = growth?.externalStatus || 'unknown'
  const researchStatusLine = lowConfidenceCount
    ? `${growthStatus} • ${opportunityCount} selected • ${lowConfidenceCount} low-confidence cluster${lowConfidenceCount === 1 ? '' : 's'}`
    : `${growthStatus} • ${opportunityCount} selected`
  const topDraftSummary = topDraft
    ? `${topDraft.distribution_type || 'draft'}${topDraft.source_account ? ` • ${topDraft.source_account}` : ''}`
    : 'No draft yet'
  const nextScheduledSummary = nextScheduledPost
    ? `${nextScheduledPost.distributionType || 'scheduled'} • ${formatPacificTime(nextScheduledPost.scheduledAtPt || nextScheduledPost.scheduledAt || null)}`
    : readyToSchedule
      ? `${readyToSchedule} ready to publish`
      : 'Nothing scheduled'
  const queueStatusLine = `${readyToSchedule} ready • ${scheduledCount} scheduled${failedPosts.length ? ` • ${failedPosts.length} failed` : ''}`
  const utilityActions = [
    { key: 'refresh', label: 'Refresh', action: () => void runGrowthAction('refresh_research') },
    { key: 'select', label: 'Select', action: () => void runGrowthAction('select_opportunities') },
    { key: 'drafts', label: candidateCount ? 'Clear drafts' : 'Generate drafts', action: () => void runGrowthAction(candidateCount ? 'clear_current_drafts' : 'generate_drafts', undefined, candidateCount ? {} : { voiceDirection }) },
    { key: 'queue', label: 'Open queue', action: () => setActiveDrawer((current) => current === 'queue' ? null : 'queue') },
    { key: 'signals', label: 'Open signals', action: () => setActiveDrawer((current) => current === 'signals' ? null : 'signals') },
  ]

  const fallbackOpportunityFamilies = useMemo(() => {
    const grouped = new Map<string, GrowthApiResponse['growth']['selectedOpportunities']>()
    for (const opportunity of standaloneOpportunities) {
      const key = String(opportunity.sourceFamilyKey || opportunity.sourceUrl || opportunity.id).trim()
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(opportunity)
    }
    return Array.from(grouped.entries()).map(([key, family]) => {
      const leader = family[0]
      return {
        key,
        sourceLabel: leader.sourceAccount || leader.title || 'Fallback original',
        opportunities: family,
      }
    })
  }, [standaloneOpportunities])

  const draftFamilyModels = useMemo(
    () =>
      groupedDraftCandidates.map((drafts) => {
        const leader = drafts[0]
        const familyId = String(leader.variant_family_id || leader.id)
        return {
          familyId,
          leader,
          drafts,
          sourceLabel: leader.source_account || leader.source_tweet?.author?.username || leader.pillar || 'Draft family',
          familyLabel: leader.variant_group_label || `${drafts.length} variants`,
        }
      }),
    [groupedDraftCandidates],
  )

  const queueSections = useMemo(
    () => [
      { key: 'ready' as const, title: 'Ready', items: readyPosts },
      { key: 'scheduled' as const, title: 'Scheduled', items: scheduledPosts },
      { key: 'failed' as const, title: 'Failed', items: failedPosts },
      { key: 'published' as const, title: 'Published', items: publishedPosts },
    ],
    [readyPosts, scheduledPosts, failedPosts, publishedPosts],
  )

  const allQueueItems = useMemo(
    () => queueSections.flatMap((section) => section.items.map((item) => ({ status: section.key, item }))),
    [queueSections],
  )

  useEffect(() => {
    const nextSelection = (() => {
      if (draftFamilyModels.length) {
        const firstFamily = draftFamilyModels[0]
        return { kind: 'draft' as const, familyId: firstFamily.familyId, draftId: firstFamily.drafts[0].id }
      }
      if (reactiveOpportunityFamilies.length) {
        return { kind: 'opportunity' as const, id: reactiveOpportunityFamilies[0].opportunities[0].id }
      }
      if (fallbackOpportunityFamilies.length) {
        return { kind: 'opportunity' as const, id: fallbackOpportunityFamilies[0].opportunities[0].id }
      }
      if (allQueueItems.length) {
        return { kind: 'queue' as const, status: allQueueItems[0].status, id: allQueueItems[0].item.id }
      }
      return null
    })()

    const selectionStillValid =
      selection?.kind === 'draft'
        ? draftFamilyModels.some((family) => family.familyId === selection.familyId && family.drafts.some((draft) => draft.id === selection.draftId))
        : selection?.kind === 'opportunity'
          ? selectedOpportunities.some((opportunity) => opportunity.id === selection.id)
          : selection?.kind === 'queue'
            ? allQueueItems.some((entry) => entry.status === selection.status && entry.item.id === selection.id)
            : false

    if (!selectionStillValid) {
      setSelection(nextSelection)
    }
  }, [allQueueItems, draftFamilyModels, fallbackOpportunityFamilies, reactiveOpportunityFamilies, selectedOpportunities, selection])

  const selectedOpportunity = useMemo(() => {
    if (selection?.kind !== 'opportunity') return null
    return selectedOpportunities.find((opportunity) => opportunity.id === selection.id) || null
  }, [selectedOpportunities, selection])

  const selectedDraftFamily = useMemo(() => {
    if (selection?.kind !== 'draft') return draftFamilyModels[0] || null
    return draftFamilyModels.find((family) => family.familyId === selection.familyId) || draftFamilyModels[0] || null
  }, [draftFamilyModels, selection])

  const selectedDraft = useMemo(() => {
    if (!selectedDraftFamily) return null
    if (selection?.kind !== 'draft') return selectedDraftFamily.drafts[0] || null
    return selectedDraftFamily.drafts.find((draft) => draft.id === selection.draftId) || selectedDraftFamily.drafts[0] || null
  }, [selectedDraftFamily, selection])

  const selectedQueueEntry = useMemo(() => {
    if (selection?.kind !== 'queue') return null
    return allQueueItems.find((entry) => entry.status === selection.status && entry.item.id === selection.id) || null
  }, [allQueueItems, selection])

  const inspectorMode: 'opportunity' | 'draft' | 'queue' | 'empty' = selectedDraft
    ? 'draft'
    : selectedOpportunity
      ? 'opportunity'
      : selectedQueueEntry
        ? 'queue'
        : 'empty'

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
    const feedbackSource = extra.feedback ?? (draftId ? feedbackDrafts[draftId] : '')
    const feedback = String(feedbackSource || '').trim()
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
        select_opportunities: 'Opportunities selected from the current research snapshot.',
        refresh_research_and_select: 'Research refreshed and opportunities re-ranked.',
        generate_drafts: 'Draft candidates generated.',
        refresh_research_and_generate: 'Research refreshed and a new candidate pack generated.',
        expand_family_variants: 'Added more options for this source family.',
        rewrite_draft: 'Draft rewritten from the current research snapshot.',
        update_draft_text: 'Draft text saved.',
        approve_draft: 'Post approved and moved to Ready to schedule.',
        reject_draft: 'Draft rejected. The system will learn from that.',
        archive_draft: 'Angle archived without poisoning the whole source family.',
        reject_opportunity: 'Opportunity rejected and removed from the active lane.',
        archive_opportunity: 'Opportunity archived out of the active lane.',
        clear_current_drafts: 'Current drafts cleared. Learning memory was preserved.',
        schedule_draft: 'Post scheduled in the editorial desk.',
        unschedule_draft: 'Post moved back to Ready to schedule without a publish time.',
        mark_published: 'Post marked published and the results loop was triggered.',
        link_manual_publish: 'Manual publish link recorded and source family retired.',
        reopen_published: 'Published state cleared and the post moved back into the scheduling lane.',
        set_account_target_state: 'Account target updated.',
      }
      if (draftId) {
        setFeedbackDrafts((current) => ({ ...current, [draftId]: '' }))
        setOpportunityFeedback((current) => ({ ...current, [draftId]: '' }))
      }
      setActionState({ status: 'saved', message: messageMap[action] || 'Growth updated.' })
    } catch {
      setActionState({ status: 'error', message: 'Growth update failed.' })
    }
  }, [feedbackDrafts, growth?.week, patchAccountTargetState, reload])

  if (loading && !growth) {
    return <div className="panel"><div className="panel-body"><div className="h-36 rounded-lg shimmer" /></div></div>
  }

  if (!growth && error) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
          <div className="text-sm font-semibold text-rose-100">Growth desk unavailable</div>
          <div className="mt-1 text-sm text-rose-100/80">{error}</div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setActionState({ status: 'idle' })
                void reload()
              }}
              className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-100 transition-smooth hover:bg-rose-500/20"
            >
              Retry load
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!growth) {
    return <div className="panel"><div className="panel-body text-sm text-muted-foreground">Growth data is not available yet.</div></div>
  }

  return (
    <div className="space-y-5 p-5">
      <div className="rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(15,20,27,0.98),rgba(11,16,23,0.98))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Growth</div>
            <div className="mt-1 max-w-3xl text-sm text-muted-foreground">Review the next move, decide on exact post text, then push it into the publishing queue.</div>
          </div>
          <div className="flex flex-col items-stretch gap-3 xl:items-end">
            <div className="flex flex-wrap gap-2">
              {(['act', 'queue', 'signals'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDeskMode(mode)}
                  className={cx(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-smooth',
                    deskMode === mode ? 'border-cyan-500/25 bg-cyan-500/12 text-cyan-100' : 'border-white/10 bg-black/20 text-muted-foreground hover:bg-surface-2',
                  )}
                >
                  {mode === 'act' ? 'Act' : mode === 'queue' ? 'Queue' : 'Signals'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 rounded-2xl border border-white/8 bg-black/20 p-2">
              {utilityActions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.action}
                  disabled={actionState.status === 'saving'}
                  className="rounded-lg border border-white/10 bg-[#121922] px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={voiceDirection}
              onChange={(event) => setVoiceDirection(event.target.value)}
              placeholder="Voice direction (optional)"
              className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-foreground outline-none transition-smooth focus:border-cyan-500/30 xl:max-w-sm"
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/8 via-surface-2/80 to-surface-2/80 p-4">
          <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
            <div className="max-w-4xl">
              <div className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">Today’s best move</div>
              <div className="mt-1 text-base font-semibold text-foreground">
                {topMoveTitle}
              </div>
              <div className="mt-2 text-sm text-foreground/85">
                {topMoveBody}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {topOpportunity?.distributionType ? <CommandChip label={topOpportunity.distributionType} tone="live" /> : todayBestMove?.distributionType ? <CommandChip label={todayBestMove.distributionType} tone="live" /> : null}
                {growth.strategy?.accountStage ? <CommandChip label={growth.strategy.accountStage} /> : null}
                {topOpportunity?.clusterLabel ? <CommandChip label={topOpportunity.clusterLabel} /> : todayBestMove?.clusterLabel ? <CommandChip label={todayBestMove.clusterLabel} /> : null}
                {topOpportunity?.sourceAccount ? <CommandChip label={topOpportunity.sourceAccount} /> : todayBestMove?.sourceAccount ? <CommandChip label={todayBestMove.sourceAccount} /> : null}
                {topOpportunity?.confidence ? <CommandChip label={topOpportunity.confidence} tone={topOpportunity.confidence === 'high' ? 'queue' : topOpportunity.confidence === 'low' ? 'warning' : 'neutral'} /> : todayBestMove?.confidence ? <CommandChip label={todayBestMove.confidence} tone={todayBestMove.confidence === 'high' ? 'queue' : todayBestMove.confidence === 'low' ? 'warning' : 'neutral'} /> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {topOpportunity?.sourceUrl || todayBestMove?.sourceUrl ? (
                  <a href={topOpportunity?.sourceUrl || todayBestMove?.sourceUrl || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20">
                    Open source
                  </a>
                ) : null}
                {topOpportunity ? (
                  <button type="button" onClick={() => scrollToId('growth-opportunities')} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2">
                    Jump to opportunity
                  </button>
                ) : null}
                {candidateCount && topDraft ? (
                  <button type="button" onClick={() => scrollToId('growth-drafts')} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2">
                    Jump to drafts
                  </button>
                ) : null}
                {!candidateCount && topOpportunity ? (
                  <button type="button" onClick={() => void runGrowthAction('generate_drafts', undefined, { voiceDirection })} disabled={actionState.status === 'saving'} className="rounded-lg border border-amber-500/20 bg-black/20 px-3 py-2 text-xs font-medium text-amber-200 transition-smooth hover:bg-amber-500/10 disabled:opacity-60">
                    Generate drafts
                  </button>
                ) : null}
                {readyToSchedule ? (
                  <button type="button" onClick={() => scrollToId('growth-ready-to-schedule')} className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 transition-smooth hover:bg-emerald-500/20">
                    Go to scheduling
                  </button>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3">
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Research status</div>
                <div className="mt-2 text-sm text-foreground/90">{researchStatusLine}</div>
                <div className="mt-1 text-xs text-foreground/65">{queueStatusLine}</div>
                <div className="mt-1 text-xs text-muted-foreground">{formatPacificTime(growth.freshness?.lastXPullAt || growth.researchGeneratedAt || null)}</div>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Top draft</div>
                <div className="mt-2 text-sm text-foreground/90">{topDraftSummary}</div>
                <div className="mt-1 text-xs text-muted-foreground">{actionState.message || topMoveActionText}</div>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Next scheduled</div>
                <div className="mt-2 text-sm text-foreground/90">{nextScheduledSummary}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {deskMode === 'act' ? (
      <div className="space-y-4">
        <div id="growth-opportunities">
          <CollapsibleSection title="Opportunities" subtitle="Choose the move before you draft." defaultOpen>
            <div className="space-y-4">
              {selectedOpportunities.length ? (
                <div className="space-y-3">
                  <OpportunityFamilyLane
                    title="Reactive moves"
                    subtitle="Grouped by source family so you can scan live moves quickly."
                    families={reactiveOpportunityFamilies}
                    feedbackDrafts={opportunityFeedback}
                    onFeedbackChange={(opportunityId, value) => setOpportunityFeedback((current) => ({ ...current, [opportunityId]: value }))}
                    onAction={runGrowthAction}
                    saving={actionState.status === 'saving'}
                  />
                  <OpportunityLane
                    title="Fallback original posts"
                    subtitle="These only appear when reply and quote opportunities do not clear the bar in the current research window."
                    opportunities={standaloneOpportunities}
                    feedbackDrafts={opportunityFeedback}
                    onFeedbackChange={(opportunityId, value) => setOpportunityFeedback((current) => ({ ...current, [opportunityId]: value }))}
                    onAction={runGrowthAction}
                    saving={actionState.status === 'saving'}
                    defaultOpen={!reactiveOpportunityFamilies.length}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-[#10161f] px-4 py-4 text-sm text-muted-foreground">
                  {growth.noOpportunityReason || 'No selected opportunities yet. Refresh research, then run Select Opportunities before drafting.'}
                  {growth.externalStatus === 'live' ? (
                    <div className="mt-2 text-xs text-foreground/60">
                      Last live pull: {formatPacificTime(growth.freshness?.lastXPullAt || growth.researchGeneratedAt || null)}
                      {typeof growth.sourceMemory?.blockedSourceCount === 'number' && growth.sourceMemory.blockedSourceCount > 0
                        ? ` • ${growth.sourceMemory.blockedSourceCount} blocked source${growth.sourceMemory.blockedSourceCount === 1 ? '' : 's'} retained in source memory`
                        : ''}
                    </div>
                  ) : null}
                </div>
              )}
              {blockedOpportunities.length ? (
                <details className="rounded-xl border border-rose-500/15 bg-[#130f14] p-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-rose-100">
                    Blocked by source truth ({blockedOpportunities.length})
                  </summary>
                  <div className="mt-3 space-y-3">
                    {blockedOpportunities.map((opportunity) => (
                      <OpportunityCard key={`blocked-${opportunity.id}`} opportunity={opportunity} blocked />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </CollapsibleSection>
        </div>

        <div id="growth-drafts">
          <CollapsibleSection title="Drafts" subtitle="Review exact post text first. Open details only when you need more context." defaultOpen>
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
                      voiceDirection={voiceDirection}
                      onVoiceDirectionChange={setVoiceDirection}
                      onFeedbackChange={(draftId, value) => setFeedbackDrafts((current) => ({ ...current, [draftId]: value }))}
                      onAction={(action, draftId, extra) => void runGrowthAction(action, draftId, extra || {})}
                      onExpandFamily={(draftId) => void runGrowthAction('expand_family_variants', draftId, { feedback: feedbackDrafts[draftId] || '' })}
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
                    voiceDirection={voiceDirection}
                    onVoiceDirectionChange={setVoiceDirection}
                    onFeedbackChange={(value) => setFeedbackDrafts((current) => ({ ...current, [draft.id]: value }))}
                    onAction={(action, draftId, extra) => void runGrowthAction(action, draftId, extra || {})}
                    saving={actionState.status === 'saving'}
                  />
                )
              }) : <div className="rounded-xl border border-white/10 bg-[#10161f] px-4 py-4 text-sm text-muted-foreground">Research is ready. Generate a fresh candidate pack when you want posts to review.</div>}
            </div>
          </CollapsibleSection>
        </div>

      </div>
      ) : null}

      {deskMode === 'signals' ? (
        <div className="space-y-4">
          {growth.changesSummary || growth.stateIntegrity ? (
            <CollapsibleSection title="What changed" subtitle="Recent movement, pruning, and learning effects from the last cycle." defaultOpen={false}>
              <div className="space-y-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <div className="flex flex-wrap gap-3 text-xs text-foreground/85">
                  {growth.changesSummary ? <span>{growth.changesSummary.newCount} new</span> : null}
                  {growth.changesSummary ? <span>{growth.changesSummary.retainedCount} retained</span> : null}
                  {growth.changesSummary ? <span>{growth.changesSummary.changedDraftIds.length} changed</span> : null}
                  {growth.stateIntegrity?.orphanDraftCount ? <span>{growth.stateIntegrity.orphanDraftCount} orphan retired</span> : null}
                  {growth.stateIntegrity?.prunedVariantCount ? <span>{growth.stateIntegrity.prunedVariantCount} variants pruned</span> : null}
                </div>
                {growth.changesSummary?.whatChangedSinceLastRun?.length ? (
                  <div className="space-y-1 text-xs text-foreground/85">
                    {growth.changesSummary.whatChangedSinceLastRun.map((effect, index) => <div key={`change-${index}`} className="flex gap-2"><span>•</span><span>{effect}</span></div>)}
                  </div>
                ) : growth.changesSummary?.feedbackEffects?.length ? (
                  <div className="space-y-1 text-xs text-amber-100/85">
                    {growth.changesSummary.feedbackEffects.map((effect, index) => <div key={`effect-${index}`} className="flex gap-2"><span>•</span><span>{effect}</span></div>)}
                  </div>
                ) : null}
              </div>
            </CollapsibleSection>
          ) : null}
          <CollapsibleSection title="Listening" subtitle="Market signal, research diagnostics, and live conversation quality." defaultOpen={false}>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-sm text-foreground/85">
                <div><strong className="text-foreground">Primary goal:</strong> {growth.strategy?.primaryGoal || 'No strategy generated yet.'}</div>
                <div className="mt-2 text-xs text-muted-foreground">Last pull {formatPacificTime(growth.freshness?.lastXPullAt || growth.researchGeneratedAt || null)} • {growth.freshness?.queryCount ?? 0} queries • {growth.freshness?.sampleSize ?? 0} samples</div>
                <div className="mt-1 text-xs text-foreground/60">
                  {growth.freshness?.cacheUsed
                    ? `Using cached snapshot (${Number(growth.freshness?.cacheAgeMinutes || 0).toFixed(0)} min old) until research is refreshed.`
                    : 'Using a fresh current-week snapshot.'}
                  {growth.freshness?.discoveryTriggered ? ' Fallback discovery was used because the live lane was thin.' : ' Neighborhood-first research stayed within the current target lane.'}
                </div>
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

          <CollapsibleSection title="Signals" subtitle="Source quality, account targets, and research residue that did not make the active review lane." defaultOpen={false}>
            <div className="space-y-3">
              {accountGrowthSummaries.length ? (
                <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Account growth</div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {latestAccountGrowthSummary?.week || 'Current week'}
                        {latestAccountGrowthSummary?.snapshotStatus === 'partial' ? ' • partial' : ''}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {latestAccountGrowthSummary?.generatedAt ? `Updated ${formatPacificTime(latestAccountGrowthSummary.generatedAt)}` : 'Waiting on weekly snapshot'}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Followers</div>
                      <div className="mt-1 text-xl font-semibold text-foreground">
                        {typeof latestAccountGrowthSummary?.endingFollowerCount === 'number' ? latestAccountGrowthSummary.endingFollowerCount.toLocaleString() : 'Unknown'}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {typeof latestAccountGrowthSummary?.startingFollowerCount === 'number' && typeof latestAccountGrowthSummary?.endingFollowerCount === 'number'
                          ? `${latestAccountGrowthSummary.startingFollowerCount.toLocaleString()} → ${latestAccountGrowthSummary.endingFollowerCount.toLocaleString()}`
                          : latestAccountGrowthSummary?.snapshotStatus === 'partial'
                            ? 'Partial follower snapshot'
                            : 'No follower snapshot yet'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Net growth</div>
                      <div className="mt-1 text-xl font-semibold text-foreground">
                        {typeof latestAccountGrowthSummary?.netFollowerGrowth === 'number' ? formatSignedCount(latestAccountGrowthSummary.netFollowerGrowth) : '—'}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {bestGrowthWeek ? `Best week so far: ${bestGrowthWeek.week} (${formatSignedCount(bestGrowthWeek.netFollowerGrowth)})` : 'Waiting for multiple weeks of follower data'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Posts published</div>
                      <div className="mt-1 text-xl font-semibold text-foreground">{latestAccountGrowthSummary?.postsPublished ?? 0}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {latestAccountGrowthSummary ? `${latestAccountGrowthSummary.repliesPublished ?? 0} replies • ${latestAccountGrowthSummary.quotesPublished ?? 0} quotes • ${latestAccountGrowthSummary.originalsPublished ?? 0} originals` : 'No weekly publish summary yet'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Follows</div>
                      <div className="mt-1 text-xl font-semibold text-foreground">{latestAccountGrowthSummary?.accountsFollowed ?? 0}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {latestAccountGrowthSummary ? `${latestAccountGrowthSummary.followsFromProactiveQueue ?? 0} proactive • ${latestAccountGrowthSummary.followsFromEngagement ?? 0} engagement` : 'No follow summary yet'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
                    <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Weekly trend</div>
                        <div className="text-xs text-muted-foreground">Newest week first.</div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {[...accountGrowthSummaries].reverse().map((summary) => (
                          <div
                            key={`growth-summary-${summary.week}`}
                            className="rounded-lg border border-white/8 bg-black/10 px-3 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-foreground">{summary.week}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {typeof summary.startingFollowerCount === 'number' && typeof summary.endingFollowerCount === 'number'
                                    ? `${summary.startingFollowerCount.toLocaleString()} -> ${summary.endingFollowerCount.toLocaleString()} followers`
                                    : typeof summary.endingFollowerCount === 'number'
                                      ? `${summary.endingFollowerCount.toLocaleString()} followers`
                                      : 'Follower snapshot still partial'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full border border-white/8 bg-black/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                  {summary.snapshotStatus || 'ready'}
                                </span>
                                <div className="text-right">
                                  <div className="text-lg font-semibold text-foreground">
                                    {typeof summary.netFollowerGrowth === 'number' ? formatSignedCount(summary.netFollowerGrowth) : '—'}
                                  </div>
                                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Net growth</div>
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              <div className="rounded-md border border-white/8 bg-black/10 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Posts</div>
                                <div className="mt-1 text-sm font-medium text-foreground">{summary.postsPublished ?? 0}</div>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {summary.repliesPublished ?? 0} replies • {summary.quotesPublished ?? 0} quotes • {summary.originalsPublished ?? 0} originals
                                </div>
                              </div>
                              <div className="rounded-md border border-white/8 bg-black/10 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Follows</div>
                                <div className="mt-1 text-sm font-medium text-foreground">{summary.accountsFollowed ?? 0}</div>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {summary.followsFromProactiveQueue ?? 0} proactive • {summary.followsFromEngagement ?? 0} engagement
                                </div>
                              </div>
                              <div className="rounded-md border border-white/8 bg-black/10 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Pipeline</div>
                                <div className="mt-1 text-sm font-medium text-foreground">
                                  {summary.selectedOpportunityCount ?? 0} selected • {summary.draftCount ?? 0} drafts
                                </div>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {summary.successfulPublishCount ?? 0} successful • {summary.failedPublishCount ?? 0} failed
                                </div>
                              </div>
                            </div>
                            {summary.notes?.length ? (
                              <div className="mt-3 rounded-md border border-white/8 bg-black/10 px-3 py-2 text-xs text-foreground/78">
                                {summary.notes[0]}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Published mix</div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <div className="rounded-md border border-white/8 bg-black/10 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Replies</div>
                            <div className="mt-1 text-lg font-semibold text-foreground">{latestAccountGrowthSummary?.repliesPublished ?? 0}</div>
                          </div>
                          <div className="rounded-md border border-white/8 bg-black/10 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Quotes</div>
                            <div className="mt-1 text-lg font-semibold text-foreground">{latestAccountGrowthSummary?.quotesPublished ?? 0}</div>
                          </div>
                          <div className="rounded-md border border-white/8 bg-black/10 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Originals</div>
                            <div className="mt-1 text-lg font-semibold text-foreground">{latestAccountGrowthSummary?.originalsPublished ?? 0}</div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Follow split</div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md border border-white/8 bg-black/10 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Proactive</div>
                            <div className="mt-1 text-lg font-semibold text-foreground">{latestAccountGrowthSummary?.followsFromProactiveQueue ?? 0}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {latestAccountGrowthSummary?.followBudget?.proactiveDailyCap ? `Cap ${latestAccountGrowthSummary.followBudget.proactiveDailyCap}/day` : 'Budgeted discovery follows'}
                            </div>
                          </div>
                          <div className="rounded-md border border-white/8 bg-black/10 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Engagement</div>
                            <div className="mt-1 text-lg font-semibold text-foreground">{latestAccountGrowthSummary?.followsFromEngagement ?? 0}</div>
                            <div className="mt-1 text-xs text-muted-foreground">Does not reduce the proactive budget.</div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Weekly read</div>
                        <div className="mt-2 space-y-1 text-xs text-foreground/82">
                          {bestGrowthWeek ? <div>Best visible week: {bestGrowthWeek.week} ({formatSignedCount(bestGrowthWeek.netFollowerGrowth)})</div> : null}
                          {latestAccountGrowthSummary?.postsPublished && !latestAccountGrowthSummary.netFollowerGrowth ? <div>Publishing is happening, but follower movement is still partial or flat this week.</div> : null}
                          {latestAccountGrowthSummary?.notes?.length ? latestAccountGrowthSummary.notes.map((note, index) => <div key={`growth-note-${index}`}>{note}</div>) : <div>Weekly growth data is available here without cluttering the posting workflow.</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {watchOnlyOpportunities.length ? (
                <details className="rounded-xl border border-white/8 bg-black/20 p-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                    Accounts to watch ({watchOnlyOpportunities.length})
                  </summary>
                  <div className="mt-2 text-xs text-foreground/70">
                    These are low-confidence watch items and account targets, not live posting opportunities.
                  </div>
                  <div className="mt-3 space-y-3">
                    {watchOnlyOpportunities.map((opportunity) => {
                      const username = extractOpportunityUsername(opportunity)
                      return (
                        <div key={`watch-${opportunity.id}`} className="space-y-3">
                          <OpportunityCard opportunity={opportunity} blocked />
                          {username ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(['watch', 'prioritize', 'mute', 'engage_this_week'] as const).map((state) => (
                                <button
                                  key={`${opportunity.id}-${state}`}
                                  onClick={() => void runGrowthAction('set_account_target_state', undefined, { accountUsername: username, accountState: state, feedback: opportunity.selectionReason || opportunity.whyNow || opportunity.title || '' })}
                                  disabled={actionState.status === 'saving'}
                                  className={cx(
                                    'rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] transition-smooth',
                                    opportunity.accountState === state
                                      ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200'
                                      : 'border-white/10 text-muted-foreground hover:bg-surface-2',
                                  )}
                                >
                                  {state.replaceAll('_', ' ')}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </details>
              ) : null}
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

              {(followQueue.length || followLog.length) ? (
                <details className="rounded-xl border border-white/8 bg-black/20 p-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                    Follow queue {pendingFollows.length ? `(${pendingFollows.length} pending)` : ''}
                  </summary>
                  <div className="mt-2 text-xs text-foreground/70">
                    Proactive follows are budgeted separately from engagement-triggered follows, so posting activity does not consume neighborhood-growth capacity.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <FieldChip>{pendingProactiveFollows.length} proactive pending</FieldChip>
                    <FieldChip>{pendingEngagementFollows.length} engagement pending</FieldChip>
                    <FieldChip>{completedProactiveFollowsToday} proactive followed today</FieldChip>
                    <FieldChip>{completedEngagementFollowsToday} engagement followed today</FieldChip>
                    <FieldChip>cap 15/day proactive</FieldChip>
                  </div>
                  {pendingFollows.length ? (
                    <div className="mt-3 space-y-2">
                      {pendingFollows.slice(0, 6).map((entry) => (
                        <div key={entry.id} className="rounded-xl border border-white/8 bg-black/15 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-foreground">{displayUsername(entry.username)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {entry.clusterLabel || 'Watchlist follow candidate'}{entry.role ? ` • ${entry.role}` : ''}{entry.followType ? ` • ${entry.followType}` : ''}
                              </div>
                            </div>
                            {typeof entry.score === 'number' ? <FieldChip>score {entry.score}</FieldChip> : null}
                          </div>
                          {entry.reason ? <div className="mt-2 text-sm text-foreground/82">{entry.reason}</div> : null}
                          {entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-cyan-200 hover:text-cyan-100">Open source</a> : null}
                        </div>
                      ))}
                    </div>
                  ) : <div className="mt-3 text-sm text-muted-foreground">No pending follows right now.</div>}
                  {followLog.length ? (
                    <div className="mt-4 rounded-xl border border-white/8 bg-black/15 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Recent follow activity</div>
                      <div className="mt-2 space-y-2">
                        {followLog.slice(0, 5).map((entry, index) => (
                          <div key={`${entry.username}-${entry.createdAt || index}`} className="flex items-center justify-between gap-3 text-sm">
                            <div className="text-foreground/88">{displayUsername(entry.username)}</div>
                            <div className="text-xs text-muted-foreground">
                              {entry.status || 'followed'}{entry.datePt ? ` • ${entry.datePt}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </details>
              ) : null}

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
      ) : null}

      {deskMode === 'queue' ? (
        <div className="space-y-4">
          <div id="growth-ready-to-schedule">
          <CollapsibleSection title="Publishing queue" subtitle="Move approved posts into the live queue, then monitor scheduled, failed, and published state here." defaultOpen>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3 rounded-[1.4rem] border border-emerald-500/12 bg-[linear-gradient(180deg,rgba(16,28,24,0.96),rgba(9,15,18,0.98))] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
                  <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-200/85">Ready</div>
                      <div className="mt-1 text-xs text-muted-foreground">Approved posts waiting on a publish time or immediate send.</div>
                    </div>
                    <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">{readyApprovedPosts.length}</div>
                  </div>
                  {readyApprovedPosts.length ? (
                    readyApprovedPosts.map((post) => {
                      const suggested = buildSuggestedSchedule(post)
                      const scheduleState = scheduleDrafts[post.id] || { when: post.scheduledAt || suggested.when, note: post.scheduleNote || suggested.note }
                      const publishState = publishDrafts[post.id] || { tweetUrl: post.tweetUrl || '', tweetId: post.tweetId || '' }
                      return (
                        <div key={post.id} className="rounded-[1.2rem] border border-emerald-500/15 bg-[#10161f] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold leading-5 text-foreground">{post.pillar || 'Approved post'}{post.angle ? `: ${post.angle}` : ''}</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {post.distributionType ? <FieldChip>{post.distributionType}</FieldChip> : null}
                                {post.sourceType ? <FieldChip>{post.sourceType}</FieldChip> : null}
                                {post.approvedAtPt ? <FieldChip>{formatPacificTime(post.approvedAtPt)}</FieldChip> : null}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 rounded-xl border border-emerald-500/15 bg-black/20 px-4 py-4 text-sm leading-6 text-foreground whitespace-pre-wrap">{post.text}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button onClick={() => void runGrowthAction('schedule_draft', post.id, { scheduledAt: scheduleState.when, scheduleNote: scheduleState.note, scheduleSource: scheduleState.when === suggested.when ? 'machine_suggested' : 'user_selected' })} disabled={actionState.status === 'saving' || !scheduleState.when} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition-smooth hover:bg-emerald-500/20 disabled:opacity-60">Schedule</button>
                            <button onClick={() => void runGrowthAction('post_now', post.id)} disabled={actionState.status === 'saving'} className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/20 disabled:opacity-60">Post now</button>
                          </div>
                          <details className="mt-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                            <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Scheduling details</summary>
                            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
                              <label className="text-xs text-muted-foreground">When
                                <input type="datetime-local" value={scheduleState.when} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [post.id]: { ...scheduleState, when: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                              </label>
                              <label className="text-xs text-muted-foreground">Note
                                <input value={scheduleState.note} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [post.id]: { ...scheduleState, note: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="optional schedule note" />
                              </label>
                            </div>
                            <details className="mt-3 rounded-xl border border-white/8 bg-black/15 px-3 py-3">
                              <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Manual fallback</summary>
                              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
                                <label className="text-xs text-muted-foreground">Tweet URL
                                  <input value={publishState.tweetUrl} onChange={(event) => setPublishDrafts((current) => ({ ...current, [post.id]: { ...publishState, tweetUrl: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="https://x.com/.../status/..." />
                                </label>
                                <label className="text-xs text-muted-foreground">Tweet ID
                                  <input value={publishState.tweetId} onChange={(event) => setPublishDrafts((current) => ({ ...current, [post.id]: { ...publishState, tweetId: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="optional if URL is present" />
                                </label>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button onClick={() => void runGrowthAction('link_manual_publish', post.id, { tweetUrl: publishState.tweetUrl, tweetId: publishState.tweetId })} disabled={actionState.status === 'saving' || (!publishState.tweetUrl && !publishState.tweetId)} className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/20 disabled:opacity-60">Link manual publish</button>
                              </div>
                            </details>
                          </details>
                        </div>
                      )
                    })
                  ) : (
                    <div className="rounded-[1.1rem] border border-white/10 bg-[#10161f] px-4 py-4 text-sm text-muted-foreground">Nothing is ready to publish yet.</div>
                  )}
                </div>

              <div className="space-y-3 rounded-[1.4rem] border border-cyan-500/12 bg-[linear-gradient(180deg,rgba(12,24,30,0.96),rgba(9,15,18,0.98))] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
                  <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/85">Scheduled</div>
                      <div className="mt-1 text-xs text-muted-foreground">Posts that already have a publish time and are waiting on the worker.</div>
                    </div>
                    <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100">{scheduledPosts.length}</div>
                  </div>
                  {scheduledPosts.length ? (
                    scheduledPosts.map((post) => (
                      <div key={`scheduled-${post.id}`} className="rounded-[1.2rem] border border-cyan-500/15 bg-[#10161f] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                        <div className="text-sm font-semibold leading-5 text-foreground">{post.pillar || 'Scheduled post'}{post.angle ? `: ${post.angle}` : ''}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <FieldChip>{post.distributionType || 'scheduled'}</FieldChip>
                          <FieldChip>{formatPacificTime(post.scheduledAtPt || post.scheduledAt || null)}</FieldChip>
                        </div>
                        <div className="mt-4 rounded-xl border border-cyan-500/15 bg-black/20 px-4 py-4 text-sm leading-6 text-foreground whitespace-pre-wrap">{post.text}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => void runGrowthAction('post_now', post.id)} disabled={actionState.status === 'saving'} className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/20 disabled:opacity-60">Post now</button>
                          <button onClick={() => void runGrowthAction('unschedule_draft', post.id)} disabled={actionState.status === 'saving'} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60">Unschedule</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1.1rem] border border-white/10 bg-[#10161f] px-4 py-4 text-sm text-muted-foreground">Nothing is scheduled.</div>
                  )}
                </div>

              <div className="space-y-3 rounded-[1.4rem] border border-rose-500/12 bg-[linear-gradient(180deg,rgba(28,16,22,0.96),rgba(14,12,18,0.98))] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
                  <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-rose-200/85">Failed</div>
                      <div className="mt-1 text-xs text-muted-foreground">Items that need a retry, a rewrite, or a different source/account path.</div>
                    </div>
                    <div className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-100">{failedPosts.length}</div>
                  </div>
                  {failedPosts.length ? (
                    failedPosts.map((post) => (
                      <div key={`failed-${post.id}`} className="rounded-[1.2rem] border border-rose-500/15 bg-[#161014] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                        <div className="text-sm font-semibold leading-5 text-foreground">{post.pillar || 'Failed post'}{post.angle ? `: ${post.angle}` : ''}</div>
                        <div className="mt-3 rounded-lg border border-rose-500/15 bg-black/15 px-3 py-2 text-xs text-rose-100/90">{post.publishError || 'Publish failed.'}</div>
                        <div className="mt-3 rounded-xl border border-rose-500/15 bg-black/20 px-4 py-4 text-sm leading-6 text-foreground whitespace-pre-wrap">{post.text}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1.1rem] border border-white/10 bg-[#10161f] px-4 py-4 text-sm text-muted-foreground">No failed publishes.</div>
                  )}
                </div>

              <div className="space-y-3 rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(17,18,23,0.96),rgba(9,15,18,0.98))] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.22)] xl:col-span-2">
                  <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-white/80">Published</div>
                      <div className="mt-1 text-xs text-muted-foreground">Latest shipped posts and the most recent learning signal.</div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-foreground">{publishedCount}</div>
                  </div>
                  {publishedCount ? (
                    <div className="space-y-3">
                      <div className="rounded-[1.2rem] border border-white/10 bg-[#10161f] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                        <div className="text-sm font-semibold leading-5 text-foreground">{(approvedPosts.find((post) => post.status === 'published' || post.status === 'linked')?.pillar) || 'Latest published post'}</div>
                        <div className="mt-2 text-xs text-muted-foreground">{publishedCount} published or linked • {publishAttempts} publish update{publishAttempts === 1 ? '' : 's'}</div>
                        {growth.resultsSummary?.winningDistributionTypes?.length || growth.resultsSummary?.winningSourceTypes?.length || (growth.resultsSummary?.strategyNotes || []).length ? (
                          <div className="mt-3 space-y-2 rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-xs text-foreground/85">
                            {growth.resultsSummary?.winningDistributionTypes?.length ? <div>Winning distribution: {growth.resultsSummary.winningDistributionTypes.join(' • ')}</div> : null}
                            {growth.resultsSummary?.winningSourceTypes?.length ? <div>Winning sources: {growth.resultsSummary.winningSourceTypes.join(' • ')}</div> : null}
                            {(growth.resultsSummary?.strategyNotes || []).slice(0, 1).map((note, index) => <div key={`published-note-${index}`}>{note}</div>)}
                          </div>
                        ) : <div className="mt-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-xs text-muted-foreground">Learning will tighten once more published posts accumulate.</div>}
                      </div>
                    </div>
                  ) : <div className="rounded-[1.1rem] border border-white/10 bg-[#10161f] px-4 py-4 text-sm text-muted-foreground">No published post results yet.</div>}
                </div>
              </div>
            </CollapsibleSection>
          </div>

        </div>
      ) : null}
    </div>
  )
}
