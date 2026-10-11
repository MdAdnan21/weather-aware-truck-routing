import { addHours, formatDateTime } from '../format'
import { colorForLevel, type ViewMode } from '../risk'
import type { Route } from '../types'

interface Props {
  mode: ViewMode
  maxHour: number
  forecastStart: string
  route: Route | null
  onChange: (mode: ViewMode) => void
}

export default function ForecastControl({ mode, maxHour, forecastStart, route, onChange }: Props) {
  const hour = mode.kind === 'hour' ? mode.hour : 0
  const btn = (active: boolean) =>
    `rounded px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${active ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`
  // Real per-hour worst-risk for the selected route — shows where on the slider trouble lies.
  const strip = route && Array.isArray(route.hourly_summary) ? route.hourly_summary.slice(0, maxHour + 1) : []

  return (
    <div className="animate-fade-up rounded-card border border-ink-200 bg-white/95 p-3 shadow-float backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="inline-flex rounded-md bg-ink-100 p-0.5" role="group" aria-label="Weather view">
          <button type="button" aria-pressed={mode.kind === 'eta'} className={btn(mode.kind === 'eta')} onClick={() => onChange({ kind: 'eta' })}>Weather at my ETA</button>
          <button type="button" aria-pressed={mode.kind === 'hour'} className={btn(mode.kind === 'hour')} onClick={() => onChange({ kind: 'hour', hour })}>Forecast hour</button>
        </div>
        <p className="min-w-0 flex-1 text-right text-xs text-ink-500 max-sm:basis-full max-sm:text-left" aria-live="polite">
          {mode.kind === 'eta'
            ? 'Each checkpoint uses the forecast for the hour the truck arrives.'
            : <><b className="font-semibold text-ink-900">Forecast hour +{hour} h</b> · {formatDateTime(addHours(forecastStart, hour))} (snapshot; recommendation still uses ETA)</>}
        </p>
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <span className="w-8 text-xs tabular-nums text-ink-400">0 h</span>
        <div className="relative flex-1">
          <input
            type="range" min={0} max={maxHour} step={1} value={hour}
            onChange={(e) => onChange({ kind: 'hour', hour: Number(e.target.value) })}
            aria-label="Forecast hour after departure"
            aria-valuetext={`Plus ${hour} hours`}
            className={`slider w-full transition-opacity duration-200 ${mode.kind === 'eta' ? 'opacity-50 hover:opacity-100' : ''}`}
          />
          <div className="pointer-events-none relative mt-0.5 h-3 text-[10px] tabular-nums text-ink-400" aria-hidden="true">
            {[0, 24, maxHour].filter((v, i, a) => a.indexOf(v) === i).map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(t / maxHour) * 100}%` }}>{t === 0 ? '0h' : `${t}h`}</span>
            ))}
          </div>
          {strip.length > 1 && (
            <div className="pointer-events-none mt-0.5 flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
              {strip.map((s, i) => <div key={i} className="flex-1" style={{ backgroundColor: colorForLevel(s?.worst_level) }} />)}
            </div>
          )}
        </div>
        <span className="w-10 text-right text-xs tabular-nums text-ink-400">{maxHour} h</span>
      </div>
    </div>
  )
}
