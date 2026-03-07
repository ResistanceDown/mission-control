'use client'

import { useCallback, useState } from 'react'
import { useSmartPoll } from '@/lib/use-smart-poll'

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
    researchSignals: string[]
    strategy: {
      primaryGoal: string
      contentMix: string[]
      engagementTactics: string[]
      editorialBias: string[]
      followerGrowthLoop: string[]
      targetAccountStrategy: string[]
      whyThisWeek: string[]
    } | null
    engagementTargets: {
      quoteTargets: Array<{ clusterLabel: string; why: string; url: string; text: string; author: string; likes: number; replies: number; followers: number }>
      replyTargets: Array<{ clusterLabel: string; why: string; url: string; text: string; author: string; likes: number; replies: number; followers: number }>
    }
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
      source_type?: string
      distribution_type?: string
      cluster_id?: string | null
      why_now?: string
      brand_fit?: string
      supporting_signals?: string[]
      follower_growth_score?: number
      brand_building_score?: number
      selection_reason?: string
      source_tweet?: {
        id?: string
        text?: string
        url?: string | null
      } | null
    }>
    recommendations?: {
      bestForFollowerGrowth: string | null
      bestForBrandBuilding: string | null
      bestOriginalPost: string | null
    } | null
    approvedPosts: Array<{
      id: string
      text: string
      pillar: string
      angle: string
      status: string
      approvedAtPt: string
      tweetId?: string
      tweetUrl?: string | null
    }>
    resultsSummary?: {
      postedCount: number
      winningPillars: string[]
      strategyNotes: string[]
      topPosts: Array<{
        id: string
        pillar: string
        tweetUrl: string | null
        engagementScore: number
      }>
    } | null
    scorecard: {
      week?: string
      posts_planned?: number
      posts_published?: number
      replies_target?: number
      replies_completed?: number
      status?: string
    } | null
  }
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
  return { data, loading, reload: load }
}

function Metric({ label, value, subtitle, color = 'blue' }: { label: string; value: string | number; subtitle?: string; color?: 'blue' | 'green' | 'purple' | 'amber' }) {
  const colorMap = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  }
  return (
    <div className={`rounded-xl border px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${colorMap[color]}`}>
      <div className="text-2xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      {subtitle ? <div className="mt-1 text-2xs text-foreground/55">{subtitle}</div> : null}
    </div>
  )
}

function DraftRecommendation({ title, description, draft }: { title: string; description: string; draft: GrowthApiResponse['growth']['draftCandidates'][number] | undefined }) {
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-black/15 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      {draft ? (
        <>
          <div className="mt-3 text-sm font-medium text-foreground">{draft.pillar}: {draft.angle}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {draft.distribution_type ? <span className="rounded-full border border-white/10 px-2 py-0.5">{draft.distribution_type}</span> : null}
            {typeof draft.follower_growth_score === 'number' ? <span className="rounded-full border border-white/10 px-2 py-0.5">growth {draft.follower_growth_score}</span> : null}
            {typeof draft.brand_building_score === 'number' ? <span className="rounded-full border border-white/10 px-2 py-0.5">brand {draft.brand_building_score}</span> : null}
          </div>
          <div className="mt-3 rounded-lg border border-cyan-500/15 bg-[#0e1520] px-3 py-3 text-sm leading-6 text-foreground whitespace-pre-wrap">{draft.text}</div>
        </>
      ) : <div className="mt-3 text-sm text-muted-foreground">No candidate selected yet.</div>}
    </div>
  )
}

export function GrowthReviewPanel() {
  const { data, loading, reload } = useGrowthData()
  const [actionState, setActionState] = useState<{ status: 'idle' | 'saving' | 'error' | 'saved'; message?: string }>({ status: 'idle' })
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({})

  async function runGrowthAction(action: 'refresh_research' | 'generate_drafts' | 'approve_draft' | 'reject_draft' | 'archive_draft' | 'reset_to_research', draftId?: string) {
    const growthWeek = data?.growth?.week ?? null
    const feedback = draftId ? String(feedbackDrafts[draftId] || '').trim() : ''
    setActionState({ status: 'saving' })
    try {
      const response = await fetch('/api/founder/growth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, draftId, week: growthWeek, feedback }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setActionState({ status: 'error', message: payload.error || 'Growth update failed.' })
        return
      }
      await reload()
      const messageMap: Record<string, string> = {
        refresh_research: 'Research refreshed.',
        generate_drafts: 'Draft candidates generated.',
        approve_draft: 'Post approved. It is now ready to publish.',
        reject_draft: 'Draft rejected.',
        archive_draft: 'Draft archived.',
        reset_to_research: 'Drafts cleared. Growth is back to research-first state.',
      }
      if (draftId) setFeedbackDrafts((current) => ({ ...current, [draftId]: '' }))
      setActionState({ status: 'saved', message: messageMap[action] || 'Growth updated.' })
    } catch {
      setActionState({ status: 'error', message: 'Growth update failed.' })
    }
  }

  if (loading) {
    return <div className="panel"><div className="panel-body"><div className="h-36 rounded-lg shimmer" /></div></div>
  }

  const growth = data?.growth
  if (!growth) {
    return <div className="panel"><div className="panel-body text-sm text-muted-foreground">Growth data is not available yet.</div></div>
  }

  const byId = new Map(growth.draftCandidates.map((draft) => [draft.id, draft]))
  const bestForFollowerGrowth = growth.recommendations?.bestForFollowerGrowth ? byId.get(growth.recommendations.bestForFollowerGrowth) : undefined
  const bestForBrandBuilding = growth.recommendations?.bestForBrandBuilding ? byId.get(growth.recommendations.bestForBrandBuilding) : undefined
  const bestOriginalPost = growth.recommendations?.bestOriginalPost ? byId.get(growth.recommendations.bestOriginalPost) : undefined

  return (
    <div className="space-y-4 p-5">
      <div className="panel border-white/10 bg-[#0f141b] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
        <div className="panel-header flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Growth Review</h2>
            <p className="mt-1 text-xs text-muted-foreground">Research-backed content strategy, draft review, and follower-growth decisions.</p>
          </div>
          <div className="text-right text-2xs text-muted-foreground">
            <div>{growth.week || 'No active week'}</div>
            <div className="uppercase tracking-wide">{growth.externalStatus}</div>
          </div>
        </div>
        <div className="panel-body space-y-4">
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            <Metric label="Drafts" value={growth.draftCandidates.length} subtitle="Candidates ready" color="blue" />
            <Metric label="Approved" value={growth.approvedPosts.length} subtitle="Ready to publish" color="green" />
            <Metric label="Quote Targets" value={growth.engagementTargets.quoteTargets.length} subtitle="Credible posts" color="purple" />
            <Metric label="Reply Targets" value={growth.engagementTargets.replyTargets.length} subtitle="Live conversations" color="amber" />
            <Metric label="Results" value={growth.resultsSummary?.postedCount ?? 0} subtitle="Posts tracked" color="blue" />
          </div>

          <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/8 via-surface-2/82 to-surface-2/82 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Research and Draft Pipeline</div>
                <div className="mt-1 text-xs text-muted-foreground">Use research first. Generate drafts only after the signal looks worth responding to.</div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => void runGrowthAction('refresh_research')} disabled={actionState.status === 'saving'} className="rounded-lg border border-cyan-500/20 bg-black/15 px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60">Refresh Research</button>
                {growth.draftCandidates.length ? (
                  <button onClick={() => void runGrowthAction('reset_to_research')} disabled={actionState.status === 'saving'} className="rounded-lg border border-amber-500/20 bg-black/15 px-3 py-2 text-xs font-medium text-amber-200 transition-smooth hover:bg-surface-2 disabled:opacity-60">Clear Drafts</button>
                ) : (
                  <button onClick={() => void runGrowthAction('generate_drafts')} disabled={actionState.status === 'saving'} className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 transition-smooth hover:bg-cyan-500/20 disabled:opacity-60">Generate Drafts</button>
                )}
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {actionState.message || 'The system should prefer credible reply and quote opportunities before generic originals on an early account.'}
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <DraftRecommendation title="Best for follower growth" description="Best candidate if the goal is reach and profile discovery." draft={bestForFollowerGrowth} />
            <DraftRecommendation title="Best for brand building" description="Best candidate if the goal is shaping the account voice and positioning." draft={bestForBrandBuilding} />
            <DraftRecommendation title="Best original post" description="Best standalone post if you do not want to reply or quote first." draft={bestOriginalPost} />
          </div>

          <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-3">
              <div className="rounded-lg border border-cyan-500/15 bg-black/15 px-3 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Growth strategy</div>
                <div className="mt-2 space-y-3 text-sm text-foreground">
                  {growth.strategy?.primaryGoal ? <div className="rounded-lg border border-cyan-500/10 bg-black/20 px-3 py-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Primary goal</div><div className="mt-1">{growth.strategy.primaryGoal}</div></div> : <div className="text-muted-foreground">No explicit growth strategy has been generated yet.</div>}
                  {growth.strategy?.followerGrowthLoop?.length ? <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Follower loop</div><div className="mt-1 space-y-1 text-xs text-foreground/85">{growth.strategy.followerGrowthLoop.map((item, index) => <div key={`loop-${index}`} className="flex gap-2"><span className="text-cyan-300">•</span><span>{item}</span></div>)}</div></div> : null}
                  {growth.strategy?.targetAccountStrategy?.length ? <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Target account rules</div><div className="mt-1 space-y-1 text-xs text-foreground/85">{growth.strategy.targetAccountStrategy.map((item, index) => <div key={`target-${index}`} className="flex gap-2"><span className="text-cyan-300">•</span><span>{item}</span></div>)}</div></div> : null}
                </div>
              </div>

              <div className="rounded-lg border border-cyan-500/15 bg-black/15 px-3 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top live targets</div>
                <div className="mt-2 space-y-2 text-sm text-foreground">
                  {[...growth.engagementTargets.replyTargets, ...growth.engagementTargets.quoteTargets].slice(0, 4).map((target, index) => (
                    <div key={`target-${index}`} className="rounded-lg border border-cyan-500/10 bg-black/20 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-foreground">{target.clusterLabel}</div>
                        {target.author ? <span className="text-[11px] text-muted-foreground">{target.author}</span> : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{target.why}</div>
                      <div className="mt-2 text-[11px] text-muted-foreground">{target.followers.toLocaleString()} followers • {target.likes} likes • {target.replies} replies</div>
                      {target.text ? <div className="mt-2 text-xs text-foreground/80">{target.text}</div> : null}
                      <a href={target.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-cyan-200 hover:text-cyan-100 text-xs">Open source post</a>
                    </div>
                  ))}
                  {!growth.engagementTargets.replyTargets.length && !growth.engagementTargets.quoteTargets.length ? <div className="text-muted-foreground">No credible live targets yet.</div> : null}
                </div>
              </div>

              <div className="rounded-lg border border-cyan-500/15 bg-black/15 px-3 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strategy memory</div>
                <div className="mt-2 space-y-2 text-sm text-foreground">
                  {growth.resultsSummary?.postedCount ? (
                    <>
                      <div className="text-xs text-muted-foreground">{growth.resultsSummary.postedCount} published post{growth.resultsSummary.postedCount === 1 ? '' : 's'} tracked</div>
                      {growth.resultsSummary.strategyNotes.map((note, index) => <div key={`note-${index}`} className="flex gap-2"><span className="text-primary">•</span><span>{note}</span></div>)}
                    </>
                  ) : (
                    <div className="text-muted-foreground">No published post results yet. The engine can learn from your editorial feedback now, and from real post outcomes once something is live.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-cyan-500/15 bg-black/15 px-3 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Draft candidates</div>
                <div className="mt-1 text-sm text-foreground">Review the exact post text here. Approval moves it to Ready to publish.</div>
                <div className="mt-3 space-y-3">
                  {growth.draftCandidates.length ? growth.draftCandidates.map((draft) => (
                    <div key={draft.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-medium text-foreground">{draft.pillar}: {draft.angle}</div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${draft.approval === 'approved' ? 'border-emerald-500/25 text-emerald-300' : draft.approval === 'rejected' ? 'border-rose-500/25 text-rose-300' : 'border-border/70 text-muted-foreground'}`}>{draft.approval}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {draft.distribution_type ? <span className="rounded-full border border-white/10 px-2 py-0.5">{draft.distribution_type}</span> : null}
                        {draft.source_type ? <span className="rounded-full border border-white/10 px-2 py-0.5">{draft.source_type}</span> : null}
                        {draft.cluster_id ? <span className="rounded-full border border-white/10 px-2 py-0.5">{draft.cluster_id}</span> : null}
                        {draft.brand_fit ? <span className="rounded-full border border-white/10 px-2 py-0.5">brand fit: {draft.brand_fit}</span> : null}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{draft.rationale}</div>
                      {draft.selection_reason ? <div className="mt-1 text-xs text-cyan-100/80">{draft.selection_reason}</div> : null}
                      {draft.why_now ? <div className="mt-1 text-xs text-cyan-100/80">Why now: {draft.why_now}</div> : null}
                      {draft.source_tweet?.url ? (
                        <div className="mt-2 rounded-lg border border-cyan-500/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
                          <div className="font-medium text-foreground">Source post</div>
                          {draft.source_tweet.text ? <div className="mt-1">{draft.source_tweet.text}</div> : null}
                          <a href={draft.source_tweet.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-cyan-200 hover:text-cyan-100">Open source post</a>
                        </div>
                      ) : null}
                      <div className="mt-3 rounded-lg border border-cyan-500/15 bg-[#0e1520] px-3 py-3 text-sm leading-6 text-foreground whitespace-pre-wrap">{draft.text}</div>
                      <div className="mt-3 space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Feedback for next pass</div>
                        <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-20" placeholder="Examples: too generic, weak source, better as a reply, stronger hook, too much product, not enough edge." value={feedbackDrafts[draft.id] || ''} onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [draft.id]: event.target.value }))} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => void runGrowthAction('approve_draft', draft.id)} disabled={actionState.status === 'saving' || draft.approval === 'approved'} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition-smooth hover:bg-emerald-500/20 disabled:opacity-60">Approve This Post</button>
                        <button onClick={() => void runGrowthAction('reject_draft', draft.id)} disabled={actionState.status === 'saving' || draft.approval === 'rejected'} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-smooth hover:bg-surface-2 disabled:opacity-60">Reject</button>
                        <button onClick={() => void runGrowthAction('archive_draft', draft.id)} disabled={actionState.status === 'saving' || draft.approval === 'archived'} className="rounded-lg border border-amber-500/20 px-3 py-2 text-xs font-medium text-amber-200 transition-smooth hover:bg-amber-500/10 disabled:opacity-60">Archive Angle</button>
                      </div>
                    </div>
                  )) : <div className="text-muted-foreground">Research is ready. Generate a fresh draft pack when you want candidates to review.</div>}
                </div>
              </div>

              <div className="rounded-lg border border-emerald-500/15 bg-black/15 px-3 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ready to publish</div>
                <div className="mt-1 text-sm text-foreground">These are the exact approved posts. Approval does not publish; it only marks them ready.</div>
                <div className="mt-3 space-y-3">
                  {growth.approvedPosts.length ? growth.approvedPosts.map((post) => (
                    <div key={post.id} className="rounded-lg border border-emerald-500/15 bg-[#0e1520] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-foreground">{post.pillar || 'Approved post'}{post.angle ? `: ${post.angle}` : ''}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{post.approvedAtPt ? `Approved ${post.approvedAtPt}` : 'Approved'}</div>
                        </div>
                        <span className="rounded-full border border-emerald-500/25 px-2 py-0.5 text-[11px] uppercase tracking-wide text-emerald-300">ready</span>
                      </div>
                      <div className="mt-3 rounded-lg border border-emerald-500/15 bg-black/20 px-3 py-3 text-sm leading-6 text-foreground whitespace-pre-wrap">{post.text}</div>
                    </div>
                  )) : <div className="text-muted-foreground">No approved posts yet.</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
