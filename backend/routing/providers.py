
"""External API clients: OpenRouteService and Open-Meteo."""

from __future__ import annotations

import logging
import math
import time
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
        self.message = message
        self.status = status


def _ors_headers():
    api_key = settings.ORS_API_KEY

    if not api_key:
        raise ProviderError(
            "Routing service is not configured (missing ORS_API_KEY).",
            503,
        )

    return {
        "Authorization": api_key.strip(),
        "Content-Type": "application/json",
    }

def _request(method, url, *, what, **kwargs):
    for attempt in range(3):
        try:
            resp = requests.request(method, url, timeout=settings.HTTP_TIMEOUT_SECONDS, **kwargs)
        except requests.Timeout:
            raise ProviderError(f"{what} timed out. Please try again.", 504)
        except requests.RequestException:
            raise ProviderError(f"{what} is unreachable. Please try again.", 502)

        if resp.status_code == 429:
            # A daily quota will not recover in a few seconds, so fail immediately.
            if "daily" in resp.text.lower():
                raise ProviderError(
                    f"{what} daily request limit reached. It resets at about 5:30 AM IST; please try again later.",
                    503,
                )
            if attempt < 2:
                time.sleep(2 * (attempt + 1))  # short per-minute limit: wait 2s, then 4s
                continue
        break

    if resp.status_code == 429:
        raise ProviderError(f"{what} rate limit reached. Please wait a moment and retry.", 503)
    if resp.status_code in (401, 403):
        raise ProviderError(f"{what} rejected the request (check the API key).", 502)
    return resp

def _json(resp, what):
    try:
        return resp.json()
    except ValueError:
        raise ProviderError(
            f"{what} returned an invalid response.",
            502,
        ) 




def geocode(query: str):
    query = query.strip()

    if len(query) < 3:
        raise ProviderError(
            "Search query must contain at least 3 characters.",
            400,
        )

    resp = _request(
        "GET",
        f"{settings.ORS_BASE_URL}/geocode/search",
        what="Geocoding service",
        headers=_ors_headers(),
        params={
            "text": query[:200],
            "size": 5,
        },
    )

    if resp.status_code != 200:
        raise ProviderError(
            f"Geocoding failed (HTTP {resp.status_code}).",
            502,
        )

    data = _json(resp, "Geocoding service")
    features = data.get("features", [])

    results = []

    for feature in features:
        try:
            coordinates = feature["geometry"]["coordinates"]
            properties = feature["properties"]

            lng, lat = coordinates[:2]
            label = properties.get("label")

            if not label:
                continue

            results.append({
                "label": str(label),
                "lat": float(lat),
                "lng": float(lng),
            })

        except (KeyError, TypeError, ValueError):
            log.warning("Skipping malformed geocoding result.")
            continue

    return results


def _directions(coordinates, **extra):
    """Coordinates are a list of (latitude, longitude) pairs."""

    body = {
        "coordinates": [
            [lng, lat]
            for lat, lng in coordinates
        ],
        "instructions": False,
        "geometry_simplify": True,
        **extra,
    }

    resp = _request(
        "POST",
        (
            f"{settings.ORS_BASE_URL}/v2/directions/"
            f"{settings.ORS_PROFILE}/geojson"
        ),
        what="Routing service",
        headers=_ors_headers(),
        json=body,
    )

    if resp.status_code == 404:
        raise ProviderError(
            "No drivable route was found between those locations.",
            422,
        )

    if resp.status_code != 200:
        data = _json(resp, "Routing service") if resp.content else {}

        error = data.get("error", {})
        message = (
            error.get("message")
            if isinstance(error, dict)
            else None
        )

        status = 422 if resp.status_code == 400 else 502

        raise ProviderError(
            message or "Routing service could not compute a route.",
            status,
        )

    features = _json(resp, "Routing service").get("features", [])
    routes = []

    for feature in features:
        try:
            coords = [
                (lat, lng)
                for lng, lat in feature["geometry"]["coordinates"]
            ]

            summary = feature["properties"]["summary"]

            routes.append({
                "coords": coords,
                "distance_m": float(summary["distance"]),
                "duration_s": float(summary["duration"]),
            })

        except (KeyError, TypeError, ValueError):
            continue

    return routes


def _similar(a, b, threshold_mi=0.6, share=0.9):
    """Check whether two routes are substantially similar."""

    if not a or not b:
        return False

    step_a = max(1, len(a) // 25)
    step_b = max(1, len(b) // 400)

    points_a = a[::step_a]
    points_b = b[::step_b]

    near = sum(
        1
        for point in points_a
        if min(
            haversine_miles(point, other)
            for other in points_b
        ) <= threshold_mi
    )

    return near / len(points_a) >= share


def _add_unique(found, candidates):
    for candidate in candidates:
        if len(found) >= MAX_ROUTES:
            return

        if not any(
            _similar(candidate["coords"], route["coords"])
            for route in found
        ):
            found.append(candidate)


def _detour_via_points(coords):
    """Generate two approximate detour points near the route midpoint."""

    if len(coords) < 2:
        return

    midpoint = coords[len(coords) // 2]

    (lat1, lng1), (lat2, lng2) = coords[0], coords[-1]

    dx = (
        (lng2 - lng1)
        * math.cos(math.radians(midpoint[0]))
    )
    dy = lat2 - lat1

    norm = math.hypot(dx, dy) or 1.0

    px = -dy / norm
    py = dx / norm

    offset_deg = max(0.1, 0.12 * norm)

    for side in (1, -1):
        yield (
            midpoint[0] + side * py * offset_deg,
            midpoint[1]
            + side * px * offset_deg
            / max(0.2, math.cos(math.radians(midpoint[0]))),
        )


def fetch_routes(origin, destination):
    """Return up to three distinct routes."""

    found = []
    base = [origin, destination]

    try:
        _add_unique(
            found,
            _directions(
                base,
                alternative_routes={
                    "target_count": 3,
                    "weight_factor": 1.6,
                    "share_factor": 0.6,
                },
            ),
        )

    except ProviderError as exc:
        if exc.status in (503, 504) or "configured" in exc.message:
            raise

        log.info(
            "Alternative routes unavailable; trying preferences."
        )

    for preference in ("recommended", "fastest", "shortest"):
        if len(found) >= MAX_ROUTES:
            break

        try:
            _add_unique(
                found,
                _directions(base, preference=preference),
            )

        except ProviderError as exc:
            if not found and exc.status == 422:
                raise

    if found and len(found) < MAX_ROUTES:
        for via in _detour_via_points(found[0]["coords"]):
            if len(found) >= MAX_ROUTES:
                break

            try:
                _add_unique(
                    found,
                    _directions([origin, via, destination]),
                )

            except ProviderError:
                continue

    if not found:
        raise ProviderError(
            "No drivable route was found between those locations.",
            422,
        )

    return found[:MAX_ROUTES]



def _fetch_weather_chunk(points, start: datetime, end: datetime):
    params = {
        "latitude": ",".join(
            f"{lat:.4f}" for lat, _ in points
        ),
        "longitude": ",".join(
            f"{lng:.4f}" for _, lng in points
        ),
        "hourly": "wind_speed_10m,rain,snowfall",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "UTC",
        "start_date": start.date().isoformat(),
        "end_date": end.date().isoformat(),
    }

    resp = _request(
        "GET",
        settings.OPEN_METEO_URL,
        what="Weather service",
        params=params,
    )

    if resp.status_code != 200:
        raise ProviderError(
            "Weather service could not provide a forecast "
            "for the requested dates.",
            502,
        )

    data = _json(resp, "Weather service")
    items = data if isinstance(data, list) else [data]

    if len(items) != len(points):
        raise ProviderError(
            "Weather service returned an unexpected number "
            "of locations.",
            502,
        )

    series = []

    for item in items:
        hourly = item.get("hourly") or {}

        times, wind, rain, snow = (
            hourly.get(key)
            for key in (
                "time",
                "wind_speed_10m",
                "rain",
                "snowfall",
            )
        )

        valid = (
            isinstance(times, list)
            and isinstance(wind, list)
            and isinstance(rain, list)
            and isinstance(snow, list)
            and len(times) == len(wind) == len(rain) == len(snow)
        )

        if not valid:
            raise ProviderError(
                "Weather service returned malformed hourly data.",
                502,
            )

        series.append({
            time: (w, r, s)
            for time, w, r, s in zip(times, wind, rain, snow)
        })

    return series


def fetch_weather(points, start: datetime, end: datetime):
    """Return one hourly weather dictionary per point."""

    chunks = [
        points[index:index + WEATHER_CHUNK]
        for index in range(0, len(points), WEATHER_CHUNK)
    ]

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(
            pool.map(
                lambda chunk: _fetch_weather_chunk(chunk, start, end),
                chunks,
            )
        )

    return [
        series
        for chunk_result in results
        for series in chunk_result
    ]
