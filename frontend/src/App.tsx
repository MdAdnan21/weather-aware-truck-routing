import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { analyzeRoutes, ApiError } from './api'
import AnalysisForm from './components/AnalysisForm'
import CheckpointTable from './components/CheckpointTable'
import ForecastControl from './components/ForecastControl'
import Legend from './components/Legend'
import MapBoundary from './components/MapBoundary'
import MapView, { ROUTE_COLORS } from './components/MapView'
import RouteCard from './components/RouteCard'
import { Icon, RouteCardSkeleton, Spinner, Toast } from './components/ui'
import { clampHour, type ViewMode } from './risk'
import type { AnalyzeRequest, AnalyzeResponse } from './types'

type Status = 'idle' | 'loading' | 'success' | 'error'
interface ErrorState { message: string; details?: Record<string, string>; retryable: boolean }

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<ErrorState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewMode>({ kind: 'eta' })
  const [showTable, setShowTable] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastReq = useRef<AnalyzeRequest | null>(null)

  const deferredMode = useDeferredValue(mode) // keeps the slider responsive on long routes
  useEffect(() => () => abortRef.current?.abort(), []) // cancel in-flight request on unmount

  const run = useCallback(async (req: AnalyzeRequest) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    lastReq.current = req
    setStatus('loading')
    setError(null)
    try {
      const data = await analyzeRoutes(req, ctrl.signal)
      if (ctrl.signal.aborted) return
      setResult(data)
      setSelectedId(data.recommendation.route_id)
      setMode({ kind: 'eta' })
      setStatus('success')
      setToast(`${data.routes.length} route${data.routes.length === 1 ? '' : 's'} analysed`)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const err = e as ApiError
      setError({ message: err.message || 'Something went wrong.', details: err.details, retryable: err instanceof ApiError && err.retryable })
      setStatus('error')
    }
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])
  const selected = result?.routes.find((r) => r.id === selectedId) ?? null
  const sorted = result ? [...result.routes].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) : []
  const loading = status === 'loading'
  const recommended = result?.routes.find((r) => r.id === result.recommendation.route_id)

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {toast && <Toast onDone={dismissToast}>{toast}</Toast>}
      <aside className="flex w-full shrink-0 flex-col border-b border-ink-200 bg-white lg:h-full lg:w-[420px] lg:border-b-0 lg:border-r" aria-busy={loading}>
        <header className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white"><Icon name="route" className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold leading-tight tracking-tight text-ink-900">Weather-Aware Truck Routing</h1>
            <p className="text-xs text-ink-500">Route options ranked by weather risk, load and time</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 lg:min-h-0">
          <AnalysisForm loading={loading} onSubmit={run} serverErrors={error?.details} />

          {status === 'error' && error && (
            <div role="alert" className="mt-4 animate-fade-up rounded-card border border-red-200 bg-red-50 p-3.5 text-sm text-red-900">
              <p className="flex items-center gap-2 font-semibold"><Icon name="alert" className="h-4 w-4" /> Couldn’t analyse the route</p>
              <p className="mt-1 break-words text-red-800">{error.message}</p>
              {error.retryable && lastReq.current && (
                <button type="button" onClick={() => run(lastReq.current!)} className="btn btn-ghost mt-2.5 !px-3 !py-1.5 text-xs text-red-800">
                  <Icon name="refresh" className="h-3.5 w-3.5" /> Try again
                </button>
              )}
            </div>
          )}

          {status === 'idle' && (
            <div className="mt-5 animate-fade-in rounded-card border border-dashed border-ink-200 bg-ink-50 p-4 text-sm text-ink-500">
              Enter a trip above, or click <b className="text-ink-700">Example</b>, to compare three routes, see checkpoints and the weather corridor on the map.
            </div>
          )}

          {loading && !result && (
            <div className="mt-5 space-y-3" aria-live="polite">
              <p className="flex items-center gap-2 text-sm text-ink-500"><Spinner /> Fetching routes and forecasts — this can take 10–20 seconds…</p>
              <RouteCardSkeleton /><RouteCardSkeleton /><RouteCardSkeleton />
            </div>
          )}
          {loading && result && <p className="mt-4 flex items-center gap-2 text-sm text-ink-500" aria-live="polite"><Spinner /> Refreshing analysis…</p>}

          {result && (
            <section className={`mt-5 space-y-3 transition-opacity duration-200 ${loading ? 'pointer-events-none opacity-50' : ''}`} aria-label="Route options">
              <div key={result.recommendation.route_id + result.departure} className="animate-fade-up rounded-card border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-950">
                <p className="font-semibold">Recommended: {recommended?.name ?? '—'}</p>
                <p className="mt-0.5 text-xs text-emerald-900/80">{result.recommendation.reason}</p>
                {mode.kind === 'hour' && <p className="mt-1.5 flex items-start gap-1.5 text-xs text-emerald-900/80"><Icon name="info" className="mt-px h-3.5 w-3.5 shrink-0" />Recommendation uses weather at each truck’s ETA, not the forecast-hour snapshot.</p>}
              </div>
              {result.routes.length < 3 && (
                <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-500">The routing provider returned {result.routes.length} route{result.routes.length === 1 ? '' : 's'} for this trip.</p>
              )}
              {sorted.map((r, i) => (
                <RouteCard
                  key={`${r.id}-${result.departure}`} route={r} index={i} color={ROUTE_COLORS[result.routes.indexOf(r) % ROUTE_COLORS.length]} selected={r.id === selectedId}
                  recommended={r.id === result.recommendation.route_id} mode={mode} onSelect={() => setSelectedId(r.id)}
                />
              ))}
              <Legend />
              {selected && (
                <div>
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700" onClick={() => setShowTable((s) => !s)} aria-expanded={showTable} aria-controls="cp-details">
                    <Icon name="chevron" className={`h-4 w-4 transition-transform duration-200 ${showTable ? 'rotate-180' : ''}`} />
                    {showTable ? 'Hide' : 'Show'} checkpoint details ({selected.checkpoints?.length ?? 0})
                  </button>
                  <div id="cp-details" className="collapse" data-open={showTable}>
                    <div className="pt-2"><CheckpointTable route={selected} mode={mode} /></div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </aside>

      <main className="relative min-h-[460px] flex-1 lg:min-h-0">
        <MapBoundary>
          <MapView result={result} selectedId={selectedId} mode={deferredMode} onSelect={setSelectedId} />
        </MapBoundary>
        {loading && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[500] w-64 -translate-x-1/2 animate-pop-in overflow-hidden rounded-full border border-ink-200 bg-white/95 shadow-float" role="status">
            <div className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-ink-700"><Spinner /> Analysing routes…</div>
            <div className="h-0.5 w-full bg-ink-100"><div className="h-full w-1/3 animate-sweep bg-brand-500" /></div>
          </div>
        )}
        {result && (
          <div className="absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-2xl">
            <ForecastControl
              mode={mode} maxHour={result.forecast_hours} forecastStart={result.forecast_start} route={selected}
              onChange={(m) => setMode(m.kind === 'hour' ? { kind: 'hour', hour: clampHour(m.hour, result.forecast_hours) } : m)}
            />
          </div>
        )}
      </main>
    </div>
  )
}
