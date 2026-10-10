"""Geometry helpers: distances, checkpoint sampling and per-checkpoint coverage."""
from __future__ import annotations

import math
from bisect import bisect_right
from dataclasses import dataclass

EARTH_RADIUS_MI = 3958.8


def haversine_miles(a, b) -> float:
    (lat1, lng1), (lat2, lng2) = a, b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dlmb = p2 - p1, math.radians(lng2 - lng1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(min(1.0, math.sqrt(h)))


def cumulative_miles(coords) -> list[float]:
    cum = [0.0]
    for prev, cur in zip(coords, coords[1:]):
        cum.append(cum[-1] + haversine_miles(prev, cur))
    return cum


@dataclass
class Sample:
    mile: float
    lat: float
    lng: float
    seg_start: int  # first geometry vertex covered by this checkpoint
    seg_end: int  # last geometry vertex covered (inclusive)
    coverage_miles: float


def _vertex_at(cum, mile) -> int:
    return max(0, min(len(cum) - 1, bisect_right(cum, mile) - 1))


def _point_at(coords, cum, mile):
    idx = min(_vertex_at(cum, mile), len(coords) - 2)
    span = cum[idx + 1] - cum[idx]
    frac = (mile - cum[idx]) / span if span > 0 else 0.0
    frac = max(0.0, min(1.0, frac))
    (lat1, lng1), (lat2, lng2) = coords[idx], coords[idx + 1]
    return lat1 + (lat2 - lat1) * frac, lng1 + (lng2 - lng1) * frac


def sample_route(coords, cum, interval_miles: float) -> list[Sample]:
    """Checkpoints at 0, interval, 2*interval ... plus the destination.

    Each checkpoint "covers" the stretch of road halfway to its neighbours, so
    the covered miles always sum to the route length.
    """
    if len(coords) < 2:
        raise ValueError("A route needs at least two coordinates")
    total = cum[-1]
    miles, m = [], 0.0
    while m < total - 1e-9:
        miles.append(m)
        m += interval_miles
    miles.append(total)

    bounds = [0.0] + [(a + b) / 2 for a, b in zip(miles, miles[1:])] + [total]
    last = len(coords) - 1
    samples = []
    for i, mile in enumerate(miles):
        lat, lng = _point_at(coords, cum, mile)
        start = 0 if i == 0 else _vertex_at(cum, bounds[i])
        end = last if i == len(miles) - 1 else _vertex_at(cum, bounds[i + 1])
        samples.append(Sample(mile, lat, lng, start, end, bounds[i + 1] - bounds[i]))
    return samples
