"use client"

import { create } from "zustand"

import type { SortingState } from "@tanstack/react-table"

type AnalyticsTableState = {
  search: string
  project: string
  client: string
  agentName: string
  intent: string
  pageIndex: number
  pageSize: number
  sorting: SortingState
  expanded: Record<string, boolean>
  setSearch: (value: string) => void
  setProject: (value: string) => void
  setClient: (value: string) => void
  setAgentName: (value: string) => void
  setIntent: (value: string) => void
  setPageIndex: (value: number) => void
  setPageSize: (value: number) => void
  setSorting: (value: SortingState) => void
  toggleExpanded: (sessionKey: string) => void
  resetFilters: () => void
}

const defaultSorting: SortingState = [{ id: "startedAt", desc: true }]

function resetPagination() {
  return { pageIndex: 0 }
}

export const useAnalyticsTableStore = create<AnalyticsTableState>()((set) => ({
  search: "",
  project: "all",
  client: "all",
  agentName: "all",
  intent: "all",
  pageIndex: 0,
  pageSize: 10,
  sorting: defaultSorting,
  expanded: {},
  setSearch: (value) => set({ search: value, ...resetPagination() }),
  setProject: (value) => set({ project: value, ...resetPagination() }),
  setClient: (value) => set({ client: value, ...resetPagination() }),
  setAgentName: (value) => set({ agentName: value, ...resetPagination() }),
  setIntent: (value) => set({ intent: value, ...resetPagination() }),
  setPageIndex: (value) => set({ pageIndex: value }),
  setPageSize: (value) => set({ pageSize: value, pageIndex: 0 }),
  setSorting: (value) => set({ sorting: value }),
  toggleExpanded: (sessionKey) =>
    set((state) => ({
      expanded: { ...state.expanded, [sessionKey]: !state.expanded[sessionKey] },
    })),
  resetFilters: () =>
    set({
      search: "",
      project: "all",
      client: "all",
      agentName: "all",
      intent: "all",
      pageIndex: 0,
      pageSize: 10,
      sorting: defaultSorting,
      expanded: {},
    }),
}))
