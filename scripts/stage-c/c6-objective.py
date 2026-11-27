#!/usr/bin/env python3
"""Stage C C6: the pre-registered fit and selection objective for the calibrated-t20-02 refit (research only).

Pre-registered in docs/pavilion/stage-c/C6_REFIT.md section 1 before any candidate was fitted. It reads game files from
scripts/stage-c/c1-game-balls.ts and the calibration-split real table from scripts/stage-c/c1-real-extract.py
(dates up to 2025-08-24; the holdout, 30 August 2025 onward, is never read and the script refuses a table that holds it).

For one candidate it reports, first innings only, by phase (overs 1 to 6, 7 to 15, 16 to 20):
  runs an over (all runs on all balls / legal balls x 6), wickets per 100 legal balls (all wickets), dot % (legal balls
  with no run and no wicket), four % and six % (legal balls with 4 or 6 off the bat), and caught (real: caught plus
  caught and bowled), bowled and lbw per 100 legal balls; first-innings runs and wickets; and the 8 phase- and
  opponent-adjusted top / bottom rating-quarter ratios, with the estimator of scripts/stage-c/c1-analyse.py
  (crossed_effects, no bootstrap, as scripts/stage-c/c5-adjusted-quick.py).

  J = sum over terms of ((game - target) / scale)^2.

  Fit period (to 2023-08-31) targets:
    - batter runs and batter boundary ratios: the upper end of the fit-period range (log scale, scale 0.02);
    - the other six ratios: log distance to the fit-period range, 0 inside (scale 0.02);
    - every phase figure above: the fit-period value (scales: runs an over 0.25; wickets 0.25; dot 1.5; four 1.0;
      six 1.0; caught, bowled, lbw 0.25), first-innings runs (scale 4) and wickets (scale 0.25).
  Selection period (2023-09-01 to 2025-08-24): the same terms against the selection-period values, except that all 8
  ratios use the log distance to the selection-period range (0 inside).

  python3 -I scripts/stage-c/c6-objective.py --game <c1-game-balls files...> --real <calibration table> \
      [--targets docs/pavilion/stage-c/c5-real-adjusted.json] [--label <text>] [--out <json>]
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
FIT_END, CAL_END = "2023-08-31", "2025-08-24"
PHASES = (("powerplay", 0, 6), ("middle", 6, 15), ("death", 15, 20))
SCALES = {"runsPerOver": 0.25, "wicketsPer100": 0.25, "dotPercent": 1.5, "fourPercent": 1.0, "sixPercent": 1.0,
          "caughtPer100": 0.25, "bowledPer100": 0.25, "lbwPer100": 0.25}
TOTAL_SCALES = {"firstInningsRuns": 4.0, "firstInningsWickets": 0.25}
RATIO_SCALE = 0.02
RATIOS = [f"{n}.{w}" for n in ("runs", "boundary", "nonDot", "dismissal") for w in ("batter", "bowler")]
UPPER_END_TARGETS = ("runs.batter", "boundary.batter")


def phase_figures(c, sel):
    """First-innings figures by phase for the rows in `sel` (numpy arrays in c)."""
    legal = (c["wides"] == 0) & (c["noballs"] == 0)
    total = c["batRuns"] + c["wides"] + c["noballs"] + c["byes"] + c["legbyes"]
    out = c["outKind"] != ""
    caught = np.isin(c["outKind"], ["caught", "caught and bowled"])
    f = sel & (c["inn"] == 0)
    res = {}
    for name, lo, hi in PHASES:
        p = f & (c["over"] >= lo) & (c["over"] < hi)
        n = int((p & legal).sum())
        res[name] = {
            "legalBalls": n,
            "runsPerOver": float(6 * total[p].sum() / n),
            "wicketsPer100": float(100 * out[p].sum() / n),
            "dotPercent": float(100 * (p & legal & (total == 0) & ~out).sum() / n),
            "fourPercent": float(100 * (p & legal & (c["batRuns"] == 4)).sum() / n),
            "sixPercent": float(100 * (p & legal & (c["batRuns"] == 6)).sum() / n),
            "caughtPer100": float(100 * (p & caught).sum() / n),
            "bowledPer100": float(100 * (p & (c["outKind"] == "bowled")).sum() / n),
            "lbwPer100": float(100 * (p & (c["outKind"] == "lbw")).sum() / n),
            "runOutPer100": float(100 * (p & (c["outKind"] == "run out")).sum() / n),
            "stumpedPer100": float(100 * (p & (c["outKind"] == "stumped")).sum() / n),
        }
    ids, inv = np.unique(c["match"][f], return_inverse=True)
    res["firstInningsRuns"] = float(np.bincount(inv, total[f], len(ids)).mean())
    res["firstInningsWickets"] = float(np.bincount(inv, out[f], len(ids)).mean())
    res["innings"] = int(len(ids))
    return res


def load_cols(paths):
    cols = {}
    parts = [json.loads(Path(p).read_text()) for p in paths]
    for part in parts:
        for k, v in part["columns"].items():
            cols.setdefault(k, []).extend(v)
    return parts, cols


def log_range_distance(g, lo, hi):
    return 0.0 if lo <= g <= hi else min(abs(math.log(g / lo)), abs(math.log(g / hi)))


def objective(game, ratios, real_phase, real_ratios, period):
    terms = {}
    for k in RATIOS:
        g = ratios[k]
        lo, hi = real_ratios[k]["realRange"]
        if period == "fit" and k in UPPER_END_TARGETS:
            d = math.log(g / hi)
        else:
            d = log_range_distance(g, lo, hi)
        terms[f"ratio.{k}"] = (d / RATIO_SCALE) ** 2
    for name, _, _ in PHASES:
        for k, s in SCALES.items():
            terms[f"{name}.{k}"] = ((game[name][k] - real_phase[name][k]) / s) ** 2
    for k, s in TOTAL_SCALES.items():
        terms[k] = ((game[k] - real_phase[k]) / s) ** 2
    return float(sum(terms.values())), terms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", nargs="+", type=Path, required=True)
    ap.add_argument("--real", type=Path, required=True)
    ap.add_argument("--targets", type=Path, default=HERE.parent.parent / "docs/pavilion/stage-c/c5-real-adjusted.json")
    ap.add_argument("--label", default="")
    ap.add_argument("--out", type=Path, default=None)
    a = ap.parse_args()

    d = json.loads(a.real.read_text())
    if max(d["columns"]["date"]) > CAL_END:
        raise SystemExit("the calibration table must not contain holdout matches")
    rc = {k: np.array(v) for k, v in d["columns"].items()}
    full = rc["fullMemberMatch"].astype(bool)
    real = {"fit": phase_figures(rc, full & (rc["date"] <= FIT_END)),
            "selection": phase_figures(rc, full & (rc["date"] > FIT_END) & (rc["date"] <= CAL_END))}

    spec = importlib.util.spec_from_file_location("c1_analyse", HERE / "c1-analyse.py")
    c1 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(c1)
    parts, cols = load_cols(a.game)
    ratings = {p["playerId"]: p for part in parts for p in part["players"]}
    t = c1.Table(cols)
    ce = c1.crossed_effects(t, np.ones(len(t.m)), ratings)
    ratios = {f"{n}.{w}": float(ce[n][w]["adjustedByRatingRatio"]) for n in ("runs", "boundary", "nonDot", "dismissal") for w in ("batter", "bowler")}
    gc = {k: np.array(v) for k, v in cols.items()}
    game = phase_figures(gc, np.ones(len(gc["match"]), dtype=bool))

    targets = json.loads(a.targets.read_text())
    res = {"version": "LC_STAGE_C_C6_OBJECTIVE_V1", "researchOnly": True, "label": a.label,
           "gameFiles": [str(p) for p in a.game], "model": sorted({p.get("model") for p in parts}),
           "captain": sorted({p.get("captain") for p in parts}),
           "repeats": sorted({(p.get("firstRepeat"), p.get("repeats")) for p in parts}),
           "attribution": "Contains information from Cricsheet (https://cricsheet.org/), ODC-By 1.0 (https://cricsheet.org/licensing/). "
                          "Derived aggregates only. Calibration split only; the holdout is not read.",
           "game": game, "ratios": ratios, "real": real, "periods": {}}
    for period in ("fit", "selection"):
        rr = {k: targets[period]["criterion1Adjusted"]["calibrated-t20-01"][k] for k in RATIOS}
        j, terms = objective(game, ratios, real[period], rr, period)
        inside = {k: bool(rr[k]["realRange"][0] <= ratios[k] <= rr[k]["realRange"][1]) for k in RATIOS}
        res["periods"][period] = {"J": j, "terms": terms, "ratioRanges": {k: rr[k]["realRange"] for k in RATIOS},
                                  "ratioInside": inside, "ratioPasses": int(sum(inside.values()))}
    held = ("nonDot.batter", "dismissal.batter", "runs.bowler", "boundary.bowler", "nonDot.bowler", "dismissal.bowler")
    res["eligibleSixHeld"] = all(res["periods"]["fit"]["ratioInside"][k] for k in held)
    if a.out:
        a.out.write_text(json.dumps(res, indent=1) + "\n")
    print(f"{a.label}: J fit {res['periods']['fit']['J']:.1f}  J selection {res['periods']['selection']['J']:.1f}  "
          f"ratios fit {res['periods']['fit']['ratioPasses']}/8 selection {res['periods']['selection']['ratioPasses']}/8  six held {res['eligibleSixHeld']}")
    print("  ratios " + " ".join(f"{k}={v:.3f}" for k, v in ratios.items()))
    for name, _, _ in PHASES:
        g, r = game[name], real["fit"][name]
        print(f"  {name:9} " + " ".join(f"{k[:-7] if k.endswith('Percent') else k}={g[k]:.2f}({r[k]:.2f})" for k in SCALES))
    print(f"  first innings runs {game['firstInningsRuns']:.1f} ({real['fit']['firstInningsRuns']:.1f}) wickets {game['firstInningsWickets']:.2f} ({real['fit']['firstInningsWickets']:.2f})")
    top = sorted(res["periods"]["fit"]["terms"].items(), key=lambda kv: -kv[1])[:8]
    print("  largest fit terms " + ", ".join(f"{k} {v:.1f}" for k, v in top))


if __name__ == "__main__":
    main()
