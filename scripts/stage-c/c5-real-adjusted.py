#!/usr/bin/env python3
"""Stage C C5: the real phase- and opponent-adjusted top / bottom quarter ratios, by calibration period.

RESEARCH ONLY. Reads the calibration-split delivery table (scripts/stage-c/c1-real-extract.py, date <= 2025-08-24); the
holdout (2025-08-30 onward) is never read. Full-member men's T20 internationals, as the C1 to C3 reference, split
into the fit period (<= 2023-08-31, used to fit skill pack V5) and the selection period (2023-09-01 to 2025-08-24,
used only to check the choice). Estimator: `crossed_effects` and `crossed_bootstrap` of scripts/stage-c/c1-analyse.py
(loaded from that file), so the numbers are on the same footing as the C3 gates. Output: for each effect, the
adjusted true-skill ratio and its match-bootstrap P10 to P90, in the c2-report.py `criterion1Adjusted` layout so
scripts/stage-c/c5-adjusted-quick.py can read it with --targets.

  python3 -I scripts/stage-c/c5-real-adjusted.py --real /home/user/lcx-data/c1-real-calibration-balls.json \
      --out docs/pavilion/stage-c/c5-real-adjusted.json [--boot 100]
"""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
FIT_END, CAL_END = "2023-08-31", "2025-08-24"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--real", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--boot", type=int, default=100)
    a = ap.parse_args()
    spec = importlib.util.spec_from_file_location("c1_analyse", HERE / "c1-analyse.py")
    c1 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(c1)
    real = json.loads(a.real.read_text())
    rc = real["columns"]
    assert max(rc["date"]) <= CAL_END, "the calibration table must not contain holdout matches"
    full = np.array(rc["fullMemberMatch"]).astype(bool)
    date = np.array(rc["date"])
    res = {"version": "LC_STAGE_C_C5_REAL_ADJUSTED_V1", "researchOnly": True,
           "attribution": {**real["attribution"], "note": c1.ATTRIBUTION_NOTE},
           "reference": "full-member men's T20 internationals", "bootstrapReplicates": a.boot}
    for name, keep in (("fit", full & (date <= FIT_END)), ("selection", full & (date > FIT_END) & (date <= CAL_END))):
        t = c1.Table(rc, keep)
        ce = c1.crossed_effects(t, np.ones(len(t.m)))
        boot = c1.crossed_bootstrap(t, reps=a.boot)
        block = {}
        for eff in ("runs", "boundary", "nonDot", "dismissal"):
            for who in ("batter", "bowler"):
                r = ce[eff][who]["adjustedTrueSkillRatio"]
                ci = boot.get(f"{eff}.{who}.adjustedTrueSkillRatio", [r, r])[:2]
                block[f"{eff}.{who}"] = {"real": r, "realP10P90": ci, "realRange": [min(r, ci[0]), max(r, ci[1])]}
        res[name] = {"matches": int(t.n_matches), "criterion1Adjusted": {"calibrated-t20-01": block}}
        print(name, t.n_matches, {k: [round(v["real"], 3)] + [round(x, 3) for x in v["realRange"]] for k, v in block.items()}, flush=True)
    a.out.write_text(json.dumps(res, indent=1, default=float) + "\n")


if __name__ == "__main__":
    main()
