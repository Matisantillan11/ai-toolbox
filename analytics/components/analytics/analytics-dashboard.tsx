import { Activity, Database, Sparkles, Workflow } from "lucide-react"

import { ExecutionsTable } from "@/components/analytics/executions-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { AnalyticsDashboardData } from "@/lib/analytics"
import { formatCompactNumber } from "@/lib/format"

type AnalyticsDashboardProps = {
  data: AnalyticsDashboardData
}

const summaryCards = [
  {
    key: "totalExecutions",
    label: "Executions",
    description: "Tracked execution rows",
    icon: Activity,
  },
  {
    key: "totalCalls",
    label: "Calls",
    description: "Total invoked operations",
    icon: Workflow,
  },
  {
    key: "totalTokensSpent",
    label: "Tokens Spent",
    description: "Prompt and completion cost",
    icon: Sparkles,
  },
  {
    key: "uniqueProjects",
    label: "Projects",
    description: "Distinct repositories",
    icon: Database,
  },
] as const

export function AnalyticsDashboard({ data }: AnalyticsDashboardProps) {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-4 rounded-2xl border bg-background p-5 shadow-xs sm:p-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">Token spend dashboard</p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Visualize which agent or skill was used, by whom, and at what cost.
                </h1>
                <p className="text-sm text-muted-foreground sm:text-base">
                  This view is optimized for execution-level analytics: caller agent,
                  invoked skill or agent, action classification, project usage, call volume,
                  and tokens spent per run.
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
            const value = data.summary[card.key]

            return (
              <Card key={card.key}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1">
                    <CardDescription>{card.label}</CardDescription>
                    <CardTitle className="text-2xl font-semibold">
                      {formatCompactNumber(value)}
                    </CardTitle>
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

        <ExecutionsTable data={data} />
      </div>
    </main>
  )
}
