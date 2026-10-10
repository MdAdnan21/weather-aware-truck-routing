from datetime import datetime, timedelta, timezone

from django.test import SimpleTestCase

from routing import analysis, risk

DEP = datetime(2026, 10, 12, 8, 0, tzinfo=timezone.utc)
ORIGIN = {"lat": 30.0, "lng": -97.0, "label": "A"}
DEST = {"lat": 33.0, "lng": -97.0, "label": "B"}  # ~207 mi


def line(offset=0.0, n=31):
    return [(30 + i * 0.1, -97.0 + offset) for i in range(n)]


def fake_routes(*specs):
    """specs: (duration_s, lng_offset)"""
    def fetch(o, d):
        return [{"coords": line(off), "distance_m": 207 * 1609.344, "duration_s": dur} for dur, off in specs]
    return fetch


def fake_weather(fn):
    """fn(lat, lng, dt) -> (wind, rain, snow) or None; builds hourly dict for each point."""
    def fetch(points, start, end):
        out = []
        for lat, lng in points:
            d, t = {}, start.replace(minute=0, second=0, microsecond=0) - timedelta(hours=2)
            while t <= end + timedelta(hours=2):
                v = fn(lat, lng, t)
                d[t.strftime("%Y-%m-%dT%H:00")] = v if v else (None, None, None)
                t += timedelta(hours=1)
            out.append(d)
        return out
    return fetch


def run(routes, weather, load=20_000, interval=25):
    return analysis.analyze(ORIGIN, DEST, DEP, load, interval, route_fetcher=routes, weather_fetcher=weather_fetcher(weather))


def weather_fetcher(fn):
    return fake_weather(fn)


class EtaAndLookup(SimpleTestCase):
    def test_checkpoint_eta_is_proportional_and_drives_weather_hour(self):
        # Wind jumps to 60 mph from 11:00 UTC onward. 3 h trip: checkpoints after ~11:00 are No Travel.
        def wx(lat, lng, t):
            return (60.0 if t >= DEP.replace(hour=11) else 5.0, 0.0, 0.0)

        res = run(fake_routes((3 * 3600, 0)), wx)
        cps = res["routes"][0]["checkpoints"]
        self.assertEqual(cps[0]["eta"], DEP.isoformat())
        self.assertEqual(cps[0]["risk"], "Low")
        self.assertEqual(cps[-1]["risk"], "No Travel")
        self.assertEqual(cps[-1]["eta"], (DEP + timedelta(hours=3)).isoformat())
        # forecast slider: hour 0 (08:00) is calm, hour 3+ (11:00) is No Travel for every checkpoint
        self.assertEqual(cps[0]["forecast"]["level"][0], risk.LOW)
        self.assertEqual(cps[0]["forecast"]["level"][24], risk.NO_TRAVEL)
        self.assertEqual(cps[0]["forecast"]["level"][48], risk.NO_TRAVEL)
        self.assertEqual(len(cps[0]["forecast"]["level"]), 49)

    def test_all_low_forecast_stays_low(self):
        res = run(fake_routes((3 * 3600, 0)), lambda *_: (5.0, 0.0, 0.0))
        r = res["routes"][0]
        self.assertTrue(all(c["risk"] == "Low" for c in r["checkpoints"]))
        self.assertEqual(r["summary"]["worst_risk"], "Low")
        self.assertAlmostEqual(r["summary"]["miles_by_risk"]["Low"], 207, delta=2)

    def test_missing_weather_is_unknown_and_excluded(self):
        res = run(fake_routes((3 * 3600, 0)), lambda *_: None)
        r = res["routes"][0]
        self.assertTrue(all(c["risk"] is None for c in r["checkpoints"]))
        self.assertIsNone(r["summary"]["avg_risk"])
        self.assertAlmostEqual(r["summary"]["unknown_miles"], 207, delta=2)

    def test_summary_miles_add_up(self):
        res = run(fake_routes((3 * 3600, 0)), lambda lat, lng, t: (40.0 if lat > 31.5 else 5.0, 0, 0), load=45_000)
        s = res["routes"][0]["summary"]
        self.assertAlmostEqual(sum(s["miles_by_risk"].values()) + s["unknown_miles"], 207, delta=2)
        self.assertGreater(s["miles_by_risk"]["Severe"], 0)  # load rule: 35-44 mph + >40,000 lb


class Recommendation(SimpleTestCase):
    def test_fewest_severe_beats_faster_route(self):
        # route 1 (offset 0) is faster but has severe wind; route 2 (offset 1.0 lng) is calm but slower
        def wx(lat, lng, t):
            return (50.0 if lng > -97.5 else 5.0, 0, 0)
        # offset coords: use lng to separate; 50 mph with 10k lb => Severe
        res = run(fake_routes((3 * 3600, 0.0), (4 * 3600, -1.0)), wx, load=10_000)
        self.assertEqual(res["recommendation"]["route_id"], "r2")
        self.assertIn("Severe", res["recommendation"]["reason"])

    def test_tie_on_risk_falls_back_to_travel_time(self):
        res = run(fake_routes((5 * 3600, 0.0), (3 * 3600, 0.0)), lambda *_: (5.0, 0, 0))
        self.assertEqual(res["recommendation"]["route_id"], "r2")
        self.assertEqual(res["routes"][1]["tags"], ["Fastest"])

    def test_no_travel_route_is_not_preferred_over_severe(self):
        def wx(lat, lng, t):
            return (60.0, 0, 0) if lng > -97.5 else (50.0, 0, 0)
        res = run(fake_routes((3 * 3600, 0.0), (4 * 3600, -1.0)), wx, load=10_000)
        self.assertEqual(res["recommendation"]["route_id"], "r2")

    def test_single_route(self):
        res = run(fake_routes((3 * 3600, 0.0)), lambda *_: (5.0, 0, 0))
        self.assertEqual(res["recommendation"]["route_id"], "r1")
