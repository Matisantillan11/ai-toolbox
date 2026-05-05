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

export function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

export function formatLabel(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
