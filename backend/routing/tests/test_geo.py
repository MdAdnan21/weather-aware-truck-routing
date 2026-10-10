from django.test import SimpleTestCase

from routing import geo

# Roughly straight line along a meridian: 1 degree latitude ~ 69 miles.
LINE = [(30 + i * 0.1, -97.0) for i in range(31)]  # ~207 miles


class Sampling(SimpleTestCase):
    def setUp(self):
        self.cum = geo.cumulative_miles(LINE)

    def test_length_is_reasonable(self):
        self.assertAlmostEqual(self.cum[-1], 207, delta=2)

    def test_checkpoint_spacing_and_endpoints(self):
        for interval in (10, 25, 50):
            s = geo.sample_route(LINE, self.cum, interval)
            self.assertEqual(s[0].mile, 0)
            self.assertAlmostEqual(s[-1].mile, self.cum[-1], places=6)
            self.assertAlmostEqual(s[1].mile, interval)
            self.assertEqual((s[0].lat, s[0].lng), LINE[0])

    def test_coverage_sums_to_route_length(self):
        s = geo.sample_route(LINE, self.cum, 25)
        self.assertAlmostEqual(sum(x.coverage_miles for x in s), self.cum[-1], places=6)

    def test_segments_are_contiguous_and_ordered(self):
        s = geo.sample_route(LINE, self.cum, 25)
        self.assertEqual(s[0].seg_start, 0)
        self.assertEqual(s[-1].seg_end, len(LINE) - 1)
        for a, b in zip(s, s[1:]):
            self.assertEqual(a.seg_end, b.seg_start)
            self.assertLessEqual(a.seg_start, a.seg_end)
