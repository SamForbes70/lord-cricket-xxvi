#!/usr/bin/env python3
"""Stage C C3: rating-to-skill mapping fitted to the players who actually bat and bowl in the game.

RESEARCH ONLY. Owner decision of 25 November 2026: map ratings to real skill using the quarters of the game's
own regular players, not the world's whole rating spread; do not centre on the selected elevens; do not rescale
world ratings.

Game side (no real data): the synthetic-alpha-01 game run of C1 (frozen corpus seeds x 20 repeats, suggested elevens,
captain V3). Batters with at least 100 balls faced and bowlers with at least 100 legal balls, quartered by the game's
own batting score (timing + power + defence + rotation) and bowling score (control + movement + variation); the gap
between the top and bottom quarter means, per skill point (batting score / 4, bowling score / 3). These players are
chosen by selection and captain, not by the delivery model, so the run of either model gives the same set
[Inference: checked for the calibrated C2 run in c3-mapping.json, `calibratedRunQuarterMeans`].

Real side: the fit-period (to 2023-08-31) full-member true relative SDs and their match-bootstrap P10 to P90
(c2-fit.json). A real top / bottom quarter log ratio is ln((1 + 1.2711 SD) / (1 - 1.2711 SD)), so the per-point
target is that log ratio divided by the game's quarter gap. The validation period and the holdout are not used.

  python3 -I scripts/stage-c/c3-mapping.py --synthetic-analysis docs/pavilion/stage-c/c1-skill-differentiation.json \
      --calibrated-analysis docs/pavilion/stage-c/c2-skill-differentiation.json --fit docs/pavilion/stage-c/c2-fit.json \
      --out docs/pavilion/stage-c/c3-mapping.json
"""
import argparse
import json
import math
from pathlib import Path

TOPQ = 1.2711
ATTRIBUTION_NOTE = ("Derived aggregates only (no ball-by-ball records). Contains information from Cricsheet, "
                    "made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/.")


def log_ratio(sd):
    return math.log((1 + TOPQ * sd) / (1 - TOPQ * sd)) if sd and TOPQ * sd < 1 else 0.0


def main():
    ap = argparse.ArgumentParser()
    for k in ("synthetic-analysis", "calibrated-analysis", "fit", "out"):
        ap.add_argument(f"--{k}", type=Path, required=True)
    a = ap.parse_args()
    S = json.loads(a.synthetic_analysis.read_text())["game"]["byRating"]
    C = json.loads(a.calibrated_analysis.read_text())["game"]["byRating"]
    fit = json.loads(a.fit.read_text())
    bat_gap = (S["battingScoreQuarterMeans"][1] - S["battingScoreQuarterMeans"][0]) / 4
    bowl_gap = (S["bowlingScoreQuarterMeans"][1] - S["bowlingScoreQuarterMeans"][0]) / 3
    gaps = {"batter": bat_gap, "bowler": bowl_gap}
    out = {"version": "LC_STAGE_C_C3_MAPPING_V1", "researchOnly": True,
           "attribution": {**fit["attribution"], "note": ATTRIBUTION_NOTE},
           "gameQuarterMeans": {"battingScore": S["battingScoreQuarterMeans"], "bowlingScore": S["bowlingScoreQuarterMeans"]},
           "calibratedRunQuarterMeans": {"battingScore": C["battingScoreQuarterMeans"], "bowlingScore": C["bowlingScoreQuarterMeans"]},
           "quarterGapPerSkillPoint": gaps,
           "c2WorldSD": {"batter": 7.653551664473125, "bowler": 7.5230460849382705},
           "perPointTargets": {}}
    for key, t in fit["perPointTargets"].items():
        who = key.split(".")[1]
        lo, hi = t["trueRelativeSD_P10_P90"]
        vals = [log_ratio(x) / gaps[who] for x in (t["trueRelativeSD"], lo, hi)]
        out["perPointTargets"][key] = {"trueRelativeSD": t["trueRelativeSD"], "perPoint": vals[0],
                                       "perPoint_P10_P90": vals[1:], "range": [min(vals), max(vals)],
                                       "c2PerPoint": t["perPoint"]}
    a.out.write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps({"gaps": gaps, "targets": {k: [round(v["perPoint"], 4), [round(x, 4) for x in v["range"]], round(v["c2PerPoint"], 4)] for k, v in out["perPointTargets"].items()}, "calibratedRunQuarterMeans": out["calibratedRunQuarterMeans"]}, indent=1))


if __name__ == "__main__":
    main()
