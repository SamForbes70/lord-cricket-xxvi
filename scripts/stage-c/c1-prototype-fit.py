#!/usr/bin/env python3
"""Stage C research slice C1: prototype of the skill component's fit for a future `calibrated-t20-01`.

RESEARCH ONLY. Nothing here is read by the game; no game model, rule, schema or random stream is changed.

Uses the calibration split only, divided again by date (the M7G pattern of fit, validation, then holdout):
  fit         date <= 2023-08-31
  validation  2023-09-01 to 2025-08-24
The M7G/M7E holdout (2025-08-30 to 2026-10-14) is not read.

Steps:
  1. On each sub-split, crossed batter and bowler effects on per-ball rates over a phase baseline, and their true
     between-player SDs by moments (c1-analyse.py `crossed_effects`). Stable SDs across the two periods are a
     precondition for fitting a fixed skill coefficient.
  2. Out-of-sample check: effects estimated on `fit`, shrunk by empirical Bayes, predict `validation` balls better
     than the phase baseline alone (mean log loss for binary outcomes, mean squared error for runs), with a 95%
     interval from resampling validation matches.
  3. The implied skill coefficients on the game's own rating scale (all calibration matches, and matches between
     full members only): the real true SD of each effect divided by the
     SD of the matching game rating across the world pack's candidates (batting: mean of timing, power, defence,
     rotation over keepers, batters and all-rounders; bowling: mean of control, movement, variation over
     bowling-capable players), expressed per rating point and as a basis-point coefficient on the game's feature
     scale ((rating - 50) x 200 bp), for comparison with synthetic-alpha-01's 2500 to 5000 bp.

  python3 -I scripts/stage-c/c1-prototype-fit.py --real /home/user/lcx-data/c1-real-calibration-balls.json \
      --dose /home/user/lcx-data/c1-dose-{bat30,bat50,bat70,bowl30,bowl70}.json \
      --out docs/pavilion/stage-c/c1-prototype-fit.json
"""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("c1analyse", HERE / "c1-analyse.py")
c1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c1)

FIT_END = "2023-08-31"
VAL_START = "2023-09-01"
SEED = 20261125


ATTRIBUTION_NOTE = ("Derived aggregates only (no ball-by-ball records). Contains information from Cricsheet, "
                    "made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/.")


def effects(t, w, target):
    """Unshrunk multiplicative batter and bowler effects for one target (c1-analyse.py `fit_effects`)."""
    fe = c1.fit_effects(t, w, target)
    return fe["base"], fe["a"], fe["b"], fe["Eb"], fe["Eo"]


def shrink(eff, E, tau, disp):
    # sampling variance of an effect around the prior mean of 1 (not the observed effect, which can be 0)
    noise = disp / np.maximum(E, 1e-9)
    k = tau ** 2 / (tau ** 2 + noise)
    out = 1 + k * (eff - 1)
    out[E <= 0] = 1.0
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--real", type=Path, required=True)
    ap.add_argument("--world", type=Path, default=Path("packages/data/worlds/fictional-eight-01.json"))
    ap.add_argument("--dose", type=Path, nargs="*", default=[])
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    real = json.loads(a.real.read_text())
    rc = real["columns"]
    dates = np.array(rc["date"])
    t = c1.Table(rc)
    fit_mask = dates <= FIT_END
    val_mask = dates >= VAL_START
    targets = {"dismissal": t.striker_out, "boundary": t.bdy, "nonDot": t.runs > 0, "runs": t.runs.astype(float)}
    out = {"version": "LC_STAGE_C_C1_PROTOTYPE_FIT_V1", "researchOnly": True, "gameplayIntegrationPermitted": False,
           "attribution": {**real["attribution"], "note": ATTRIBUTION_NOTE},
           "subSplits": {"fit": f"calibration dates <= {FIT_END}", "validation": f"{VAL_START} to 2025-08-24",
                         "holdout": "not read"},
           "matches": {"fit": int(len(np.unique(np.array(rc['match'])[fit_mask]))),
                       "validation": int(len(np.unique(np.array(rc['match'])[val_mask])))}}
    # 1. variance components per sub-split
    comp = {}
    for name, mask in (("fit", fit_mask), ("validation", val_mask)):
        comp[name] = c1.crossed_effects(t, mask.astype(float))
    out["varianceComponents"] = comp
    # 2. out-of-sample prediction of validation balls from fit-period effects
    wf = fit_mask.astype(float)
    fv = t.faced & val_mask
    val_matches = np.unique(t.m[fv])
    rng = np.random.default_rng(SEED)
    oos = {}
    for name, target in targets.items():
        base, ea, eb, Eb, Eo = effects(t, wf, target)
        cf = comp["fit"][name]
        da, db = cf["batter"]["trueRelativeSD"], cf["bowler"]["trueRelativeSD"]
        disp = cf["dispersion"]
        sa, sb = shrink(ea, Eb, da, disp), shrink(eb, Eo, db, disp)
        y = target[fv].astype(float)
        # validation phase baseline from the FIT period (no validation information in the prediction)
        p0 = base[t.phase[fv]]
        p1 = p0 * sa[t.bat[fv]] * sb[t.bowl[fv]]
        m = t.m[fv]
        if name == "runs":
            l0, l1 = (y - p0) ** 2, (y - p1) ** 2
            metric = "meanSquaredError"
        else:
            p1c = np.clip(p1, 1e-4, 1 - 1e-4)
            l0 = -(y * np.log(p0) + (1 - y) * np.log(1 - p0))
            l1 = -(y * np.log(p1c) + (1 - y) * np.log(1 - p1c))
            metric = "logLoss"
        diff = l1 - l0
        per_match_d = np.bincount(np.searchsorted(val_matches, m), diff, len(val_matches))
        per_match_n = np.bincount(np.searchsorted(val_matches, m), None, len(val_matches))
        boots = []
        for _ in range(400):
            c = rng.multinomial(len(val_matches), np.full(len(val_matches), 1 / len(val_matches)))
            boots.append((c * per_match_d).sum() / (c * per_match_n).sum())
        known = (Eb[t.bat[fv]] > 0).mean()
        oos[name] = {"metric": metric, "phaseOnly": float(l0.mean()), "withPlayerEffects": float(l1.mean()),
                     "difference": float(diff.mean()), "difference95": [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))],
                     "validationBallsWithBatterSeenInFit": float(known)}
    out["outOfSample"] = oos
    out["outOfSampleNote"] = "Negative difference = player effects estimated on the fit period predict the validation period better than the phase baseline alone."
    # 3. implied coefficients on the game's rating scale
    world = json.loads(a.world.read_text())
    bat = [np.mean([p["skills"]["T20"][k] for k in ("timing", "power", "defence", "rotation")]) for p in world["players"] if p["role"] != "BOWLER"]
    bowl = [np.mean([p["skills"]["T20"][k] for k in ("control", "movement", "variation")]) for p in world["players"] if p["bowlingStyle"] is not None]
    sd_bat, sd_bowl = float(np.std(bat, ddof=1)), float(np.std(bowl, ddof=1))
    implied = {"worldRatingSD": {"battingMeanRating": sd_bat, "bowlingMeanRating": sd_bowl,
                                 "battingPlayers": len(bat), "bowlingPlayers": len(bowl)}}
    full = np.array(rc["fullMemberMatch"])
    for cohort, wc in (("all", np.ones(len(t.m))), ("fullMembersOnly", full.astype(float))):
        cal = c1.crossed_effects(t, wc)
        implied[cohort] = {}
        for name in targets:
            for who, sd in (("batter", sd_bat), ("bowler", sd_bowl)):
                tau = cal[name][who]["trueRelativeSD"]
                per_point = tau / sd
                implied[cohort][f"{name}.{who}"] = {"realTrueRelativeSD": tau, "logEffectPerRatingPoint": per_point,
                                                    "coefficientBpOnGameFeatureScale": round(per_point / 2e-6)}
    out["impliedCoefficients"] = implied
    out["impliedNote"] = ("Linear mapping of rating to log rate, at one world-rating SD = one real true-skill SD. The game's feature is "
                          "(rating - 50) x 200 bp and a term adds coefficientBp x featureBp / 10000 bp of logit, so one rating point "
                          "is coefficientBp x 2e-6 natural logit units; synthetic-alpha-01 uses 2500 to 5000 bp (0.005 to 0.010 a point).")
    # game dose-response, for the same per-point comparison
    dose = {}
    for p in a.dose:
        for r in json.loads(p.read_text())["results"]:
            dose[r["condition"]] = r
    if {"bat30", "bat70"} <= dose.keys():
        g = {}
        for k in ("runsPerBall", "strikerDismissalPerBall", "boundaryPerBall"):
            g[f"batting.{k}.logChangePerPoint"] = float(np.log(dose["bat70"][k] / dose["bat30"][k]) / 40)
        if {"bowl30", "bowl70"} <= dose.keys():
            for k in ("runsPerBall", "strikerDismissalPerBall", "boundaryPerBall"):
                g[f"bowling.{k}.logChangePerPoint"] = float(np.log(dose["bowl70"][k] / dose["bowl30"][k]) / 40)
        out["gameDoseResponse"] = {"conditions": dose, "perPoint": g}
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps({k: out[k] for k in ("matches", "outOfSample", "impliedCoefficients")}, indent=1))


if __name__ == "__main__":
    main()
