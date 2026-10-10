import { describe, expect, it } from 'vitest'
import { validate, toRequest, type FormValues } from './components/AnalysisForm'
import { parseCoordinates } from './components/LocationInput'
import { isAnalyzeResponse } from './api'
import { buildSegments, checkpointLevel, clampHour, colorForLevel, routeSummaryFor, RISK_COLORS, UNKNOWN_COLOR } from './risk'
import type { Checkpoint, Route } from './types'

// Controlled fixtures — NOT real weather data.
function cp(index: number, eta: number, levelsByHour: (number | null)[], segment: [number, number]): Checkpoint {
  return {
    index, mile: index * 25, lat: 30 + index, lng: -97, eta: `2026-10-12T${String(8 + index).padStart(2, '0')}:00:00+00:00`, segment,
    coverage_miles: 25, weather: eta == null ? null : { wind_mph: 5, rain_in_hr: 0, snow_in_hr: 0 },
    risk_level: eta, risk: null, drivers: [],
    forecast: { level: levelsByHour, wind: levelsByHour.map(() => 5), rain: levelsByHour.map(() => 0), snow: levelsByHour.map(() => 0) },
  }
}
const hours = (f: (h: number) => number | null) => Array.from({ length: 49 }, (_, h) => f(h))
const emptySummary = { miles_by_risk: {}, unknown_miles: 0, avg_risk: 0, worst_level: 0, worst_risk: 'Low', no_travel: false }

function route(checkpoints: Checkpoint[]): Route {
  return {
    id: 'r1', name: 'Route A', distance_miles: 100, duration_minutes: 90, arrival: '', tags: [], checkpoints,
    geometry: Array.from({ length: 6 }, (_, i) => [30 + i * 0.1, -97] as [number, number]),
    summary: { ...emptySummary, worst_level: 1 },
    hourly_summary: hours((h) => h).map((h) => ({ ...emptySummary, worst_level: h })) as never,
  }
}

describe('colour mapping', () => {
  it('maps each of the five risk levels to the configured colour', () => {
    expect([0, 1, 2, 3, 4].map(colorForLevel)).toEqual(['#16a34a', '#eab308', '#f97316', '#dc2626', '#7f1d1d'])
    expect(RISK_COLORS).toHaveLength(5)
  })
  it('uses a neutral colour for unknown / invalid levels', () => {
    for (const bad of [null, undefined, -1, 5, 1.5]) expect(colorForLevel(bad as number)).toBe(UNKNOWN_COLOR)
  })
})

describe('segments', () => {
  const r = route([cp(0, 0, hours(() => 0), [0, 2]), cp(1, 1, hours(() => 1), [2, 4]), cp(2, 4, hours(() => 4), [4, 5])])

  it('colours each stretch by the checkpoint risk at its ETA (all five colours possible)', () => {
    const five = route([0, 1, 2, 3, 4].map((l) => cp(l, l, hours(() => l), [l, l + 1])))
    const colors = buildSegments(five, { kind: 'eta' }).map((s) => s.color)
    expect(colors).toEqual([...RISK_COLORS])
  })
  it('slices the polyline contiguously and in order', () => {
    const segs = buildSegments(r, { kind: 'eta' })
    expect(segs.map((s) => s.positions.length)).toEqual([3, 3, 2])
    expect(segs[0].positions[2]).toEqual(segs[1].positions[0])
  })
  it('a genuine all-Low forecast stays green at every hour and in ETA mode', () => {
    const low = route([cp(0, 0, hours(() => 0), [0, 3]), cp(1, 0, hours(() => 0), [3, 5])])
    for (const mode of [{ kind: 'eta' as const }, { kind: 'hour' as const, hour: 0 }, { kind: 'hour' as const, hour: 24 }, { kind: 'hour' as const, hour: 48 }]) {
      expect(new Set(buildSegments(low, mode).map((s) => s.color))).toEqual(new Set(['#16a34a']))
    }
  })
  it('shows missing forecasts as unknown rather than guessing a level', () => {
    const missing = route([cp(0, null as never, hours(() => null), [0, 5])])
    expect(buildSegments(missing, { kind: 'eta' })[0].color).toBe(UNKNOWN_COLOR)
  })
})

describe('forecast hour selection', () => {
  const c = cp(0, 0, hours((h) => (h === 0 ? 0 : h === 24 ? 2 : h === 48 ? 4 : 1)), [0, 5])
  it('reads the level for hours 0, 24 and 48', () => {
    expect(checkpointLevel(c, { kind: 'hour', hour: 0 })).toBe(0)
    expect(checkpointLevel(c, { kind: 'hour', hour: 24 })).toBe(2)
    expect(checkpointLevel(c, { kind: 'hour', hour: 48 })).toBe(4)
  })
  it('changing the hour changes the route colour', () => {
    const r = route([c])
    expect(buildSegments(r, { kind: 'hour', hour: 0 })[0].color).toBe('#16a34a')
    expect(buildSegments(r, { kind: 'hour', hour: 24 })[0].color).toBe('#f97316')
    expect(buildSegments(r, { kind: 'hour', hour: 48 })[0].color).toBe('#7f1d1d')
  })
  it('uses the per-hour route summary in forecast mode', () => {
    const r = route([c])
    expect(routeSummaryFor(r, { kind: 'hour', hour: 24 }).worst_level).toBe(24)
    expect(routeSummaryFor(r, { kind: 'eta' })).toBe(r.summary)
  })
  it('clamps hours into range', () => {
    expect([clampHour(-3, 48), clampHour(60, 48), clampHour(NaN, 48), clampHour(12.4, 48)]).toEqual([0, 48, 0, 12])
  })
})

describe('form validation', () => {
  const place = { label: 'A', lat: 1, lng: 2 }
  const base: FormValues = { origin: place, destination: { label: 'B', lat: 3, lng: 4 }, departure: '2026-10-12T10:00', load: '30000', interval: 25 }
  const now = new Date('2026-10-12T09:00:00')
  it('accepts a valid form', () => expect(validate(base, now)).toEqual({}))
  it('flags missing places, bad load and out-of-range departure', () => {
    const e = validate({ ...base, origin: null, load: '-1', departure: '2026-12-31T10:00' }, now)
    expect(Object.keys(e).sort()).toEqual(['departure', 'load', 'origin'])
  })
  it('rejects identical origin and destination and empty load', () => {
    expect(validate({ ...base, destination: place }, now).destination).toBeTruthy()
    expect(validate({ ...base, load: '' }, now).load).toBeTruthy()
  })
  it('builds a UTC ISO request with numeric load', () => {
    const req = toRequest(base)
    expect(req.load_lbs).toBe(30000)
    expect(req.departure.endsWith('Z')).toBe(true)
  })
  it('parses lat,lng input and rejects out-of-range values', () => {
    expect(parseCoordinates('32.78, -96.8')).toMatchObject({ lat: 32.78, lng: -96.8 })
    expect(parseCoordinates('95, 10')).toBeNull()
    expect(parseCoordinates('Dallas')).toBeNull()
  })
})

describe('response guard', () => {
  it('rejects malformed payloads', () => {
    expect(isAnalyzeResponse(null)).toBe(false)
    expect(isAnalyzeResponse({ routes: [] })).toBe(false)
    expect(isAnalyzeResponse({ routes: [{ geometry: [] }], recommendation: { route_id: 'r1' } })).toBe(false)
  })
})
