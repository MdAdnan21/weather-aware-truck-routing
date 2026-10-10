import type { AnalyzeRequest, AnalyzeResponse, Place } from './types'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export const ANALYZE_TIMEOUT_MS = 60_000
export const GEOCODE_TIMEOUT_MS = 12_000

export class ApiError extends Error {
  status: number
  details?: Record<string, string>
  constructor(message: string, status: number, details?: Record<string, string>) {
    super(message)
    this.status = status
    this.details = details
  }
  /** Safe to retry automatically/with one click: transient failures, not validation or auth problems. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500
  }
}

export function messageForStatus(status: number, serverMessage?: string): string {
  switch (status) {
    case 400: return serverMessage ?? 'Some of the trip details are invalid. Please check the form.'
    case 401: return 'The server rejected the request (not authenticated).'
    case 403: return 'You do not have permission to run this analysis.'
    case 404: return serverMessage ?? 'The requested service was not found.'
    case 429: return 'Too many requests right now. Wait a few seconds and try again.'
    case 502: case 503: case 504: return serverMessage ?? 'A routing or weather provider is unavailable. Try again shortly.'
    default: return status >= 500 ? 'The server hit an error while analysing this trip. Try again.' : serverMessage ?? `Request failed (${status}).`
  }
}

async function request<T>(path: string, init: RequestInit | undefined, timeoutMs: number): Promise<T> {
  // Combine the caller's signal (user cancelled / superseded) with a timeout, and tell them apart.
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, timeoutMs)
  const outer = init?.signal
  const onOuterAbort = () => ctrl.abort()
  if (outer?.aborted) ctrl.abort()
  else outer?.addEventListener('abort', onOuterAbort, { once: true })

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal })
  } catch (err) {
    clearTimeout(timer)
    outer?.removeEventListener('abort', onOuterAbort)
    if (timedOut) throw new ApiError('The request timed out. The server or a weather provider is slow — please try again.', 408)
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError('Cannot reach the server. Check your connection and that the backend is running.', 0)
  }
  clearTimeout(timer)
  outer?.removeEventListener('abort', onOuterAbort)
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; details?: Record<string, string> }
    throw new ApiError(messageForStatus(res.status, body.error), res.status, body.details)
  }
  return data as T
}

export function isAnalyzeResponse(data: unknown): data is AnalyzeResponse {
  const d = data as AnalyzeResponse | null
  return (
    !!d &&
    Array.isArray(d.routes) &&
    d.routes.length > 0 &&
    d.routes.every((r) => Array.isArray(r.geometry) && Array.isArray(r.checkpoints) && Array.isArray(r.hourly_summary)) &&
    typeof d.recommendation?.route_id === 'string'
  )
}

export async function analyzeRoutes(payload: AnalyzeRequest, signal?: AbortSignal): Promise<AnalyzeResponse> {
  const data = await request<unknown>(
    '/api/analyze',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal },
    ANALYZE_TIMEOUT_MS,
  )
  if (Array.isArray((data as { routes?: unknown })?.routes) && (data as { routes: unknown[] }).routes.length === 0) {
    throw new ApiError('No drivable routes were found between these two places. Try different locations.', 404)
  }
  if (!isAnalyzeResponse(data)) throw new ApiError('The server returned an unexpected response.', 502)
  if (!data.routes.some((r) => r.id === data.recommendation.route_id)) throw new ApiError('The server returned an inconsistent recommendation.', 502)
  return data
}

export async function geocode(q: string, signal?: AbortSignal): Promise<Place[]> {
  const data = await request<{ results?: Place[] }>(`/api/geocode?q=${encodeURIComponent(q)}`, { signal }, GEOCODE_TIMEOUT_MS)
  return Array.isArray(data?.results) ? data.results : []
}
