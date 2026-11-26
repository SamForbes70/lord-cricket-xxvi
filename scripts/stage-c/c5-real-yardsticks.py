#!/usr/bin/env python3
"""Stage C C5: real yardsticks for delivery V2, from the CALIBRATION split only.

RESEARCH ONLY. Reads the calibration-split delivery table from scripts/stage-c/c1-real-extract.py (date <= 2025-08-24).
The holdout (2025-08-30 onward) is never read. Full-member men's T20 internationals, first innings, split into the fit
period (<= 2023-08-31) and the selection period (2023-09-01 to 2025-08-24).

Reports, for each period:
  - dismissal kinds by phase (overs 1 to 6, 7 to 15, 16 to 20), as a share of dismissals and per legal ball;
  - first-innings totals P10 / P50 / P90 and SD, for all innings and for "full" innings only (all out, or 120 legal
    balls bowled), since an innings that ends early without being all out was shortened (rain or a reduced match);
  - the share of stumpings among dismissals.

  python3 -I scripts/stage-c/c5-real-yardsticks.py --real /home/user/lcx-data/c1-real-calibration-balls.json --out <out.json>
"""
import argparse
import json
from pathlib import Path

import numpy as np

FIT_END, CAL_END = "2023-08-31", "2025-08-24"
PHASES = (("powerplay", 0, 6), ("middle", 6, 15), ("death", 15, 20))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--real", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    d = json.loads(a.real.read_text())
    c = {k: np.array(v) for k, v in d["columns"].items()}
    assert max(d["columns"]["date"]) <= CAL_END, "the calibration table must not contain holdout matches"
    legal = (c["wides"] == 0) & (c["noballs"] == 0)
    total = c["batRuns"] + c["wides"] + c["noballs"] + c["byes"] + c["legbyes"]
    out = c["out"] != ""
    res = {"version": "LC_STAGE_C_C5_REAL_YARDSTICKS_V1", "researchOnly": True,
           "attribution": "Contains information from Cricsheet (https://cricsheet.org/), ODC-By 1.0 (https://cricsheet.org/licensing/). "
                          "Derived aggregates only. Calibration split only; the holdout is not read."}
    for name, sel in (("fit", c["fullMemberMatch"].astype(bool) & (c["date"] <= FIT_END)),
                      ("selection", c["fullMemberMatch"].astype(bool) & (c["date"] > FIT_END) & (c["date"] <= CAL_END))):
        f = sel & (c["inn"] == 0)
        r = {}
        for ph, lo, hi in PHASES:
            p = f & (c["over"] >= lo) & (c["over"] < hi)
            n = int((p & legal).sum())
            kinds, counts = np.unique(c["outKind"][p & out], return_counts=True)
            r[ph] = {"legalBalls": n, "wicketPerLegalBall": float((p & out).sum() / n),
                     "kindsShare": {str(k): float(v / counts.sum()) for k, v in zip(kinds, counts)},
                     "kindsPerLegalBall": {str(k): float(v / n) for k, v in zip(kinds, counts)}}
        ids, inv = np.unique(c["match"][f], return_inverse=True)
        runs = np.bincount(inv, total[f], len(ids))
        wk = np.bincount(inv, out[f], len(ids))
        lb = np.bincount(inv, legal[f], len(ids))
        full = (wk >= 10) | (lb >= 120)

        def dist(x):
            return {"innings": int(len(x)), "mean": float(x.mean()), "sd": float(x.std(ddof=1)),
                    "p10": float(np.percentile(x, 10)), "p50": float(np.percentile(x, 50)), "p90": float(np.percentile(x, 90))}
        r["totalsAll"] = dist(runs)
        r["totalsFullInnings"] = dist(runs[full])
        r["shortenedInnings"] = int((~full).sum())
        kinds, counts = np.unique(c["outKind"][f & out], return_counts=True)
        r["dismissalKinds"] = {str(k): float(v / counts.sum()) for k, v in zip(kinds, counts)}
        res[name] = r
    a.out.write_text(json.dumps(res, indent=1) + "\n")
    for name in ("fit", "selection"):
        r = res[name]
        print(name, "all", {k: round(v, 1) for k, v in r["totalsAll"].items()}, "full", {k: round(v, 1) for k, v in r["totalsFullInnings"].items()}, "shortened", r["shortenedInnings"])
        for ph, _, _ in PHASES:
            print(" ", ph, round(r[ph]["wicketPerLegalBall"], 4), {k: round(v, 4) for k, v in r[ph]["kindsPerLegalBall"].items()})


if __name__ == "__main__":
    main()
