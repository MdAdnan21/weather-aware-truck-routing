import { describe, expect, it } from 'vitest'
import { joinDeparture, splitDeparture } from './components/DepartureField'
import { toRequest } from './components/AnalysisForm'

describe('departure date + time', () => {
  it('splits and rejoins the local datetime without loss', () => {
    expect(splitDeparture('2026-10-12T08:45')).toEqual({ date: '2026-10-12', time: '08:45' })
    expect(joinDeparture('2026-10-12', '08:45')).toBe('2026-10-12T08:45')
  })
  it('cleared date yields an empty value (validation then asks for a date)', () => {
    expect(joinDeparture('', '08:45')).toBe('')
  })
  it('combined value becomes the ISO instant sent to Django', () => {
    const req = toRequest({ origin: { label: 'a', lat: 1, lng: 1 }, destination: { label: 'b', lat: 2, lng: 2 }, departure: joinDeparture('2026-10-12', '08:45'), load: '35000', interval: 25 })
    expect(req.departure).toBe(new Date('2026-10-12T08:45').toISOString())
  })
})
