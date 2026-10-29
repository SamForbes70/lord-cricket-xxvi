"""Checks date isolation and distinguishes metadata counts from evaluation acceptance."""
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("forward_inventory", ROOT / "scripts/m7k-inventory-forward.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ForwardInventoryTests(unittest.TestCase):
    def test_same_date_and_overlapping_match_dates_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "metadata.zip"
            with zipfile.ZipFile(archive, "w") as source:
                source.writestr("LICENSE.txt", "Synthetic test data")
                for name, dates in [("old", ["2026-10-13"]), ("same", ["2026-10-14"]),
                                    ("overlap", ["2026-10-14", "2026-10-15"]), ("new", ["2026-10-15"])]:
                    source.writestr(name + ".json", json.dumps({"info": {"dates": dates}, "innings": "Not inspected by a metadata inventory"}))
            result = MODULE.inventory(archive, "2026-10-14")
            self.assertEqual(result["forwardMatchCount"], 1)
            self.assertEqual(result["matches"][0]["matchId"], "new")
            self.assertEqual(result["evaluationStatus"], "BLOCKED_INSUFFICIENT_FORWARD_MATCHES")
            self.assertFalse(result["outcomesEvaluated"])
            self.assertEqual(result, MODULE.inventory(archive, "2026-10-14"))

    def test_format_filter_excludes_other_formats_and_unknown_types(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "formats.zip"
            with zipfile.ZipFile(archive, "w") as source:
                source.writestr("LICENSE.txt", "Synthetic test data")
                for index, kind in enumerate(["T20", "ODI", "ODM", "Test", "MDM", None]):
                    source.writestr(f"{index}.json", json.dumps({"info": {"dates": ["2026-10-15"], "match_type": kind}}))
            result = MODULE.inventory(archive, "2026-10-14", "T20")
            self.assertEqual(result["forwardMatchCount"], 1)
            self.assertEqual(result["matchTypeFilter"], "T20")
            self.assertEqual(result["matches"][0]["matchId"], "0")
            self.assertEqual(MODULE.inventory(archive, "2026-10-14")["forwardMatchCount"], 6)

    def test_invalid_cutoff_rejects_before_archive_access(self):
        with self.assertRaises(ValueError):
            MODULE.inventory("missing.zip", "not-a-date")

    def test_sufficient_metadata_does_not_claim_untouched_acceptance(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "metadata.zip"
            with zipfile.ZipFile(archive, "w") as source:
                source.writestr("LICENSE.txt", "Synthetic test data")
                for index in range(200):
                    source.writestr(f"{index}.json", json.dumps({"info": {"dates": ["2026-10-15"]}}))
            result = MODULE.inventory(archive, "2026-10-14")
            self.assertEqual(result["evaluationStatus"], "ELIGIBILITY_AND_SEAL_REVIEW_REQUIRED")
            self.assertFalse(result["outcomesEvaluated"])


if __name__ == "__main__":
    unittest.main()
