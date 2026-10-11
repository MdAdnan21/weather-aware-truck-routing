/** Mirrors the JSON returned by POST /api/analyze (backend/routing/analysis.py). */
export interface Place {
  label: string
  lat: number
  lng: number
}

export interface AnalyzeRequest {
  origin: Place
  destination: Place
  departure: string // ISO 8601 UTC
  load_lbs: number
  interval_miles: 10 | 25 | 50
  demo_weather?: boolean // simulated fixture, never live data
}

export interface Weather {
  wind_mph: number
  rain_in_hr: number
  snow_in_hr: number
}

export interface HourlyForecast {
  level: (number | null)[]
  wind: (number | null)[]
  rain: (number | null)[]
  snow: (number | null)[]
}

export interface Checkpoint {
  index: number
  mile: number
  lat: number
  lng: number
  eta: string
  segment: [number, number]
  coverage_miles: number
  weather: Weather | null
  risk_level: number | null
  risk: string | null
  drivers: string[]
  forecast: HourlyForecast
}

export interface RouteSummary {
  miles_by_risk: Record<string, number>
  unknown_miles: number
  avg_risk: number | null
  worst_level: number | null
  worst_risk: string | null
  no_travel: boolean
}

export interface Route {
  id: string
  name: string
  distance_miles: number
  duration_minutes: number
  arrival: string
  geometry: [number, number][]
  summary: RouteSummary
  hourly_summary: RouteSummary[]
  checkpoints: Checkpoint[]
  tags: string[]
  rank?: number
  recommended?: boolean
}

export interface AnalyzeResponse {
  departure: string
  forecast_start: string
  forecast_hours: number
  interval_miles: number
  load_lbs: number
  origin: Place
  destination: Place
  routes: Route[]
  recommendation: { route_id: string; reason: string }
  weather_source?: 'live' | 'demo'
}
