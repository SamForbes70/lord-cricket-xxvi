"""Checks chase censoring, phase reconciliation and deterministic cohort summaries."""
import copy
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("quality_summary", ROOT / "scripts/summarise-synthetic-quality.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def innings(runs, wickets, balls):
    phases = {}
    remaining = balls
    for name, capacity in zip(MODULE.PHASES, (36, 54, 30)):
        legal = min(remaining, capacity)
        remaining -= legal
        phases[name] = dict(runs=0, wickets=0, legalBalls=legal, attempts=legal, dots=0, boundaries=0)
    phases["POWERPLAY"].update(runs=runs, wickets=wickets)
    return dict(runs=runs, wickets=wickets, legalBalls=balls, attempts=balls, dots=0,
                boundaries=0, illegals=0, phases=phases)


class SyntheticQualitySummaryTests(unittest.TestCase):
    def setUp(self):
        self.protocol = dict(matches=2, seedPrefix="sample-", seedOffset=0,
                             targetBands=[dict(name="LOW", min=1, max=80), dict(name="HIGH", min=81, max=None)])
        self.source = dict(matches=2, modelId="synthetic-alpha-01", modelHash="a" * 64, worldSha256="b" * 64,
                           runtime=dict(p95=1), rows=[
                               dict(seed="sample-000000", first=innings(40, 8, 120), second=innings(42, 2, 60), eventHash="c" * 64, elapsedMs=1),
                               dict(seed="sample-000001", first=innings(100, 4, 120), second=innings(80, 10, 110), eventHash="d" * 64, elapsedMs=2)])

    def test_short_successful_chase_is_separate_from_full_first_innings(self):
        result = MODULE.summarise(self.source, self.protocol)
        self.assertEqual(result["firstInnings"]["meanRuns"], 70)
        self.assertEqual(result["secondByTermination"]["CHASE_WON"]["count"], 1)
        self.assertEqual(result["secondByTermination"]["ALL_OUT"]["count"], 1)
        self.assertEqual(result["targetBands"]["LOW"]["successfulChases"], 1)
        self.assertEqual(result["targetBands"]["HIGH"]["successfulChases"], 0)
        self.assertFalse(result["empiricalValidation"])

    def test_target_on_final_ball_and_tied_allocation_are_distinguished(self):
        self.source["rows"][0]["second"] = innings(41, 2, 120)
        self.source["rows"][1]["second"] = innings(100, 4, 120)
        result = MODULE.summarise(self.source, self.protocol)
        self.assertEqual(result["secondByTermination"]["CHASE_WON"]["count"], 1)
        self.assertEqual(result["secondByTermination"]["ALLOCATION_END"]["count"], 1)
        self.assertEqual(result["ties"], 1)

    def test_invalid_counts_phase_totals_and_nonterminal_matches_reject(self):
        for mutation in ("negative", "phase", "attempts", "nonterminal"):
            with self.subTest(mutation=mutation):
                source = copy.deepcopy(self.source)
                a = source["rows"][0]["first"]
                if mutation == "negative": a["runs"] = -1
                elif mutation == "phase": a["phases"]["POWERPLAY"]["runs"] += 1
                elif mutation == "attempts": a["illegals"] += 1
                else: source["rows"][0]["first"] = innings(40, 2, 60)
                with self.assertRaises(ValueError): MODULE.summarise(source, self.protocol)

    def test_seed_or_count_changes_reject(self):
        for mutation in ("duplicate", "count"):
            source = copy.deepcopy(self.source)
            if mutation == "duplicate": source["rows"][1]["seed"] = source["rows"][0]["seed"]
            else: source["matches"] = 3
            with self.assertRaises(ValueError): MODULE.summarise(source, self.protocol)

    def test_target_band_gaps_and_overlaps_reject(self):
        for bands in ([dict(name="NONE", min=1000, max=None)], [dict(name="A", min=1, max=None), dict(name="B", min=1, max=None)]):
            protocol = {**self.protocol, "targetBands": bands}
            with self.assertRaises(ValueError): MODULE.summarise(self.source, protocol)

    def test_repeat_projection_ignores_timing_but_retains_event_hashes(self):
        repeat = copy.deepcopy(self.source)
        repeat["runtime"]["p95"] = 100
        repeat["rows"][0]["elapsedMs"] = 200
        self.assertEqual(MODULE.deterministic_projection(self.source), MODULE.deterministic_projection(repeat))
        repeat["rows"][0]["eventHash"] = "e" * 64
        self.assertNotEqual(MODULE.deterministic_projection(self.source), MODULE.deterministic_projection(repeat))


if __name__ == "__main__":
    unittest.main()
