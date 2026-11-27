#!/usr/bin/env python3
"""Batting policy V3 (captain V6, 27 November 2026): before and after tables for docs/pavilion/BATTING_POLICY_V3.md.

RESEARCH ONLY. Reads two sets of game files from scripts/stage-c/c4-delivery-balls.ts (before and after, the same seeds),
and optionally the matching scripts/stage-c/c1-game-balls.ts files (batter ids, for the split by tail-enders). Writes
one JSON. First innings unless stated. Brackets are 95% match-bootstrap percentiles (1,000 resamples, fixed seed; a
match is resampled whole). The difference after minus before is paired: both sides are resampled with the same
matches, which the same seeds make possible.

Definitions as scripts/stage-c/c5-summary.py and c4-analyse.py: phases are overs 1 to 6, 7 to 15 and 16 to 20 by the
legal balls before the delivery; runs an over include extras; a dot is a legal ball with no run of any kind and no
wicket; wicket, four and six % are per legal ball; dismissal kinds are per 100 legal balls (all deliveries).

  python3 -I scripts/pavilion-batting-v3-summary.py --before <g files> --after <g files> \
      [--balls-before <c1 files> --balls-after <c1 files>] --label <text> --out <json>
"""
import argparse
import json
from pathlib import Path

import numpy as np

REPS, SEED = 1000, 20261127
PHASES = (("powerplay", 0, 6), ("middle", 6, 15), ("death", 15, 20))
KINDS = ("CAUGHT", "BOWLED", "RUN_OUT", "LBW", "STUMPED", "HIT_WICKET")
TAIL_BELOW = 175


def load(paths):
    cols = {}
    meta = []
    for p in paths:
        d = json.loads(Path(p).read_text())
        meta.append({k: d.get(k) for k in ("model", "captain", "repeats", "firstRepeat", "forcedAggression")})
        for k, v in d["columns"].items():
            cols.setdefault(k, []).extend(v)
        if "players" in d:
            cols.setdefault("_players", []).extend(d["players"])
    return {k: (np.array(v) if k != "_players" else v) for k, v in cols.items()}, meta


def per_match_g(c, ids):
    """Per-match sums of everything the tables need (c4 files)."""
    idx = {m: i for i, m in enumerate(ids)}
    mi = np.array([idx[m] for m in c["match"]])
    n = len(ids)
    legal = c["legality"] == "LEGAL"
    total = c["batRuns"] + c["extras"]
    out = c["outKind"] != ""
    over = c["legalBefore"] // 6
    s = lambda mask, x=None: np.bincount(mi[mask], (np.ones(mask.sum()) if x is None else x[mask].astype(float)), n)
    m = {}
    for inn in (0, 1):
        f = c["inn"] == inn
        if inn == 0:
            m["runs"] = s(f, total)
            m["wickets"] = s(f & out)
        for name, lo, hi in PHASES:
            p = f & (over >= lo) & (over < hi)
            key = f"{name}" if inn == 0 else f"{name}2"
            m[f"{key}.legal"] = s(p & legal)
            for a in range(5):
                m[f"{key}.agg{a}"] = s(p & legal & (c["aggression"] == a))
            if inn == 1:
                continue
            m[f"{key}.runs"] = s(p, total)
            m[f"{key}.wickets"] = s(p & out & legal)
            m[f"{key}.dots"] = s(p & legal & (total == 0) & ~out)
            m[f"{key}.fours"] = s(p & legal & (c["batRuns"] == 4))
            m[f"{key}.sixes"] = s(p & legal & (c["batRuns"] == 6))
            for k in KINDS:
                m[f"{key}.kind.{k}"] = s(p & (c["outKind"] == k))
    return m


def per_match_c1(c, ids):
    """Per-match first-innings death sums by striker class (c1 files: batter ids and batting scores)."""
    score = {p["playerId"]: p["battingScore"] for p in c["_players"]}
    idx = {m: i for i, m in enumerate(ids)}
    mi = np.array([idx[m] for m in c["match"]])
    n = len(ids)
    legal = (c["wides"] == 0) & (c["noballs"] == 0)
    tail = np.array([score[b] < TAIL_BELOW for b in c["batter"]])
    death = (c["inn"] == 0) & (c["over"] >= 15)
    s = lambda mask, x=None: np.bincount(mi[mask], (np.ones(mask.sum()) if x is None else x[mask].astype(float)), n)
    m = {}
    for name, cls in (("tail", tail), ("recognised", ~tail)):
        p = death & cls
        m[f"{name}.legal"] = s(p & legal)
        m[f"{name}.batRuns"] = s(p, c["batRuns"])
        m[f"{name}.outs"] = s(p & (c["out"] == c["batter"]))
        m[f"{name}.boundaries"] = s(p & legal & np.isin(c["batRuns"], [4, 6]))
    m["all.legal"] = s(death & legal)
    return m


def stats_g():
    st = {
        "runs": lambda m: m["runs"].mean(axis=-1),
        "wickets": lambda m: m["wickets"].mean(axis=-1),
    }
    r = lambda a, b, k=1: (lambda m: k * m[a].sum(axis=-1) / m[b].sum(axis=-1))
    for name, _, _ in PHASES:
        st[f"{name}.runsPerOver"] = r(f"{name}.runs", f"{name}.legal", 6)
        st[f"{name}.wicketPercent"] = r(f"{name}.wickets", f"{name}.legal", 100)
        st[f"{name}.dotPercentExcludingWicketBalls"] = r(f"{name}.dots", f"{name}.legal", 100)
        st[f"{name}.fourPercent"] = r(f"{name}.fours", f"{name}.legal", 100)
        st[f"{name}.sixPercent"] = r(f"{name}.sixes", f"{name}.legal", 100)
    for k in KINDS:
        st[f"death.kindPer100LegalBalls.{k}"] = r(f"death.kind.{k}", "death.legal", 100)
    for key in [p[0] for p in PHASES] + [p[0] + "2" for p in PHASES]:
        for a in range(5):
            st[f"aggressionShare.{key}.{a}"] = r(f"{key}.agg{a}", f"{key}.legal", 100)
    return st


def stats_c1():
    r = lambda a, b, k=1: (lambda m: k * m[a].sum(axis=-1) / m[b].sum(axis=-1))
    st = {}
    for name in ("tail", "recognised"):
        st[f"{name}.shareOfDeathLegalBalls"] = r(f"{name}.legal", "all.legal", 100)
        st[f"{name}.runsPerBall"] = r(f"{name}.batRuns", f"{name}.legal")
        st[f"{name}.dismissalPercent"] = r(f"{name}.outs", f"{name}.legal", 100)
        st[f"{name}.boundaryPercent"] = r(f"{name}.boundaries", f"{name}.legal", 100)
    return st


def table(mb, ma, st):
    n = len(next(iter(mb.values())))
    rng = np.random.default_rng(SEED)
    boots = rng.integers(0, n, (REPS, n))
    class Take(dict):
        """The resampled per-match sums, built only for the keys a statistic reads."""
        def __init__(self, m, b):
            super().__init__()
            self.m, self.b = m, b

        def __getitem__(self, k):
            return self.m[k][self.b]
    bb, ba = Take(mb, boots), Take(ma, boots)
    res = {}
    for k, f in st.items():
        vb, va = float(f(mb)), float(f(ma))
        sb, sa = f(bb), f(ba)
        ci = lambda x: [float(np.percentile(x, 2.5)), float(np.percentile(x, 97.5))]
        res[k] = {"before": {"value": vb, "ci95": ci(sb)}, "after": {"value": va, "ci95": ci(sa)},
                  "afterMinusBefore": {"value": va - vb, "ci95": ci(sa - sb)}}
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", nargs="+", required=True)
    ap.add_argument("--after", nargs="+", required=True)
    ap.add_argument("--balls-before", nargs="*", default=[])
    ap.add_argument("--balls-after", nargs="*", default=[])
    ap.add_argument("--label", default="")
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    cb, metab = load(a.before)
    ca, metaa = load(a.after)
    ids = sorted(set(cb["match"]))
    if ids != sorted(set(ca["match"])):
        raise SystemExit("before and after are not the same matches")
    res = {"version": "LC_PAVILION_BATTING_V3_SUMMARY_V1", "researchOnly": True, "label": a.label,
           "bootstrap": {"replicates": REPS, "seed": SEED, "unit": "match", "paired": True},
           "matches": len(ids), "beforeFiles": metab, "afterFiles": metaa,
           "firstInningsUnlessStated": table(per_match_g(cb, ids), per_match_g(ca, ids), stats_g())}
    if a.balls_before and a.balls_after:
        bb, _ = load(a.balls_before)
        ba, _ = load(a.balls_after)
        if sorted(set(bb["match"])) != ids or sorted(set(ba["match"])) != ids:
            raise SystemExit("ball files are not the same matches")
        res["deathFirstInningsByStrikerClass"] = table(per_match_c1(bb, ids), per_match_c1(ba, ids), stats_c1())
    a.out.write_text(json.dumps(res, indent=1) + "\n")
    fmt = lambda x: f"{x['value']:.3f} ({x['ci95'][0]:.3f} to {x['ci95'][1]:.3f})"
    for sect in ("firstInningsUnlessStated", "deathFirstInningsByStrikerClass"):
        for k, v in res.get(sect, {}).items():
            if k.startswith("aggressionShare") and v["before"]["value"] == 0 and v["after"]["value"] == 0:
                continue
            print(f"{k}: before {fmt(v['before'])}; after {fmt(v['after'])}; diff {fmt(v['afterMinusBefore'])}")


if __name__ == "__main__":
    main()
