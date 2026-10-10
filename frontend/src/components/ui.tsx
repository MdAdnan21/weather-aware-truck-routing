import { useEffect, type ReactNode } from 'react'

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-[spin_700ms_linear_infinite]`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function RouteCardSkeleton() {
  return (
    <div className="card p-3.5" aria-hidden="true">
      <Skeleton className="h-4 w-2/5" />
      <div className="mt-3 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i}><Skeleton className="h-2.5 w-10" /><Skeleton className="mt-1.5 h-4 w-16" /></div>
        ))}
      </div>
      <Skeleton className="mt-3 h-2 w-full" />
      <Skeleton className="mt-2 h-3 w-3/5" />
    </div>
  )
}

export function Icon({ name, className = 'h-4 w-4' }: { name: 'alert' | 'check' | 'route' | 'chevron' | 'info' | 'refresh' | 'close'; className?: string }) {
  const p = { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'alert': return <svg {...p}><path d="M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
    case 'check': return <svg {...p}><path d="m5 12 5 5 9-10" /></svg>
    case 'route': return <svg {...p}><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></svg>
    case 'chevron': return <svg {...p}><path d="m6 9 6 6 6-6" /></svg>
    case 'info': return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
    case 'refresh': return <svg {...p}><path d="M20 11a8 8 0 0 0-14-4M4 5v4h4M4 13a8 8 0 0 0 14 4M20 19v-4h-4" /></svg>
    case 'close': return <svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
  }
}

/** Non-blocking success/info toast, announced politely to screen readers. */
export function Toast({ children, onDone, ms = 3500 }: { children: ReactNode; onDone: () => void; ms?: number }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms)
    return () => clearTimeout(t)
  }, [onDone, ms])
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed left-1/2 top-4 z-[2000] -translate-x-1/2">
      <div className="pointer-events-auto flex animate-pop-in items-center gap-2 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-float">
        <Icon name="check" className="h-4 w-4 text-emerald-400" />
        {children}
      </div>
    </div>
  )
}
