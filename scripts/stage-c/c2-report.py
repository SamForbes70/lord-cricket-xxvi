#!/usr/bin/env python3
"""Stage C C2: gate tables for calibrated-t20-01 against synthetic-alpha-01, on the owner's reference cohort.

RESEARCH ONLY. Reads derived outputs only:
  --synthetic / --calibrated   c1-analyse.py outputs for each model's game matches (same real reference inside)
  --dose-synthetic / --dose-calibrated   per-point.json from scripts/stage-c/c2-dose.sh
  --fit                         c2-fit.json (per-point targets, full members, fit period)
  --tactical                    directory of pavilion-tactical-validation.ts outputs named <model>-<experiment>.json
  --balls-synthetic / --balls-calibrated   game delivery tables (c1-game-balls.ts), for first-innings aggregates
Writes one JSON with every gate and the numbers behind it.

Gate rules (C1 sections 2 and 6; owner decisions of 25 November 2026):
  criterion 1, raw       game by-rating ratio inside the real full-member true-skill P10 to P90 => PASS; outside that
                         and outside the split-half to in-sample bracket, or inverted => FAIL; otherwise UNCLEAR
  criterion 1, adjusted  game adjusted by-rating ratio inside [min(point, P10), max(point, P90)] of the real
                         full-member adjusted true-skill ratio => PASS; inverted => FAIL; otherwise FAIL
  per point              game log change per rating point inside [min(point, P10), max(point, P90)] of the fit-period
                         full-member target (c2-fit.json)
  specialisation         game ratio / real full-member ratio within 0.85 to 1.15
  aggregates             first innings against the M7E holdout figures, reported with M7E's proposed tolerances,
                         NOT tuned to

  python3 -I scripts/stage-c/c2-report.py --synthetic ... --calibrated ... (see C2_CALIBRATED_SKILL.md)
"""
import argparse
import json
from pathlib import Path

import numpy as np

M7E = {"runs": 150.55, "wickets": 7.24, "dotPercent": 39.32, "boundaryPercent": 14.02}
ATTRIBUTION_NOTE = ("Derived aggregates only (no ball-by-ball records). Contains information from Cricsheet, "
                    "made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/.")
RAW = [("batting", "strikeRate"), ("batting", "average"), ("batting", "dismissalRate"), ("batting", "dotPercent"),
       ("batting", "boundaryPercent"), ("bowling", "economy"), ("bowling", "wicketRate"), ("bowling", "dotPercent"),
       ("bowling", "boundaryPercent")]
# better direction: is a ratio above 1 the correct order?
ABOVE_ONE = {"strikeRate": True, "average": True, "dismissalRate": False, "batting.dotPercent": False,
             "batting.boundaryPercent": True, "economy": False, "wicketRate": True, "bowling.dotPercent": True,
             "bowling.boundaryPercent": False}


def above_one(role, stat):
    return ABOVE_ONE.get(f"{role}.{stat}", ABOVE_ONE.get(stat))


def raw_gate(g, real, role, stat):
    X = real["fullMembersOnly"]
    t = X[role][stat].get("trueSkillRatio")
    ci = X["bootstrap"].get(f"{role}.{stat}.trueSkillRatio")
    br = sorted([X["splitHalf"][role][stat], X[role][stat]["inSampleRatio"]])
    inverted = (g < 1) == above_one(role, stat)
    if inverted:
        verdict = "FAIL (inverted)"
    elif t and ci and ci[0] <= g <= ci[1]:
        verdict = "PASS"
    elif br[0] <= g <= br[1]:
        verdict = "UNCLEAR"
    else:
        verdict = "FAIL"
    return {"game": g, "realTrueSkill": t, "realP10P90": ci[:2] if ci else None, "realBracket": br, "verdict": verdict}


def adjusted_gate(G, real, name, who):
    X = real["fullMembersOnly"]
    r = X["crossedEffects"][name][who]["adjustedTrueSkillRatio"]
    ci = X["crossedEffectsBootstrap"].get(f"{name}.{who}.adjustedTrueSkillRatio", [r, r])[:2]
    lo, hi = min(r, ci[0]), max(r, ci[1])
    g = G["crossedEffects"][name][who]["adjustedByRatingRatio"]
    # better direction for the top-rated quarter: batter more runs, boundaries, non-dots, fewer dismissals;
    # bowler fewer runs, boundaries, non-dots, more dismissals
    good_above = {"batter": name != "dismissal", "bowler": name == "dismissal"}[who]
    inverted = (g < 1) == good_above
    verdict = "FAIL (inverted)" if inverted else ("PASS" if lo <= g <= hi else "FAIL")
    return {"game": g, "real": r, "realRange": [lo, hi], "verdict": verdict}


def first_innings(path_list):
    cols = {}
    for p in path_list:
        c = json.loads(Path(p).read_text())["columns"]
        for k, v in c.items():
            cols.setdefault(k, []).extend(v)
    inn = np.array(cols["inn"]) == 0
    m = np.array(cols["match"])[inn]
    br, w, nb, b, lb = (np.array(cols[k])[inn] for k in ("batRuns", "wides", "noballs", "byes", "legbyes"))
    out = np.array(cols["out"])[inn] != ""
    legal = (w == 0) & (nb == 0)
    total = br + w + nb + b + lb
    ids, inv = np.unique(m, return_inverse=True)
    runs = np.bincount(inv, total, len(ids))
    wk = np.bincount(inv, out, len(ids))
    return {"matches": int(len(ids)), "runs": float(runs.mean()), "wickets": float(wk.mean()),
            "dotPercent": float(100 * ((total == 0) & legal).sum() / legal.sum()),
            "boundaryPercent": float(100 * (np.isin(br, [4, 6]) & legal).sum() / legal.sum()),
            "p10": float(np.percentile(runs, 10)), "p50": float(np.percentile(runs, 50)), "p90": float(np.percentile(runs, 90))}


def aggregate_gate(a):
    return {"runsWithin5pc": abs(a["runs"] / M7E["runs"] - 1) <= 0.05, "wicketsWithin0.5": abs(a["wickets"] - M7E["wickets"]) <= 0.5,
            "dotsWithin2pp": abs(a["dotPercent"] - M7E["dotPercent"]) <= 2, "boundariesWithin2pp": abs(a["boundaryPercent"] - M7E["boundaryPercent"]) <= 2}


def main():
    ap = argparse.ArgumentParser()
    for k in ("synthetic", "calibrated", "dose-synthetic", "dose-calibrated", "fit", "tactical", "out"):
        ap.add_argument(f"--{k}", type=Path, required=True)
    ap.add_argument("--balls-synthetic", nargs="+", required=True)
    ap.add_argument("--balls-calibrated", nargs="+", required=True)
    a = ap.parse_args()
    S, C = json.loads(a.synthetic.read_text()), json.loads(a.calibrated.read_text())
    real = C["real"]
    fit = json.loads(a.fit.read_text())
    res = {"version": "LC_STAGE_C_C2_REPORT_V1", "researchOnly": True, "gameplayIntegrationPermitted": False,
           "attribution": {**C["attribution"], "note": ATTRIBUTION_NOTE}, "reference": "full-member men's T20 internationals, calibration split",
           "criterion1Raw": {}, "criterion1Adjusted": {}, "perPoint": {}, "specialisation": {}, "aggregates": {}, "tactical": {}}
    for model, G in (("synthetic-alpha-01", S["game"]), ("calibrated-t20-01", C["game"])):
        res["criterion1Raw"][model] = {f"{r}.{s}": raw_gate(G["byRating"][r][s], real, r, s) for r, s in RAW}
        res["criterion1Adjusted"][model] = {f"{n}.{w}": adjusted_gate(G, real, n, w) for n in ("runs", "boundary", "nonDot", "dismissal") for w in ("batter", "bowler")}
        sp, rs = G["specialisation"], real["fullMembersOnly"]["specialisation"]
        res["specialisation"][model] = {k: {"game": sp[k], "real": rs[k], "relative": sp[k] / rs[k], "verdict": "PASS" if 0.85 <= sp[k] / rs[k] <= 1.15 else "FAIL"}
                                        for k in ("averageRatio", "strikeRateRatio", "economyRatioPartTimeOverFrontline")}
    for model, path in (("synthetic-alpha-01", a.dose_synthetic), ("calibrated-t20-01", a.dose_calibrated)):
        d = json.loads(path.read_text())
        rows = {}
        for key, tkey, sign in (("batting.runs", "runs.batter", 1), ("batting.boundary", "boundary.batter", 1), ("batting.nonDot", "nonDot.batter", 1),
                                ("batting.dismissal", "dismissal.batter", -1), ("bowling.runs", "runs.bowler", -1), ("bowling.boundary", "boundary.bowler", -1),
                                ("bowling.nonDot", "nonDot.bowler", -1), ("bowling.dismissal", "dismissal.bowler", 1)):
            t = fit["perPointTargets"][tkey]
            lo = min(t["perPoint"], t["perPoint_P10_P90"][0]); hi = max(t["perPoint"], t["perPoint_P10_P90"][1])
            g = sign * d[key]  # oriented so that a correct effect is positive
            rows[key] = {"game": g, "realRange": [lo, hi], "verdict": "PASS" if lo <= g <= hi else "FAIL"}
        rows["variationTradeOff"] = {"dismissalPerPoint": d["variation.dismissal"], "runsPerPoint": d["variation.runs"], "boundaryPerPoint": d["variation.boundary"],
                                     "verdict": "PASS" if d["variation.dismissal"] > 0 and d["variation.runs"] > 0 else "FAIL"}
        res["perPoint"][model] = rows
    for model, paths in (("synthetic-alpha-01", a.balls_synthetic), ("calibrated-t20-01", a.balls_calibrated)):
        agg = first_innings(paths)
        res["aggregates"][model] = {**agg, "againstM7E": aggregate_gate(agg)}
    res["aggregates"]["M7E holdout target"] = M7E
    for f in sorted(a.tactical.glob("*.json")):
        d = json.loads(f.read_text())
        model = d["model"]
        for r in d["results"]:
            res["tactical"].setdefault(model, {})[r["experiment"]] = {k: r[k] for k in ("area", "poor", "matches", "goodWins", "poorWins", "tiesOrNoResult", "goodWinPercentOfDecided", "goodWinPercent95", "meanRunsGood", "meanRunsPoor", "meanRunDifference", "meanRunDifference95")}
    a.out.write_text(json.dumps(res, indent=1) + "\n")
    print(json.dumps({k: res[k] for k in ("perPoint", "specialisation", "aggregates")}, indent=1)[:6000])


if __name__ == "__main__":
    main()
