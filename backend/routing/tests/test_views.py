import json
from datetime import datetime, timedelta, timezone
from unittest import mock

from django.test import SimpleTestCase

from routing import providers


def payload(**over):
    base = {
        "origin": {"lat": 32.78, "lng": -96.8, "label": "Dallas"},
        "destination": {"lat": 39.74, "lng": -104.99, "label": "Denver"},
        "departure": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        "load_lbs": 42000, "interval_miles": 25,
    }
    base.update(over)
    return base


class AnalyzeValidation(SimpleTestCase):
    def post(self, body):
        return self.client.post("/api/analyze", data=json.dumps(body), content_type="application/json")

    def test_rejects_bad_coordinates(self):
        r = self.post(payload(origin={"lat": 120, "lng": 0}))
        self.assertEqual(r.status_code, 400)
        self.assertIn("origin", r.json()["details"])

    def test_rejects_bad_load_interval_and_departure(self):
        r = self.post(payload(load_lbs=-5, interval_miles=7, departure="tomorrow-ish"))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(set(r.json()["details"]), {"load_lbs", "interval_miles", "departure"})

    def test_rejects_departure_beyond_forecast_range(self):
        far = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        self.assertEqual(self.post(payload(departure=far)).status_code, 400)

    def test_rejects_same_origin_and_destination(self):
        p = payload()
        p["destination"] = dict(p["origin"])
        self.assertEqual(self.post(p).status_code, 400)

    def test_invalid_json(self):
        r = self.client.post("/api/analyze", data="{nope", content_type="application/json")
        self.assertEqual(r.status_code, 400)

    def test_method_not_allowed(self):
        self.assertEqual(self.client.get("/api/analyze").status_code, 405)

    def test_provider_error_maps_to_status(self):
        with mock.patch("routing.analysis.analyze", side_effect=providers.ProviderError("rate limited", 503)):
            r = self.post(payload())
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["error"], "rate limited")

    def test_unexpected_error_does_not_leak_details(self):
        with mock.patch("routing.analysis.analyze", side_effect=RuntimeError("secret internals")):
            r = self.post(payload())
        self.assertEqual(r.status_code, 500)
        self.assertNotIn("secret", r.content.decode())

    def test_success_passes_clean_values(self):
        with mock.patch("routing.analysis.analyze", return_value={"routes": []}) as m:
            r = self.post(payload())
        self.assertEqual(r.status_code, 200)
        kwargs = m.call_args.kwargs
        self.assertEqual(kwargs["load_lbs"], 42000.0)
        self.assertEqual(kwargs["interval_miles"], 25)


class OtherEndpoints(SimpleTestCase):
    def test_health(self):
        self.assertEqual(self.client.get("/api/health").json(), {"status": "ok"})

    def test_geocode_requires_query(self):
        self.assertEqual(self.client.get("/api/geocode?q=ab").status_code, 400)

    def test_geocode_proxies(self):
        with mock.patch("routing.providers.geocode", return_value=[{"label": "X", "lat": 1, "lng": 2}]):
            r = self.client.get("/api/geocode?q=dallas")
        self.assertEqual(r.json()["results"][0]["label"], "X")


class ProviderParsing(SimpleTestCase):
    def test_weather_chunk_parses_multi_location_response(self):
        body = [{"hourly": {"time": ["2026-10-12T08:00"], "wind_speed_10m": [12.0], "rain": [0.0], "snowfall": [0.0]}}] * 2
        resp = mock.Mock(status_code=200)
        resp.json.return_value = body
        with mock.patch("routing.providers.requests.request", return_value=resp) as req:
            out = providers._fetch_weather_chunk([(1.0, 2.0), (3.0, 4.0)], datetime(2026, 10, 12, tzinfo=timezone.utc), datetime(2026, 10, 14, tzinfo=timezone.utc))
        self.assertEqual(out[1]["2026-10-12T08:00"], (12.0, 0.0, 0.0))
        params = req.call_args.kwargs["params"]
        self.assertEqual((params["wind_speed_unit"], params["precipitation_unit"], params["timezone"]), ("mph", "inch", "UTC"))

    def test_weather_malformed_raises(self):
        resp = mock.Mock(status_code=200)
        resp.json.return_value = {"hourly": {"time": ["a", "b"], "wind_speed_10m": [1], "rain": [1], "snowfall": [1]}}
        with mock.patch("routing.providers.requests.request", return_value=resp):
            with self.assertRaises(providers.ProviderError):
                providers._fetch_weather_chunk([(1.0, 2.0)], datetime(2026, 10, 12, tzinfo=timezone.utc), datetime(2026, 10, 13, tzinfo=timezone.utc))

    def test_timeout_maps_to_504(self):
        import requests
        with mock.patch("routing.providers.requests.request", side_effect=requests.Timeout):
            with self.assertRaises(providers.ProviderError) as ctx:
                providers._request("GET", "http://x", what="Weather service")
        self.assertEqual(ctx.exception.status, 504)

    def test_missing_ors_key(self):
        with self.settings(ORS_API_KEY=""):
            with self.assertRaises(providers.ProviderError) as ctx:
                providers.geocode("dallas")
        self.assertEqual(ctx.exception.status, 503)
