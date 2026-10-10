import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeRoutes, ApiError, messageForStatus } from './api'
import { formatDuration, formatNumber } from './format'
import type { AnalyzeRequest } from './types'

const req: AnalyzeRequest = {
  origin: { label: 'A', lat: 1, lng: 1 }, destination: { label: 'B', lat: 2, lng: 2 },
  departure: '2026-01-01T00:00:00Z', load_lbs: 30000, interval_miles: 25,
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('analyzeRoutes error handling', () => {
  it.each([400, 401, 403, 404, 429, 500])('maps HTTP %i to an ApiError with a message', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, status)))
    const err = await analyzeRoutes(req).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(status)
    expect(err.message).toBe(messageForStatus(status))
  })

  it('marks only transient failures as retryable', () => {
    expect(new ApiError('x', 429).retryable).toBe(true)
    expect(new ApiError('x', 500).retryable).toBe(true)
    expect(new ApiError('x', 0).retryable).toBe(true)
    expect(new ApiError('x', 400).retryable).toBe(false)
    expect(new ApiError('x', 403).retryable).toBe(false)
  })

  it('reports a network failure as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(analyzeRoutes(req)).rejects.toMatchObject({ status: 0 })
  })

  it('rejects malformed bodies and empty route lists distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ nope: true })))
    await expect(analyzeRoutes(req)).rejects.toMatchObject({ status: 502 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ routes: [], recommendation: { route_id: 'x', reason: '' } })))
    await expect(analyzeRoutes(req)).rejects.toMatchObject({ status: 404 })
  })

  it('times out slow requests but passes user aborts through untouched', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))))
    const p = analyzeRoutes(req)
    const assertion = expect(p).rejects.toMatchObject({ status: 408 })
    await vi.advanceTimersByTimeAsync(60_001)
    await assertion

    const user = new AbortController()
    const p2 = analyzeRoutes(req, user.signal)
    const a2 = expect(p2).rejects.toMatchObject({ name: 'AbortError' })
    user.abort()
    await a2
  })
})

describe('format guards', () => {
  it('never renders NaN/negative values', () => {
    expect(formatDuration(NaN)).toBe('—')
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(125)).toBe('2 h 05 min')
    expect(formatNumber(NaN)).toBe('—')
    expect(formatNumber(0, 2)).toBe('0.00')
  })
})
