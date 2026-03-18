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
  | 'cancel_approved_post'
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
    dailyGrowthPlanPath?: string | null
    draftPackPath: string | null
    scorecardPath: string | null
    dailyPlanGeneratedAt?: string | null
    dailyPlanMode?: string | null
    researchGeneratedAt?: string | null
    draftPackGeneratedAt?: string | null
    externalStatus: string
    signalState?: string
    signalProvenance?: string[]
    strategyNote?: string | null
    degradedModeStreak?: number
    automationSummary?: {
      runsOncePerDayPt: boolean
      founderChoosesOpportunities: boolean
      founderReviewsDrafts: boolean
      resultsSyncAt?: string | null
      founderTimelineSyncAt?: string | null
      researchRefreshAt?: string | null
      opportunitySelectionAt?: string | null
      draftGenerationAt?: string | null
      selectedOpportunityCount?: number
      draftCount?: number
    } | null
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
      signalOriginClass?: string
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
      signalOriginClass?: string
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
      signalOriginClass?: string
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
      voice_profile?: string
      voice_direction?: string
      source_metrics?: Record<string, unknown>
      source_quality_note?: string
      variant_family_id?: string
      variant_group_label?: string
      variant_label?: string
      variant_position?: number
      variant_count?: number
      reply_preflight_state?: string | null
      reply_preflight_reason?: string | null
      reply_preflight_reason_code?: string | null
      reply_warmth_source?: string | null
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
      postedAt?: string | null
      postedAtPt?: string | null
      scheduleSource?: string | null
      scheduleNote?: string | null
      distributionType?: string
      sourceType?: string
      sourceAccount?: string | null
      selectionReason?: string
      tweetId?: string
      tweetUrl?: string | null
      publishError?: string | null
      replyPreflightState?: string | null
      replyPreflightReason?: string | null
      replyPreflightReasonCode?: string | null
      replyWarmthSource?: string | null
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

function titleCaseSignalState(value?: string | null) {
  return String(value || '')
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ') || 'History Only'
}

function describeSignalOrigin(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'fresh_reactive') return 'fresh reactive signal'
  if (normalized === 'carry_forward') return 'carry-forward signal'
  if (normalized === 'timeline_derived') return 'founder timeline signal'
  if (normalized === 'history_derived') return 'history/watchlist signal'
  return 'system-selected signal'
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

function isReplyPreflightBlocked(state?: string | null) {
  return String(state || '').trim().toLowerCase() === 'blocked'
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
  const summaryReason = opportunity.selectionReason || opportunity.whyNow || 'Review the system-selected move and decide whether it should keep feeding the draft lane.'
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
          {blocked ? opportunity.sourceState.replace(/_/g, ' ') : 'auto-selected'}
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
            <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Automation role</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <FieldChip>system selected</FieldChip>
                <FieldChip>{describeSignalOrigin(opportunity.signalOriginClass)}</FieldChip>
                <FieldChip>founder reviews drafts</FieldChip>
              </div>
            </div>
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
  const replyPreflightBlocked = isReplyPreflightBlocked(draft.reply_preflight_state)

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

      <div className="mt-4 space-y-4">
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
          {replyPreflightBlocked ? (
            <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-sm text-amber-100/90">
              <div className="text-[11px] uppercase tracking-[0.12em] text-amber-200/80">Reply blocked before queueing</div>
              <div className="mt-1">{draft.reply_preflight_reason || 'This thread is still too cold for a live reply.'}</div>
            </div>
          ) : null}
          <textarea
            className="min-h-36 w-full resize-y rounded-xl border border-white/8 bg-black/15 px-4 py-4 text-[15px] leading-7 text-foreground outline-none transition-smooth focus:border-cyan-500/30"
            value={draftText}
            onChange={(event) => {
              setDraftText(event.target.value)
              setDirty(event.target.value !== draft.text)
            }}
          />
        </div>
        <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Why this draft</div>
          <div className="mt-1 text-sm leading-6 text-foreground/88">{visibleRationale}</div>
          <div className="mt-4 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Actions</div>
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
              <button onClick={() => onAction('approve_draft', draft.id)} disabled={saving || dirty || draft.approval === 'approved' || replyPreflightBlocked} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition-smooth hover:bg-emerald-500/20 disabled:opacity-60">Approve</button>
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
          {(typeof draft.follower_growth_score === 'number' || typeof draft.brand_building_score === 'number' || typeof draft.timeliness_score === 'number') ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {typeof draft.follower_growth_score === 'number' ? <FieldChip>growth {draft.follower_growth_score}</FieldChip> : null}
              {typeof draft.brand_building_score === 'number' ? <FieldChip>brand {draft.brand_building_score}</FieldChip> : null}
              {typeof draft.timeliness_score === 'number' ? <FieldChip>timeliness {draft.timeliness_score}</FieldChip> : null}
            </div>
          ) : null}
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
        <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Details {detailSignalCount ? `• ${detailSignalCount} signals` : ''}</summary>
        <div className="mt-3 space-y-3">
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
                {draft.distribution_type === 'reply' && draft.reply_preflight_state ? <FieldChip>{draft.reply_preflight_state === 'eligible' ? 'replyable now' : 'cold thread'}</FieldChip> : null}
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

function OpportunitySelectorCard({
  opportunity,
  selected,
  onSelect,
}: {
  opportunity: GrowthApiResponse['growth']['selectedOpportunities'][number]
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        'w-full rounded-2xl border p-4 text-left shadow-[0_16px_32px_rgba(0,0,0,0.18)] transition-smooth',
        selected ? 'border-cyan-500/25 bg-cyan-500/8' : 'border-white/8 bg-black/20 hover:bg-surface-2/70',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {opportunity.sourceAccount ? <span>{opportunity.sourceAccount}</span> : null}
            {opportunity.distributionType ? <span>{opportunity.distributionType}</span> : null}
            {opportunity.confidence ? <span>{opportunity.confidence}</span> : null}
          </div>
          <div className="mt-2 text-sm font-semibold leading-5 text-foreground">{opportunity.title || 'Opportunity'}</div>
          <div className="mt-1 text-xs leading-5 text-foreground/72">{opportunity.selectionReason || opportunity.whyNow || 'Review this move.'}</div>
        </div>
        {selected ? <FieldChip>Selected</FieldChip> : null}
      </div>
      {opportunity.sourceText ? (
        <div className="mt-3 rounded-xl border border-white/8 bg-black/15 px-3 py-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100/70">Source tweet</div>
          <div className="border-l-2 border-cyan-500/35 pl-3 text-[13px] leading-5 text-foreground/84 whitespace-pre-wrap">
          {opportunity.sourceText}
          </div>
        </div>
      ) : null}
    </button>
  )
}

function DraftSelectorCard({
  draft,
  selected,
  onSelect,
}: {
  draft: GrowthApiResponse['growth']['draftCandidates'][number]
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        'w-full rounded-xl border p-4 text-left transition-smooth',
        selected ? 'border-cyan-500/25 bg-cyan-500/8' : 'border-white/8 bg-black/15 hover:bg-surface-2/70',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{draft.variant_label || 'Draft'}</div>
        <div className="flex flex-wrap gap-2">
          {draft.approval ? <FieldChip>{draft.approval}</FieldChip> : null}
          {selected ? <FieldChip>Selected</FieldChip> : null}
        </div>
      </div>
      <div className="mt-3 text-[15px] leading-7 text-foreground whitespace-pre-wrap">{draft.text}</div>
      {(draft.selection_reason || draft.why_now || draft.rationale) ? (
        <div className="mt-3 text-xs leading-5 text-muted-foreground">{draft.selection_reason || draft.why_now || draft.rationale}</div>
      ) : null}
    </button>
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
  const signalStateLabel = titleCaseSignalState(growth?.signalState)
  const topMoveTitle = topOpportunity?.title || todayBestMove?.title || 'Run the daily planner before reviewing the next move.'
  const topMoveBody = topOpportunity?.selectionReason || topOpportunity?.whyNow || growth?.strategyNote || todayBestMove?.why || 'The system ranks the best live move first, then the founder reviews the resulting drafts.'
  const topMoveActionText =
    readyToSchedule
      ? `${readyToSchedule} approved post${readyToSchedule === 1 ? '' : 's'} waiting to schedule`
      : topDraft
        ? 'Review the top draft candidate'
        : topOpportunity
          ? 'Review the draft lane fed by today’s auto-selected move'
          : 'Run the daily planner to refresh research, selections, and drafts'
  const growthStatus = growth?.externalStatus || 'unknown'
  const researchStatusLine = lowConfidenceCount
    ? `${signalStateLabel} • ${opportunityCount} auto-selected • ${lowConfidenceCount} low-confidence cluster${lowConfidenceCount === 1 ? '' : 's'}`
    : `${signalStateLabel} • ${opportunityCount} auto-selected`
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
    { key: 'refresh', label: 'Refresh everything', action: () => void runGrowthAction('refresh_research') },
    { key: 'select', label: 'Try a different selection', action: () => void runGrowthAction('select_opportunities') },
    { key: 'drafts', label: candidateCount ? 'Clear draft batch' : 'Generate drafts', action: () => void runGrowthAction(candidateCount ? 'clear_current_drafts' : 'generate_drafts', undefined, candidateCount ? {} : { voiceDirection }) },
    { key: 'queue', label: 'Publishing queue', action: () => setActiveDrawer((current) => current === 'queue' ? null : 'queue') },
    { key: 'signals', label: 'Research signals', action: () => setActiveDrawer((current) => current === 'signals' ? null : 'signals') },
  ]
  const primaryActions = utilityActions.slice(0, 2)
  const secondaryActions = utilityActions.slice(2)

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

  const nowStripItems = readyToSchedule
    ? [
        `Review ${readyToSchedule} ready-to-publish post${readyToSchedule === 1 ? '' : 's'}`,
        'Queue actions appear now',
        'Refresh or reselect anytime',
      ]
    : selectedDraft
      ? [
          'Review the selected draft',
          'Approve, rewrite, or reject it',
          'Schedule controls appear after approval',
        ]
      : candidateCount
        ? [
            'Pick the strongest draft family',
            'Approve or rewrite before looking at signals',
            'Refresh or reselect if this batch feels weak',
          ]
        : selectedOpportunities.length
          ? [
              'Try a different selection from today’s research',
              'Use refresh everything only if research feels stale',
              'Drafts will appear once a move clears the bar',
            ]
          : [
              'Run refresh everything to rebuild today’s lane',
              'Wait for new drafts to appear',
              'Review only when fresh work arrives',
            ]

  const founderActionTitle = readyToSchedule
    ? 'Schedule or publish the approved posts waiting in the queue.'
    : selectedDraft
      ? 'Review the selected draft and either approve it, rewrite it, or reject it.'
      : candidateCount
        ? 'Review the generated draft families and pick the strongest one to approve or rewrite.'
        : selectedOpportunities.length
          ? 'The system found moves, but no draft cleared the bar. Re-select or run a full refresh.'
          : 'Run a full refresh to rebuild research, moves, and drafts.'
  const founderActionBody = readyToSchedule
    ? `${readyToSchedule} approved post${readyToSchedule === 1 ? '' : 's'} ${readyToSchedule === 1 ? 'is' : 'are'} waiting in the publishing queue.`
    : selectedDraft
      ? `${selectedDraft.distribution_type || 'draft'}${selectedDraft.source_account ? ` from ${selectedDraft.source_account}` : ''} is selected in the draft lane.`
      : candidateCount
        ? `${candidateCount} draft candidate${candidateCount === 1 ? '' : 's'} ${candidateCount === 1 ? 'is' : 'are'} ready for founder review.`
        : selectedOpportunities.length
          ? `${selectedOpportunities.length} system-selected move${selectedOpportunities.length === 1 ? '' : 's'} are available, but none produced a strong enough draft pack.`
          : 'No usable work is in the lane yet.'
  const founderChecklist = readyToSchedule
      ? ['Open the publishing queue', 'Schedule or publish the approved post', 'Return later for the next draft batch']
      : selectedDraft
        ? ['Read the selected draft', 'Approve, rewrite, or reject it', 'Ignore the move list unless you need context']
        : candidateCount
          ? ['Start in Draft studio', 'Pick the strongest family', 'Approve or rewrite before looking at signals']
        : selectedOpportunities.length
          ? ['Try a different selection', 'Use refresh everything only if the research itself feels stale', 'Ignore low-value moves']
          : ['Run refresh everything', 'Wait for new drafts', 'Come back to review only when the lane refills']
  const automationStatusLine = growth?.automationSummary?.draftGenerationAt
    ? `Last system planning run ${formatPacificTime(growth.automationSummary.draftGenerationAt)}`
    : 'System planning has not completed yet today'

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

  const patchGrowthDraft = useCallback((draftPatch: Record<string, unknown>) => {
    const draftId = String(draftPatch.id || '').trim()
    if (!draftId) return
    setData((current) => {
      if (!current?.growth) return current
      const next = structuredClone(current) as GrowthApiResponse
      let changed = false

      next.growth.draftCandidates = next.growth.draftCandidates.map((draft) => {
        if (String(draft.id || '').trim() !== draftId) return draft
        changed = true
        return {
          ...draft,
          ...draftPatch,
        }
      })

      next.growth.approvedPosts = next.growth.approvedPosts.map((post) => {
        if (String(post.id || '').trim() !== draftId) return post
        changed = true
        return {
          ...post,
          ...draftPatch,
        }
      })

      return changed ? next : current
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
      if (action === 'rewrite_draft' || action === 'update_draft_text') {
        const rewrittenDraft = payload?.draft && typeof payload.draft === 'object' ? payload.draft as Record<string, unknown> : null
        if (rewrittenDraft) {
          patchGrowthDraft(rewrittenDraft)
        }
      }
      await reload()
      if (action === 'post_now') {
        const draftStatus = String(payload?.draft?.status || '').trim().toLowerCase()
        const tweetUrl = String(payload?.draft?.tweet_url || '').trim()
        const publishError = String(payload?.draft?.publish_error || '').trim()
        if (draftStatus === 'published') {
          setActionState({
            status: 'saved',
            message: tweetUrl ? `Post published on X. ${tweetUrl}` : 'Post published on X.',
          })
          return
        }
        if (draftStatus === 'failed') {
          setActionState({
            status: 'error',
            message: publishError || 'X rejected the post. Review the failed queue item for the exact reason.',
          })
          return
        }
      }
      const messageMap: Partial<Record<GrowthAction, string>> = {
        refresh_research: 'Daily growth plan refreshed.',
        select_opportunities: 'System-selected moves re-ranked from the latest daily plan.',
        refresh_research_and_select: 'Daily growth plan refreshed and moves re-ranked.',
        generate_drafts: 'Draft candidates generated from the current system-selected moves.',
        refresh_research_and_generate: 'Daily growth plan refreshed and a new draft pack generated.',
        expand_family_variants: 'Added more options for this source family.',
        rewrite_draft: payload?.draft?.text ? 'Draft rewritten and updated in place.' : 'Draft rewrite requested.',
        update_draft_text: 'Draft text saved.',
        approve_draft: 'Post approved and moved to Ready to schedule.',
        reject_draft: 'Draft rejected. The system will learn from that.',
        archive_draft: 'Angle archived without poisoning the whole source family.',
        reject_opportunity: 'Opportunity rejected and removed from the active lane.',
        archive_opportunity: 'Opportunity archived out of the active lane.',
        clear_current_drafts: 'Current drafts cleared. Learning memory was preserved.',
        schedule_draft: 'Post scheduled in the editorial desk.',
        unschedule_draft: 'Post moved back to Ready to schedule without a publish time.',
        cancel_approved_post: 'Queued post cancelled and removed from the active publishing lane.',
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

  const selectedOpportunitySourceFamilyKey = selectedOpportunity?.sourceFamilyKey || selectedOpportunity?.sourceUrl || selectedOpportunity?.id || null
  const selectedDraftFamilyId = selectedDraftFamily?.familyId || null
  const compactOpportunities = reactiveOpportunityFamilies.length ? reactiveOpportunityFamilies : fallbackOpportunityFamilies
  const showFallbackStub = !reactiveOpportunityFamilies.length && fallbackOpportunityFamilies.length > 0

  return (
    <div className="space-y-5 p-5">
      <div className="rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(15,20,27,0.98),rgba(11,16,23,0.98))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Growth desk</div>
            <div className="mt-1 text-sm text-muted-foreground">{automationStatusLine} • {researchStatusLine}</div>
          </div>
          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-white/8 bg-black/20 p-2">
              {primaryActions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.action}
                  disabled={actionState.status === 'saving'}
                  className={cx(
                    'rounded-lg border px-3 py-2 text-xs font-medium transition-smooth disabled:opacity-60',
                    'border-cyan-500/25 bg-cyan-500/12 text-cyan-100 hover:bg-cyan-500/18',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <FieldChip>{researchStatusLine}</FieldChip>
              <FieldChip>{queueStatusLine}</FieldChip>
              {topDraft ? <FieldChip>{topDraftSummary}</FieldChip> : null}
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-cyan-500/12 bg-cyan-500/6 px-4 py-3 text-sm text-foreground/88">
          <div className="font-medium text-foreground">The system now chooses opportunities once per day.</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Your role starts at draft review and approval, not raw opportunity picking.
            {growth.automationSummary?.researchRefreshAt ? ` Last daily planning run: ${formatPacificTime(growth.automationSummary.researchRefreshAt)}.` : ''}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="text-foreground">Refresh everything</span> pulls fresh research and rebuilds the whole lane.
            {' '}
            <span className="text-foreground">Try a different selection</span> keeps today&apos;s research snapshot, picks a different move set, and regenerates drafts.
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">What you can do now</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {nowStripItems.map((item) => (
              <FieldChip key={item}>{item}</FieldChip>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-emerald-500/12 bg-emerald-500/6 p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/70">What you should do now</div>
          <div className="mt-1 text-base font-semibold text-foreground">{founderActionTitle}</div>
          <div className="mt-2 text-sm text-foreground/85">{founderActionBody}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {founderChecklist.map((item) => <FieldChip key={item}>{item}</FieldChip>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {secondaryActions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.action}
                disabled={actionState.status === 'saving'}
                className={cx(
                  'rounded-lg border px-3 py-2 text-xs font-medium transition-smooth disabled:opacity-60',
                  (activeDrawer === 'queue' && item.key === 'queue') || (activeDrawer === 'signals' && item.key === 'signals')
                    ? 'border-cyan-500/25 bg-cyan-500/12 text-cyan-100'
                    : 'border-white/10 bg-[#121922] text-foreground hover:bg-surface-2',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start">
        <div className="space-y-5">
          <section className="rounded-2xl border border-cyan-500/15 bg-[#10161f] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.26)]">
            <div className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">Top move</div>
            <div className="mt-1 text-base font-semibold text-foreground">{topMoveTitle}</div>
            <div className="mt-2 text-sm text-foreground/85">{topMoveBody}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedDraft?.distribution_type ? <CommandChip label={selectedDraft.distribution_type} tone="live" /> : selectedOpportunity?.distributionType ? <CommandChip label={selectedOpportunity.distributionType} tone="live" /> : topOpportunity?.distributionType ? <CommandChip label={topOpportunity.distributionType} tone="live" /> : null}
              {selectedDraft?.source_account ? <CommandChip label={selectedDraft.source_account} /> : selectedOpportunity?.sourceAccount ? <CommandChip label={selectedOpportunity.sourceAccount} /> : topOpportunity?.sourceAccount ? <CommandChip label={topOpportunity.sourceAccount} /> : null}
              {selectedOpportunity?.confidence ? <CommandChip label={selectedOpportunity.confidence} tone={selectedOpportunity.confidence === 'high' ? 'queue' : selectedOpportunity.confidence === 'low' ? 'warning' : 'neutral'} /> : topOpportunity?.confidence ? <CommandChip label={topOpportunity.confidence} tone={topOpportunity.confidence === 'high' ? 'queue' : topOpportunity.confidence === 'low' ? 'warning' : 'neutral'} /> : null}
              <CommandChip label={growth.freshness?.cacheUsed ? `Cached ${Number(growth.freshness?.cacheAgeMinutes || 0).toFixed(0)}m` : growth.externalStatus || 'fresh'} />
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#10161f] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Draft studio</div>
                <div className="mt-1 text-xs text-muted-foreground">This is the main founder decision lane now. Review variants here, then approve or reject.</div>
              </div>
              <FieldChip>{groupedDraftCandidates.length}</FieldChip>
            </div>
            <div className="mt-4 space-y-3">
              {draftFamilyModels.length ? (
                <>
                  {draftFamilyModels.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {draftFamilyModels.map((family) => {
                        const isSelectedFamily = selectedDraftFamilyId === family.familyId
                        return (
                          <button
                            key={`family-switch-${family.familyId}`}
                            type="button"
                            onClick={() => setSelection({ kind: 'draft', familyId: family.familyId, draftId: family.drafts[0].id })}
                            className={cx(
                              'rounded-full border px-3 py-2 text-left text-xs font-medium transition-smooth',
                              isSelectedFamily
                                ? 'border-cyan-500/30 bg-cyan-500/12 text-cyan-100'
                                : 'border-white/10 bg-black/20 text-foreground hover:bg-surface-2',
                            )}
                          >
                            {family.sourceLabel} • {family.drafts.length} variants
                          </button>
                        )
                      })}
                    </div>
                  ) : null}

                  {selectedDraftFamily ? (
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{selectedDraftFamily.sourceLabel}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{selectedDraftFamily.familyLabel}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <FieldChip>{selectedDraftFamily.drafts.length} variants</FieldChip>
                          {selectedDraftFamily.leader.distribution_type ? <FieldChip>{selectedDraftFamily.leader.distribution_type}</FieldChip> : null}
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {selectedDraftFamily.drafts.map((draft) => {
                          const isSelected = selectedDraft?.id === draft.id
                          return (
                            <DraftSelectorCard
                              key={draft.id}
                              draft={draft}
                              selected={isSelected}
                              onSelect={() => setSelection({ kind: 'draft', familyId: selectedDraftFamily.familyId, draftId: draft.id })}
                            />
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-muted-foreground">
                  {selectedOpportunities.length
                    ? 'Auto-selected moves are ready. Review these drafts, rewrite a strong one, or reselect from current research if the whole batch feels off.'
                    : 'No drafts yet. Run a full refresh to rebuild research, moves, and drafts.'}
                </div>
              )}
            </div>
          </section>

          <details className="rounded-2xl border border-white/10 bg-[#10161f] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Context behind today&apos;s moves</div>
                  <div className="mt-1 text-xs text-muted-foreground">Open this when you want to inspect why the system picked today&apos;s opportunities. Most of the time you can stay in Draft studio.</div>
                </div>
                <FieldChip>{selectedOpportunities.length}</FieldChip>
              </div>
            </summary>
            <div className="mt-4 space-y-3">
              {compactOpportunities.length ? compactOpportunities.map((family) => {
                const leader = family.opportunities[0]
                const isSelected = selectedOpportunitySourceFamilyKey === (leader.sourceFamilyKey || leader.sourceUrl || leader.id)
                return (
                  <OpportunitySelectorCard
                    key={family.key}
                    opportunity={leader}
                    selected={isSelected}
                    onSelect={() => setSelection({ kind: 'opportunity', id: leader.id })}
                  />
                )
              }) : (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-muted-foreground">
                  {allQueueItems.length
                    ? 'Nothing is in review right now. Open the publishing queue to keep moving.'
                    : growth.noOpportunityReason || 'No auto-selected moves yet.'}
                </div>
              )}
              {showFallbackStub ? (
                <details className="rounded-xl border border-white/8 bg-black/15 p-3">
                  <summary className="cursor-pointer list-none text-sm font-medium text-foreground">Fallback original posts</summary>
                  <div className="mt-2 space-y-2">
                    {fallbackOpportunityFamilies.map((family) => {
                      const leader = family.opportunities[0]
                      return (
                        <button
                          key={`fallback-${family.key}`}
                          type="button"
                          onClick={() => setSelection({ kind: 'opportunity', id: leader.id })}
                          className="w-full rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-left hover:bg-surface-2/70"
                        >
                          <div className="text-sm font-medium text-foreground">{leader.title || family.sourceLabel}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{leader.selectionReason || leader.whyNow || 'Fallback original'}</div>
                        </button>
                      )
                    })}
                  </div>
                </details>
              ) : null}
            </div>
          </details>
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,20,27,0.98),rgba(11,16,23,0.98))] p-4 shadow-[0_24px_48px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">Focus panel</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {inspectorMode === 'draft' ? 'Work on this draft' : inspectorMode === 'opportunity' ? 'Context for this move' : inspectorMode === 'queue' ? 'Work on this queue item' : 'Nothing selected'}
                </div>
              </div>
              {activeDrawer ? (
                <button type="button" onClick={() => setActiveDrawer(null)} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2">
                  Close drawer
                </button>
              ) : null}
            </div>

            <div className="mt-4">
              {inspectorMode === 'draft' && selectedDraft ? (
                <DraftCard
                  key={selectedDraft.id}
                  draft={selectedDraft}
                  feedbackValue={feedbackDrafts[selectedDraft.id] || ''}
                  voiceDirection={voiceDirection}
                  onVoiceDirectionChange={setVoiceDirection}
                  onFeedbackChange={(value) => setFeedbackDrafts((current) => ({ ...current, [selectedDraft.id]: value }))}
                  onAction={(action, draftId, extra) => void runGrowthAction(action, draftId, extra || {})}
                  saving={actionState.status === 'saving'}
                />
              ) : inspectorMode === 'opportunity' && selectedOpportunity ? (
                <OpportunityCard
                  opportunity={selectedOpportunity}
                  feedbackValue={opportunityFeedback[selectedOpportunity.id] || ''}
                  onFeedbackChange={(value) => setOpportunityFeedback((current) => ({ ...current, [selectedOpportunity.id]: value }))}
                  onAction={runGrowthAction}
                  saving={actionState.status === 'saving'}
                />
              ) : inspectorMode === 'queue' && selectedQueueEntry ? (
                (() => {
                  const post = selectedQueueEntry.item
                  const status = selectedQueueEntry.status
                  const suggested = buildSuggestedSchedule(post)
                  const scheduleState = scheduleDrafts[post.id] || { when: post.scheduledAt || suggested.when, note: post.scheduleNote || suggested.note }
                  const publishState = publishDrafts[post.id] || { tweetUrl: post.tweetUrl || '', tweetId: post.tweetId || '' }
                  const replyPreflightBlocked = isReplyPreflightBlocked(post.replyPreflightState)
                  return (
                    <div className="space-y-3 rounded-2xl border border-white/8 bg-black/15 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{post.pillar || 'Queue item'}{post.angle ? `: ${post.angle}` : ''}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{post.sourceAccount || post.sourceType || post.distributionType || status}</div>
                        </div>
                        <FieldChip>{status}</FieldChip>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-4 text-sm leading-6 text-foreground whitespace-pre-wrap">{post.text}</div>
                      {status === 'failed' && post.publishError ? (
                        <div className="rounded-lg border border-rose-500/15 bg-rose-500/10 px-3 py-2 text-xs text-rose-100/90">{post.publishError}</div>
                      ) : null}
                      {replyPreflightBlocked ? (
                        <div className="rounded-lg border border-amber-500/15 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
                          {post.replyPreflightReason || 'This reply is blocked because the thread is still too cold to use reliably.'}
                        </div>
                      ) : null}
                      {status === 'published' && post.tweetUrl ? (
                        <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-xs text-foreground/80">
                          Published {formatPacificTime(post.postedAtPt || post.postedAt || null)}
                          <div className="mt-2">
                            <a href={post.tweetUrl} target="_blank" rel="noreferrer" className="text-cyan-200 hover:text-cyan-100">Open published post</a>
                          </div>
                        </div>
                      ) : null}
                      {status === 'ready' ? (
                        <>
                          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                            <label className="text-xs text-muted-foreground">When
                              <input type="datetime-local" value={scheduleState.when} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [post.id]: { ...scheduleState, when: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                            </label>
                            <label className="text-xs text-muted-foreground">Note
                              <input value={scheduleState.note} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [post.id]: { ...scheduleState, note: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                            </label>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => void runGrowthAction('schedule_draft', post.id, { scheduledAt: scheduleState.when, scheduleNote: scheduleState.note, scheduleSource: scheduleState.when === suggested.when ? 'machine_suggested' : 'user_selected' })} disabled={actionState.status === 'saving' || !scheduleState.when || replyPreflightBlocked} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition-smooth hover:bg-emerald-500/20 disabled:opacity-60">Schedule</button>
                            <button onClick={() => void runGrowthAction('post_now', post.id)} disabled={actionState.status === 'saving' || replyPreflightBlocked} className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/20 disabled:opacity-60">Post now</button>
                            <button onClick={() => void runGrowthAction('cancel_approved_post', post.id)} disabled={actionState.status === 'saving'} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 transition-smooth hover:bg-rose-500/20 disabled:opacity-60">Cancel</button>
                          </div>
                          <details className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                            <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Manual fallback</summary>
                            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
                              <label className="text-xs text-muted-foreground">Tweet URL
                                <input value={publishState.tweetUrl} onChange={(event) => setPublishDrafts((current) => ({ ...current, [post.id]: { ...publishState, tweetUrl: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="https://x.com/.../status/..." />
                              </label>
                              <label className="text-xs text-muted-foreground">Tweet ID
                                <input value={publishState.tweetId} onChange={(event) => setPublishDrafts((current) => ({ ...current, [post.id]: { ...publishState, tweetId: event.target.value } }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="optional if URL is present" />
                              </label>
                            </div>
                            <div className="mt-3">
                              <button onClick={() => void runGrowthAction('link_manual_publish', post.id, { tweetUrl: publishState.tweetUrl, tweetId: publishState.tweetId })} disabled={actionState.status === 'saving' || (!publishState.tweetUrl && !publishState.tweetId)} className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/20 disabled:opacity-60">Link manual publish</button>
                            </div>
                          </details>
                        </>
                      ) : null}
                      {status === 'scheduled' ? (
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => void runGrowthAction('post_now', post.id)} disabled={actionState.status === 'saving' || replyPreflightBlocked} className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/20 disabled:opacity-60">Post now</button>
                          <button onClick={() => void runGrowthAction('unschedule_draft', post.id)} disabled={actionState.status === 'saving'} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60">Unschedule</button>
                          <button onClick={() => void runGrowthAction('cancel_approved_post', post.id)} disabled={actionState.status === 'saving'} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 transition-smooth hover:bg-rose-500/20 disabled:opacity-60">Cancel</button>
                        </div>
                      ) : null}
                      {status === 'failed' ? (
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setActiveDrawer('queue')} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2">Review in queue</button>
                          <button onClick={() => void runGrowthAction('cancel_approved_post', post.id)} disabled={actionState.status === 'saving'} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 transition-smooth hover:bg-rose-500/20 disabled:opacity-60">Cancel</button>
                        </div>
                      ) : null}
                    </div>
                  )
                })()
              ) : (
                <div className="rounded-2xl border border-white/8 bg-black/15 p-4 text-sm text-muted-foreground">
                  Pick a draft to act on. Only open move context or queue items here when you need more detail.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {activeDrawer ? (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm">
          <div className="absolute inset-y-0 right-0 w-full max-w-[460px] overflow-y-auto border-l border-white/10 bg-[#0d131b] p-5 shadow-[-20px_0_40px_rgba(0,0,0,0.32)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">{activeDrawer === 'queue' ? 'Publishing queue' : 'Research signals'}</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {activeDrawer === 'queue' ? 'Operational publishing state' : 'Research, follows, and account intelligence'}
                </div>
              </div>
              <button type="button" onClick={() => setActiveDrawer(null)} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2">
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {activeDrawer === 'queue' ? (
                queueSections.map((section) => (
                  <section key={section.key} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{section.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {section.key === 'ready' ? 'Approved posts waiting to publish.' : section.key === 'scheduled' ? 'Waiting on the publish worker.' : section.key === 'failed' ? 'Needs review or retry.' : 'Published history.'}
                        </div>
                      </div>
                      <FieldChip>{section.items.length}</FieldChip>
                    </div>
                    <div className="mt-3 space-y-2">
                      {section.items.length ? section.items.map((post) => (
                        <button
                          key={`${section.key}-${post.id}`}
                          type="button"
                          onClick={() => setSelection({ kind: 'queue', status: section.key, id: post.id })}
                          className={cx(
                            'w-full rounded-xl border p-3 text-left transition-smooth',
                            selection?.kind === 'queue' && selection.id === post.id && selection.status === section.key
                              ? 'border-cyan-500/25 bg-cyan-500/8'
                              : 'border-white/8 bg-black/15 hover:bg-surface-2/70',
                          )}
                        >
                          <div className="text-sm font-medium text-foreground line-clamp-2">{post.text}</div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {post.sourceAccount || post.sourceType || post.distributionType || section.key}
                            {section.key === 'scheduled' && (post.scheduledAtPt || post.scheduledAt) ? ` • ${formatPacificTime(post.scheduledAtPt || post.scheduledAt || null)}` : ''}
                            {section.key === 'published' && (post.postedAtPt || post.postedAt) ? ` • ${formatPacificTime(post.postedAtPt || post.postedAt || null)}` : ''}
                          </div>
                          {section.key === 'failed' && post.publishError ? <div className="mt-2 text-xs text-rose-100/80 line-clamp-2">{post.publishError}</div> : null}
                        </button>
                      )) : <div className="text-sm text-muted-foreground">Nothing here right now.</div>}
                    </div>
                  </section>
                ))
              ) : (
                <>
                  <CollapsibleSection title="Listening" subtitle="Current-week research status and diagnostics." defaultOpen>
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
                        </div>
                      )) : <div className="text-sm text-muted-foreground">No high-confidence clusters yet.</div>}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Blocked by source truth" subtitle="Suppressed sources and opportunities." defaultOpen={false}>
                    <div className="space-y-3">
                      {blockedOpportunities.length ? blockedOpportunities.map((opportunity) => (
                        <OpportunityCard key={`blocked-${opportunity.id}`} opportunity={opportunity} blocked />
                      )) : <div className="text-sm text-muted-foreground">Nothing is blocked right now.</div>}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Accounts to watch" subtitle="Secondary account targets and low-confidence watch items." defaultOpen={false}>
                    <div className="space-y-3">
                      {watchOnlyOpportunities.length ? watchOnlyOpportunities.map((opportunity) => {
                        const username = extractOpportunityUsername(opportunity)
                        return (
                          <div key={`watch-${opportunity.id}`} className="rounded-xl border border-white/8 bg-black/20 p-4">
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
                      }) : <div className="text-sm text-muted-foreground">No watch items right now.</div>}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Follow queue" subtitle="Proactive and engagement-driven follows." defaultOpen={false}>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <FieldChip>{pendingProactiveFollows.length} proactive pending</FieldChip>
                        <FieldChip>{pendingEngagementFollows.length} engagement pending</FieldChip>
                        <FieldChip>{completedProactiveFollowsToday} proactive followed today</FieldChip>
                        <FieldChip>{completedEngagementFollowsToday} engagement followed today</FieldChip>
                        <FieldChip>cap 15/day proactive</FieldChip>
                      </div>
                      {pendingFollows.length ? pendingFollows.slice(0, 6).map((entry) => (
                        <div key={entry.id} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                          <div className="font-medium text-foreground">{displayUsername(entry.username)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{entry.followType || 'proactive'} • {entry.clusterLabel || 'follow candidate'}</div>
                          {entry.reason ? <div className="mt-2 text-sm text-foreground/82">{entry.reason}</div> : null}
                        </div>
                      )) : <div className="text-sm text-muted-foreground">No pending follows right now.</div>}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Account growth" subtitle="Weekly account momentum." defaultOpen={false}>
                    <div className="space-y-3">
                      {accountGrowthSummaries.length ? (
                        <>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-3">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Active week</div>
                              <div className="mt-1 text-sm font-medium text-foreground">{latestAccountGrowthSummary?.week || 'Current week'}</div>
                            </div>
                            <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-3">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Current best streak</div>
                              <div className="mt-1 text-sm font-medium text-foreground">{bestGrowthWeek ? `${bestGrowthWeek.week} (${formatSignedCount(bestGrowthWeek.netFollowerGrowth)})` : 'Waiting on more weeks'}</div>
                            </div>
                            <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-3">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Total completions</div>
                              <div className="mt-1 text-sm font-medium text-foreground">{latestAccountGrowthSummary?.postsPublished ?? 0} posts • {latestAccountGrowthSummary?.accountsFollowed ?? 0} follows</div>
                            </div>
                          </div>
                          {[...accountGrowthSummaries].reverse().map((summary) => (
                            <div key={`growth-summary-${summary.week}`} className="rounded-lg border border-white/8 bg-black/20 px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-medium text-foreground">{summary.week}</div>
                                <FieldChip>{summary.snapshotStatus || 'ready'}</FieldChip>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                {typeof summary.startingFollowerCount === 'number' && typeof summary.endingFollowerCount === 'number'
                                  ? `${summary.startingFollowerCount.toLocaleString()} → ${summary.endingFollowerCount.toLocaleString()} followers`
                                  : 'Follower snapshot partial'}
                              </div>
                              <div className="mt-2 text-sm text-foreground/82">
                                {formatSignedCount(summary.netFollowerGrowth || 0)} • {summary.postsPublished ?? 0} posts • {summary.accountsFollowed ?? 0} follows
                              </div>
                            </div>
                          ))}
                        </>
                      ) : <div className="text-sm text-muted-foreground">No account growth summary yet.</div>}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Strategy memory" subtitle="Feedback, source memory, and learned signals." defaultOpen={false}>
                    <div className="space-y-3">
                      {growth.editorialMemory?.recentFeedback?.length ? (
                        <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Editorial memory</div>
                          <div className="mt-2 space-y-2">
                            {growth.editorialMemory.recentFeedback.map((entry, index) => (
                              <div key={`feedback-${index}`} className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
                                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{entry.decision} • {entry.archetype || 'unknown'} • {formatPacificTime(entry.reviewedAtPt)}</div>
                                <div className="mt-1 text-sm text-foreground/85">{entry.feedback}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-xs text-foreground/85">
                        {growth.strategyMemory?.strategyNotes?.length ? growth.strategyMemory.strategyNotes.map((note, index) => (
                          <div key={`strategy-note-${index}`} className="flex gap-2"><span>•</span><span>{note}</span></div>
                        )) : <div className="text-muted-foreground">No strategy memory yet.</div>}
                      </div>
                    </div>
                  </CollapsibleSection>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
