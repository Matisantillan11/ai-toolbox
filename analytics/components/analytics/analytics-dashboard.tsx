import { ArrowDownToLine, ArrowUpFromLine, MessagesSquare, Workflow } from "lucide-react"

import { SessionsTable } from "@/components/analytics/sessions-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { AnalyticsDashboardData } from "@/lib/analytics"
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/format"

type AnalyticsDashboardProps = {
  data: AnalyticsDashboardData
}

export function AnalyticsDashboard({ data }: AnalyticsDashboardProps) {
  const { summary } = data
  const summaryCards = [
    {
      key: "input",
      label: "Input tokens (asked)",
      value: formatCompactNumber(summary.totalInputTokens),
      description: `${formatCompactNumber(summary.inputTokens)} uncached · ${formatCompactNumber(summary.cacheReadTokens)} cache read (${formatPercent(summary.cacheReadTokens, summary.totalInputTokens)}) · ${formatCompactNumber(summary.cacheCreationTokens)} cache write`,
      icon: ArrowUpFromLine,
    },
    {
      key: "output",
      label: "Output tokens (generated)",
      value: formatCompactNumber(summary.outputTokens),
      description: "Tokens the model generated across all sessions",
      icon: ArrowDownToLine,
    },
    {
      key: "sessions",
      label: "Sessions",
      value: formatNumber(summary.sessions),
      description: `${formatNumber(summary.turns)} turns in total`,
      icon: MessagesSquare,
    },
    {
      key: "agentRuns",
      label: "Sub-agent runs",
      value: formatNumber(summary.agentRuns),
      description: "Agents spawned by turns",
      icon: Workflow,
    },
  ]

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-4 rounded-2xl border bg-background p-5 shadow-xs sm:p-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">Token spend dashboard</p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  How much we ask, and how much the AI generates, per session.
                </h1>
                <p className="text-sm text-muted-foreground sm:text-base">
                  Real token usage collected from session transcripts. Input covers every
                  token sent to the model, split into uncached, cache read and cache write;
                  output is what the model generated. Each session breaks down into its turns
                  and the sub-agent runs they spawned.
                </p>
              </div>
              <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">SQLite:</span> {data.dbPath}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon

            return (
              <Card key={card.key}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1">
                    <CardDescription>{card.label}</CardDescription>
                    <CardTitle className="text-2xl font-semibold">{card.value}</CardTitle>
                  </div>
                  <div className="rounded-lg border bg-muted/60 p-2 text-muted-foreground">
                    <Icon className="size-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                </CardContent>
              </Card>
            )
          })}
        </section>

        <SessionsTable data={data} />
      </div>
    </main>
  )
}
