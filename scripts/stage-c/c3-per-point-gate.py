#!/usr/bin/env python3
"""Stage C C3: per-rating-point gate for one calibrated pack revision against the C3 targets (c3-mapping.json).

RESEARCH ONLY. Reads derived files only: per-point.json from scripts/stage-c/c2-dose.sh (one model, one pack) and
c3-mapping.json (fit-period targets, calibration split; the holdout is never read). Effects are oriented so that a
correct effect is positive. PASS when the effect lies inside the target range.

  python3 -I scripts/stage-c/c3-per-point-gate.py --dose <per-point.json> --mapping docs/pavilion/stage-c/c3-mapping.json \
      --pack-version LC_CALIBRATED_T20_SKILL_V3 --pack-sha256 <hash> --out docs/pavilion/stage-c/c3-v3-per-point.json
"""
import argparse
import json
from pathlib import Path

ROWS = (("batting.runs", "runs.batter", 1), ("batting.boundary", "boundary.batter", 1), ("batting.nonDot", "nonDot.batter", 1),
        ("batting.dismissal", "dismissal.batter", -1), ("bowling.runs", "runs.bowler", -1), ("bowling.boundary", "boundary.bowler", -1),
        ("bowling.nonDot", "nonDot.bowler", -1), ("bowling.dismissal", "dismissal.bowler", 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dose", type=Path, required=True)
    ap.add_argument("--mapping", type=Path, required=True)
    ap.add_argument("--pack-version", required=True)
    ap.add_argument("--pack-sha256", required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    d = json.loads(a.dose.read_text())
    m = json.loads(a.mapping.read_text())
    gates = {}
    for key, tkey, sign in ROWS:
        lo, hi = m["perPointTargets"][tkey]["range"]
        g = sign * d[key]
        gates[key] = {"game": g, "range": [lo, hi], "positionInRange": (g - lo) / (hi - lo) if hi > lo else None,
                      "verdict": "PASS" if lo <= g <= hi else "FAIL"}
    gates["variationTradeOff"] = {"dismissalPerPoint": d["variation.dismissal"], "runsPerPoint": d["variation.runs"],
                                  "verdict": "PASS" if d["variation.dismissal"] > 0 and d["variation.runs"] > 0 else "FAIL"}
    out = {"version": "LC_STAGE_C_C3_PER_POINT_GATE_V1", "researchOnly": True, "model": "calibrated-t20-01",
           "packVersion": a.pack_version, "packSha256": a.pack_sha256, "attribution": m["attribution"],
           "targets": "c3-mapping.json (fit period, full-member reference, quarters of the game's regular players)",
           "gates": gates, "firstInningsRunsByCondition": d.get("firstInningsRuns")}
    a.out.write_text(json.dumps(out, indent=1) + "\n")
    for k, v in gates.items():
        print(k, {kk: (round(vv, 5) if isinstance(vv, float) else vv) for kk, vv in v.items() if kk != "range"}, [round(x, 5) for x in v.get("range", [])])


if __name__ == "__main__":
    main()
