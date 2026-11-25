#!/usr/bin/env python3
"""Stage C C2 final report on the holdout (2025-08-30 to 2026-10-14), read ONCE, after calibrated-t20-01 was frozen.

RESEARCH ONLY. Inputs: c1-analyse.py run with the holdout deliveries as the real side and the calibrated game as the
game side; the holdout delivery table (for first-innings figures); both models' game delivery tables. Nothing here
is used to change the pack.

  python3 -I scripts/stage-c/c2-holdout.py --analysis /home/user/lcx-data/c2-holdout-analysis.json \
      --holdout-balls /home/user/lcx-data/c2-holdout-balls.json --report docs/pavilion/stage-c/c2-report.json \
      --out docs/pavilion/stage-c/c2-holdout.json
"""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("c2report", HERE / "c2-report.py")
rep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rep)


def first_innings_real(path, full_only):
    d = json.loads(Path(path).read_text())
    c = d["columns"]
    keep = np.ones(len(c["match"]), bool) if not full_only else np.array(c["fullMemberMatch"])
    # completed 20-over first innings only would need match metadata; all first innings are used (M7E kept
    # all-out innings and excluded interrupted ones, so these figures are close but not identical to M7E's)
    sub = {k: [v for v, k2 in zip(c[k], keep) if k2] for k in c}
    tmp = HERE / ".c2-holdout-tmp.json"
    tmp.write_text(json.dumps({"columns": sub}))
    try:
        return rep.first_innings([tmp])
    finally:
        tmp.unlink()


def main():
    ap = argparse.ArgumentParser()
    for k in ("analysis", "holdout-balls", "report", "out"):
        ap.add_argument(f"--{k}", type=Path, required=True)
    a = ap.parse_args()
    H = json.loads(a.analysis.read_text())
    R = json.loads(a.report.read_text())
    G = H["game"]
    real = H["real"]
    out = {"version": "LC_STAGE_C_C2_HOLDOUT_V1", "researchOnly": True, "readOnce": True,
           "attribution": {**H["attribution"], "note": rep.ATTRIBUTION_NOTE},
           "holdout": "2025-08-30 to 2026-10-14", "matches": {"all": real["all"]["matches"], "fullMembersOnly": real["fullMembersOnly"]["matches"]},
           "model": "calibrated-t20-01",
           "criterion1Raw": {f"{r}.{s}": rep.raw_gate(G["byRating"][r][s], real, r, s) for r, s in rep.RAW},
           "criterion1Adjusted": {f"{n}.{w}": rep.adjusted_gate(G, real, n, w) for n in ("runs", "boundary", "nonDot", "dismissal") for w in ("batter", "bowler")},
           "specialisation": {k: {"game": G["specialisation"][k], "real": real["fullMembersOnly"]["specialisation"][k],
                                  "relative": G["specialisation"][k] / real["fullMembersOnly"]["specialisation"][k]}
                              for k in ("averageRatio", "strikeRateRatio", "economyRatioPartTimeOverFrontline")},
           "firstInnings": {"holdoutAll": first_innings_real(a.holdout_balls, False),
                            "holdoutFullMembers": first_innings_real(a.holdout_balls, True),
                            "M7E": rep.M7E,
                            "synthetic-alpha-01": R["aggregates"]["synthetic-alpha-01"],
                            "calibrated-t20-01": R["aggregates"]["calibrated-t20-01"]}}
    for v in out["specialisation"].values():
        v["verdict"] = "PASS" if 0.85 <= v["relative"] <= 1.15 else "FAIL"
    a.out.write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1)[:5000])


if __name__ == "__main__":
    main()
