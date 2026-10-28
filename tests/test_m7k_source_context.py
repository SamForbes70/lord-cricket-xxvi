"""Checks source addressing and rejection without licensed external data."""
import copy
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("m7k_context", ROOT / "scripts/m7k-audit-source-context.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SourceContextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.archive = Path(self.temp.name) / "source.zip"
        self.deliveries = [
            {"batter": "A", "non_striker": "B", "bowler": "C", "actual_delivery": "0.1",
             "runs": {"batter": 0, "extras": 1, "total": 1}, "extras": {"noballs": 1}},
            {"batter": "A", "non_striker": "B", "bowler": "C", "actual_delivery": "0.1",
             "runs": {"batter": 1, "extras": 0, "total": 1}, "wickets": [{"kind": "retired not out", "player_out": "A"}]},
            {"batter": "D", "non_striker": "B", "bowler": "C", "actual_delivery": "0.2",
             "runs": {"batter": 4, "extras": 0, "total": 4}},
        ]
        self.match = {"info": {"dates": ["2023-01-01"], "teams": ["One", "Two"]},
                      "innings": [{"team": "One", "overs": [{"over": 0, "deliveries": self.deliveries}]}]}
        self.row = {"matchId": "123", "innings": 1, "over": 0, "attempt": 1,
                    "sourceEventSha256": MODULE.digest(MODULE.addressed("123", 1, 0, 1, self.deliveries[1])),
                    "cohort": "training", "reason": "UNSUPPORTED_WICKET_TYPE"}
        self.register = {"exceptions": [self.row]}
        self.selection = {"gameplayIntegrationPermitted": False, "cases": [{
            "signatureSha256": "signature", "representative": self.row.copy(), "memberIdentities": [self.row.copy()],
            "independentlyAdjudicated": False, "chronologyConfirmed": False}]}
        self.write_archive()

    def write_archive(self):
        with zipfile.ZipFile(self.archive, "w") as source:
            source.writestr("123.json", json.dumps(self.match))

    def run_audit(self):
        return MODULE.audit(self.archive, self.register, self.selection)

    def test_repeated_label_uses_source_index_and_preserves_observations(self):
        result = self.run_audit()
        event = result["events"][0]
        self.assertEqual(event["observedPriorRunSum"], 1)
        self.assertEqual(event["observedPriorDeliveryCount"], 1)
        self.assertEqual(event["observedPriorWicketKinds"], {})
        self.assertEqual(event["observedCurrentWickets"][0]["kind"], "retired not out")
        self.assertEqual([item["relativePosition"] for item in event["sourceNeighbors"]], [-1, 0, 1])
        self.assertEqual(event["sourceNeighbors"][1]["sourceEventSha256"], self.row["sourceEventSha256"])
        self.assertNotEqual(event["sourceNeighbors"][0]["sourceEventSha256"], self.row["sourceEventSha256"])
        self.assertEqual(result["acceptedFixtureCount"], 0)
        self.assertFalse(result["gameplayIntegrationPermitted"])
        self.assertFalse(event["chronologyConfirmed"])
        self.assertFalse(event["independentlyAdjudicated"])

    def test_changed_delivery_rejects(self):
        self.deliveries[1]["runs"]["total"] = 100
        self.write_archive()
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            self.run_audit()

    def test_missing_archive_match_rejects(self):
        with zipfile.ZipFile(self.archive, "w"):
            pass
        with self.assertRaisesRegex(ValueError, "Missing or duplicate source match"):
            self.run_audit()

    def test_selection_omission_and_duplicate_reject(self):
        for members in ([], [self.row, self.row]):
            with self.subTest(members=members):
                self.selection["cases"][0]["memberIdentities"] = members
                with self.assertRaisesRegex(ValueError, "coverage"):
                    self.run_audit()

    def test_register_duplicate_rejects(self):
        self.register["exceptions"].append(copy.deepcopy(self.row))
        with self.assertRaisesRegex(ValueError, "Duplicate register"):
            self.run_audit()

    def test_approval_and_gameplay_flags_reject(self):
        for key in ("independentlyAdjudicated", "chronologyConfirmed", "gameplayIntegrationPermitted"):
            with self.subTest(key=key):
                target = self.selection if key == "gameplayIntegrationPermitted" else self.selection["cases"][0]
                target[key] = True
                with self.assertRaises(ValueError):
                    self.run_audit()
                target[key] = False

    def test_missing_or_duplicate_position_rejects(self):
        for overs in ([], self.match["innings"][0]["overs"] * 2):
            with self.subTest(overs=overs):
                self.match["innings"][0]["overs"] = overs
                self.write_archive()
                with self.assertRaisesRegex(ValueError, "source position"):
                    self.run_audit()

    def test_output_reproduces_and_register_order_is_irrelevant(self):
        first = copy.deepcopy(self.row)
        first["attempt"] = 0
        first["sourceEventSha256"] = MODULE.digest(MODULE.addressed("123", 1, 0, 0, self.deliveries[0]))
        self.register["exceptions"].append(first)
        self.selection["cases"][0]["memberIdentities"].append(first.copy())
        expected = self.run_audit()
        self.register["exceptions"].reverse()
        self.selection["cases"][0]["memberIdentities"].reverse()
        self.assertEqual(expected, self.run_audit())


if __name__ == "__main__":
    unittest.main()
