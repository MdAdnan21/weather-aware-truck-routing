import { formatDateTime, formatDuration, formatNumber } from '../format'
import { RISK_COLORS, RISK_LABELS, colorForLevel, labelForLevel, routeSummaryFor, type ViewMode } from '../risk'
import { Icon } from './ui'
import type { Route } from '../types'

interface Props {
  route: Route
  color: string
  selected: boolean
  recommended: boolean
  mode: ViewMode
  index: number
  onSelect: () => void
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export default function RouteCard({ route, color, selected, recommended, mode, index, onSelect }: Props) {
  const summary = routeSummaryFor(route, mode)
  const byRisk = summary?.miles_by_risk ?? {}
  const unknown = num(summary?.unknown_miles)
  const total = RISK_LABELS.reduce((a, l) => a + num(byRisk[l]), 0) + unknown
  const severeish = num(byRisk['Severe']) + num(byRisk['No Travel'])
  const high = num(byRisk['High'])
  const tags = Array.isArray(route.tags) ? route.tags : []
  const worstLevel = summary?.worst_level ?? null

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ animationDelay: `${index * 70}ms` }}
      className={`relative w-full animate-fade-up overflow-hidden rounded-card border p-3.5 text-left transition-[border-color,box-shadow,background-color,transform] duration-200 hover:-translate-y-px hover:shadow-panel active:translate-y-0 ${
        selected ? 'border-brand-500 bg-brand-50/60 shadow-panel' : 'border-ink-200 bg-white hover:border-ink-300'
      }`}
    >
      {/* Route colour key matches the line on the map */}
      <span className="absolute inset-y-0 left-0 w-1 transition-opacity duration-200" style={{ backgroundColor: color, opacity: selected ? 1 : 0.45 }} aria-hidden="true" />
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="min-w-0">
          <p className="break-words font-semibold leading-snug text-ink-900">{route.name || 'Unnamed route'}</p>
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((t) => <span key={t} className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">{t}</span>)}
            </div>
          )}
        </div>
        {recommended && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Icon name="check" className="h-3 w-3" /> Recommended
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 pl-1.5 text-xs">
        <div><dt className="text-ink-400">Distance</dt><dd className="mt-0.5 font-semibold tabular-nums text-ink-900">{formatNumber(route.distance_miles, 0)} mi</dd></div>
        <div><dt className="text-ink-400">Drive time</dt><dd className="mt-0.5 font-semibold tabular-nums text-ink-900">{formatDuration(route.duration_minutes)}</dd></div>
        <div><dt className="text-ink-400">Arrival</dt><dd className="mt-0.5 font-semibold tabular-nums text-ink-900">{formatDateTime(route.arrival)}</dd></div>
      </dl>

      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink-100 pl-0" role="img" aria-label={`Miles by risk: ${RISK_LABELS.map((l) => `${l} ${Math.round(num(byRisk[l]))}`).join(', ')}${unknown ? `, no data ${Math.round(unknown)}` : ''}`}>
        {total > 0 && RISK_LABELS.map((label, i) => {
          const miles = num(byRisk[label])
          return miles > 0 ? <div key={label} className="transition-[width] duration-300 ease-out" style={{ width: `${(miles / total) * 100}%`, backgroundColor: RISK_COLORS[i] }} title={`${label}: ${Math.round(miles)} mi`} /> : null
        })}
        {unknown > 0 && <div className="transition-[width] duration-300" style={{ width: `${(unknown / (total || 1)) * 100}%`, backgroundColor: colorForLevel(null) }} title={`No data: ${Math.round(unknown)} mi`} />}
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-1.5 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForLevel(worstLevel) }} aria-hidden="true" />
          Worst: {summary?.worst_risk ?? labelForLevel(worstLevel)}
        </span>
        {summary?.avg_risk != null && <span>avg {formatNumber(summary.avg_risk, 2)}/4</span>}
        {high > 0 && <span className="font-medium text-orange-700">{Math.round(high)} mi High</span>}
        {severeish > 0 && <span className="font-semibold text-red-700">{Math.round(severeish)} mi Severe+</span>}
        {unknown > 0 && <span>{Math.round(unknown)} mi no data</span>}
      </p>
      {summary?.no_travel && (
        <p className="mt-2 ml-1.5 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs font-medium text-red-800">
          <Icon name="alert" className="h-3.5 w-3.5 shrink-0" /> No Travel conditions on this route
        </p>
      )}
    </button>
  )
}
