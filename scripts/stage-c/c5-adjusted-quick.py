#!/usr/bin/env python3
"""Stage C C5: the game's phase- and opponent-adjusted top / bottom rating-quarter ratios, quickly, for fitting.

RESEARCH ONLY. Reads game files from scripts/stage-c/c1-game-balls.ts and the real adjusted targets from a committed
c2-report.py output (default docs/pavilion/stage-c/c3rm-after-captain-v4.json: full-member men's T20 internationals,
calibration split; the holdout is never read). It uses the same estimator as scripts/stage-c/c1-analyse.py
(`crossed_effects`, loaded from that file) but skips every bootstrap, so one fitting iteration takes seconds. The
gate verdicts in the write-up come from the full c1-analyse.py and c2-report.py run, not from this helper.

With --targets docs/pavilion/stage-c/c5-real-adjusted.json and --period fit (or selection) it reads that period's
targets from scripts/stage-c/c5-real-adjusted.py instead.

  python3 -I scripts/stage-c/c5-adjusted-quick.py --game <c1-game-balls files...> [--targets <json>] [--period fit|selection] [--out <json>]
"""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", nargs="+", type=Path, required=True)
    ap.add_argument("--targets", type=Path, default=HERE.parent.parent / "docs/pavilion/stage-c/c3rm-after-captain-v4.json")
    ap.add_argument("--period", choices=("fit", "selection"), default=None)
    ap.add_argument("--out", type=Path, default=None)
    a = ap.parse_args()
    spec = importlib.util.spec_from_file_location("c1_analyse", HERE / "c1-analyse.py")
    c1 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(c1)
    parts = [json.loads(p.read_text()) for p in a.game]
    ratings = {p["playerId"]: p for part in parts for p in part["players"]}
    cols = {k: [x for p in parts for x in p["columns"][k]] for k in parts[0]["columns"]}
    t = c1.Table(cols)
    ce = c1.crossed_effects(t, np.ones(len(t.m)), ratings)
    targets = json.loads(a.targets.read_text())
    real = (targets[a.period] if a.period else targets)["criterion1Adjusted"]["calibrated-t20-01"]
    out, passes, dist = {}, 0, 0.0
    for name in ("runs", "boundary", "nonDot", "dismissal"):
        for who in ("batter", "bowler"):
            g = ce[name][who]["adjustedByRatingRatio"]
            r = real[f"{name}.{who}"]
            lo, hi = r["realRange"]
            ok = lo <= g <= hi
            passes += ok
            # log distance from the range (0 inside)
            d = 0.0 if ok else min(abs(np.log(g / lo)), abs(np.log(g / hi)))
            dist += d
            out[f"{name}.{who}"] = {"game": g, "real": r["real"], "realRange": [lo, hi], "inRange": bool(ok), "logDistance": d}
    res = {"passes": passes, "sumLogDistance": dist, "ratios": out}
    if a.out:
        a.out.write_text(json.dumps(res, indent=1) + "\n")
    for k, v in out.items():
        print(f"{k:18} game {v['game']:.3f}  real {v['real']:.3f} [{v['realRange'][0]:.3f}, {v['realRange'][1]:.3f}] {'IN' if v['inRange'] else 'out'}")
    print(f"passes {passes}/8  sumLogDistance {dist:.4f}")


if __name__ == "__main__":
    main()
