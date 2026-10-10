# Weather-Aware Truck Routing

React + Django app that compares three routes between two places and recommends the safest one using
weather at each checkpoint's **estimated arrival time**, the truck's **load weight**, and travel time.

- **Backend:** Django (stateless JSON API), OpenRouteService (routes + geocoding), Open-Meteo (hourly weather)
- **Frontend:** React 18, TypeScript, Tailwind, Leaflet (OpenStreetMap tiles), pnpm

## Run locally

```bash
# Backend  (http://127.0.0.1:8000)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then put your free OpenRouteService key in ORS_API_KEY
python manage.py runserver

# Frontend (http://localhost:5173) — Vite proxies /api to the backend
cd frontend
pnpm install
pnpm dev
```

Free ORS key: https://openrouteservice.org/dev/#/signup. Open-Meteo needs no key.

## Tests

```bash
cd backend  && python manage.py check && python manage.py test      # 38 tests, external APIs mocked
cd frontend && pnpm typecheck && pnpm test && pnpm build            # 16 tests
```

## How it works

`POST /api/analyze` `{origin, destination, departure (ISO), load_lbs, interval_miles: 10|25|50}`

1. **Routes** – ORS `driving-hgv` alternatives; if fewer than 3 distinct routes come back, falls back to
   `recommended / fastest / shortest` preferences, then via-point detours. Near-duplicate geometries are discarded.
2. **Checkpoints** – every 10/25/50 miles plus the destination. ETA = departure + route duration × (miles so far / total miles).
3. **Weather** – one batched Open-Meteo request (hourly wind mph, rain in, snowfall in, UTC). Each checkpoint uses the
   forecast hour nearest its ETA. Missing data is shown as *Unknown* and never treated as zero.
4. **Risk** (`backend/routing/risk.py`) – the assessment table + load rules. Where table ranges touch (e.g. rain 0.25),
   the higher level wins; rain >1.00 and snow >3.00 are strict No Travel cut-offs.
5. **Summary** – each checkpoint covers the road halfway to its neighbours, so miles-per-risk sum to the route length.
6. **Recommendation** – lexicographic: No Travel miles → Severe miles → High miles → average risk → travel time.
   Miles are rounded to whole miles so tiny differences fall through to the next rule. (No Travel is compared first
   because it is strictly worse than Severe; the spec lists Severe first.)

### Map & slider
- Selected route is coloured per checkpoint stretch (Low #16a34a, Moderate #eab308, High #f97316, Severe #dc2626,
  No Travel #7f1d1d, grey = no data) with a wide translucent corridor underneath (the heatmap). Alternatives are dashed and clickable.
- **Weather at my ETA** (default): the recommendation view. **Forecast hour** (0–48 h slider): a snapshot of conditions
  everywhere at departure + N hours, using precomputed per-hour levels, so scrubbing needs no network calls.
  The recommendation always reflects ETA weather.

## Limitations / assumptions
- ORS `driving-hgv` is a heavy-goods profile but **no truck dimensions/weight restrictions are sent**; don't treat routes as legally truck-safe.
- ORS native alternatives are limited to shorter trips, so long trips may use preference/detour fallbacks (may be near-identical roads).
- Wind is 10 m wind speed (not gusts). Snowfall is inches of snow per hour as reported by Open-Meteo.
- Forecast covers up to ~10 days ahead; departures outside that are rejected.
- Free-tier rate limits apply (ORS ~40 directions/min); errors are surfaced as 503 with a retry message.
- Not verified against the live APIs in the authoring environment (network-restricted): external calls are covered by mocked tests only.

## Deploy (suggested)
- **Backend (Render/Railway/Fly):** root `backend/`, start `gunicorn config.wsgi`, env: `ORS_API_KEY`, `DJANGO_SECRET_KEY`,
  `DJANGO_DEBUG=false`, `DJANGO_ALLOWED_HOSTS=<api-host>`, `CORS_ALLOWED_ORIGINS=<frontend-url>`.
- **Frontend (Vercel/Netlify):** root `frontend/`, build `pnpm build`, output `dist`, env `VITE_API_BASE_URL=<backend-url>`.

## Loom outline (5–10 min)
1. Demo: Dallas → Denver, heavy load; show 3 routes, recommendation reason, checkpoints popup. 2. Slider 0/24/48 h and ETA mode.
3. Risk rules + load rules in `risk.py` and its tests. 4. Recommendation ordering in `analysis.py`. 5. Limitations above.
