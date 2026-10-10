import json
import logging
from datetime import datetime, timedelta, timezone

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from . import analysis, providers

log = logging.getLogger(__name__)
ALLOWED_INTERVALS = (10, 25, 50)
MAX_LOAD_LBS = 150_000


def _error(message, status=400, details=None):
    body = {"error": message}
    if details:
        body["details"] = details
    return JsonResponse(body, status=status)


def _parse_place(raw, field, errors):
    try:
        lat, lng = float(raw["lat"]), float(raw["lng"])
    except (KeyError, TypeError, ValueError):
        errors[field] = "Provide numeric lat and lng."
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        errors[field] = "Coordinates are out of range."
        return None
    return {"lat": lat, "lng": lng, "label": str(raw.get("label") or f"{lat:.4f}, {lng:.4f}")[:200]}


def parse_request(payload):
    """Validate the /analyze payload. Returns (clean, errors)."""
    errors = {}
    if not isinstance(payload, dict):
        return None, {"body": "Expected a JSON object."}
    origin = _parse_place(payload.get("origin") or {}, "origin", errors)
    destination = _parse_place(payload.get("destination") or {}, "destination", errors)

    departure = None
    try:
        departure = datetime.fromisoformat(str(payload.get("departure")).replace("Z", "+00:00"))
        if departure.tzinfo is None:
            departure = departure.replace(tzinfo=timezone.utc)
        departure = departure.astimezone(timezone.utc)
        now = datetime.now(timezone.utc)
        if departure < now - timedelta(hours=24) or departure > now + timedelta(days=10):
            errors["departure"] = "Departure must be within the last 24 hours and the next 10 days (forecast range)."
    except ValueError:
        errors["departure"] = "Use an ISO 8601 date/time."

    load = payload.get("load_lbs")
    if isinstance(load, bool) or not isinstance(load, (int, float)) or not (0 <= load <= MAX_LOAD_LBS):
        errors["load_lbs"] = f"Load weight must be a number between 0 and {MAX_LOAD_LBS:,} lb."

    interval = payload.get("interval_miles", 25)
    if interval not in ALLOWED_INTERVALS:
        errors["interval_miles"] = "Interval must be 10, 25 or 50 miles."

    if origin and destination and origin["lat"] == destination["lat"] and origin["lng"] == destination["lng"]:
        errors["destination"] = "Destination must differ from the origin."
    if errors:
        return None, errors
    return {"origin": origin, "destination": destination, "departure": departure,
            "load_lbs": float(load), "interval_miles": interval}, {}


@require_GET
def health(request):
    return JsonResponse({"status": "ok"})


@require_GET
def geocode(request):
    q = request.GET.get("q", "").strip()
    if len(q) < 3:
        return _error("Query must be at least 3 characters.", 400)
    try:
        return JsonResponse({"results": providers.geocode(q[:200])})
    except providers.ProviderError as exc:
        return _error(exc.message, exc.status)


@csrf_exempt
@require_POST
def analyze(request):
    try:
        payload = json.loads(request.body or b"{}")
    except ValueError:
        return _error("Invalid JSON body.")
    clean, errors = parse_request(payload)
    if errors:
        return _error("Invalid request.", 400, errors)
    try:
        return JsonResponse(analysis.analyze(**clean))
    except providers.ProviderError as exc:
        return _error(exc.message, exc.status)
    except Exception:  # noqa: BLE001 - never leak internals to the client
        log.exception("Unexpected error during route analysis")
        return _error("Unexpected server error while analysing the route.", 500)
