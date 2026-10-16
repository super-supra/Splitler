/** "2h ago", "just now", "3d ago" */
export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

/** "October 2026" for an ISO date (YYYY-MM-DD). */
export function monthLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** { mon: "Oct", day: "14" } for an ISO date. */
export function dayParts(date: string): { mon: string; day: string } {
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return { mon: '', day: date }
  return { mon: d.toLocaleDateString(undefined, { month: 'short' }), day: String(d.getDate()) }
}

/** "Today", "Yesterday" or "Mon, 14 Oct" for a timestamp. */
export function dayLabel(at: number, now = Date.now()): string {
  const d = new Date(at)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(new Date(now)) - start(d)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Currency symbol for a code, e.g. INR -> ₹ */
export function currencySymbol(currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}
