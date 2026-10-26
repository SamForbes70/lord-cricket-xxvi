"""Checks review coverage, provenance rejection and non-retirement routing."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("m7k_selection", ROOT / "scripts/m7k-select-review-cases.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReviewSelectionTests(unittest.TestCase):
    def setUp(self):
        self.source = json.loads((ROOT / "docs/verification-m7j/LC_M7I_INPUT_REGISTER.json").read_text())
        self.routes = json.loads((ROOT / "docs/verification-m7j/LC_M7J_ADJUDICATION_REGISTER.json").read_text())

    def test_complete_unique_coverage_without_approvals(self):
        result = MODULE.select_cases(self.source, self.routes)
        covered = [MODULE.identity(row) for case in result["cases"] for row in case["memberIdentities"]]
        self.assertEqual(len(covered), 69)
        self.assertEqual(set(covered), {MODULE.identity(row) for row in self.source["exceptions"]})
        self.assertEqual(len(set(covered)), len(covered))
        self.assertFalse(result["gameplayIntegrationPermitted"])
        for case in result["cases"]:
            self.assertFalse(case["independentlyAdjudicated"])
            self.assertFalse(case["chronologyConfirmed"])

    def test_selection_is_independent_of_register_order(self):
        expected = MODULE.select_cases(self.source, self.routes)
        self.source["exceptions"].reverse()
        self.routes["exceptions"].reverse()
        self.assertEqual(expected, MODULE.select_cases(self.source, self.routes))

    def test_hit_ball_twice_requires_separate_review(self):
        result = MODULE.select_cases(self.source, self.routes)
        case = next(case for case in result["cases"] if case["representative"]["matchId"] == "1391336")
        self.assertEqual(case["routingWarning"], "NON_RETIREMENT_WICKET_REQUIRES_SEPARATE_LAWS_REVIEW")
        self.assertEqual(case["signature"]["observedComponents"]["wickets"][0]["kind"], "hit the ball twice")

    def test_missing_duplicate_and_tampered_provenance_reject(self):
        for mutation in ("missing", "duplicate", "hash", "reason", "cohort", "approved"):
            with self.subTest(mutation=mutation):
                routes = copy.deepcopy(self.routes)
                rows = routes["exceptions"]
                if mutation == "missing": rows.pop()
                elif mutation == "duplicate": rows.append(copy.deepcopy(rows[0]))
                elif mutation == "hash": rows[0]["sourceEventSha256"] = "0" * 64
                elif mutation == "reason": rows[0]["reason"] = "OTHER"
                elif mutation == "cohort": rows[0]["cohort"] = "OTHER"
                else: rows[0]["autoApproved"] = True
                with self.assertRaises(ValueError): MODULE.select_cases(self.source, routes)


if __name__ == "__main__":
    unittest.main()
