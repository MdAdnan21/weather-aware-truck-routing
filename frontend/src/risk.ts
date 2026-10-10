import type { Checkpoint, Route, RouteSummary } from './types'

export const RISK_LABELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel'] as const
export const RISK_COLORS = ['#16a34a', '#eab308', '#f97316', '#dc2626', '#7f1d1d'] as const
export const UNKNOWN_COLOR = '#94a3b8'

/** 'eta' = risk at each checkpoint's estimated arrival; 'hour' = snapshot at departure + N hours. */
export type ViewMode = { kind: 'eta' } | { kind: 'hour'; hour: number }

export function colorForLevel(level: number | null | undefined): string {
  return level != null && Number.isInteger(level) && level >= 0 && level < RISK_COLORS.length
    ? RISK_COLORS[level]
    : UNKNOWN_COLOR
}

export function labelForLevel(level: number | null | undefined): string {
  return level != null && level >= 0 && level < RISK_LABELS.length ? RISK_LABELS[level] : 'Unknown'
}

export function checkpointLevel(cp: Checkpoint, mode: ViewMode): number | null {
  if (mode.kind === 'eta') return cp.risk_level
  return cp.forecast.level[mode.hour] ?? null
}

export interface CheckpointConditions {
  wind: number | null
  rain: number | null
  snow: number | null
}

export function checkpointConditions(cp: Checkpoint, mode: ViewMode): CheckpointConditions {
  if (mode.kind === 'eta') {
    return { wind: cp.weather?.wind_mph ?? null, rain: cp.weather?.rain_in_hr ?? null, snow: cp.weather?.snow_in_hr ?? null }
  }
  return {
    wind: cp.forecast.wind[mode.hour] ?? null,
    rain: cp.forecast.rain[mode.hour] ?? null,
    snow: cp.forecast.snow[mode.hour] ?? null,
  }
}

export function routeSummaryFor(route: Route, mode: ViewMode): RouteSummary {
  if (mode.kind === 'eta') return route.summary
  return route.hourly_summary[mode.hour] ?? route.summary
}

export interface ColoredSegment {
  checkpointIndex: number
  level: number | null
  color: string
  positions: [number, number][]
}

/** Split the route polyline into one coloured piece per checkpoint (the stretch it covers). */
export function buildSegments(route: Route, mode: ViewMode): ColoredSegment[] {
  const out: ColoredSegment[] = []
  for (const cp of route.checkpoints) {
    const [start, end] = cp.segment
    const positions = route.geometry.slice(start, end + 1)
    if (positions.length < 2) continue
    const level = checkpointLevel(cp, mode)
    out.push({ checkpointIndex: cp.index, level, color: colorForLevel(level), positions })
  }
  return out
}

export function clampHour(hour: number, max: number): number {
  if (!Number.isFinite(hour)) return 0
  return Math.min(Math.max(Math.round(hour), 0), max)
}

export function modeKey(mode: ViewMode): string {
  return mode.kind === 'eta' ? 'eta' : `h${mode.hour}`
}
