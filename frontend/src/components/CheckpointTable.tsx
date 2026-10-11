import { formatDateTime, formatNumber } from '../format'
import { checkpointConditions, checkpointLevel, colorForLevel, labelForLevel, type ViewMode } from '../risk'
import type { Route } from '../types'

/** Every checkpoint of the selected route (no row cap). Unknown weather is shown as "No data", never as 0. */
export default function CheckpointTable({ route, mode }: { route: Route; mode: ViewMode }) {
  const cps = Array.isArray(route.checkpoints) ? route.checkpoints : []
  if (cps.length === 0) return <p className="rounded-md bg-ink-50 p-3 text-xs text-ink-500">No checkpoints were returned for this route.</p>
  return (
    <div>
      <p className="mb-1.5 text-xs text-ink-500">
        {route.name} · {cps.length} checkpoints · {mode.kind === 'eta' ? 'weather at each ETA' : `forecast +${mode.hour} h (ETA column is arrival time)`}
      </p>
      <div className="overflow-x-auto rounded-card border border-ink-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-ink-50 text-left text-ink-500">
            <tr>
              {['Mile', 'ETA', 'Wind mph', 'Rain in/h', 'Snow in/h', 'Risk'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-2.5 py-2 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {cps.map((cp) => {
              const level = checkpointLevel(cp, mode)
              const c = checkpointConditions(cp, mode)
              const unknown = level == null
              return (
                <tr key={cp.index} className="border-t border-ink-100 transition-colors hover:bg-ink-50">
                  <td className="px-2.5 py-1.5 tabular-nums">{formatNumber(cp.mile, 0)}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{formatDateTime(cp.eta)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums">{c.wind == null ? <span className="text-ink-300">n/a</span> : formatNumber(c.wind, 0)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums">{c.rain == null ? <span className="text-ink-300">n/a</span> : formatNumber(c.rain, 2)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums">{c.snow == null ? <span className="text-ink-300">n/a</span> : formatNumber(c.snow, 2)}</td>
                  <td className="px-2.5 py-1.5">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForLevel(level) }} aria-hidden="true" />
                      {unknown ? <span className="text-ink-500">Unknown</span> : labelForLevel(level)}
                    </span>
                    {mode.kind === 'eta' && cp.drivers.length > 0 && <span className="block text-[10px] text-ink-400">{cp.drivers.join(' + ')}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
