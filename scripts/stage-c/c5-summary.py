#!/usr/bin/env python3
"""Stage C C5: before and after tables with 95% intervals, for the write-up.

RESEARCH ONLY. Reads game files from scripts/stage-c/c4-delivery-balls.ts for two model states (before = main,
after = this branch), the forced bowling-plan runs of both (--length / --effort), and the forced-aggression runs, and
writes one JSON. Intervals are 95% match-bootstrap percentiles (fixed seed; a match is resampled whole). First
innings only, as C4. The real side is not read here (see c4-analyse.py and c5-real-yardsticks.py).

  python3 -I scripts/stage-c/c5-summary.py --before <g files> --after <g files> \
      --levers-before <dir> --levers-after <dir> --forced-before <f files> --forced-after <f files> --out <json>
"""
import argparse
import json
from pathlib import Path

import numpy as np

PHASES = (("powerplay", 0, 6), ("middle", 6, 15), ("death", 15, 20))
REPS, SEED = 400, 20261126


def load(paths):
    cols = {}
    for p in paths:
        for k, v in json.loads(Path(p).read_text())["columns"].items():
            cols.setdefault(k, []).extend(v)
    return {k: np.array(v) for k, v in cols.items()}


def per_match(c):
    """Per first-innings sums, so any ratio can be bootstrapped by match."""
    f = c["inn"] == 0
    legal = c["legality"] == "LEGAL"
    total = c["batRuns"] + c["extras"]
    out = c["outKind"] != ""
    over = c["legalBefore"] // 6
    ids, inv = np.unique(c["match"][f], return_inverse=True)
    n = len(ids)
    s = lambda x: np.bincount(inv, x[f].astype(float), n)
    m = {"runs": s(total), "wickets": s(out), "legal": s(legal), "dots": s((total == 0) & legal),
         "boundaries": s(np.isin(c["batRuns"], [4, 6]) & legal), "fours": s((c["batRuns"] == 4) & legal),
         "stumped": s(c["outKind"] == "STUMPED")}
    for name, lo, hi in PHASES:
        p = (over >= lo) & (over < hi)
        m[f"{name}.runs"] = s(total * p)
        m[f"{name}.legal"] = s(legal & p)
        m[f"{name}.wickets"] = s(out & legal & p)
        m[f"{name}.dots"] = s((total == 0) & legal & ~out & p)
        m[f"{name}.fours"] = s((c["batRuns"] == 4) & legal & p)
    return m


STATS = {
    "runs": lambda m, i: m["runs"][i].mean(),
    "wickets": lambda m, i: m["wickets"][i].mean(),
    "dotPercent": lambda m, i: 100 * m["dots"][i].sum() / m["legal"][i].sum(),
    "boundaryPercent": lambda m, i: 100 * m["boundaries"][i].sum() / m["legal"][i].sum(),
    "stumpedShareOfWickets": lambda m, i: 100 * m["stumped"][i].sum() / m["wickets"][i].sum(),
    **{f"{p}.runsPerOver": (lambda p: lambda m, i: 6 * m[f"{p}.runs"][i].sum() / m[f"{p}.legal"][i].sum())(p) for p, _, _ in PHASES},
    **{f"{p}.wicketPercent": (lambda p: lambda m, i: 100 * m[f"{p}.wickets"][i].sum() / m[f"{p}.legal"][i].sum())(p) for p, _, _ in PHASES},
    **{f"{p}.dotPercent": (lambda p: lambda m, i: 100 * m[f"{p}.dots"][i].sum() / m[f"{p}.legal"][i].sum())(p) for p, _, _ in PHASES},
    **{f"{p}.fourPercent": (lambda p: lambda m, i: 100 * m[f"{p}.fours"][i].sum() / m[f"{p}.legal"][i].sum())(p) for p, _, _ in PHASES},
}


def with_ci(m, keys=None):
    n = len(m["runs"])
    rng = np.random.default_rng(SEED)
    idx = np.arange(n)
    boots = [rng.integers(0, n, n) for _ in range(REPS)]
    out = {}
    for k, f in STATS.items():
        if keys and k not in keys:
            continue
        v = float(f(m, idx))
        b = np.array([f(m, i) for i in boots])
        out[k] = {"value": v, "ci95": [float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))]}
    out["innings"] = n
    out["p10p50p90"] = [float(np.percentile(m["runs"], q)) for q in (10, 50, 90)]
    return out


def diff_ci(ma, mb, key):
    """Difference a - b of one statistic between two independent runs, bootstrapped separately."""
    rng = np.random.default_rng(SEED + 7)
    f = STATS[key]
    na, nb = len(ma["runs"]), len(mb["runs"])
    d = [f(ma, rng.integers(0, na, na)) - f(mb, rng.integers(0, nb, nb)) for _ in range(REPS)]
    return {"value": float(f(ma, np.arange(na)) - f(mb, np.arange(nb))), "ci95": [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]}


def levers(directory):
    res = {}
    d = Path(directory)
    files = {p.stem: per_match(load([p])) for p in sorted(d.glob("*.json"))}
    keys = ("runs", "wickets", "dotPercent", "boundaryPercent", "death.runsPerOver", "death.wicketPercent")
    for name, m in files.items():
        res[name] = with_ci(m, keys)
    for lever, a, b in (("effort MAXIMUM - CONSERVE", "effort-MAXIMUM", "effort-CONSERVE"),
                        ("effort MAXIMUM - NORMAL", "effort-MAXIMUM", "effort-NORMAL"),
                        ("length YORKER - GOOD", "length-YORKER", "length-GOOD"),
                        ("length FULL - GOOD", "length-FULL", "length-GOOD")):
        if a in files and b in files:
            res[lever] = {k: diff_ci(files[a], files[b], k) for k in ("runs", "wickets", "death.runsPerOver", "death.wicketPercent")}
    return res


def forced(paths):
    rows = {}
    for p in paths:
        d = json.loads(Path(p).read_text())
        m = per_match(load([p]))
        rows[str(d["forcedAggression"])] = with_ci(m, ("runs", "wickets", "dotPercent", "boundaryPercent"))
    return rows


def main():
    ap = argparse.ArgumentParser()
    for k in ("before", "after", "forced-before", "forced-after"):
        ap.add_argument(f"--{k}", nargs="+", required=True)
    for k in ("levers-before", "levers-after", "out"):
        ap.add_argument(f"--{k}", type=Path, required=True)
    a = ap.parse_args()
    mb, ma = per_match(load(a.before)), per_match(load(a.after))
    res = {"version": "LC_STAGE_C_C5_SUMMARY_V1", "researchOnly": True, "bootstrap": {"replicates": REPS, "seed": SEED, "unit": "match"},
           "before": with_ci(mb), "after": with_ci(ma),
           "afterMinusBefore": {k: diff_ci(ma, mb, k) for k in ("runs", "wickets", "dotPercent", "boundaryPercent", "death.runsPerOver", "death.wicketPercent")},
           "leversBefore": levers(a.levers_before), "leversAfter": levers(a.levers_after),
           "forcedAggressionBefore": forced(a.forced_before), "forcedAggressionAfter": forced(a.forced_after)}
    a.out.write_text(json.dumps(res, indent=1) + "\n")
    fmt = lambda x: f"{x['value']:.2f} ({x['ci95'][0]:.2f} to {x['ci95'][1]:.2f})"
    for side in ("before", "after"):
        print(side, {k: fmt(v) for k, v in res[side].items() if isinstance(v, dict)}, res[side]["p10p50p90"])
    for side in ("leversBefore", "leversAfter"):
        for k, v in res[side].items():
            if " - " in k:
                print(side, k, {kk: fmt(vv) for kk, vv in v.items()})


if __name__ == "__main__":
    main()
