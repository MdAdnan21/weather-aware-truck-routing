import { RISK_COLORS, RISK_LABELS, UNKNOWN_COLOR } from '../risk'

/** Same colours as the map (RISK_COLORS / UNKNOWN_COLOR in risk.ts). */
export default function Legend({ className = '' }: { className?: string }) {
  const items = [...RISK_LABELS.map((label, i) => ({ label, color: RISK_COLORS[i] })), { label: 'No data', color: UNKNOWN_COLOR }]
  return (
    <ul className={`flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-500 ${className}`} aria-label="Risk legend">
      {items.map(({ label, color }) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
          {label}
        </li>
      ))}
    </ul>
  )
}
