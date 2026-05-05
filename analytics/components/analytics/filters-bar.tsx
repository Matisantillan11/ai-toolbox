"use client"

import { RotateCcw, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AnalyticsFilters } from "@/lib/analytics"
import { formatLabel } from "@/lib/format"

type FiltersBarProps = {
  filters: AnalyticsFilters
  search: string
  project: string
  callerAgent: string
  invokedName: string
  invocationType: string
  actionClassification: string
  onSearchChange: (value: string) => void
  onProjectChange: (value: string) => void
  onCallerAgentChange: (value: string) => void
  onInvokedNameChange: (value: string) => void
  onInvocationTypeChange: (value: string) => void
  onActionClassificationChange: (value: string) => void
  onReset: () => void
}

type FilterSelectProps = {
  placeholder: string
  value: string
  options: string[]
  onChange: (value: string) => void
}

function FilterSelect({ placeholder, value, options, onChange }: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={(nextValue) => onChange(nextValue ?? "all")}>
      <SelectTrigger className="h-10 w-full rounded-xl bg-background px-3">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {formatLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function FiltersBar({
  filters,
  search,
  project,
  callerAgent,
  invokedName,
  invocationType,
  actionClassification,
  onSearchChange,
  onProjectChange,
  onCallerAgentChange,
  onInvokedNameChange,
  onInvocationTypeChange,
  onActionClassificationChange,
  onReset,
}: FiltersBarProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_repeat(5,minmax(0,1fr))_auto]">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search project, caller, invoked tool..."
          className="h-10 rounded-xl bg-background pl-9"
        />
      </div>

      <FilterSelect
        placeholder="Project"
        value={project}
        options={filters.projects}
        onChange={onProjectChange}
      />
      <FilterSelect
        placeholder="Caller"
        value={callerAgent}
        options={filters.callerAgents}
        onChange={onCallerAgentChange}
      />
      <FilterSelect
        placeholder="Used skill or agent"
        value={invokedName}
        options={filters.invokedNames}
        onChange={onInvokedNameChange}
      />
      <FilterSelect
        placeholder="Invocation type"
        value={invocationType}
        options={filters.invocationTypes}
        onChange={onInvocationTypeChange}
      />
      <FilterSelect
        placeholder="Action"
        value={actionClassification}
        options={filters.actionClassifications}
        onChange={onActionClassificationChange}
      />

      <Button variant="outline" className="h-10 rounded-xl" onClick={onReset}>
        <RotateCcw className="size-4" />
        Reset
      </Button>
    </div>
  )
}
