const compactNumberFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const standardNumberFormatter = new Intl.NumberFormat("en")

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function formatCompactNumber(value: number) {
  return value >= 1000
    ? compactNumberFormatter.format(value)
    : standardNumberFormatter.format(value)
}

export function formatNumber(value: number) {
  return standardNumberFormatter.format(value)
}

export function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "—"
}

export function formatPercent(part: number, total: number) {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "—"
}

export function shortId(value: string) {
  return value.length > 8 ? value.slice(0, 8) : value
}

export function formatLabel(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
