"use client"

import { create } from "zustand"

import type { SortingState } from "@tanstack/react-table"

type AnalyticsTableState = {
  search: string
  project: string
  callerAgent: string
  invokedName: string
  invocationType: string
  actionClassification: string
  pageIndex: number
  pageSize: number
  sorting: SortingState
  setSearch: (value: string) => void
  setProject: (value: string) => void
  setCallerAgent: (value: string) => void
  setInvokedName: (value: string) => void
  setInvocationType: (value: string) => void
  setActionClassification: (value: string) => void
  setPageIndex: (value: number) => void
  setPageSize: (value: number) => void
  setSorting: (value: SortingState) => void
  resetFilters: () => void
}

const defaultSorting: SortingState = [{ id: "createdAt", desc: true }]

function resetPagination() {
  return { pageIndex: 0 }
}

export const useAnalyticsTableStore = create<AnalyticsTableState>()((set) => ({
  search: "",
  project: "all",
  callerAgent: "all",
  invokedName: "all",
  invocationType: "all",
  actionClassification: "all",
  pageIndex: 0,
  pageSize: 10,
  sorting: defaultSorting,
  setSearch: (value) => set({ search: value, ...resetPagination() }),
  setProject: (value) => set({ project: value, ...resetPagination() }),
  setCallerAgent: (value) => set({ callerAgent: value, ...resetPagination() }),
  setInvokedName: (value) => set({ invokedName: value, ...resetPagination() }),
  setInvocationType: (value) => set({ invocationType: value, ...resetPagination() }),
  setActionClassification: (value) =>
    set({ actionClassification: value, ...resetPagination() }),
  setPageIndex: (value) => set({ pageIndex: value }),
  setPageSize: (value) => set({ pageSize: value, pageIndex: 0 }),
  setSorting: (value) => set({ sorting: value }),
  resetFilters: () =>
    set({
      search: "",
      project: "all",
      callerAgent: "all",
      invokedName: "all",
      invocationType: "all",
      actionClassification: "all",
      pageIndex: 0,
      pageSize: 10,
      sorting: defaultSorting,
    }),
}))
