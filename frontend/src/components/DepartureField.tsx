import { useMemo } from 'react'
import { toLocalInputValue } from '../format'

/**
 * Departure date + time as two controlled fields that together produce the
 * `YYYY-MM-DDTHH:mm` (local time) string the form and `toRequest()` already use.
 *
 * Why not one `datetime-local`? Its native popup combines calendar and time and, in Chromium,
 * stays open after a pick until the user clicks away. Separate date / time controls each
 * commit and dismiss on selection; the date input is also blurred after a pick so its popover
 * can't linger or reopen.
 */
const STEP_MIN = 15
const pad = (n: number) => n.toString().padStart(2, '0')

export function splitDeparture(value: string): { date: string; time: string } {
  const [date = '', time = ''] = value.split('T')
  return { date, time: time.slice(0, 5) }
}

export function joinDeparture(date: string, time: string): string {
  return date ? `${date}T${time || '00:00'}` : ''
}

function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(2000, 0, 1, h, m)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

interface Props {
  value: string
  onChange: (value: string) => void
  error?: string
}

export default function DepartureField({ value, onChange, error }: Props) {
  const { date, time } = splitDeparture(value)
  const bounds = useMemo(() => {
    const now = Date.now()
    return { min: toLocalInputValue(new Date(now - 86_400_000)).slice(0, 10), max: toLocalInputValue(new Date(now + 10 * 86_400_000)).slice(0, 10) }
  }, [])
  const options = useMemo(() => {
    const list: string[] = []
    for (let m = 0; m < 24 * 60; m += STEP_MIN) list.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`)
    if (time && !list.includes(time)) list.push(time) // keep an existing off-grid value selectable
    return list.sort()
  }, [time])

  return (
    <div>
      <span className="label" id="dep-label">Departure</span>
      <div className="grid grid-cols-[1fr_auto] gap-2" role="group" aria-labelledby="dep-label">
        <input
          id="dep-date" type="date" min={bounds.min} max={bounds.max} value={date}
          aria-label="Departure date" aria-invalid={!!error} aria-describedby={error ? 'dep-err' : undefined}
          onChange={(e) => { onChange(joinDeparture(e.target.value, time)); e.currentTarget.blur() }}
          className="field"
        />
        <select
          id="dep-time" value={time} aria-label="Departure time" aria-invalid={!!error}
          onChange={(e) => onChange(joinDeparture(date, e.target.value))}
          className="field w-[7.5rem]"
        >
          {!time && <option value="">Time</option>}
          {options.map((o) => <option key={o} value={o}>{timeLabel(o)}</option>)}
        </select>
      </div>
      {error && <p id="dep-err" className="mt-1 animate-fade-in text-xs text-red-600">{error}</p>}
    </div>
  )
}
