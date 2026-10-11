"""Route analysis: checkpoints, ETAs, weather lookup, risk summaries and recommendation."""
from __future__ import annotations

from datetime import datetime, timedelta

from . import geo, providers, risk

FORECAST_HOURS = 48
METERS_PER_MILE = 1609.344


def _round_hour(dt: datetime) -> datetime:
    return (dt + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)


def _key(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:00")


def _lookup(series, dt):
    """(wind, rain, snow) at the hour nearest to dt, or None if unavailable."""
    wx = series.get(_key(_round_hour(dt)))
    if wx is None or any(v is None for v in wx):
        return None
    return wx


def summarise(levels_and_miles):
    """levels_and_miles: [(level|None, miles)] -> route summary dict."""
    by_level = [0.0] * 5
    unknown = 0.0
    for level, miles in levels_and_miles:
        if level is None:
            unknown += miles
        else:
            by_level[level] += miles
    known = sum(by_level)
    worst = max((lvl for lvl, _ in levels_and_miles if lvl is not None), default=None)
    avg = sum(i * m for i, m in enumerate(by_level)) / known if known else None
    return {
        "miles_by_risk": {name: round(by_level[i], 1) for i, name in enumerate(risk.LEVELS)},
        "unknown_miles": round(unknown, 1),
        "avg_risk": None if avg is None else round(avg, 2),
        "worst_level": worst,
        "worst_risk": None if worst is None else risk.LEVELS[worst],
        "no_travel": by_level[risk.NO_TRAVEL] > 0,
    }


def _rank_key(route):
    s = route["summary"]["miles_by_risk"]
    avg = route["summary"]["avg_risk"]
    # No Travel is worse than Severe, so it is compared first. Distances are
    # rounded to whole miles so sub-mile differences fall through to the next rule.
    return (round(s["No Travel"]), round(s["Severe"]), round(s["High"]), round(avg if avg is not None else 99, 1), route["duration_minutes"])


CRITERIA = [("No Travel miles", 0), ("Severe miles", 1), ("High miles", 2), ("average risk", 3), ("travel time", 4)]


def recommend(routes):
    ranked = sorted(routes, key=_rank_key)
    for i, r in enumerate(ranked, 1):
        r["rank"], r["recommended"] = i, i == 1
    best = ranked[0]
    if len(ranked) == 1:
        reason = "Only one route was available."
    else:
        a, b = _rank_key(best), _rank_key(ranked[1])
        name = next((n for n, i in CRITERIA if a[i] != b[i]), None)
        if name is None:
            reason = "Routes are equivalent on weather risk and travel time."
        elif name == "travel time":
            reason = f"Same weather risk as the alternatives, but the shortest travel time ({round(a[4])} min)."
        else:
            idx = dict(CRITERIA)[name]
            reason = f"Lowest {name}: {a[idx]} vs {b[idx]} on the next-best route."
    if best["summary"]["no_travel"]:
        reason += " Warning: every route has No Travel conditions at the selected time."
    return best["id"], reason


def analyze(origin, destination, departure: datetime, load_lbs: float, interval_miles: int,
            *, route_fetcher=None, weather_fetcher=None):
    """origin/destination: dicts with lat/lng/label. departure: tz-aware UTC datetime."""
    if weather_fetcher is None:
        providers.check_weather_available()  # fail fast if the weather quota is exhausted
    route_fetcher = route_fetcher or providers.fetch_routes
    weather_fetcher = weather_fetcher or providers.fetch_weather

    raw_routes = route_fetcher((origin["lat"], origin["lng"]), (destination["lat"], destination["lng"]))
    if not raw_routes:
        raise providers.ProviderError("No drivable route was found between those locations.", 422)

    forecast_start = _round_hour(departure)
    plans = []
    for raw in raw_routes:
        coords = raw["coords"]
        cum = geo.cumulative_miles(coords)
        samples = geo.sample_route(coords, cum, interval_miles)
        total_geo = cum[-1] or 1.0
        etas = [departure + timedelta(seconds=raw["duration_s"] * s.mile / total_geo) for s in samples]
        plans.append((raw, coords, samples, etas))

    # One weather request set for all unique (rounded) checkpoint locations.
    index, points = {}, []
    for _, _, samples, _ in plans:
        for s in samples:
            k = (round(s.lat, 2), round(s.lng, 2))
            if k not in index:
                index[k] = len(points)
                points.append((s.lat, s.lng))
    longest_s = max(r["duration_s"] for r, *_ in plans)
    window_end = departure + timedelta(hours=FORECAST_HOURS, seconds=longest_s, minutes=90)
    series = weather_fetcher(points, departure - timedelta(hours=1), window_end)

    routes = []
    for n, (raw, coords, samples, etas) in enumerate(plans):
        checkpoints = []
        for i, (s, eta) in enumerate(zip(samples, etas)):
            wx_series = series[index[(round(s.lat, 2), round(s.lng, 2))]]
            at_eta = _lookup(wx_series, eta)
            res = risk.classify(*at_eta, load_lbs) if at_eta else None
            fc = {"level": [], "wind": [], "rain": [], "snow": []}
            for h in range(FORECAST_HOURS + 1):
                wx = _lookup(wx_series, forecast_start + timedelta(hours=h))
                r = risk.classify(*wx, load_lbs) if wx else None
                fc["level"].append(r["level"] if r else None)
                for j, key in enumerate(("wind", "rain", "snow")):
                    fc[key].append(wx[j] if wx else None)
            checkpoints.append({
                "index": i, "mile": round(s.mile, 1), "lat": round(s.lat, 5), "lng": round(s.lng, 5),
                "eta": eta.isoformat(), "segment": [s.seg_start, s.seg_end], "coverage_miles": round(s.coverage_miles, 2),
                "weather": None if not at_eta else {"wind_mph": at_eta[0], "rain_in_hr": at_eta[1], "snow_in_hr": at_eta[2]},
                "risk_level": res["level"] if res else None,
                "risk": risk.LEVELS[res["level"]] if res else None,
                "drivers": res["drivers"] if res else [],
                "forecast": fc,
            })
        summary = summarise([(c["risk_level"], s.coverage_miles) for c, s in zip(checkpoints, samples)])
        hourly = [summarise([(c["forecast"]["level"][h], s.coverage_miles) for c, s in zip(checkpoints, samples)])
                  for h in range(FORECAST_HOURS + 1)]
        routes.append({
            "id": f"r{n + 1}", "name": f"Route {chr(65 + n)}",
            "distance_miles": round(raw["distance_m"] / METERS_PER_MILE, 1),
            "duration_minutes": round(raw["duration_s"] / 60),
            "arrival": etas[-1].isoformat(),
            "geometry": [[round(lat, 5), round(lng, 5)] for lat, lng in coords],
            "summary": summary, "hourly_summary": hourly, "checkpoints": checkpoints, "tags": [],
        })

    fastest = min(routes, key=lambda r: r["duration_minutes"])
    shortest = min(routes, key=lambda r: r["distance_miles"])
    fastest["tags"].append("Fastest")
    if shortest is not fastest or len(routes) == 1:
        shortest["tags"].append("Shortest")
    best_id, reason = recommend(routes)
    return {
        "departure": departure.isoformat(), "forecast_start": forecast_start.isoformat(),
        "forecast_hours": FORECAST_HOURS, "interval_miles": interval_miles, "load_lbs": load_lbs,
        "origin": origin, "destination": destination, "routes": routes,
        "recommendation": {"route_id": best_id, "reason": reason},
    }