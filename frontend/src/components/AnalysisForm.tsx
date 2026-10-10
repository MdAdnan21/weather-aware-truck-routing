import { useState } from 'react'
import { toLocalInputValue } from '../format'
import type { AnalyzeRequest, Place } from '../types'
import LocationInput from './LocationInput'
import { Spinner } from './ui'

export const MAX_LOAD_LBS = 150_000
const DAY = 86_400_000

export interface FormValues {
  origin: Place | null
  destination: Place | null
  departure: string // datetime-local value
  load: string
  interval: 10 | 25 | 50
}

export function validate(v: FormValues, now = new Date()): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!v.origin) errors.origin = 'Pick a suggestion or enter coordinates as "lat,lng".'
  if (!v.destination) errors.destination = 'Pick a suggestion or enter coordinates as "lat,lng".'
  if (v.origin && v.destination && v.origin.lat === v.destination.lat && v.origin.lng === v.destination.lng) {
    errors.destination = 'Destination must differ from the origin.'
  }
  const dep = new Date(v.departure)
  if (!v.departure || Number.isNaN(dep.getTime())) errors.departure = 'Choose a departure date and time.'
  else if (dep.getTime() < now.getTime() - DAY) errors.departure = 'Departure cannot be more than 24 hours in the past.'
  else if (dep.getTime() > now.getTime() + 10 * DAY) errors.departure = 'Forecast is only available up to 10 days ahead.'
  const load = Number(v.load)
  if (v.load.trim() === '' || !Number.isFinite(load) || load < 0 || load > MAX_LOAD_LBS) {
    errors.load = `Enter a load between 0 and ${MAX_LOAD_LBS.toLocaleString()} lb.`
  }
  return errors
}

export function toRequest(v: FormValues): AnalyzeRequest {
  return {
    origin: v.origin!,
    destination: v.destination!,
    departure: new Date(v.departure).toISOString(),
    load_lbs: Number(v.load),
    interval_miles: v.interval,
  }
}

const EXAMPLE = {
  origin: { label: 'Dallas, TX', lat: 32.7767, lng: -96.797 },
  destination: { label: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
}

interface Props {
  loading: boolean
  onSubmit: (req: AnalyzeRequest) => void
  serverErrors?: Record<string, string>
}

export default function AnalysisForm({ loading, onSubmit, serverErrors }: Props) {
  const [values, setValues] = useState<FormValues>(() => {
    const d = new Date(Date.now() + 3_600_000)
    d.setMinutes(0, 0, 0)
    return { origin: null, destination: null, departure: toLocalInputValue(d), load: '35000', interval: 25 }
  })
  const [touched, setTouched] = useState(false)
  const errors = { ...(touched ? validate(values) : {}), ...(serverErrors ?? {}) }
  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues((p) => ({ ...p, [k]: v }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (Object.keys(validate(values)).length === 0) onSubmit(toRequest(values))
  }
  const field = (bad?: string) => `field ${bad ? 'border-risk-severe' : ''}`

  return (
    <form onSubmit={submit} className="space-y-3.5" noValidate aria-busy={loading}>
      <LocationInput label="Origin" value={values.origin} onChange={(p) => set('origin', p)} error={errors.origin} />
      <LocationInput label="Destination" value={values.destination} onChange={(p) => set('destination', p)} error={errors.destination} />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="dep" className="label">Departure</label>
          <input id="dep" type="datetime-local" value={values.departure} onChange={(e) => set('departure', e.target.value)} aria-invalid={!!errors.departure} aria-describedby={errors.departure ? 'dep-err' : undefined} className={field(errors.departure)} />
          {errors.departure && <p id="dep-err" className="mt-1 animate-fade-in text-xs text-red-600">{errors.departure}</p>}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="load" className="label">Load weight (lb)</label>
          <input id="load" type="number" inputMode="numeric" min={0} max={MAX_LOAD_LBS} step={500} value={values.load} onChange={(e) => set('load', e.target.value)} aria-invalid={!!errors.load} aria-describedby={errors.load ? 'load-err' : undefined} className={field(errors.load)} />
          {errors.load && <p id="load-err" className="mt-1 animate-fade-in text-xs text-red-600">{errors.load}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="int" className="label">Weather checkpoint every</label>
        <select id="int" value={values.interval} onChange={(e) => set('interval', Number(e.target.value) as 10 | 25 | 50)} className={field()}>
          <option value={10}>10 miles (most detail)</option>
          <option value={25}>25 miles</option>
          <option value={50}>50 miles (fastest)</option>
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading} className="btn btn-primary flex-1">
          {loading ? <><Spinner /> Analysing routes…</> : 'Find safest route'}
        </button>
        <button type="button" disabled={loading} onClick={() => setValues((p) => ({ ...p, ...EXAMPLE }))} className="btn btn-ghost">
          Example
        </button>
      </div>
    </form>
  )
}
