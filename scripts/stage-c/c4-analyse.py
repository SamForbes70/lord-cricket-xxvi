#!/usr/bin/env python3
"""Stage C C4: decompose the game's dots and wickets by delivery-model branch, phase and aggression, and compare the
first-innings outcome mix with real full-member men's T20 internationals from the CALIBRATION split only.

RESEARCH ONLY. Reads:
  --game   one or more files from scripts/stage-c/c4-delivery-balls.ts (captain-driven runs);
  --forced optional files from the same script with --aggression=k (one aggression level per file);
  --real   the calibration-split delivery table from scripts/stage-c/c1-real-extract.py (date <= 2025-08-24).
The holdout (2025-08-30 onward) is never read. The real side is split into the fit period (<= 2023-08-31) and the
selection period (2023-09-01 to 2025-08-24), and both are reported.

Definitions (as scripts/stage-c/c2-report.py): a dot is a legal ball with no run of any kind; a boundary ball is a
legal ball with 4 or 6 off the bat; first innings only; phases are overs 1 to 6, 7 to 15 and 16 to 20.

  python3 -I scripts/stage-c/c4-analyse.py --game <c4 game files...> [--forced <files...>] \
      --real /home/user/lcx-data/c1-real-calibration-balls.json --out <out.json>
"""
import argparse
import json
from pathlib import Path

import numpy as np

FIT_END = "2023-08-31"
CAL_END = "2025-08-24"
PHASES = (("powerplay", 0, 6), ("middle", 6, 15), ("death", 15, 20))


def load(paths):
    cols, meta = {}, []
    for p in paths:
        d = json.loads(Path(p).read_text())
        meta.append({k: d.get(k) for k in ("version", "model", "forcedAggression", "repeats", "firstRepeat")})
        for k, v in d["columns"].items():
            cols.setdefault(k, []).extend(v)
    return {k: np.array(v) for k, v in cols.items()}, meta


def mix(legal, total, bat, out, over=None):
    """Per-legal-ball outcome mix (fractions), and runs per over including extras on all balls in the slice."""
    n = int(legal.sum())
    if n == 0:
        return {"legalBalls": 0}
    lb = legal
    res = {"legalBalls": n,
           "dot": float(((total == 0) & lb & ~out).sum() / n),
           "dotIncludingWicketBalls": float(((total == 0) & lb).sum() / n),
           "one": float(((bat == 1) & lb).sum() / n), "two": float(((bat == 2) & lb).sum() / n),
           "three": float(((bat == 3) & lb).sum() / n), "four": float(((bat == 4) & lb).sum() / n),
           "six": float(((bat == 6) & lb).sum() / n), "wicket": float((out & lb).sum() / n),
           "boundary": float((np.isin(bat, [4, 6]) & lb).sum() / n)}
    res["runsPerOver"] = float(6 * total.sum() / n)
    return res


def first_innings_summary(match, inn, over, legal, total, bat, out):
    f = inn == 0
    ids, invi = np.unique(match[f], return_inverse=True)
    runs = np.bincount(invi, total[f], len(ids))
    wk = np.bincount(invi, out[f], len(ids))
    s = {"innings": int(len(ids)), "runs": float(runs.mean()), "wickets": float(wk.mean()),
         "p10": float(np.percentile(runs, 10)), "p50": float(np.percentile(runs, 50)), "p90": float(np.percentile(runs, 90)),
         "dotPercent": float(100 * ((total[f] == 0) & legal[f]).sum() / legal[f].sum()),
         "boundaryPercent": float(100 * (np.isin(bat[f], [4, 6]) & legal[f]).sum() / legal[f].sum()),
         "all": mix(legal[f], total[f], bat[f], out[f])}
    for name, lo, hi in PHASES:
        p = f & (over >= lo) & (over < hi)
        s[name] = mix(legal[p], total[p], bat[p], out[p])
    return s


def real_side(path):
    c, _ = load([path])
    full = c["fullMemberMatch"].astype(bool)
    legal = (c["wides"] == 0) & (c["noballs"] == 0)
    total = c["batRuns"] + c["wides"] + c["noballs"] + c["byes"] + c["legbyes"]
    out = c["out"] != ""
    res = {}
    for name, sel in (("fit", full & (c["date"] <= FIT_END)), ("selection", full & (c["date"] > FIT_END) & (c["date"] <= CAL_END))):
        s = first_innings_summary(c["match"][sel], c["inn"][sel], c["over"][sel], legal[sel], total[sel], c["batRuns"][sel], out[sel])
        res[name] = s
        # Real trade-off between phases: extra wickets per ball for each extra run per ball, middle to death.
        m, d = s["middle"], s["death"]
        res[name]["middleToDeathWicketsPerRun"] = (d["wicket"] - m["wicket"]) / ((d["runsPerOver"] - m["runsPerOver"]) / 6)
        kinds = c["outKind"][sel & (c["inn"] == 0) & out]
        u, k = np.unique(kinds, return_counts=True)
        res[name]["dismissalKinds"] = {str(a): float(b / k.sum()) for a, b in zip(u, k)}
    return res


def game_side(paths):
    c, meta = load(paths)
    legal = c["legality"] == "LEGAL"
    total = c["batRuns"] + c["extras"]
    out = c["outKind"] != ""
    over = c["legalBefore"] // 6
    s = first_innings_summary(c["match"], c["inn"], over, legal, total, c["batRuns"], out)
    s["meta"] = meta
    f = (c["inn"] == 0) & legal
    traj, fo = c["trajectory"], c["fieldOutcome"]
    dot = f & (total == 0) & ~out
    n_dot = int(dot.sum())
    branches = {
        "noContact": traj == "NONE",
        "ground": traj == "GROUND",
        "aerial": traj == "AERIAL",
        "edge": traj == "EDGE",
    }
    s["dotSources"] = {k: {"shareOfDots": float((dot & b).sum() / n_dot), "perLegalBall": float((dot & b).sum() / f.sum())}
                       for k, b in branches.items()}
    s["contactMix"] = {k: float((f & b).sum() / f.sum()) for k, b in branches.items()}
    s["outcomeByContact"] = {}
    for k, b in branches.items():
        sel = f & b
        if sel.sum():
            s["outcomeByContact"][k] = {"share": float(sel.sum() / f.sum()), "dot": float((sel & (total == 0) & ~out).sum() / sel.sum()),
                                        "runsPerBall": float(total[sel].sum() / sel.sum()),
                                        "boundary": float((sel & np.isin(c["batRuns"], [4, 6])).sum() / sel.sum()),
                                        "wicket": float((sel & out).sum() / sel.sum())}
    s["contactByPhase"] = {}
    for name, lo, hi in PHASES:
        ph = f & (over >= lo) & (over < hi)
        s["contactByPhase"][name] = {k: {"share": float((ph & b).sum() / ph.sum()),
                                         "dot": float((ph & b & (total == 0) & ~out).sum() / max(1, (ph & b).sum())),
                                         "wicket": float((ph & b & out).sum() / max(1, (ph & b).sum()))} for k, b in branches.items()}
    w = f & out
    s["wicketSources"] = {k: float((w & b).sum() / w.sum()) for k, b in branches.items()}
    u, k = np.unique(c["outKind"][(c["inn"] == 0) & out], return_counts=True)
    s["dismissalKinds"] = {str(a): float(b / k.sum()) for a, b in zip(u, k)}
    s["byAggression"] = {}
    for a in range(5):
        sel = f & (c["aggression"] == a)
        if sel.sum() == 0:
            continue
        row = mix(sel[sel], total[sel], c["batRuns"][sel], out[sel])
        row["shareOfBalls"] = float(sel.sum() / f.sum())
        row["contact"] = {k: float((sel & b).sum() / sel.sum()) for k, b in branches.items()}
        for name, lo, hi in PHASES:
            p = sel & (over >= lo) & (over < hi)
            row[name + "Balls"] = int(p.sum())
        s["byAggression"][str(a)] = row
    return s


def forced_side(paths):
    rows = {}
    for p in paths:
        c, meta = load([p])
        a = meta[0]["forcedAggression"]
        legal = c["legality"] == "LEGAL"
        total = c["batRuns"] + c["extras"]
        out = c["outKind"] != ""
        over = c["legalBefore"] // 6
        s = first_innings_summary(c["match"], c["inn"], over, legal, total, c["batRuns"], out)
        f = (c["inn"] == 0) & legal
        s["perBall"] = {"runs": float(total[f].sum() / f.sum()), "wicket": float((f & out).sum() / f.sum())}
        rows[str(a)] = s
    keys = sorted(rows, key=int)
    steps = []
    for lo, hi in zip(keys, keys[1:]):
        dr = rows[hi]["perBall"]["runs"] - rows[lo]["perBall"]["runs"]
        dw = rows[hi]["perBall"]["wicket"] - rows[lo]["perBall"]["wicket"]
        steps.append({"from": int(lo), "to": int(hi), "extraRunsPerBall": dr, "extraWicketsPerBall": dw,
                      "wicketsPerExtraRun": dw / dr if dr else None})
    return {"levels": rows, "steps": steps}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", nargs="+", required=True)
    ap.add_argument("--forced", nargs="*", default=[])
    ap.add_argument("--real", type=Path, required=True)
    ap.add_argument("--label", default="")
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    real = real_side(a.real)
    res = {"version": "LC_STAGE_C_C4_ANALYSIS_V1", "researchOnly": True, "label": a.label,
           "attribution": "Contains information from Cricsheet (https://cricsheet.org/), ODC-By 1.0 (https://cricsheet.org/licensing/). "
                          "Real side: full-member men's T20 internationals, calibration split only (fit <= 2023-08-31, selection "
                          "2023-09-01 to 2025-08-24). The holdout is not read.",
           "real": real, "game": game_side(a.game)}
    if a.forced:
        res["forcedAggression"] = forced_side(a.forced)
    a.out.write_text(json.dumps(res, indent=1) + "\n")
    g = res["game"]
    print("game", {k: round(g[k], 2) for k in ("runs", "wickets", "dotPercent", "boundaryPercent")},
          {p: round(g[p]["runsPerOver"], 2) for p, _, _ in PHASES})
    for name in ("fit", "selection"):
        r = real[name]
        print(name, {k: round(r[k], 2) for k in ("runs", "wickets", "dotPercent", "boundaryPercent")},
              {p: round(r[p]["runsPerOver"], 2) for p, _, _ in PHASES}, "w/run", round(r["middleToDeathWicketsPerRun"], 4))
    print("dotSources", {k: round(v["perLegalBall"], 4) for k, v in g["dotSources"].items()})
    print("contact", {k: round(v, 4) for k, v in g["contactMix"].items()})
    print("wicketSources", {k: round(v, 3) for k, v in g["wicketSources"].items()})
    for ph, v in g["contactByPhase"].items():
        print(" ", ph, " ".join(f"{k}={x['share']:.3f}/{x['dot']:.2f}/{x['wicket']:.3f}" for k, x in v.items()))
    for k, v in g["outcomeByContact"].items():
        print(" ", k, {kk: round(vv, 4) for kk, vv in v.items()})
    for k, v in g["byAggression"].items():
        print("aggr", k, {kk: round(v[kk], 4) for kk in ("shareOfBalls", "dot", "boundary", "wicket", "runsPerOver")})
    if a.forced:
        for k, v in res["forcedAggression"]["levels"].items():
            print("forced", k, {kk: round(v[kk], 2) for kk in ("runs", "wickets", "dotPercent", "boundaryPercent")}, {kk: round(vv, 4) for kk, vv in v["perBall"].items()})
        for s in res["forcedAggression"]["steps"]:
            print("step", s)


if __name__ == "__main__":
    main()
