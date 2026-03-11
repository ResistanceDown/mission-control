'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMissionControl } from '@/store'
import { createClientLogger } from '@/lib/client-logger'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'
import { ChartFrame } from '@/components/ui/chart-frame'

const log = createClientLogger('TokenDashboard')

interface UsageStats {
  summary: {
    totalTokens: number
    totalCost: number
    requestCount: number
    avgTokensPerRequest: number
    avgCostPerRequest: number
  }
  models: Record<string, { totalTokens: number; totalCost: number; requestCount: number }>
  sessions: Record<string, { totalTokens: number; totalCost: number; requestCount: number }>
  timeframe: string
  recordCount: number
}

interface TrendData {
  trends: Array<{ timestamp: string; tokens: number; cost: number; requests: number }>
  timeframe: string
}

interface TaskCostEntry {
  taskId: number
  title: string
  assignedTo?: string | null
  stats: {
    totalTokens: number
    totalCost: number
    requestCount: number
  }
}

interface TaskCostsResponse {
  summary: {
    totalTokens: number
    totalCost: number
    requestCount: number
  }
  unattributed: {
    totalTokens: number
    totalCost: number
    requestCount: number
  }
  tasks: TaskCostEntry[]
  attributionRate: number
  actionableAttributionRate: number
  attributedRecordCount: number
  backgroundRecordCount: number
  unattributedRecordCount: number
  backgroundAgents: Array<{ agent: string; cost: number; requests: number; tokens: number }>
  topUnattributedAgents: Array<{ agent: string; cost: number; requests: number; tokens: number }>
}

export function TokenDashboardPanel() {
  const { sessions } = useMissionControl()

  const [selectedTimeframe, setSelectedTimeframe] = useState<'hour' | 'day' | 'week' | 'month'>('day')
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [trendData, setTrendData] = useState<TrendData | null>(null)
  const [taskCosts, setTaskCosts] = useState<TaskCostsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const loadUsageStats = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/tokens?action=stats&timeframe=${selectedTimeframe}`)
      const data = await response.json()
      setUsageStats(data)
    } catch (error) {
      log.error('Failed to load usage stats:', error)
    } finally {
      setIsLoading(false)
    }
  }, [selectedTimeframe])

  const loadTrendData = useCallback(async () => {
    try {
      const response = await fetch(`/api/tokens?action=trends&timeframe=${selectedTimeframe}`)
      const data = await response.json()
      setTrendData(data)
    } catch (error) {
      log.error('Failed to load trend data:', error)
    }
  }, [selectedTimeframe])

  const loadTaskCosts = useCallback(async () => {
    try {
      const response = await fetch(`/api/tokens?action=task-costs&timeframe=${selectedTimeframe}`)
      const data = await response.json()
      setTaskCosts(data)
    } catch (error) {
      log.error('Failed to load task cost data:', error)
    }
  }, [selectedTimeframe])

  useEffect(() => {
    loadUsageStats()
    loadTrendData()
    loadTaskCosts()
  }, [loadUsageStats, loadTrendData, loadTaskCosts])

  const exportData = async (format: 'json' | 'csv') => {
    setIsExporting(true)
    try {
      const response = await fetch(`/api/tokens?action=export&timeframe=${selectedTimeframe}&format=${format}`)
      
      if (!response.ok) {
        throw new Error('Export failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = `token-usage-${selectedTimeframe}-${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      log.error('Export failed:', error)
      alert('Export failed: ' + error)
    } finally {
      setIsExporting(false)
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
  }

  const formatCost = (cost: number) => {
    return '$' + cost.toFixed(4)
  }

  const getModelDisplayName = (modelName: string) => {
    const parts = modelName.split('/')
    return parts[parts.length - 1] || modelName
  }

  const prepareModelChartData = () => {
    if (!usageStats?.models) return []
    return Object.entries(usageStats.models)
      .map(([model, stats]) => ({
        name: getModelDisplayName(model),
        tokens: stats.totalTokens,
        cost: stats.totalCost,
        requests: stats.requestCount
      }))
      .sort((a, b) => b.cost - a.cost)
  }

  const preparePieChartData = () => {
    if (!usageStats?.models) return []
    const data = Object.entries(usageStats.models)
      .map(([model, stats]) => ({
        name: getModelDisplayName(model),
        value: stats.totalCost,
        tokens: stats.totalTokens
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6) // Top 6 models
    
    return data
  }

  const prepareTrendChartData = () => {
    if (!trendData?.trends) return []
    return trendData.trends.map(trend => ({
      time: new Date(trend.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tokens: trend.tokens,
      cost: trend.cost,
      requests: trend.requests
    }))
  }

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d']

  // Enhanced performance metrics
  const getPerformanceMetrics = () => {
    if (!usageStats?.models) return null

    const models = Object.entries(usageStats.models)
    if (models.length === 0) return null

    // Find most cost-effective model (lowest cost per token)
    let mostEfficient = { model: models[0][0], stats: models[0][1] }
    for (const [model, stats] of models) {
      const costPerToken = stats.totalCost / Math.max(1, stats.totalTokens)
      const bestCostPerToken = mostEfficient.stats.totalCost / Math.max(1, mostEfficient.stats.totalTokens)
      if (costPerToken < bestCostPerToken) {
        mostEfficient = { model, stats }
      }
    }

    // Find most used model
    let mostUsed = { model: models[0][0], stats: models[0][1] }
    for (const [model, stats] of models) {
      if (stats.requestCount > mostUsed.stats.requestCount) {
        mostUsed = { model, stats }
      }
    }

    // Find most expensive model
    let mostExpensive = { model: models[0][0], stats: models[0][1] }
    for (const [model, stats] of models) {
      const costPerToken = stats.totalCost / Math.max(1, stats.totalTokens)
      const bestCostPerToken = mostExpensive.stats.totalCost / Math.max(1, mostExpensive.stats.totalTokens)
      if (costPerToken > bestCostPerToken) {
        mostExpensive = { model, stats }
      }
    }

    // Calculate potential savings
    const totalTokens = usageStats.summary.totalTokens
    const currentCost = usageStats.summary.totalCost
    const efficientCostPerToken = mostEfficient.stats.totalCost / Math.max(1, mostEfficient.stats.totalTokens)
    const potentialCost = totalTokens * efficientCostPerToken
    const potentialSavings = Math.max(0, currentCost - potentialCost)

    return {
      mostEfficient,
      mostUsed,
      mostExpensive,
      potentialSavings,
      savingsPercentage: currentCost > 0 ? (potentialSavings / currentCost) * 100 : 0
    }
  }

  const performanceMetrics = getPerformanceMetrics()

  // Alert conditions
  const getAlerts = () => {
    const alerts = []
    
    if (usageStats && usageStats.summary.totalCost !== undefined && usageStats.summary.totalCost > 100) {
      alerts.push({
        type: 'warning',
        title: 'High Usage Cost',
        message: `Total cost of ${formatCost(usageStats.summary.totalCost)} exceeds $100 threshold`,
        suggestion: 'Consider using more cost-effective models for routine tasks'
      })
    }

    if (performanceMetrics && performanceMetrics.savingsPercentage !== undefined && performanceMetrics.savingsPercentage > 20) {
      alerts.push({
        type: 'info',
        title: 'Optimization Opportunity',
        message: `Using ${getModelDisplayName(performanceMetrics.mostEfficient.model)} could save ${formatCost(performanceMetrics.potentialSavings)} (${performanceMetrics.savingsPercentage.toFixed(1)}%)`,
        suggestion: 'Consider switching routine tasks to more efficient models'
      })
    }

    if (usageStats && usageStats.summary.requestCount !== undefined && usageStats.summary.requestCount > 1000) {
      alerts.push({
        type: 'info',
        title: 'High Request Volume',
        message: `${usageStats.summary.requestCount} requests in selected timeframe`,
        suggestion: 'Consider implementing request batching or caching for efficiency'
      })
    }

    return alerts
  }

  const alerts = getAlerts()
  const attributionAlert = taskCosts
    ? taskCosts.topUnattributedAgents.length > 0
      ? `Most actionable unattributed spend is coming from ${taskCosts.topUnattributedAgents[0].agent}. Attach task IDs there first.`
      : taskCosts.actionableAttributionRate < 0.9
        ? 'Some task-related spend is still unattributed. Review agent/session flows that write usage without a task ID.'
        : 'Task attribution coverage is healthy.'
    : null
  const worstUnattributedAgent = taskCosts?.topUnattributedAgents?.[0] || null
  const attributionChecklist = taskCosts
    ? [
        worstUnattributedAgent
          ? `Patch ${worstUnattributedAgent.agent} to emit task_id on token usage writes first.`
          : null,
        taskCosts.topUnattributedAgents.length > 0
          ? 'Check agent/session flows that should attach task_id but are still writing bare usage records.'
          : null,
        taskCosts.actionableAttributionRate < 0.9
          ? 'Verify task creation, assignment, and completion paths all preserve task_id through agent execution.'
          : null,
      ].filter(Boolean) as string[]
    : []

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Token & Cost Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Monitor token usage and costs across models and sessions
            </p>
          </div>
          <div className="flex space-x-2">
            {(['hour', 'day', 'week', 'month'] as const).map((timeframe) => (
              <button
                key={timeframe}
                onClick={() => setSelectedTimeframe(timeframe)}
                className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${
                  selectedTimeframe === timeframe
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                }`}
              >
                {timeframe.charAt(0).toUpperCase() + timeframe.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-3 text-muted-foreground">Loading usage data...</span>
        </div>
      ) : usageStats ? (
        <div className="space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="min-w-0 bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-foreground">
                {formatNumber(usageStats.summary.totalTokens)}
              </div>
              <div className="text-sm text-muted-foreground">
                Total Tokens ({selectedTimeframe})
              </div>
            </div>

            <div className="min-w-0 bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-foreground">
                {formatCost(usageStats.summary.totalCost)}
              </div>
              <div className="text-sm text-muted-foreground">
                Total Cost ({selectedTimeframe})
              </div>
            </div>

            <div className="min-w-0 bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-foreground">
                {formatNumber(usageStats.summary.requestCount)}
              </div>
              <div className="text-sm text-muted-foreground">
                API Requests
              </div>
            </div>

            <div className="min-w-0 bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-foreground">
                {formatNumber(usageStats.summary.avgTokensPerRequest)}
              </div>
              <div className="text-sm text-muted-foreground">
                Avg Tokens/Request
              </div>
            </div>
          </div>

          {taskCosts && (
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
              <div className="min-w-0 bg-card border border-border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">Task Attribution Health</h2>
                    <p className="text-sm text-muted-foreground">How much token usage is attached to real Habi work.</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-foreground">{(taskCosts.actionableAttributionRate * 100).toFixed(0)}%</div>
                    <div className="text-xs text-muted-foreground">Actionable attribution</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-border bg-secondary/30 p-4">
                    <div className="text-lg font-semibold text-foreground">{formatCost(taskCosts.summary.totalCost)}</div>
                    <div className="text-xs text-muted-foreground">Task-attributed spend</div>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/30 p-4">
                    <div className="text-lg font-semibold text-foreground">{formatCost(taskCosts.unattributed.totalCost)}</div>
                    <div className="text-xs text-muted-foreground">Actionable unattributed spend</div>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/30 p-4">
                    <div className="text-lg font-semibold text-foreground">{formatNumber(taskCosts.unattributed.requestCount)}</div>
                    <div className="text-xs text-muted-foreground">Actionable unattributed requests</div>
                  </div>
                </div>
              </div>

              <div className="min-w-0 bg-card border border-border rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Top Unattributed Agents</h2>
                <div className="space-y-3">
                  {taskCosts.topUnattributedAgents.length === 0 ? (
                    <div className="text-sm text-muted-foreground">All current usage is attributed to tasks.</div>
                  ) : (
                    taskCosts.topUnattributedAgents.slice(0, 5).map((entry) => (
                      <div key={entry.agent} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/20 px-3 py-2">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{entry.agent}</div>
                          <div className="text-xs text-muted-foreground">{formatNumber(entry.requests)} requests · {formatNumber(entry.tokens)} tokens</div>
                        </div>
                        <div className="text-sm font-medium text-foreground">{formatCost(entry.cost)}</div>
                      </div>
                    ))
                  )}
                </div>
                {attributionAlert && (
                  <div className="mt-4 rounded-lg border border-dashed border-border bg-secondary/10 px-3 py-3 text-xs text-muted-foreground">
                    {attributionAlert}
                  </div>
                )}
                {attributionChecklist.length > 0 && (
                  <div className="mt-4 rounded-lg border border-border bg-secondary/20 p-4">
                    <h3 className="text-sm font-semibold text-foreground">Remediation</h3>
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {attributionChecklist.map((item) => (
                        <div key={item} className="flex gap-2">
                          <span className="text-foreground">•</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {taskCosts.backgroundAgents.length > 0 && (
                  <div className="mt-4 rounded-lg border border-border bg-secondary/10 p-4">
                    <h3 className="text-sm font-semibold text-foreground">Background system spend</h3>
                    <div className="mt-3 space-y-2">
                      {taskCosts.backgroundAgents.slice(0, 3).map((entry) => (
                        <div key={entry.agent} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{entry.agent}</span>
                          <span>{formatCost(entry.cost)} · {formatNumber(entry.requests)} requests</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">These agents run system/background work and are tracked separately from task attribution.</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Charts Section */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Usage Trends Chart */}
            <div className="bg-card border border-border rounded-lg p-6 lg:col-span-2">
              <h2 className="text-xl font-semibold mb-4">Usage Trends (Last 24h)</h2>
              <ChartFrame className="h-64 min-w-0 w-full">
                {(size) => prepareTrendChartData().length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No trend data for this timeframe</div>
                ) : (
                  <LineChart width={size.width} height={size.height} data={prepareTrendChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="tokens" 
                      stroke="#8884d8" 
                      strokeWidth={2} 
                      name="Tokens"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="requests" 
                      stroke="#82ca9d" 
                      strokeWidth={2} 
                      name="Requests"
                    />
                  </LineChart>
                )}
              </ChartFrame>
            </div>

            {/* Model Usage Bar Chart */}
            <div className="min-w-0 bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Token Usage by Model</h2>
              <ChartFrame className="h-64 min-w-0 w-full">
                {(size) => prepareModelChartData().length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No model usage data yet</div>
                ) : (
                  <BarChart width={size.width} height={size.height} data={prepareModelChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={80}
                      interval={0}
                    />
                    <YAxis />
                    <Tooltip formatter={(value, name) => [formatNumber(Number(value)), name]} />
                    <Bar dataKey="tokens" fill="#8884d8" name="Tokens" />
                  </BarChart>
                )}
              </ChartFrame>
            </div>

            {/* Cost Distribution Pie Chart */}
            <div className="min-w-0 bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Cost Distribution by Model</h2>
              <ChartFrame className="h-64 min-w-0 w-full">
                {(size) => preparePieChartData().length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No cost data yet</div>
                ) : (
                  <PieChart width={size.width} height={size.height}>
                    <Pie
                      data={preparePieChartData()}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {preparePieChartData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCost(Number(value))} />
                    <Legend />
                  </PieChart>
                )}
              </ChartFrame>
            </div>
          </div>

          {/* Export Section */}
          <div className="min-w-0 bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Export Data</h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => exportData('csv')}
                  disabled={isExporting}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/30 disabled:opacity-50 transition-smooth"
                >
                  {isExporting ? 'Exporting...' : 'Export CSV'}
                </button>
                <button
                  onClick={() => exportData('json')}
                  disabled={isExporting}
                  className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-md hover:bg-green-500/30 disabled:opacity-50 transition-smooth"
                >
                  {isExporting ? 'Exporting...' : 'Export JSON'}
                </button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Export token usage data for analysis. Includes detailed usage records, model statistics, and cost breakdowns.
            </p>
          </div>

          {taskCosts && (
            <div className="min-w-0 bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold">Top Costly Tasks</h2>
                  <p className="text-sm text-muted-foreground">Highest spend tasks in the selected timeframe.</p>
                </div>
              </div>
              <div className="space-y-3">
                {taskCosts.tasks.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No task-attributed token usage yet.</div>
                ) : (
                  taskCosts.tasks.slice(0, 8).map((task) => (
                    <div key={task.taskId} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/20 px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{task.title}</div>
                        <div className="text-xs text-muted-foreground">
                          Task #{task.taskId}{task.assignedTo ? ` · ${task.assignedTo}` : ''} · {formatNumber(task.stats.requestCount)} requests
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-foreground">{formatCost(task.stats.totalCost)}</div>
                        <div className="text-xs text-muted-foreground">{formatNumber(task.stats.totalTokens)} tokens</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Performance Insights */}
          {performanceMetrics && (
            <div className="min-w-0 bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Performance Insights</h2>
              
              {/* Alerts */}
              {alerts.length > 0 && (
                <div className="mb-6 space-y-3">
                  {alerts.map((alert, index) => (
                    <div
                      key={index}
                      className={`border-l-4 p-4 rounded ${
                        alert.type === 'warning' 
                          ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' 
                          : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      }`}
                    >
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          {alert.type === 'warning' ? '⚠️' : 'ℹ️'}
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium">{alert.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">{alert.suggestion}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Performance Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-secondary rounded-lg p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Most Efficient Model</h3>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {getModelDisplayName(performanceMetrics.mostEfficient.model)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ${(performanceMetrics.mostEfficient.stats.totalCost / Math.max(1, performanceMetrics.mostEfficient.stats.totalTokens) * 1000).toFixed(4)}/1K tokens
                  </div>
                </div>

                <div className="bg-secondary rounded-lg p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Most Used Model</h3>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {getModelDisplayName(performanceMetrics.mostUsed.model)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {performanceMetrics.mostUsed.stats.requestCount} requests
                  </div>
                </div>

                <div className="bg-secondary rounded-lg p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Optimization Potential</h3>
                  <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    {formatCost(performanceMetrics.potentialSavings)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {performanceMetrics.savingsPercentage.toFixed(1)}% savings possible
                  </div>
                </div>
              </div>

              {/* Model Efficiency Comparison */}
              <div className="mt-4">
                <h3 className="text-sm font-medium mb-3">Model Efficiency Comparison</h3>
                <div className="space-y-2">
                  {Object.entries(usageStats?.models || {})
                    .map(([model, stats]) => {
                      const costPerToken = stats.totalCost / Math.max(1, stats.totalTokens) * 1000
                      const efficiency = 1 / costPerToken // Higher is better
                      const maxEfficiency = Math.max(...Object.values(usageStats?.models || {}).map(s => 1 / (s.totalCost / Math.max(1, s.totalTokens) * 1000)))
                      const barWidth = (efficiency / maxEfficiency) * 100

                      return (
                        <div key={model} className="flex items-center text-sm">
                          <div className="w-32 truncate text-muted-foreground">
                            {getModelDisplayName(model)}
                          </div>
                          <div className="flex-1 mx-3">
                            <div className="w-full bg-secondary rounded-full h-2">
                              <div
                                className="bg-green-500 h-2 rounded-full"
                                style={{ width: `${barWidth}%` }}
                              ></div>
                            </div>
                          </div>
                          <div className="w-20 text-right text-xs text-muted-foreground">
                            ${costPerToken.toFixed(4)}/1K
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Detailed Statistics */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Model Statistics */}
            <div className="min-w-0 bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Model Performance</h2>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {Object.entries(usageStats.models)
                  .sort(([,a], [,b]) => b.totalCost - a.totalCost)
                  .map(([model, stats]) => {
                    const avgCostPerRequest = stats.totalCost / Math.max(1, stats.requestCount)
                    const avgTokensPerRequest = stats.totalTokens / Math.max(1, stats.requestCount)
                    
                    return (
                      <div key={model} className="p-3 bg-secondary rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium text-foreground">
                            {getModelDisplayName(model)}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-foreground">
                              {formatCost(stats.totalCost)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatNumber(stats.totalTokens)} tokens
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                          <div>
                            <div className="font-medium">{stats.requestCount}</div>
                            <div>Requests</div>
                          </div>
                          <div>
                            <div className="font-medium">{formatCost(avgCostPerRequest)}</div>
                            <div>Avg Cost</div>
                          </div>
                          <div>
                            <div className="font-medium">{formatNumber(avgTokensPerRequest)}</div>
                            <div>Avg Tokens</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Session Statistics */}
            <div className="min-w-0 bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Top Sessions by Cost</h2>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {Object.entries(usageStats.sessions)
                  .sort(([,a], [,b]) => b.totalCost - a.totalCost)
                  .slice(0, 10)
                  .map(([sessionId, stats]) => {
                    const sessionInfo = sessions.find(s => s.id === sessionId)
                    const avgCostPerRequest = stats.totalCost / Math.max(1, stats.requestCount)
                    
                    return (
                      <div key={sessionId} className="p-3 bg-secondary rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="font-medium text-foreground">
                              {sessionInfo?.key || sessionId}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {sessionInfo?.active ? 'Active' : 'Inactive'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-foreground">
                              {formatCost(stats.totalCost)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatNumber(stats.totalTokens)} tokens
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                          <div>
                            <div className="font-medium">{stats.requestCount}</div>
                            <div>Requests</div>
                          </div>
                          <div>
                            <div className="font-medium">{formatCost(avgCostPerRequest)}</div>
                            <div>Avg Cost</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-12">
          <div className="text-lg mb-2">No usage data available</div>
          <div className="text-sm">Token usage will appear here once agents start running</div>
          <button 
            onClick={loadUsageStats}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}
