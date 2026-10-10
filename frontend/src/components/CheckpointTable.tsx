import { formatDateTime, formatNumber } from '../format'
import { checkpointConditions, checkpointLevel, colorForLevel, labelForLevel, type ViewMode } from '../risk'
import type { Route } from '../types'

export default function CheckpointTable({ route, mode }: { route: Route; mode: ViewMode }) {
  const cps = Array.isArray(route.checkpoints) ? route.checkpoints : []
  if (cps.length === 0) return <p className="rounded-md bg-ink-50 p-3 text-xs text-ink-500">No checkpoints were returned for this route.</p>
  return (
    <div className="max-h-72 overflow-auto rounded-card border border-ink-200 bg-white">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-ink-50 text-left text-ink-500">
          <tr>
            {['Mile', 'ETA', 'Wind mph', 'Rain in/h', 'Snow in/h', 'Risk'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-2.5 py-2 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {cps.map((cp) => {
            const level = checkpointLevel(cp, mode)
            const c = checkpointConditions(cp, mode)
            return (
              <tr key={cp.index} className="border-t border-ink-100 transition-colors hover:bg-ink-50">
                <td className="px-2.5 py-1.5 tabular-nums">{formatNumber(cp.mile, 0)}</td>
                <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{formatDateTime(cp.eta)}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{formatNumber(c.wind, 0)}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{formatNumber(c.rain, 2)}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{formatNumber(c.snow, 2)}</td>
                <td className="px-2.5 py-1.5">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForLevel(level) }} aria-hidden="true" />
                    {labelForLevel(level)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
