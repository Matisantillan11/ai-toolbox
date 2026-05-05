"use client"

import { useMemo } from "react"

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"

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
import type { AnalyticsDashboardData } from "@/lib/analytics"
import { formatDate, formatLabel, formatNumber } from "@/lib/format"
import { useAnalyticsTableStore } from "@/stores/analytics-table-store"

type ExecutionsTableProps = {
  data: AnalyticsDashboardData
}

type ExecutionRow = AnalyticsDashboardData["executions"][number]

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

const columns: ColumnDef<ExecutionRow>[] = [
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: ({ column }) => (
      <SortButton
        label="Date"
        direction={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-36 text-sm text-muted-foreground">
        {formatDate(row.original.createdAt)}
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
    cell: ({ row }) => <span className="font-medium">{row.original.project}</span>,
  },
  {
    id: "callerAgent",
    accessorKey: "callerAgent",
    header: "Caller",
    cell: ({ row }) => <Badge variant="outline">{formatLabel(row.original.callerAgent)}</Badge>,
  },
  {
    id: "invokedName",
    accessorKey: "invokedName",
    header: "Used Skill / Agent",
    cell: ({ row }) => (
      <div className="flex min-w-44 flex-col gap-1">
        <span className="font-medium">{row.original.invokedName}</span>
        <span className="text-xs text-muted-foreground">
          {formatLabel(row.original.invocationType)}
        </span>
      </div>
    ),
  },
  {
    id: "invocationType",
    accessorKey: "invocationType",
    header: "Type",
    cell: ({ row }) => formatLabel(row.original.invocationType),
  },
  {
    id: "actionClassification",
    accessorKey: "actionClassification",
    header: "Action",
    cell: ({ row }) => (
      <Badge variant="secondary">{formatLabel(row.original.actionClassification)}</Badge>
    ),
  },
  {
    id: "callCount",
    accessorKey: "callCount",
    header: ({ column }) => (
      <SortButton
        label="Calls"
        direction={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      />
    ),
    cell: ({ row }) => formatNumber(row.original.callCount),
  },
  {
    id: "tokensSpent",
    accessorKey: "tokensSpent",
    header: ({ column }) => (
      <SortButton
        label="Tokens"
        direction={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      />
    ),
    cell: ({ row }) => <span className="font-medium">{formatNumber(row.original.tokensSpent)}</span>,
  },
]

function compareRows(left: ExecutionRow, right: ExecutionRow, columnId: keyof ExecutionRow, desc: boolean) {
  const direction = desc ? -1 : 1
  const leftValue = left[columnId]
  const rightValue = right[columnId]

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return (leftValue - rightValue) * direction
  }

  return String(leftValue).localeCompare(String(rightValue)) * direction
}

export function ExecutionsTable({ data }: ExecutionsTableProps) {
  const {
    actionClassification,
    callerAgent,
    invokedName,
    invocationType,
    pageIndex,
    pageSize,
    project,
    search,
    setActionClassification,
    setCallerAgent,
    setInvokedName,
    setInvocationType,
    setPageIndex,
    setPageSize,
    setProject,
    setSearch,
    setSorting,
    sorting,
    resetFilters,
  } = useAnalyticsTableStore()

  const filteredRows = useMemo(() => {
    const query = search.toLowerCase().trim()

    return data.executions.filter((execution) => {
      if (project !== "all" && execution.project !== project) {
        return false
      }

      if (callerAgent !== "all" && execution.callerAgent !== callerAgent) {
        return false
      }

      if (invokedName !== "all" && execution.invokedName !== invokedName) {
        return false
      }

      if (invocationType !== "all" && execution.invocationType !== invocationType) {
        return false
      }

      if (
        actionClassification !== "all" &&
        execution.actionClassification !== actionClassification
      ) {
        return false
      }

      if (!query) {
        return true
      }

      return [
        execution.project,
        execution.callerAgent,
        execution.invokedName,
        execution.invocationType,
        execution.actionClassification,
        execution.runId,
      ].some((field) => field.toLowerCase().includes(query))
    })
  }, [
    actionClassification,
    callerAgent,
    data.executions,
    invocationType,
    invokedName,
    project,
    search,
  ])

  const sortedRows = useMemo(() => {
    const [activeSort] = sorting

    if (!activeSort) {
      return filteredRows
    }

    return [...filteredRows].sort((left, right) => {
      return compareRows(left, right, activeSort.id as keyof ExecutionRow, activeSort.desc)
    })
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
    state: {
      sorting,
      columnVisibility: {
        invocationType: false,
      },
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
        <CardTitle>Execution analytics</CardTitle>
        <CardDescription>
          Filter and sort local SQLite executions by project, caller, invoked skill or
          agent, action classification, calls, and token spend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FiltersBar
          filters={data.filters}
          search={search}
          project={project}
          callerAgent={callerAgent}
          invokedName={invokedName}
          invocationType={invocationType}
          actionClassification={actionClassification}
          onSearchChange={setSearch}
          onProjectChange={setProject}
          onCallerAgentChange={setCallerAgent}
          onInvokedNameChange={setInvokedName}
          onInvocationTypeChange={setInvocationType}
          onActionClassificationChange={setActionClassification}
          onReset={resetFilters}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {rows.length} of {sortedRows.length} filtered executions.
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
                rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    No executions match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 md:hidden">
          {rows.length ? (
            rows.map((row) => (
              <div key={row.id} className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">{row.original.project}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(row.original.createdAt)}
                    </p>
                  </div>
                  <Badge variant="outline">{formatLabel(row.original.callerAgent)}</Badge>
                </div>

                <div className="mt-4 grid gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Used</p>
                    <p className="font-medium">{row.original.invokedName}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {formatLabel(row.original.actionClassification)}
                    </Badge>
                    <Badge variant="outline">{formatLabel(row.original.invocationType)}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Calls</span>
                    <span className="font-medium">{formatNumber(row.original.callCount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tokens spent</span>
                    <span className="font-medium">{formatNumber(row.original.tokensSpent)}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No executions match the current filters.
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
