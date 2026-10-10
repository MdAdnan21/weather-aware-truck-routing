export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '—'
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`
}

export function formatNumber(value: number | null | undefined, digits = 0, unit = ''): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}${unit}`
}

export function addHours(iso: string, hours: number): string {
  const t = new Date(iso).getTime() + hours * 3_600_000
  return Number.isNaN(t) ? '' : new Date(t).toISOString() // '' renders as "—" via formatDateTime
}

/** Value for <input type="datetime-local"> in the browser's local time. */
export function toLocalInputValue(date: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}
