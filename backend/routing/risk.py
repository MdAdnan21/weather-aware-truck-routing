"""Deterministic weather-risk classification (assessment risk table + load rules).

Boundary convention: where the table's ranges touch (e.g. rain 0.10-0.25 and
0.25-0.50) the shared value goes to the *higher* level (conservative). The
"No Travel" cut-offs for rain (>1.00) and snow (>3.00) are strict, as written.
"""
from __future__ import annotations

LEVELS = ["Low", "Moderate", "High", "Severe", "No Travel"]
LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL = range(5)

HEAVY_LOAD_LBS = 30_000
VERY_HEAVY_LOAD_LBS = 40_000


def wind_level(mph: float) -> int:
    return sum(mph >= bound for bound in (25, 35, 45, 55))


def rain_level(in_per_hr: float) -> int:
    if in_per_hr > 1.00:
        return NO_TRAVEL
    if in_per_hr >= 0.50:
        return SEVERE
    if in_per_hr >= 0.25:
        return HIGH
    if in_per_hr >= 0.10:
        return MODERATE
    return LOW


def snow_level(in_per_hr: float) -> int:
    if in_per_hr > 3.0:
        return NO_TRAVEL
    if in_per_hr >= 2.0:
        return SEVERE
    if in_per_hr >= 1.0:
        return HIGH
    if in_per_hr >= 0.5:
        return MODERATE
    return LOW


def classify(wind_mph, rain_in_hr, snow_in_hr, load_lbs: float):
    """Return {"level": int, "drivers": [str]} or None if any input is missing.

    Missing data is never treated as zero: the checkpoint is reported as unknown.
    """
    if wind_mph is None or rain_in_hr is None or snow_in_hr is None:
        return None

    w, r, s = wind_level(wind_mph), rain_level(rain_in_hr), snow_level(snow_in_hr)
    level = max(w, r, s)
    drivers = [name for name, lvl in (("wind", w), ("rain", r), ("snow", s)) if lvl == level and lvl > LOW]

    # Load rules (applied on top of the weather-only level)
    if wind_mph >= 55:
        level, drivers = NO_TRAVEL, ["wind"]
    elif wind_mph >= 45 and load_lbs > HEAVY_LOAD_LBS:
        level = NO_TRAVEL
        drivers = ["wind", "load"]
    elif wind_mph >= 35 and load_lbs > VERY_HEAVY_LOAD_LBS and level < SEVERE:
        level = SEVERE
        drivers = ["wind", "load"]
    return {"level": level, "drivers": drivers}
