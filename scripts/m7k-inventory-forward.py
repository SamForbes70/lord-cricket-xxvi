#!/usr/bin/env python3
"""Inventories forward-dated match metadata without extracting outcomes or scoring metrics."""
import argparse
import datetime
import hashlib
import json
import zipfile
from pathlib import Path


def inventory(archive, cutoff):
    datetime.date.fromisoformat(cutoff)
    rows = []
    with zipfile.ZipFile(archive) as source:
        names = source.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive member")
        notice = source.read("LICENSE.txt")
        for name in names:
            if not name.endswith(".json"):
                continue
            raw = source.read(name)
            dates = json.loads(raw)["info"]["dates"]
            if not dates:
                raise ValueError("Missing match dates")
            for date in dates:
                datetime.date.fromisoformat(date)
            if min(dates) > cutoff:
                rows.append({"matchId": Path(name).stem, "date": min(dates), "lastDate": max(dates),
                             "sourceSha256": hashlib.sha256(raw).hexdigest()})
    return {"version": "LC_M7K_FORWARD_METADATA_INVENTORY_V1", "archiveSha256": hashlib.sha256(Path(archive).read_bytes()).hexdigest(),
            "licenceNoticeSha256": hashlib.sha256(notice).hexdigest(), "priorDevelopmentLatestDate": cutoff,
            "minimumEvaluationMatches": 200, "forwardMatchCount": len(rows),
            "evaluationStatus": "BLOCKED_INSUFFICIENT_FORWARD_MATCHES" if len(rows) < 200 else "ELIGIBILITY_AND_SEAL_REVIEW_REQUIRED",
            "outcomesEvaluated": False, "matches": sorted(rows, key=lambda row: (row["date"], row["matchId"]))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--after-date", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    result = inventory(args.archive, args.after_date)
    Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
    print(f"{result['evaluationStatus']}: {result['forwardMatchCount']} forward-dated matches before eligibility checks; minimum 200.")


if __name__ == "__main__":
    main()
