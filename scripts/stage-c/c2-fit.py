#!/usr/bin/env python3
"""Stage C slice C2: the skill parameters for a future `calibrated-t20-01`, on the owner's reference cohort.

RESEARCH ONLY. Nothing here is read by the game. Owner decisions of 25 November 2026
(docs/pavilion/stage-c/C1_SKILL_DIFFERENTIATION.md): full-member men's T20 internationals only; stronger pooling
allowed for dismissal skill; variation to carry a wicket-taking against economy trade-off.

Periods (calibration split only; the M7G holdout, 2025-08-30 to 2026-10-14, is NOT read):
  fit         date <= 2023-08-31
  validation  2023-09-01 to 2025-08-24 (choices only: the pooling strength per outcome)

For each per-ball outcome (striker dismissal, boundary, not a dot, batter runs):
  1. batter and bowler effects over a phase baseline on the fit period (c1-analyse.py `fit_effects`), and their
     true between-player SDs by moments;
  2. empirical-Bayes shrinkage towards 1 with the noise term multiplied by a pooling factor lambda (1 = plain
     empirical Bayes; larger = stronger pooling); lambda is chosen per outcome on the validation period by the
     out-of-sample loss against the phase-only baseline, and the chosen loss change is reported with a 95%
     interval from resampling validation matches. Because lambda is chosen on the validation period, that interval
     is optimistic; the untouched test is the holdout, used once at the end of C2;
  3. cross-outcome correlations of true effects, estimated across two halves of the matches (outcome A on one half,
     outcome B on the other) so that the shared sampling noise of one ball cancels: the bowler wicket effect against
     the bowler runs effect (the variation trade-off) and the batter boundary effect against the batter dismissal
     effect.

  python3 -I scripts/stage-c/c2-fit.py --real /home/user/lcx-data/c1-real-calibration-balls.json \
      --out docs/pavilion/stage-c/c2-fit.json
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
LAMBDAS = (0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 1e9)  # 1e9 = full pooling (no player effect)
FULL_MEMBERS = ["Afghanistan", "Australia", "Bangladesh", "England", "India", "Ireland", "New Zealand",
                "Pakistan", "South Africa", "Sri Lanka", "West Indies", "Zimbabwe"]
ATTRIBUTION_NOTE = ("Derived aggregates only (no ball-by-ball records). Contains information from Cricsheet, "
                    "made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/.")


def true_sd(fe, who):
    eff, n, E, r = (fe["a"], fe["nb"], fe["Eb"], fe["rb"]) if who == "batter" else (fe["b"], fe["no"], fe["Eo"], fe["ro"])
    e = n >= c1.MIN_BALLS
    var = eff[e].var(ddof=1) - np.mean(fe["disp"] * r[e] * eff[e] / np.maximum(E[e], 1e-9))
    return float(np.sqrt(var)) if var > 0 else 0.0, int(e.sum())


def shrink(eff, E, tau, disp, lam):
    noise = lam * disp / np.maximum(E, 1e-9)
    k = tau ** 2 / (tau ** 2 + noise) if tau > 0 else np.zeros_like(E)
    out = 1 + k * (eff - 1)
    out[E <= 0] = 1.0
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--real", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    real = json.loads(a.real.read_text())
    rc = real["columns"]
    keep = np.array(rc["fullMemberMatch"])
    t = c1.Table(rc, keep)
    dates = np.array(rc["date"])[keep]
    fit_w = (dates <= FIT_END).astype(float)
    val = (dates >= VAL_START)
    fv = t.faced & val
    val_matches = np.unique(t.m[fv])
    vm = np.searchsorted(val_matches, t.m[fv])
    rng = np.random.default_rng(SEED)
    boot_counts = [rng.multinomial(len(val_matches), np.full(len(val_matches), 1 / len(val_matches))) for _ in range(400)]
    out = {"version": "LC_STAGE_C_C2_FIT_V1", "researchOnly": True, "gameplayIntegrationPermitted": False,
           "attribution": {**real["attribution"], "note": ATTRIBUTION_NOTE},
           "reference": {"cohort": "men's T20 internationals between two full members", "fullMembers": FULL_MEMBERS,
                         "note": "Cricsheet withholds Afghanistan men's matches"},
           "periods": {"fit": f"<= {FIT_END}", "validation": f"{VAL_START} to 2025-08-24", "holdout": "not read"},
           "matches": {"fit": int(len(np.unique(t.m[dates <= FIT_END]))), "validation": int(len(val_matches))},
           "outcomes": {}}
    fes = {}
    for name in c1.TARGETS:
        y_all = c1.target_values(t, name)
        fe = c1.fit_effects(t, fit_w, y_all)
        fes[name] = fe
        sd_b, nb = true_sd(fe, "batter")
        sd_o, no = true_sd(fe, "bowler")
        y = y_all[fv].astype(float)
        p0 = fe["base"][t.phase[fv]]
        if name == "runs":
            loss = lambda p: (y - p) ** 2
        else:
            loss = lambda p: -(y * np.log(np.clip(p, 1e-4, 1 - 1e-4)) + (1 - y) * np.log(np.clip(1 - p, 1e-4, 1)))
        l0 = loss(p0)
        trials = []
        for lam in LAMBDAS:
            sa = shrink(fe["a"], fe["Eb"], sd_b, fe["disp"], lam)
            sb = shrink(fe["b"], fe["Eo"], sd_o, fe["disp"], lam)
            d = loss(p0 * sa[t.bat[fv]] * sb[t.bowl[fv]]) - l0
            per_d = np.bincount(vm, d, len(val_matches)); per_n = np.bincount(vm, None, len(val_matches))
            bs = [(c * per_d).sum() / (c * per_n).sum() for c in boot_counts]
            trials.append({"lambda": lam if lam < 1e8 else "full pooling", "lossChange": float(d.mean()),
                           "lossChange95": [float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))]})
        best = min(trials, key=lambda x: x["lossChange"])
        out["outcomes"][name] = {
            "metric": "meanSquaredError" if name == "runs" else "logLoss",
            "phaseBaselineFit": fe["base"].tolist(), "phaseOnlyValidationLoss": float(l0.mean()),
            "batter": {"players": nb, "trueRelativeSD": sd_b}, "bowler": {"players": no, "trueRelativeSD": sd_o},
            "poolingTrials": trials, "chosen": best,
            "predictsLaterMatches": bool(best["lossChange95"][1] < 0 and best["lambda"] != "full pooling"),
        }
    # cross-outcome correlations of true effects, across halves (whole calibration split, full members)
    corr = {}
    halves = [((t.half == h) & (t.m >= 0)).astype(float) for h in (0, 1)]
    def eff_half(name, h, who):
        fe = c1.fit_effects(t, halves[h], c1.target_values(t, name))
        return (fe["a"], fe["nb"]) if who == "batter" else (fe["b"], fe["no"])
    full_w = np.ones(len(t.m))
    for label, who, x, y_ in (("bowlerWicketVsRuns", "bowler", "dismissal", "runs"),
                              ("bowlerWicketVsBoundary", "bowler", "dismissal", "boundary"),
                              ("batterBoundaryVsDismissal", "batter", "boundary", "dismissal"),
                              ("batterRunsVsDismissal", "batter", "runs", "dismissal")):
        covs = []
        for h in (0, 1):
            ex, nx = eff_half(x, h, who)
            ey, ny = eff_half(y_, 1 - h, who)
            e = (nx >= 50) & (ny >= 50)
            covs.append(np.cov(ex[e], ey[e])[0, 1])
        sdx = true_sd(c1.fit_effects(t, full_w, c1.target_values(t, x)), who)[0]
        sdy = true_sd(c1.fit_effects(t, full_w, c1.target_values(t, y_)), who)[0]
        r = float(np.mean(covs) / (sdx * sdy)) if sdx > 0 and sdy > 0 else None
        corr[label] = {"crossHalfCovariance": float(np.mean(covs)), "trueSDs": [sdx, sdy], "correlation": r}
    out["crossOutcomeCorrelations"] = corr
    out["note"] = ("Correlations use halves of the whole calibration split (full members), not the validation period. "
                   "Half-sample effects with at least 50 balls in each half; correlation = cross-half covariance / product of true SDs.")
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps({"matches": out["matches"], "chosen": {k: (v["chosen"], v["batter"], v["bowler"], v["predictsLaterMatches"]) for k, v in out["outcomes"].items()}, "corr": corr}, indent=1))


if __name__ == "__main__":
    main()
