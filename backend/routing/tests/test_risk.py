from django.test import SimpleTestCase

from routing import risk


class WindRainSnowThresholds(SimpleTestCase):
    def test_wind_boundaries(self):
        cases = [(0, 0), (24.9, 0), (25, 1), (34.9, 1), (35, 2), (44.9, 2), (45, 3), (54.9, 3), (55, 4), (80, 4)]
        for mph, expected in cases:
            self.assertEqual(risk.wind_level(mph), expected, mph)

    def test_rain_boundaries(self):
        cases = [(0, 0), (0.099, 0), (0.10, 1), (0.249, 1), (0.25, 2), (0.499, 2), (0.50, 3), (1.00, 3), (1.01, 4)]
        for v, expected in cases:
            self.assertEqual(risk.rain_level(v), expected, v)

    def test_snow_boundaries(self):
        cases = [(0, 0), (0.49, 0), (0.5, 1), (0.99, 1), (1.0, 2), (1.99, 2), (2.0, 3), (3.0, 3), (3.01, 4)]
        for v, expected in cases:
            self.assertEqual(risk.snow_level(v), expected, v)


class Classify(SimpleTestCase):
    def test_overall_is_worst_factor(self):
        r = risk.classify(10, 0.3, 0.6, 20_000)
        self.assertEqual(r["level"], risk.HIGH)
        self.assertEqual(r["drivers"], ["rain"])

    def test_all_low(self):
        self.assertEqual(risk.classify(5, 0, 0, 80_000)["level"], risk.LOW)

    def test_wind_55_is_no_travel_for_any_load(self):
        self.assertEqual(risk.classify(55, 0, 0, 0)["level"], risk.NO_TRAVEL)

    def test_wind_45_to_54_heavy_load_no_travel(self):
        self.assertEqual(risk.classify(50, 0, 0, 30_001)["level"], risk.NO_TRAVEL)
        self.assertEqual(risk.classify(50, 0, 0, 30_000)["level"], risk.SEVERE)

    def test_wind_35_to_44_very_heavy_load_is_severe(self):
        self.assertEqual(risk.classify(40, 0, 0, 40_001)["level"], risk.SEVERE)
        self.assertEqual(risk.classify(40, 0, 0, 40_000)["level"], risk.HIGH)

    def test_load_rule_never_downgrades(self):
        self.assertEqual(risk.classify(40, 2.5, 0, 45_000)["level"], risk.NO_TRAVEL)

    def test_missing_data_is_unknown_not_zero(self):
        self.assertIsNone(risk.classify(None, 0, 0, 1000))
        self.assertIsNone(risk.classify(10, None, 0, 1000))
