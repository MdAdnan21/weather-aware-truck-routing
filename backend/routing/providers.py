"""External API clients: OpenRouteService (routes, geocoding) and Open-Meteo (weather).

API keys are sent in headers only, so they never appear in URLs or logs.
"""
from __future__ import annotations

import logging
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import requests
from django.conf import settings

from .geo import haversine_miles

log = logging.getLogger(__name__)
WEATHER_CHUNK = 50
MAX_ROUTES = 3


class ProviderError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message, self.status = message, status


# ----------------------------------------------------------------- helpers
def _ors_headers():
    if not settings.ORS_API_KEY:
        raise ProviderError("Routing service is not configured (missing ORS_API_KEY).", 503)
    return {"Authorization": settings.ORS_API_KEY, "Content-Type": "application/json"}


def _request(method, url, *, what, **kwargs):
    try:
        resp = requests.request(method, url, timeout=settings.HTTP_TIMEOUT_SECONDS, **kwargs)
    except requests.Timeout:
        raise ProviderError(f"{what} timed out. Please try again.", 504)
    except requests.RequestException:
        raise ProviderError(f"{what} is unreachable. Please try again.", 502)
    if resp.status_code == 429:
        raise ProviderError(f"{what} rate limit reached. Please wait a moment and retry.", 503)
    if resp.status_code in (401, 403):
        raise ProviderError(f"{what} rejected the request (check the API key).", 502)
    return resp


def _json(resp, what):
    try:
        return resp.json()
    except ValueError:
        raise ProviderError(f"{what} returned an invalid response.", 502)


# ----------------------------------------------------------------- geocoding
def geocode(query: str):
    resp = _request(
        "GET", f"{settings.ORS_BASE_URL}/geocode/search", what="Geocoding service",
        headers=_ors_headers(), params={"text": query, "size": 5},
    )
    if resp.status_code != 200:
        raise ProviderError("Geocoding failed.", 502)
    out = []
    for feat in _json(resp, "Geocoding service").get("features", []):
        try:
            lng, lat = feat["geometry"]["coordinates"][:2]
            out.append({"label": feat["properties"]["label"], "lat": float(lat), "lng": float(lng)})
        except (KeyError, TypeError, ValueError):
            continue
    return out


# ----------------------------------------------------------------- routing
def _directions(coordinates, **extra):
    """coordinates: [(lat,lng), ...]. Returns list of route dicts."""
    body = {"coordinates": [[lng, lat] for lat, lng in coordinates], "instructions": False,
            "geometry_simplify": True, **extra}
    resp = _request(
        "POST", f"{settings.ORS_BASE_URL}/v2/directions/{settings.ORS_PROFILE}/geojson",
        what="Routing service", headers=_ors_headers(), json=body,
    )
    if resp.status_code == 404:
        raise ProviderError("No drivable route was found between those locations.", 422)
    if resp.status_code != 200:
        data = _json(resp, "Routing service") if resp.content else {}
        msg = (data.get("error") or {}).get("message") if isinstance(data.get("error"), dict) else None
        raise ProviderError(msg or "Routing service could not compute a route.", 422 if resp.status_code == 400 else 502)
    routes = []
    for feat in _json(resp, "Routing service").get("features", []):
        try:
            coords = [(lat, lng) for lng, lat in feat["geometry"]["coordinates"]]
            summary = feat["properties"]["summary"]
            routes.append({"coords": coords, "distance_m": float(summary["distance"]), "duration_s": float(summary["duration"])})
        except (KeyError, TypeError, ValueError):
            continue
    return routes


def _similar(a, b, threshold_mi=0.6, share=0.9) -> bool:
    """True if >= `share` of sampled points of route `a` lie within threshold of route `b`."""
    step_a = max(1, len(a) // 25)
    step_b = max(1, len(b) // 400)
    pts_a, pts_b = a[::step_a], b[::step_b]
    near = sum(1 for p in pts_a if min(haversine_miles(p, q) for q in pts_b) <= threshold_mi)
    return near / len(pts_a) >= share


def _add_unique(found, candidates):
    for cand in candidates:
        if len(found) >= MAX_ROUTES:
            return
        if not any(_similar(cand["coords"], f["coords"]) for f in found):
            found.append(cand)


def _detour_via_points(coords):
    """Two via-points offset to either side of the route midpoint (used only as a last resort)."""
    mid = coords[len(coords) // 2]
    (lat1, lng1), (lat2, lng2) = coords[0], coords[-1]
    dx, dy = (lng2 - lng1) * math.cos(math.radians(mid[0])), lat2 - lat1
    norm = math.hypot(dx, dy) or 1.0
    px, py = -dy / norm, dx / norm  # unit perpendicular
    offset_deg = max(0.1, 0.12 * norm)
    for side in (1, -1):
        yield (mid[0] + side * py * offset_deg, mid[1] + side * px * offset_deg / max(0.2, math.cos(math.radians(mid[0]))))


def fetch_routes(origin, destination):
    """Up to 3 distinct routes. origin/destination are (lat, lng).

    1. ORS native alternatives (limited by ORS to shorter trips),
    2. different route preferences (fastest / shortest / recommended),
    3. via-point detours.
    """
    found: list[dict] = []
    base = [origin, destination]
    try:
        _add_unique(found, _directions(base, alternative_routes={"target_count": 3, "weight_factor": 1.6, "share_factor": 0.6}))
    except ProviderError as exc:
        if exc.status in (503, 504) or "configured" in exc.message:
            raise
        log.info("Alternative routes unavailable, falling back to preferences")

    for pref in ("recommended", "fastest", "shortest"):
        if len(found) >= MAX_ROUTES:
            break
        try:
            _add_unique(found, _directions(base, preference=pref))
        except ProviderError as exc:
            if not found and exc.status == 422:
                raise
    if found and len(found) < MAX_ROUTES:
        for via in _detour_via_points(found[0]["coords"]):
            if len(found) >= MAX_ROUTES:
                break
            try:
                _add_unique(found, _directions([origin, via, destination]))
            except ProviderError:
                continue
    if not found:
        raise ProviderError("No drivable route was found between those locations.", 422)
    return found[:MAX_ROUTES]


# ----------------------------------------------------------------- weather
def _fetch_weather_chunk(points, start: datetime, end: datetime):
    params = {
        "latitude": ",".join(f"{lat:.4f}" for lat, _ in points),
        "longitude": ",".join(f"{lng:.4f}" for _, lng in points),
        "hourly": "wind_speed_10m,rain,snowfall",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "UTC",
        "start_date": start.date().isoformat(),
        "end_date": end.date().isoformat(),
    }
    resp = _request("GET", settings.OPEN_METEO_URL, what="Weather service", params=params)
    if resp.status_code != 200:
        raise ProviderError("Weather service could not provide a forecast for the requested dates.", 502)
    data = _json(resp, "Weather service")
    items = data if isinstance(data, list) else [data]
    if len(items) != len(points):
        raise ProviderError("Weather service returned an unexpected number of locations.", 502)
    series = []
    for item in items:
        hourly = item.get("hourly") or {}
        times, wind, rain, snow = (hourly.get(k) for k in ("time", "wind_speed_10m", "rain", "snowfall"))
        if not (isinstance(times, list) and isinstance(wind, list) and isinstance(rain, list) and isinstance(snow, list)) \
                or not (len(times) == len(wind) == len(rain) == len(snow)):
            raise ProviderError("Weather service returned malformed hourly data.", 502)
        series.append({t: (w, r, s) for t, w, r, s in zip(times, wind, rain, snow)})
    return series


def fetch_weather(points, start: datetime, end: datetime):
    """points: [(lat, lng)]. Returns one {"YYYY-MM-DDTHH:00": (wind_mph, rain_in, snow_in)} dict per point (UTC)."""
    chunks = [points[i:i + WEATHER_CHUNK] for i in range(0, len(points), WEATHER_CHUNK)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda c: _fetch_weather_chunk(c, start, end), chunks))
    return [s for chunk in results for s in chunk]
