import { useEffect, useRef, useState } from 'react'
import { geocode } from '../api'
import type { Place } from '../types'
import { Icon, Spinner } from './ui'

export function parseCoordinates(text: string): Place | null {
  const m = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng }
}

interface Props {
  label: string
  value: Place | null
  onChange: (place: Place | null) => void
  error?: string
  placeholder?: string
}

export default function LocationInput({ label, value, onChange, error, placeholder }: Props) {
  const [text, setText] = useState(value?.label ?? '')
  const [options, setOptions] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Reflect external changes (e.g. the "load example" button).
  useEffect(() => {
    if (value && value.label !== text) setText(value.label)
    if (!value && text === '' ) setOptions([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    const trimmed = text.trim()
    if (trimmed.length < 3 || value?.label === text || parseCoordinates(trimmed)) {
      setOptions([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setSearching(true)
      setSearchError(null)
      try {
        setOptions(await geocode(trimmed, ctrl.signal))
        setOpen(true)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setSearchError((e as Error).message)
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [text, value])

  useEffect(() => {
    const close = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const onType = (next: string) => {
    setText(next)
    onChange(parseCoordinates(next))
  }

  const listId = `loc-${label.toLowerCase()}`
  return (
    <div className="relative" ref={boxRef}>
      <label htmlFor={`${listId}-input`} className="label">{label}</label>
      <div className="relative">
        <input
          id={`${listId}-input`}
          value={text}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => options.length && setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder={placeholder ?? 'City, address or lat,lng'}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-invalid={!!error}
          className="field pr-9"
        />
        {searching && <span className="absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-ink-400"><Spinner className="h-4 w-4" /></span>}
        {!searching && value && !error && <span className="absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-emerald-600"><Icon name="check" className="h-4 w-4" /></span>}
      </div>
      {value && !error && <p className="mt-1 text-[11px] tabular-nums text-ink-400">{value.lat.toFixed(3)}, {value.lng.toFixed(3)}</p>}
      {(error || searchError) && <p className="mt-1 animate-fade-in text-xs text-red-600">{error ?? searchError}</p>}
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-[1000] mt-1 max-h-56 w-full origin-top animate-pop-in overflow-auto rounded-card border border-ink-200 bg-white py-1 text-sm shadow-float">
          {options.map((o) => (
            <li key={`${o.lat},${o.lng}`} role="option" aria-selected={value?.lat === o.lat && value?.lng === o.lng}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left transition-colors hover:bg-brand-50 focus-visible:bg-brand-50"
                onClick={() => {
                  setText(o.label)
                  onChange(o)
                  setOpen(false)
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
