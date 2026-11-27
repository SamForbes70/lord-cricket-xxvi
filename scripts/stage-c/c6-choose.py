#!/usr/bin/env python3
"""Stage C C6: apply the pre-registered choice rule (docs/pavilion/stage-c/C6_REFIT.md section 1f) to every fitted
candidate, and write the candidate table (research only).

Eligible: a calibrated-t20-02 candidate whose six currently passing ratios (batter non-dot, batter dismissal, the four
bowler ratios) are inside their fit-period ranges, and whose fit J is at most 1.5 times the smallest fit J among
calibrated-t20-02 candidates. Chosen: the smallest selection J among the eligible (ties: smaller fit J). Candidate c0
(calibrated-t20-01) is listed for reference and is never eligible.

  python3 -I scripts/stage-c/c6-choose.py --fit-dir /home/user/lcx-data/c6/fit --candidates c0 c1 ... --out <json>
"""
import argparse
import json
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fit-dir", type=Path, required=True)
    ap.add_argument("--candidates", nargs="+", required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    rows = []
    for c in a.candidates:
        o = json.loads((a.fit_dir / c / "objective.json").read_text())
        p = json.loads((a.fit_dir / c / "params.json").read_text())
        rows.append({"candidate": c, "model": o["model"], "params": p, "Jfit": o["periods"]["fit"]["J"],
                     "Jselection": o["periods"]["selection"]["J"], "ratios": o["ratios"],
                     "ratioPassesFit": o["periods"]["fit"]["ratioPasses"], "ratioPassesSelection": o["periods"]["selection"]["ratioPasses"],
                     "ratioInsideFit": o["periods"]["fit"]["ratioInside"], "sixHeld": o["eligibleSixHeld"],
                     "game": o["game"], "termsFit": o["periods"]["fit"]["terms"], "termsSelection": o["periods"]["selection"]["terms"]})
    cands = [r for r in rows if r["model"] == ["calibrated-t20-02"]]
    best = min(r["Jfit"] for r in cands)
    for r in rows:
        r["withinJfitBound"] = r["model"] == ["calibrated-t20-02"] and r["Jfit"] <= 1.5 * best
        r["eligible"] = r["withinJfitBound"] and r["sixHeld"]
    eligible = sorted((r for r in rows if r["eligible"]), key=lambda r: (r["Jselection"], r["Jfit"]))
    res = {"version": "LC_STAGE_C_C6_CANDIDATES_V1", "researchOnly": True,
           "rule": "eligible: six passing ratios inside the fit-period ranges and fit J <= 1.5 x the smallest fit J of the calibrated-t20-02 candidates; chosen: smallest selection J",
           "smallestJfit": best, "JfitBound": 1.5 * best, "order": [r["candidate"] for r in eligible],
           "chosen": eligible[0]["candidate"] if eligible else None, "candidates": rows,
           "attribution": "Contains information from Cricsheet (https://cricsheet.org/), ODC-By 1.0 (https://cricsheet.org/licensing/). Derived aggregates only; calibration split only."}
    a.out.write_text(json.dumps(res, indent=1) + "\n")
    for r in rows:
        print(f"{r['candidate']}: Jfit {r['Jfit']:.1f} Jsel {r['Jselection']:.1f} ratios fit {r['ratioPassesFit']}/8 sel {r['ratioPassesSelection']}/8 "
              f"sixHeld {r['sixHeld']} withinBound {r['withinJfitBound']} eligible {r['eligible']}")
    print("order", res["order"], "chosen", res["chosen"])


if __name__ == "__main__":
    main()
