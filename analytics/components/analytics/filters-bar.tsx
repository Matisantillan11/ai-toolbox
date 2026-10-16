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
  client: string
  agentName: string
  intent: string
  onSearchChange: (value: string) => void
  onProjectChange: (value: string) => void
  onClientChange: (value: string) => void
  onAgentNameChange: (value: string) => void
  onIntentChange: (value: string) => void
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
  client,
  agentName,
  intent,
  onSearchChange,
  onProjectChange,
  onClientChange,
  onAgentNameChange,
  onIntentChange,
  onReset,
}: FiltersBarProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(0,1fr))_auto]">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search session, agent, model, description..."
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
        placeholder="Client"
        value={client}
        options={filters.clients}
        onChange={onClientChange}
      />
      <FilterSelect
        placeholder="Agent"
        value={agentName}
        options={filters.agentNames}
        onChange={onAgentNameChange}
      />
      <FilterSelect
        placeholder="Intent"
        value={intent}
        options={filters.intents}
        onChange={onIntentChange}
      />

      <Button variant="outline" className="h-10 rounded-xl" onClick={onReset}>
        <RotateCcw className="size-4" />
        Reset
      </Button>
    </div>
  )
}
