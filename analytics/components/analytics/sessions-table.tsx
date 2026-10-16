"use client"

import { Fragment, useMemo } from "react"

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import { FiltersBar } from "@/components/analytics/filters-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { UNTAGGED_INTENT } from "@/db/schema"
import type { AnalyticsDashboardData, SessionUsage, UsageRun } from "@/lib/analytics"
import { formatCompactNumber, formatDate, formatLabel, formatNumber, shortId } from "@/lib/format"
import { useAnalyticsTableStore } from "@/stores/analytics-table-store"

type SessionsTableProps = {
  data: AnalyticsDashboardData
}

type SortableColumn = "startedAt" | "project" | "totalInputTokens" | "outputTokens"

type SessionRow = SessionUsage & {
  /** Runs left after the agent and intent filters, in turn → sub-agent order. */
  visibleRuns: UsageRun[]
}

function SortButton({
  label,
  direction,
  onClick,
}: {
  label: string
  direction: false | "asc" | "desc"
  onClick: () => void
}) {
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown

  return (
    <Button className="-ml-2" variant="ghost" size="sm" onClick={onClick}>
      {label}
      <Icon className="size-3.5" />
    </Button>
  )
}

function IntentBadge({ intent }: { intent: string | null }) {
  return intent ? (
    <Badge variant="secondary">{formatLabel(intent)}</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Untagged
    </Badge>
  )
}

function SessionIntents({ session }: { session: SessionUsage }) {
  return (
    <div className="flex min-w-28 flex-wrap gap-1">
      {session.intentList.map((intent) => (
        <IntentBadge key={intent} intent={intent} />
      ))}
      {session.hasUntaggedRuns ? <IntentBadge intent={null} /> : null}
    </div>
  )
}

function InputBreakdown({
  usage,
}: {
  usage: Pick<UsageRun, "inputTokens" | "cacheReadTokens" | "cacheCreationTokens">
}) {
  return (
    <span className="text-xs text-muted-foreground">
      {formatCompactNumber(usage.inputTokens)} uncached · {formatCompactNumber(usage.cacheReadTokens)}{" "}
      read · {formatCompactNumber(usage.cacheCreationTokens)} write
    </span>
  )
}

const columns: ColumnDef<SessionRow>[] = [
  {
    id: "expand",
    header: () => <span className="sr-only">Toggle breakdown</span>,
    cell: () => null,
  },
  {
    id: "startedAt",
    accessorKey: "startedAt",
    header: ({ column }) => (
      <SortButton
        label="Started"
        direction={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      />
    ),
    cell: ({ row }) => (
      <div className="flex min-w-36 flex-col gap-1">
        <span className="text-sm">{formatDate(row.original.startedAt)}</span>
        <span className="font-mono text-xs text-muted-foreground" title={row.original.sessionId}>
          {shortId(row.original.sessionId)}
        </span>
      </div>
    ),
  },
  {
    id: "project",
    accessorKey: "project",
    header: ({ column }) => (
      <SortButton
        label="Project"
        direction={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      />
    ),
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        <span className="font-medium">{row.original.project}</span>
        <span className="text-xs text-muted-foreground">{row.original.client}</span>
      </div>
    ),
  },
  {
    id: "activity",
    header: "Activity",
    cell: ({ row }) => (
      <div className="flex min-w-24 flex-col gap-1 text-sm">
        <span>{formatNumber(row.original.turns)} turns</span>
        <span className="text-xs text-muted-foreground">
          {formatNumber(row.original.agentRuns)} sub-agent runs
        </span>
      </div>
    ),
  },
  {
    id: "totalInputTokens",
    accessorKey: "totalInputTokens",
    header: ({ column }) => (
      <SortButton
        label="Input (asked)"
        direction={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      />
    ),
    cell: ({ row }) => (
      <div className="flex min-w-44 flex-col gap-1">
        <span className="text-base font-semibold">
          {formatNumber(row.original.totalInputTokens)}
        </span>
        <InputBreakdown usage={row.original} />
      </div>
    ),
  },
  {
    id: "outputTokens",
    accessorKey: "outputTokens",
    header: ({ column }) => (
      <SortButton
        label="Output (generated)"
        direction={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      />
    ),
    cell: ({ row }) => (
      <span className="text-base font-semibold">{formatNumber(row.original.outputTokens)}</span>
    ),
  },
  {
    id: "intents",
    header: "Intent",
    cell: ({ row }) => <SessionIntents session={row.original} />,
  },
]

function compareSessions(left: SessionRow, right: SessionRow, columnId: SortableColumn, desc: boolean) {
  const direction = desc ? -1 : 1
  const leftValue = left[columnId]
  const rightValue = right[columnId]

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return (leftValue - rightValue) * direction
  }

  return String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * direction
}

function matchesRunFilters(run: UsageRun, agentName: string, intent: string) {
  if (agentName !== "all" && run.agentName !== agentName) {
    return false
  }

  if (intent === UNTAGGED_INTENT) {
    return run.intent === null
  }

  return intent === "all" || run.intent === intent
}

function matchesSearch(session: SessionUsage, query: string) {
  if (!query) {
    return true
  }

  const fields = [
    session.sessionId,
    session.project,
    session.client,
    ...session.runs.flatMap((run) => [
      run.agentName,
      run.description ?? "",
      run.model ?? "",
      run.gitBranch ?? "",
    ]),
  ]

  return fields.some((field) => field.toLowerCase().includes(query))
}

function RunLabel({ run }: { run: UsageRun }) {
  const isNested = run.kind === "agent" && run.parentRunId !== null

  return (
    <div className={isNested ? "flex min-w-48 flex-col gap-1 pl-5" : "flex min-w-48 flex-col gap-1"}>
      <div className="flex items-center gap-2">
        {isNested ? <span className="text-muted-foreground">↳</span> : null}
        <Badge variant={run.kind === "turn" ? "default" : "outline"}>
          {run.kind === "turn" ? "Turn" : "Sub-agent"}
        </Badge>
        <span className="font-medium">{run.agentName}</span>
      </div>
      {run.description ? (
        <span className="max-w-72 truncate text-xs text-muted-foreground" title={run.description}>
          {run.description}
        </span>
      ) : null}
    </div>
  )
}

function RunsBreakdown({ session }: { session: SessionRow }) {
  const runs = session.visibleRuns

  return (
    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">
        Showing {runs.length} of {session.runs.length} runs. Session totals above include every run.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Intent</TableHead>
            <TableHead className="text-right">Uncached</TableHead>
            <TableHead className="text-right">Cache read</TableHead>
            <TableHead className="text-right">Cache write</TableHead>
            <TableHead className="text-right">Total input</TableHead>
            <TableHead className="text-right">Output</TableHead>
            <TableHead className="text-right">API / tool calls</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.runId}>
              <TableCell>
                <RunLabel run={run} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(run.startedAt)}
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs" title={run.models.join(", ")}>
                  {run.model ?? "—"}
                </span>
                {run.models.length > 1 ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    +{run.models.length - 1}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <IntentBadge intent={run.intent} />
              </TableCell>
              <TableCell className="text-right">{formatNumber(run.inputTokens)}</TableCell>
              <TableCell className="text-right">{formatNumber(run.cacheReadTokens)}</TableCell>
              <TableCell className="text-right">{formatNumber(run.cacheCreationTokens)}</TableCell>
              <TableCell className="text-right font-medium">
                {formatNumber(run.totalInputTokens)}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatNumber(run.outputTokens)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatNumber(run.apiCalls)} / {formatNumber(run.toolCalls)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function MobileRun({ run }: { run: UsageRun }) {
  return (
    <div className="space-y-2 rounded-lg border bg-background p-3 text-sm">
      <RunLabel run={run} />
      <div className="flex flex-wrap items-center gap-2">
        <IntentBadge intent={run.intent} />
        <span className="font-mono text-xs text-muted-foreground">{run.model ?? "—"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Input</span>
        <span className="font-medium">{formatNumber(run.totalInputTokens)}</span>
      </div>
      <InputBreakdown usage={run} />
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Output</span>
        <span className="font-medium">{formatNumber(run.outputTokens)}</span>
      </div>
    </div>
  )
}

export function SessionsTable({ data }: SessionsTableProps) {
  const {
    agentName,
    client,
    expanded,
    intent,
    pageIndex,
    pageSize,
    project,
    search,
    setAgentName,
    setClient,
    setIntent,
    setPageIndex,
    setPageSize,
    setProject,
    setSearch,
    setSorting,
    sorting,
    toggleExpanded,
    resetFilters,
  } = useAnalyticsTableStore()

  const filteredRows = useMemo(() => {
    const query = search.toLowerCase().trim()
    const runFiltersActive = agentName !== "all" || intent !== "all"

    return data.sessions.flatMap<SessionRow>((session) => {
      if (project !== "all" && session.project !== project) {
        return []
      }

      if (client !== "all" && session.client !== client) {
        return []
      }

      if (!matchesSearch(session, query)) {
        return []
      }

      const visibleRuns = session.runs.filter((run) => matchesRunFilters(run, agentName, intent))

      if (runFiltersActive && visibleRuns.length === 0) {
        return []
      }

      return [{ ...session, visibleRuns }]
    })
  }, [agentName, client, data.sessions, intent, project, search])

  const sortedRows = useMemo(() => {
    const [activeSort] = sorting

    if (!activeSort) {
      return filteredRows
    }

    return [...filteredRows].sort((left, right) =>
      compareSessions(left, right, activeSort.id as SortableColumn, activeSort.desc)
    )
  }, [filteredRows, sorting])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const currentPageIndex = Math.min(pageIndex, pageCount - 1)

  const pagedRows = useMemo(() => {
    const start = currentPageIndex * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [currentPageIndex, pageSize, sortedRows])

  // TanStack Table is only used as a rendering layer here to keep client state predictable.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: pagedRows,
    columns,
    getRowId: (row) => row.key,
    state: {
      sorting,
    },
    onSortingChange: (updater) => {
      const nextSorting = typeof updater === "function" ? updater(sorting) : updater
      setSorting(nextSorting)
    },
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  })

  const rows = table.getRowModel().rows

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          Input is everything sent to the model (uncached + cache read + cache write); output is
          what the model generated. Expand a session to see each turn and the sub-agent runs it
          spawned.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FiltersBar
          filters={data.filters}
          search={search}
          project={project}
          client={client}
          agentName={agentName}
          intent={intent}
          onSearchChange={setSearch}
          onProjectChange={setProject}
          onClientChange={setClient}
          onAgentNameChange={setAgentName}
          onIntentChange={setIntent}
          onReset={resetFilters}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {rows.length} of {sortedRows.length} filtered sessions.
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <div className="flex gap-1">
              {[10, 20, 50].map((size) => (
                <Button
                  key={size}
                  size="sm"
                  variant={pageSize === size ? "secondary" : "outline"}
                  onClick={() => setPageSize(size)}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => {
                  const isExpanded = Boolean(expanded[row.id])

                  return (
                    <Fragment key={row.id}>
                      <TableRow data-state={isExpanded ? "selected" : undefined}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {cell.column.id === "expand" ? (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? "Hide runs" : "Show runs"}
                                onClick={() => toggleExpanded(row.id)}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </Button>
                            ) : (
                              flexRender(cell.column.columnDef.cell, cell.getContext())
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      {isExpanded ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={columns.length} className="p-2">
                            <RunsBreakdown session={row.original} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    No sessions match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 md:hidden">
          {rows.length ? (
            rows.map((row) => {
              const session = row.original
              const isExpanded = Boolean(expanded[row.id])

              return (
                <div key={row.id} className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium">{session.project}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(session.startedAt)} · {session.client}
                      </p>
                    </div>
                    <SessionIntents session={session} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Input (asked)</p>
                      <p className="text-lg font-semibold">
                        {formatNumber(session.totalInputTokens)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Output (generated)</p>
                      <p className="text-lg font-semibold">{formatNumber(session.outputTokens)}</p>
                    </div>
                    <div className="col-span-2">
                      <InputBreakdown usage={session} />
                    </div>
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {formatNumber(session.turns)} turns · {formatNumber(session.agentRuns)}{" "}
                        sub-agent runs
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpanded(row.id)}
                      >
                        {isExpanded ? "Hide runs" : "Show runs"}
                      </Button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-3 grid gap-2">
                      {session.visibleRuns.map((run) => (
                        <MobileRun key={run.runId} run={run} />
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No sessions match the current filters.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPageIndex + 1} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPageIndex(Math.max(0, currentPageIndex - 1))}
              disabled={currentPageIndex === 0}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPageIndex(Math.min(pageCount - 1, currentPageIndex + 1))}
              disabled={currentPageIndex >= pageCount - 1}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
