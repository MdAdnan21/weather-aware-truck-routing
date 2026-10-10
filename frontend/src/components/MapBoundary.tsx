import { Component, type ReactNode } from 'react'

/** Keeps a map crash (WebGL/Leaflet/tile init) from taking down the whole app. */
export default class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { console.error('Map failed to render:', error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="flex h-full items-center justify-center bg-ink-100 p-6 text-center">
        <div className="max-w-xs">
          <p className="font-semibold text-ink-900">The map couldn’t be displayed</p>
          <p className="mt-1 text-sm text-ink-500">Route results are still available in the panel. Reload the page to try the map again.</p>
          <button className="btn btn-ghost mt-3" onClick={() => this.setState({ failed: false })}>Retry map</button>
        </div>
      </div>
    )
  }
}
