import L from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Pane, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { formatDateTime, formatNumber } from '../format'
import { buildSegments, checkpointConditions, checkpointLevel, colorForLevel, labelForLevel, type ViewMode } from '../risk'
import type { AnalyzeResponse, Route } from '../types'

export const ROUTE_COLORS = ['#2563eb', '#7c3aed', '#0891b2']

function FitBounds({ routes, resultKey }: { routes: Route[]; resultKey: string }) {
  const map = useMap()
  useEffect(() => {
    const pts = routes.flatMap((r) => r.geometry)
    if (pts.length) map.fitBounds(L.latLngBounds(pts as L.LatLngTuple[]), { padding: [30, 30] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey, map])
  return null
}

interface Props {
  result: AnalyzeResponse | null
  selectedId: string | null
  mode: ViewMode
  onSelect: (id: string) => void
}

export default function MapView({ result, selectedId, mode, onSelect }: Props) {
  const selected = result?.routes.find((r) => r.id === selectedId) ?? null
  const segments = useMemo(() => (selected ? buildSegments(selected, mode) : []), [selected, mode])
  const [tileErrors, setTileErrors] = useState(0)
  const tilesDown = tileErrors >= 4

  return (
    <>
    {tilesDown && (
      <div role="status" className="absolute left-1/2 top-3 z-[600] -translate-x-1/2 animate-pop-in rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-panel">
        Map tiles are not loading — routes and risk colours still display.
      </div>
    )}
    <MapContainer center={[39, -98]} zoom={4} preferCanvas className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        eventHandlers={{ tileerror: () => setTileErrors((n) => n + 1), tileload: () => setTileErrors(0) }}
      />
      {result && <FitBounds routes={result.routes} resultKey={`${result.departure}|${result.routes.map((r) => r.id + r.distance_miles).join()}`} />}

      {/* Alternatives: distinct dashed lines, click to select. */}
      <Pane name="alts" style={{ zIndex: 410 }}>
        {result?.routes.filter((r) => r.id !== selectedId).map((r) => (
          <Polyline key={r.id} positions={r.geometry} pathOptions={{ color: ROUTE_COLORS[result.routes.indexOf(r) % 3], weight: 4, opacity: 0.7, dashArray: '8 8' }} eventHandlers={{ click: () => onSelect(r.id) }}>
            <Tooltip sticky>{r.name} — click to select</Tooltip>
          </Polyline>
        ))}
      </Pane>

      {/* Heat corridor: wide translucent band under the selected route, same risk colours. */}
      <Pane name="corridor" style={{ zIndex: 420 }}>
        {segments.map((s) => (
          <Polyline key={`band-${s.checkpointIndex}`} positions={s.positions} pathOptions={{ color: s.color, weight: 26, opacity: 0.25, lineCap: 'butt', lineJoin: 'round' }} interactive={false} />
        ))}
      </Pane>
      <Pane name="selected" style={{ zIndex: 430 }}>
        {segments.map((s) => (
          <Polyline key={`seg-${s.checkpointIndex}`} positions={s.positions} pathOptions={{ color: s.color, weight: 7, opacity: 0.95, lineCap: 'butt' }} interactive={false} />
        ))}
      </Pane>

      <Pane name="markers" style={{ zIndex: 440 }}>
        {selected?.checkpoints.map((cp) => {
          const level = checkpointLevel(cp, mode)
          const c = checkpointConditions(cp, mode)
          return (
            <CircleMarker key={cp.index} center={[cp.lat, cp.lng]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: colorForLevel(level), fillOpacity: 1 }}>
              <Popup>
                <div className="min-w-[180px] text-xs">
                  <p className="text-sm font-semibold">Checkpoint {cp.index + 1} · mile {cp.mile.toFixed(0)}</p>
                  <p>ETA: {formatDateTime(cp.eta)}</p>
                  <p className="mt-1 font-semibold" style={{ color: colorForLevel(level) }}>{labelForLevel(level)}{cp.drivers.length > 0 && mode.kind === 'eta' ? ` (${cp.drivers.join(', ')})` : ''}</p>
                  {c.wind == null ? <p>No forecast data available.</p> : (
                    <p>Wind {formatNumber(c.wind, 0)} mph · Rain {formatNumber(c.rain, 2)} in/h · Snow {formatNumber(c.snow, 2)} in/h</p>
                  )}
                  <p className="text-slate-500">{mode.kind === 'eta' ? 'Forecast at arrival time' : `Forecast hour +${mode.hour}`}</p>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
        {result && (
          <>
            <CircleMarker center={[result.origin.lat, result.origin.lng]} radius={9} pathOptions={{ color: '#0f172a', weight: 3, fillColor: '#ffffff', fillOpacity: 1 }}>
              <Tooltip permanent direction="top" offset={[0, -8]}>Start: {result.origin.label}</Tooltip>
            </CircleMarker>
            <CircleMarker center={[result.destination.lat, result.destination.lng]} radius={9} pathOptions={{ color: '#0f172a', weight: 3, fillColor: '#0f172a', fillOpacity: 1 }}>
              <Tooltip permanent direction="top" offset={[0, -8]}>End: {result.destination.label}</Tooltip>
            </CircleMarker>
          </>
        )}
      </Pane>
    </MapContainer>
    </>
  )
}
