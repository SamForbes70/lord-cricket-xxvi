#!/usr/bin/env python3
"""Stage C research slice C1: extract men's T20 international deliveries from a local Cricsheet archive.

Research only. Reads the Cricsheet `t20s_json.zip` (ODC-By 1.0, https://cricsheet.org/licensing/) and an
acquisition manifest written by scripts/m7d-acquire.py, checks the archive SHA-256 against the manifest, fixes the
date splits BEFORE any analysis, and writes:

  * a split manifest (match ids per split, with dates and the cohort rule), small enough to commit;
  * a normalised delivery table for the calibration split only, kept OUTSIDE the repository (raw-derived data).

Cohort: info.gender == "male", info.team_type == "international", info.match_type == "T20", info.overs == 20.
Super-over innings are dropped. Every other innings is kept (rain-shortened and no-result matches included), because
the C1 statistics are per-ball rates.

Splits (dates from docs/M7E_REAL_CRICSHEET_HOLDOUT.md and docs/M7G_RESEARCH_AND_PROMOTION_GATES.md):
  calibration  date <= 2025-08-24 (last M7G training date)
  gap          2025-08-25 to 2025-08-29 (between the M7G training and holdout; not used)
  holdout      2025-08-30 to 2026-10-14 (M7G/M7E holdout; ids recorded, NOT read further by C1)
  after        date > 2026-10-14 (not used)

Run with an isolated interpreter (the archive is untrusted input):
  python3 -I scripts/stage-c/c1-real-extract.py --archive /home/user/lcx-data/t20s_json.zip \
      --manifest /home/user/lcx-data/acquisition.json --splits docs/pavilion/stage-c/c1-splits.json \
      --balls /home/user/lcx-data/c1-real-calibration-balls.json
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile

CAL_END = "2025-08-24"
HOLD_START = "2025-08-30"
HOLD_END = "2026-10-14"
BOWLER_KINDS = {"bowled", "caught", "caught and bowled", "lbw", "stumped", "hit wicket"}
NOT_DISMISSAL = {"retired hurt", "retired not out"}
FULL_MEMBERS = {"Afghanistan", "Australia", "Bangladesh", "England", "India", "Ireland", "New Zealand",
                "Pakistan", "South Africa", "Sri Lanka", "West Indies", "Zimbabwe"}


def split_of(date: str) -> str:
    if date <= CAL_END:
        return "calibration"
    if date < HOLD_START:
        return "gap"
    if date <= HOLD_END:
        return "holdout"
    return "after"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", type=Path, required=True)
    ap.add_argument("--manifest", type=Path, required=True)
    ap.add_argument("--splits", type=Path, required=True)
    ap.add_argument("--balls", type=Path, required=True)
    ap.add_argument("--split", choices=("calibration", "holdout"), default="calibration",
                    help="which split's deliveries to write (Stage C: the holdout is read once, for the C2 final report)")
    a = ap.parse_args()
    manifest = json.loads(a.manifest.read_text())
    archive_sha = sha256_file(a.archive)
    if archive_sha != manifest["archiveSha256"]:
        raise SystemExit("ARCHIVE_SHA256_MISMATCH")
    z = zipfile.ZipFile(a.archive)
    licence_sha = hashlib.sha256(z.read("LICENSE.txt")).hexdigest()
    if licence_sha != manifest["licenseNoticeSha256"]:
        raise SystemExit("LICENCE_SHA256_MISMATCH")

    splits = {k: [] for k in ("calibration", "gap", "holdout", "after")}
    excluded = {"notMale": 0, "notInternational": 0, "notT20": 0, "notTwentyOvers": 0}
    # Column store for the calibration deliveries.
    cols = {k: [] for k in ("match", "date", "inn", "over", "batter", "nonStriker", "bowler", "pos", "nsPos", "batRuns",
                            "wides", "noballs", "byes", "legbyes", "out", "outKind", "battingTeam", "fullMemberMatch")}
    names = sorted(n for n in z.namelist() if n.endswith(".json"))
    for name in names:
        d = json.loads(z.read(name))
        info = d["info"]
        if info.get("gender") != "male":
            excluded["notMale"] += 1
            continue
        if info.get("team_type") != "international":
            excluded["notInternational"] += 1
            continue
        if info.get("match_type") != "T20":
            excluded["notT20"] += 1
            continue
        if info.get("overs") != 20:
            excluded["notTwentyOvers"] += 1
            continue
        mid = PurePosixPath(name).stem
        date = info["dates"][0]
        s = split_of(date)
        splits[s].append({"matchId": mid, "date": date})
        if s != a.split:
            continue  # other splits are never read beyond their id and date
        full = all(t in FULL_MEMBERS for t in info.get("teams", []))
        reg = info.get("registry", {}).get("people", {})
        pid = lambda n: reg.get(n, "name:" + n)
        for ii, inn in enumerate(d.get("innings", [])):
            if inn.get("super_over"):
                continue
            order = {}
            for over in inn.get("overs", []):
                for dl in over["deliveries"]:
                    for who in (dl["batter"], dl["non_striker"]):
                        if who not in order:
                            order[who] = len(order) + 1
                    ex = dl.get("extras", {})
                    out_id, out_kind = "", ""
                    for w in dl.get("wickets", []):
                        if w["kind"] in NOT_DISMISSAL:
                            continue
                        out_id, out_kind = pid(w["player_out"]), w["kind"]
                        if w["player_out"] not in order:
                            order[w["player_out"]] = len(order) + 1
                    cols["match"].append(mid); cols["date"].append(date); cols["inn"].append(ii)
                    cols["over"].append(over["over"]); cols["batter"].append(pid(dl["batter"]))
                    cols["nonStriker"].append(pid(dl["non_striker"])); cols["bowler"].append(pid(dl["bowler"]))
                    cols["pos"].append(order[dl["batter"]]); cols["nsPos"].append(order[dl["non_striker"]]); cols["batRuns"].append(dl["runs"]["batter"])
                    cols["wides"].append(ex.get("wides", 0)); cols["noballs"].append(ex.get("noballs", 0))
                    cols["byes"].append(ex.get("byes", 0)); cols["legbyes"].append(ex.get("legbyes", 0))
                    cols["out"].append(out_id); cols["outKind"].append(out_kind)
                    cols["battingTeam"].append(inn.get("team", "")); cols["fullMemberMatch"].append(full)
    for k in splits:
        splits[k].sort(key=lambda m: (m["date"], m["matchId"]))
    ids = {k: {m["matchId"] for m in v} for k, v in splits.items()}
    assert not (ids["calibration"] & ids["holdout"])
    assert max(m["date"] for m in splits["calibration"]) < min(m["date"] for m in splits["holdout"])
    attribution = {
        "source": "Cricsheet, https://cricsheet.org/",
        "sourceURL": manifest["sourceURL"],
        "licence": "Open Data Commons Attribution License (ODC-By) 1.0",
        "licenceURL": "https://cricsheet.org/licensing/",
        "archiveSha256": archive_sha,
        "licenceNoticeSha256": licence_sha,
        "retrievedAtUTC": manifest["retrievedAtUTC"],
        "note": "Derived match identifiers and dates only. Contains information from Cricsheet, made available under ODC-By 1.0.",
    }
    out = {
        "version": "LC_STAGE_C_C1_SPLITS_V1",
        "attribution": attribution,
        "cohort": "info.gender == male, info.team_type == international, info.match_type == T20, info.overs == 20 (men's T20 internationals as classified by Cricsheet; Afghanistan men's matches are withheld by Cricsheet)",
        "rules": {"calibration": f"date <= {CAL_END}", "gap": f"{CAL_END} < date < {HOLD_START} (unused)",
                  "holdout": f"{HOLD_START} <= date <= {HOLD_END} (reporting only, used once, not read by C1)",
                  "after": f"date > {HOLD_END} (unused)"},
        "excluded": excluded,
        "counts": {k: len(v) for k, v in splits.items()},
        "dateRange": {k: [v[0]["date"], v[-1]["date"]] if v else None for k, v in splits.items()},
        "matchIds": {k: [m["matchId"] for m in v] for k, v in splits.items()},
    }
    if a.split == "calibration":  # the split manifest is written once, by the calibration run
        a.splits.parent.mkdir(parents=True, exist_ok=True)
        a.splits.write_text(json.dumps(out, indent=1) + "\n")
    a.balls.write_text(json.dumps({"attribution": attribution, "split": a.split, "columns": cols}))
    print(json.dumps({"counts": out["counts"], "dateRange": out["dateRange"], "excluded": excluded,
                      "split": a.split, "deliveries": len(cols["match"])}))


if __name__ == "__main__":
    main()
