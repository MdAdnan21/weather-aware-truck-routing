import { RISK_COLORS, RISK_LABELS } from '../risk'

export default function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-500" aria-label="Risk legend">
      {RISK_LABELS.map((label, i) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: RISK_COLORS[i] }} />
          {label}
        </li>
      ))}
    </ul>
  )
}
