#!/usr/bin/env python3
"""Stage C C6: the pre-registered update rule from one calibrated-t20-02 candidate to the next (research only).

Mechanical: it reads the candidate history (parameters and scripts/stage-c/c6-objective.py output, fit period only)
and writes the next candidate's parameters. No value is set by hand. Rules (docs/pavilion/stage-c/C6_REFIT.md 1d):
  - bowled and lbw intercepts by phase: add 10,000 x ln(real / game) bp (rates per 100 legal balls, floored at 0.01),
    rounded to 100;
  - catch-chance term by phase (aerial and edge alike): add 2,400 x (real / game - 1) bp, rounded to 50;
  - timing and power on a four and a six (one value): error e = mean of ln(batter runs / 1.410) and
    ln(batter boundary / 1.781) (upper ends of the fit-period ranges). Secant on the last two candidates with different
    values when its slope is positive, otherwise the default slope 0.000014 a bp; step -e / slope, at most 4,000,
    rounded to 100;
  - rotation on a dot: error ln(batter non-dot / 1.2345) (middle of the fit-period range). Changed only when the
    non-dot ratio is outside the fit-period range, or by secant once two candidates differ in it; default slope
    -0.00001 a bp; step at most 3,000, rounded to 100.

  python3 -I scripts/stage-c/c6-fit-step.py --history <params-0.json> <objective-0.json> [<params-1.json> <objective-1.json> ...] --out <params-next.json>
"""
import argparse
import json
import math
from pathlib import Path

PHASES = {"T20_EARLY": "powerplay", "T20_MIDDLE": "middle", "T20_LATE": "death"}
RUNS_TARGET, BOUNDARY_TARGET, NONDOT_MID = 1.410, 1.781, 1.2345
NONDOT_RANGE = (1.212, 1.257)


def rnd(x, step):
    return int(step * round(x / step))


def secant(points, key, err, default_slope, positive):
    """points: [(params, objective)]; returns the slope from the last two with distinct values of key, or None."""
    distinct = []
    for p, o in reversed(points):
        if all(p[key] != q[key] for q, _ in distinct):
            distinct.append((p, o))
        if len(distinct) == 2:
            break
    if len(distinct) < 2:
        return default_slope
    (p2, o2), (p1, o1) = distinct
    slope = (err(o2) - err(o1)) / (p2[key] - p1[key])
    if (slope > 0) != positive or slope == 0:
        return default_slope
    return slope


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", nargs="+", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    files = a.history
    if len(files) % 2:
        raise SystemExit("history must be pairs of params and objective files")
    points = [(json.loads(files[i].read_text()), json.loads(files[i + 1].read_text())) for i in range(0, len(files), 2)]
    p, o = points[-1]
    game, real = o["game"], o["real"]["fit"]
    nxt = json.loads(json.dumps(p))
    for ph, name in PHASES.items():
        for key, kind in (("bowledPhase", "bowledPer100"), ("lbwPhase", "lbwPer100")):
            g, r = max(game[name][kind], 0.01), max(real[name][kind], 0.01)
            nxt[key][ph] = p[key][ph] + rnd(10000 * math.log(r / g), 100)
        g, r = max(game[name]["caughtPer100"], 0.01), real[name]["caughtPer100"]
        nxt["catchPhase"][ph] = p["catchPhase"][ph] + rnd(2400 * (r / g - 1), 50)

    def err_t(obj):
        return 0.5 * (math.log(obj["ratios"]["runs.batter"] / RUNS_TARGET) + math.log(obj["ratios"]["boundary.batter"] / BOUNDARY_TARGET))
    slope_t = secant(points, "timingPowerBoundary", err_t, 0.000014, True)
    step_t = max(-4000, min(4000, -err_t(o) / slope_t))
    nxt["timingPowerBoundary"] = p["timingPowerBoundary"] + rnd(step_t, 100)

    def err_r(obj):
        return math.log(obj["ratios"]["nonDot.batter"] / NONDOT_MID)
    moved = len({q["rotationDot"] for q, _ in points}) > 1
    nd = o["ratios"]["nonDot.batter"]
    if moved or not (NONDOT_RANGE[0] <= nd <= NONDOT_RANGE[1]):
        slope_r = secant(points, "rotationDot", err_r, -0.00001, False)
        step_r = max(-3000, min(3000, -err_r(o) / slope_r))
        nxt["rotationDot"] = p["rotationDot"] + rnd(step_r, 100)
    a.out.write_text(json.dumps(nxt, indent=1) + "\n")
    print(json.dumps(nxt))


if __name__ == "__main__":
    main()
