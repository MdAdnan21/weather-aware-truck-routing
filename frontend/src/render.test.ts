import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CheckpointTable from './components/CheckpointTable'
import ForecastControl from './components/ForecastControl'
import RouteCard from './components/RouteCard'
import type { Route } from './types'

// Intentionally malformed: nulls, unknown risk level, zero values, missing summary fields, very long name.
const bad = {
  id: 'r1', name: 'x'.repeat(300), distance_miles: 0, duration_minutes: NaN, arrival: 'not-a-date',
  geometry: [], tags: undefined, hourly_summary: [],
  summary: { miles_by_risk: undefined, unknown_miles: null, avg_risk: null, worst_level: 9, worst_risk: null, no_travel: false },
  checkpoints: [{ index: 0, mile: 0, lat: 0, lng: 0, eta: '', segment: [0, 1], coverage_miles: 0, weather: null, risk_level: 42, risk: null, drivers: [], forecast: { level: [], wind: [], rain: [], snow: [] } }],
} as unknown as Route

describe('defensive rendering', () => {
  it('RouteCard survives malformed route data', () => {
    const html = renderToStaticMarkup(h(RouteCard, { route: bad, color: '#000', selected: false, recommended: false, mode: { kind: 'eta' }, index: 0, onSelect: () => {} }))
    expect(html).not.toContain('NaN')
    expect(html).toContain('Worst: Unknown')
  })
  it('RouteCard survives a missing hourly snapshot', () => {
    expect(() => renderToStaticMarkup(h(RouteCard, { route: bad, color: '#000', selected: true, recommended: true, mode: { kind: 'hour', hour: 30 }, index: 0, onSelect: () => {} }))).not.toThrow()
  })
  it('CheckpointTable shows Unknown and em-dashes for missing data, and an empty state for no checkpoints', () => {
    const html = renderToStaticMarkup(h(CheckpointTable, { route: bad, mode: { kind: 'eta' } }))
    expect(html).toContain('Unknown')
    expect(html).not.toContain('NaN')
    expect(renderToStaticMarkup(h(CheckpointTable, { route: { ...bad, checkpoints: [] }, mode: { kind: 'eta' } }))).toContain('No checkpoints')
  })
  it('ForecastControl renders with no route / empty hourly data', () => {
    expect(() => renderToStaticMarkup(h(ForecastControl, { mode: { kind: 'eta' }, maxHour: 48, forecastStart: '2026-01-01T00:00:00Z', route: null, onChange: () => {} }))).not.toThrow()
    expect(() => renderToStaticMarkup(h(ForecastControl, { mode: { kind: 'hour', hour: 5 }, maxHour: 48, forecastStart: 'garbage', route: bad, onChange: () => {} }))).not.toThrow()
  })
})
