#!/usr/bin/env python3
"""Stage C C5 (Directive 02, A4): the size of the game's batter-against-bowler-type matchup effect.

RESEARCH ONLY. No real yardstick: Cricsheet records neither a bowler's style nor a batter's hand, so this measures
the game only. Reads game files from scripts/stage-c/c1-game-balls.ts and the world pack (bowling style, batting
hand). For every batter with at least 60 balls faced against both pace and spin:
  tilt      = vsSpin rating - vsPace rating;
  response  = ln(runs per ball against spin / runs per ball against pace), and the same for dismissals per ball.
The effect is the mean response of the top tilt quarter minus that of the bottom quarter (positive = batters rated
better against spin do relatively better against spin), with a 95% match-bootstrap interval. Handedness: the same
spin / pace response for left- minus right-handed batters (the generator has no hand term, so it should be null).

  python3 -I scripts/stage-c/c5-matchups.py --game <c1-game-balls files...> --world packages/data/worlds/fictional-eight-01.json --out <json>
"""
import argparse
import json
from pathlib import Path

import numpy as np

REPS, SEED, MIN_BALLS = 300, 20261126, 60


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", nargs="+", type=Path, required=True)
    ap.add_argument("--world", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    world = {p["playerId"]: p for p in json.loads(a.world.read_text())["players"]}
    cols = {}
    for p in a.game:
        for k, v in json.loads(p.read_text())["columns"].items():
            cols.setdefault(k, []).extend(v)
    c = {k: np.array(v) for k, v in cols.items()}
    faced = c["wides"] == 0
    spin = np.array([world[b]["bowlingStyle"] not in ("FAST", "MEDIUM") for b in c["bowler"]])
    batters, bi = np.unique(c["batter"], return_inverse=True)
    matches, mi = np.unique(c["match"], return_inverse=True)
    out = (c["out"] == c["batter"]).astype(float)
    tilt = np.array([world[b]["skills"]["T20"]["vsSpin"] - world[b]["skills"]["T20"]["vsPace"] for b in batters], float)
    left = np.array([world[b]["batHand"] == "L" for b in batters])

    def effects(w):
        n = len(batters)
        cnt = lambda x: np.bincount(bi, w * x, n)
        bs, bp = cnt(faced & spin), cnt(faced & ~spin)
        rs, rp = cnt(c["batRuns"] * (faced & spin)), cnt(c["batRuns"] * (faced & ~spin))
        ds, dp = cnt(out * (faced & spin)), cnt(out * (faced & ~spin))
        ok = (bs >= MIN_BALLS) & (bp >= MIN_BALLS) & (rs > 0) & (rp > 0)
        runs = np.log((rs / np.maximum(bs, 1)) / np.maximum(rp / np.maximum(bp, 1), 1e-9))
        okd = ok & (ds > 0) & (dp > 0)
        dis = np.log((ds / np.maximum(bs, 1)) / np.maximum(dp / np.maximum(bp, 1), 1e-9))
        ids = np.flatnonzero(ok)
        o = ids[np.argsort(tilt[ids], kind="stable")]
        q = len(o) // 4
        top, bot = o[-q:], o[:q]
        res = {"batters": int(ok.sum()), "tiltQuarterMeans": [float(tilt[bot].mean()), float(tilt[top].mean())],
               "runsTopMinusBottom": float(runs[top].mean() - runs[bot].mean()),
               "dismissalTopMinusBottom": float(dis[np.intersect1d(top, np.flatnonzero(okd))].mean() - dis[np.intersect1d(bot, np.flatnonzero(okd))].mean()),
               "runsLeftMinusRight": float(runs[ok & left].mean() - runs[ok & ~left].mean())}
        # slope of the runs response per tilt point (least squares)
        res["runsSlopePerTiltPoint"] = float(np.polyfit(tilt[ok], runs[ok], 1)[0])
        return res

    point = effects(np.ones(len(c["match"])))
    rng = np.random.default_rng(SEED)
    draws = {k: [] for k in point if k not in ("batters", "tiltQuarterMeans")}
    for _ in range(REPS):
        w = rng.multinomial(len(matches), np.full(len(matches), 1 / len(matches)))[mi].astype(float)
        e = effects(w)
        for k in draws:
            draws[k].append(e[k])
    res = {"version": "LC_STAGE_C_C5_MATCHUPS_V1", "researchOnly": True, "realYardstick": None,
           "note": "Cricsheet records no bowling style or batting hand, so no real yardstick exists for these effects.",
           "point": point, "ci95": {k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in draws.items()}}
    a.out.write_text(json.dumps(res, indent=1) + "\n")
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
