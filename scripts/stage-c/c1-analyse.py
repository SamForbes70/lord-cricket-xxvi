#!/usr/bin/env python3
"""Stage C research slice C1: skill differentiation, real (calibration split) against the game, one code path.

Research only. Inputs are the two delivery tables written by scripts/stage-c/c1-real-extract.py (Cricsheet
calibration split, kept outside the repository) and scripts/stage-c/c1-game-balls.ts (the game on current main).
Output is one JSON of derived aggregates, with Cricsheet ODC-By 1.0 attribution and the source and licence SHA-256.

Definitions (identical for both sides):
  balls faced     deliveries that are not wides (no-balls count, as in scorecards)
  strike rate     100 x batter runs / balls faced
  dismissal rate  dismissals of that batter (any kind except retired hurt or retired not out) / balls faced
  average         batter runs / dismissals
  dot %, bdy %    balls faced with 0 batter runs; with 4 or 6 batter runs
  legal balls     deliveries that are neither wides nor no-balls
  economy         6 x (batter runs + wides + no-balls) / legal balls
  wicket rate     bowler-credited wickets (bowled, caught, c&b, lbw, stumped, hit wicket) / legal balls
  bowler dot %    legal balls with 0 batter runs; bowler bdy %: legal balls with 4 or 6 batter runs
  frontline       a bowler who averages at least 18 legal balls (3 overs) per innings in which he bowled
  part-time       a bowler who averages fewer than 12 legal balls (2 overs) per innings in which he bowled
Quarters of players with >= 100 balls (faced, or legal balls bowled). Ratios are pooled top quarter / pooled bottom
quarter, where "top" is the better quarter (higher strike rate, average, boundary %; lower dismissal rate, dot %,
economy; higher wicket rate). Three ways to form quarters from outcomes (both sides) and one from ratings (game):
  in-sample   rank and measure on the same balls (inflated by luck: an upper bracket)
  split-half  rank on one half of the matches, measure on the other, both ways, averaged (diluted: a lower bracket)
  true-skill  method of moments: between-player variance minus sampling variance gives the true-skill SD, and with a
              normal shape the quarter means are mean +/- 1.271 SD (model based, between the two brackets)
  by rating   (game only) quarters of the game's own batting score (timing+power+defence+rotation) or bowling
              score (control+movement+variation), as in packages/data/src/eleven.ts
Bootstrap: resample whole matches with replacement (fixed seed), recompute everything, report the 10th and 90th
percentiles (the "middle 80%" of the criterion) and the 2.5th and 97.5th. A repeated match adds no information, so
the true-skill noise term uses effective balls, (sum of weights)^2 / sum of weights^2, while the 100-ball threshold
stays on balls as counted (so a resample keeps the same population). The in-sample and split-half estimators are
not corrected this way (a resample's extra noise widens in-sample spreads and dilutes split-half ones), so their
bootstrap percentiles are shifted from their point estimates and are kept for reference only.

  python3 -I scripts/stage-c/c1-analyse.py --real /home/user/lcx-data/c1-real-calibration-balls.json \
      --game /home/user/lcx-data/c1-game-balls-{0,1,2,3}.json --out docs/pavilion/stage-c/c1-skill-differentiation.json
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

BOWLER_KINDS = {"bowled", "caught", "caught and bowled", "lbw", "stumped", "hit wicket"}
MIN_BALLS = 100
TOPQ = 1.2711  # mean of the top quarter of a standard normal: phi(0.6745) / 0.25
BOOT = 400
SEED = 20261125


class Table:
    """Column store of deliveries with integer player and match indices."""

    def __init__(self, cols, keep=None):
        n = len(cols["match"])
        keep = np.ones(n, bool) if keep is None else keep
        self.match_ids, self.m = np.unique(np.array(cols["match"])[keep], return_inverse=True)
        people = np.array(cols["batter"] + cols["nonStriker"] + cols["bowler"] + cols["out"])
        self.players, inv = np.unique(people, return_inverse=True)
        self.bat, self.ns, self.bowl, self.outp = (inv[i * n:(i + 1) * n][keep] for i in range(4))
        self.no_out = np.searchsorted(self.players, "") if "" in set(self.players.tolist()) else -1
        g = lambda k: np.array(cols[k])[keep]
        self.inn, self.over, self.pos, self.ns_pos = g("inn"), g("over"), g("pos"), g("nsPos")
        self.runs, self.wides, self.nb = g("batRuns"), g("wides"), g("noballs")
        kind = g("outKind")
        self.out_any = self.outp != self.no_out
        self.bwkt = np.isin(kind, list(BOWLER_KINDS))
        self.faced = self.wides == 0
        self.legal = (self.wides == 0) & (self.nb == 0)
        self.conceded = self.runs + self.wides + self.nb
        self.bdy = np.isin(self.runs, [4, 6])
        self.phase = np.where(self.over < 6, 0, np.where(self.over < 15, 1, 2))
        self.striker_out = self.out_any & (self.outp == self.bat)
        # batting position of the dismissed player (the non-striker's for a non-striker run out)
        self.out_pos = np.where(self.out_any & (self.outp == self.ns), self.ns_pos, self.pos)
        self.year = np.array([d[:4] for d in cols["date"]])[keep] if "date" in cols else None
        # Deterministic half by match id (md5 parity), the same rule on both sides.
        half = np.array([int(hashlib.md5(x.encode()).hexdigest(), 16) & 1 for x in self.match_ids])
        self.half = half[self.m]
        self.n_matches = len(self.match_ids)
        self.innings_key = self.m * 4 + self.inn


ATTRIBUTION_NOTE = ("Derived aggregates only (no ball-by-ball records). Contains information from Cricsheet, "
                    "made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/.")


def bc(idx, w, size):
    return np.bincount(idx, weights=w, minlength=size)


def quarter_ratio(stat_rank, num, den, better_high, eligible):
    """Pooled top-quarter / bottom-quarter value of num/den, quarters formed from stat_rank among eligible players."""
    ids = np.flatnonzero(eligible)
    if len(ids) < 8:
        return None
    order = ids[np.argsort(stat_rank[ids], kind="stable")]
    q = len(order) // 4
    low, high = order[:q], order[-q:]
    top, bottom = (high, low) if better_high else (low, high)
    vt, vb = num[top].sum() / den[top].sum(), num[bottom].sum() / den[bottom].sum()
    return float(vt / vb) if vb > 0 else None


def true_skill_ratio(mean_i, noise_var_i, better_high):
    mu = mean_i.mean()
    var = mean_i.var(ddof=1) - noise_var_i.mean()
    sd = float(np.sqrt(var)) if var > 0 else 0.0
    hi, lo = mu + TOPQ * sd, mu - TOPQ * sd
    if lo <= 0:
        return None, sd
    return (float(hi / lo) if better_high else float(lo / hi)), sd


def batting_block(t, w, players_mask=None):
    """Per-player batting statistics and the in-sample and true-skill quarter ratios."""
    size = len(t.players)
    f = w * t.faced
    B = bc(t.bat, f, size)
    R = bc(t.bat, f * t.runs, size)
    R2 = bc(t.bat, f * t.runs ** 2, size)
    dots = bc(t.bat, f * (t.runs == 0), size)
    bdy = bc(t.bat, f * t.bdy, size)
    D = bc(t.outp[t.out_any], w[t.out_any], size)
    # Effective balls (sum of weights)^2 / sum of weights^2: equal to the balls when every match counts once, and
    # smaller in a bootstrap resample, where a repeated match adds no new information.
    neff = B ** 2 / np.maximum(bc(t.bat, w * f, size), 1e-9)
    elig = B >= MIN_BALLS  # the population is defined on balls as counted; only the noise term uses neff
    if players_mask is not None:
        elig &= players_mask
    res = {"eligiblePlayers": int(elig.sum())}
    with np.errstate(divide="ignore", invalid="ignore"):
        sr, dr, avg = 100 * R / B, D / B, R / np.maximum(D, 1e-9)
        dot, bp = dots / B, bdy / B
    stats = {"strikeRate": (sr, 100 * R, B, True), "dismissalRate": (dr, D, B, False),
             "average": (avg, R, np.maximum(D, 1e-9), True), "dotPercent": (100 * dot, 100 * dots, B, False),
             "boundaryPercent": (100 * bp, 100 * bdy, B, True)}
    for name, (val, num, den, hi) in stats.items():
        v = val[elig]
        res[name] = {"q10": float(np.percentile(v, 10)), "q50": float(np.percentile(v, 50)),
                     "q90": float(np.percentile(v, 90)),
                     "inSampleRatio": quarter_ratio(val, num, den, hi, elig)}
    # true-skill ratios (per-ball variances over effective balls)
    Bi, ni = B[elig], neff[elig]
    var_runs = R2[elig] / Bi - (R[elig] / Bi) ** 2
    res["strikeRate"]["trueSkillRatio"], sd = true_skill_ratio(100 * R[elig] / Bi, 1e4 * var_runs / ni, True)
    res["strikeRate"]["trueSkillSD"] = sd
    p = D[elig] / Bi
    res["dismissalRate"]["trueSkillRatio"], sd = true_skill_ratio(p, p * (1 - p) / ni, False)
    res["dismissalRate"]["trueSkillSD"] = sd
    p = dots[elig] / Bi
    res["dotPercent"]["trueSkillRatio"], sd = true_skill_ratio(100 * p, 1e4 * p * (1 - p) / ni, False)
    res["dotPercent"]["trueSkillSD"] = sd
    p = bdy[elig] / Bi
    res["boundaryPercent"]["trueSkillRatio"], sd = true_skill_ratio(100 * p, 1e4 * p * (1 - p) / ni, True)
    res["boundaryPercent"]["trueSkillSD"] = sd
    return res, {"B": B, "R": R, "D": D, "dots": dots, "bdy": bdy, "elig": elig}


def bowling_block(t, w, players_mask=None):
    size = len(t.players)
    l = w * t.legal
    L = bc(t.bowl, l, size)
    N = bc(t.bowl, w, size)  # deliveries
    C = bc(t.bowl, w * t.conceded, size)
    C2 = bc(t.bowl, w * t.conceded ** 2, size)
    W = bc(t.bowl, w * t.bwkt, size)
    dots = bc(t.bowl, l * (t.runs == 0), size)
    bdy = bc(t.bowl, l * t.bdy, size)
    neff = L ** 2 / np.maximum(bc(t.bowl, w * l, size), 1e-9)  # effective legal balls, as for batting
    N2 = bc(t.bowl, w * w, size)
    elig = L >= MIN_BALLS
    if players_mask is not None:
        elig &= players_mask
    res = {"eligiblePlayers": int(elig.sum())}
    with np.errstate(divide="ignore", invalid="ignore"):
        econ, wr, dot, bp = 6 * C / L, W / L, dots / L, bdy / L
    stats = {"economy": (econ, 6 * C, L, False), "wicketRate": (wr, W, L, True),
             "dotPercent": (100 * dot, 100 * dots, L, True), "boundaryPercent": (100 * bp, 100 * bdy, L, False)}
    for name, (val, num, den, hi) in stats.items():
        v = val[elig]
        res[name] = {"q10": float(np.percentile(v, 10)), "q50": float(np.percentile(v, 50)),
                     "q90": float(np.percentile(v, 90)),
                     "inSampleRatio": quarter_ratio(val, num, den, hi, elig)}
    Li, Ni, ni = L[elig], N[elig], neff[elig]
    var_c = C2[elig] / Ni - (C[elig] / Ni) ** 2
    res["economy"]["trueSkillRatio"], sd = true_skill_ratio(6 * C[elig] / Li, 36 * var_c * N2[elig] / Li ** 2, False)
    res["economy"]["trueSkillSD"] = sd
    p = W[elig] / Li
    res["wicketRate"]["trueSkillRatio"], sd = true_skill_ratio(p, p * (1 - p) / ni, True)
    res["wicketRate"]["trueSkillSD"] = sd
    p = dots[elig] / Li
    res["dotPercent"]["trueSkillRatio"], sd = true_skill_ratio(100 * p, 1e4 * p * (1 - p) / ni, True)
    res["dotPercent"]["trueSkillSD"] = sd
    p = bdy[elig] / Li
    res["boundaryPercent"]["trueSkillRatio"], sd = true_skill_ratio(100 * p, 1e4 * p * (1 - p) / ni, False)
    res["boundaryPercent"]["trueSkillSD"] = sd
    return res, {"L": L, "C": C, "W": W, "dots": dots, "bdy": bdy, "elig": elig}


def split_half(t, w):
    """Rank on one half of the matches, measure on the other; average of both directions."""
    out = {}
    halves = []
    for h in (0, 1):
        wh = w * (t.half == h)
        _, ab = batting_block(t, wh)
        _, ao = bowling_block(t, wh)
        halves.append((ab, ao))
    _, allb = batting_block(t, w)
    _, allo = bowling_block(t, w)
    bat_specs = {"strikeRate": (lambda a: 100 * a["R"] / np.maximum(a["B"], 1e-9), lambda a: (100 * a["R"], a["B"]), True),
                 "dismissalRate": (lambda a: a["D"] / np.maximum(a["B"], 1e-9), lambda a: (a["D"], a["B"]), False),
                 "average": (lambda a: a["R"] / np.maximum(a["D"], 1e-9), lambda a: (a["R"], np.maximum(a["D"], 1e-9)), True),
                 "dotPercent": (lambda a: a["dots"] / np.maximum(a["B"], 1e-9), lambda a: (a["dots"], a["B"]), False),
                 "boundaryPercent": (lambda a: a["bdy"] / np.maximum(a["B"], 1e-9), lambda a: (a["bdy"], a["B"]), True)}
    bowl_specs = {"economy": (lambda a: a["C"] / np.maximum(a["L"], 1e-9), lambda a: (6 * a["C"], a["L"]), False),
                  "wicketRate": (lambda a: a["W"] / np.maximum(a["L"], 1e-9), lambda a: (a["W"], a["L"]), True),
                  "dotPercent": (lambda a: a["dots"] / np.maximum(a["L"], 1e-9), lambda a: (a["dots"], a["L"]), True),
                  "boundaryPercent": (lambda a: a["bdy"] / np.maximum(a["L"], 1e-9), lambda a: (a["bdy"], a["L"]), False)}
    for kind, specs, idx, elig, dkey in (("batting", bat_specs, 0, allb["elig"], "B"), ("bowling", bowl_specs, 1, allo["elig"], "L")):
        out[kind] = {}
        for name, (rank_f, nd_f, hi) in specs.items():
            vals = []
            for a, b in ((0, 1), (1, 0)):
                ra, mb = halves[a][idx], halves[b][idx]
                e = elig & (ra[dkey] >= 30) & (mb[dkey] >= 30)
                num, den = nd_f(mb)
                r = quarter_ratio(rank_f(ra), num, den, hi, e)
                if r is not None:
                    vals.append(r)
            out[kind][name] = float(np.mean(vals)) if vals else None
    return out


def specialisation(t, w):
    f = w * t.faced
    top, tail = t.pos <= 7, t.pos >= 8
    d_top = (w * t.out_any * (t.out_pos <= 7)).sum()
    d_tail = (w * t.out_any * (t.out_pos >= 8)).sum()
    r_top, r_tail = (f * t.runs * top).sum(), (f * t.runs * tail).sum()
    b_top, b_tail = (f * top).sum(), (f * tail).sum()
    res = {"pos1to7": {"average": r_top / d_top, "strikeRate": 100 * r_top / b_top, "ballsShare": b_top / (b_top + b_tail)},
           "pos8to11": {"average": r_tail / d_tail, "strikeRate": 100 * r_tail / b_tail}}
    res["averageRatio"] = res["pos1to7"]["average"] / res["pos8to11"]["average"]
    res["strikeRateRatio"] = res["pos1to7"]["strikeRate"] / res["pos8to11"]["strikeRate"]
    # frontline / part-time by legal balls per innings bowled, over the whole sample
    size = len(t.players)
    l = w * t.legal
    L = bc(t.bowl, l, size)
    C = bc(t.bowl, w * t.conceded, size)
    W = bc(t.bowl, w * t.bwkt, size)
    pair = t.bowl.astype(np.int64) * (int(t.innings_key.max()) + 1) + t.innings_key
    up, inv = np.unique(pair, return_inverse=True)
    wpair = bc(inv, w, len(up)) > 0
    bowler_of = up // (int(t.innings_key.max()) + 1)
    weight_pair = np.zeros(len(up))
    np.maximum.at(weight_pair, inv, w)
    spells = bc(bowler_of, weight_pair * wpair, size)
    with np.errstate(divide="ignore", invalid="ignore"):
        per = L / spells
    front, part = per >= 18, (per < 12) & (L > 0)
    res["frontline"] = {"definition": ">= 18 legal balls per innings bowled", "bowlers": int(front.sum()),
                        "economy": 6 * C[front].sum() / L[front].sum(), "legalBalls": float(L[front].sum()),
                        "ballsPerWicket": L[front].sum() / max(W[front].sum(), 1e-9)}
    res["partTime"] = {"definition": "< 12 legal balls per innings bowled", "bowlers": int(part.sum()),
                       "economy": 6 * C[part].sum() / L[part].sum(), "legalBalls": float(L[part].sum()),
                       "ballsPerWicket": L[part].sum() / max(W[part].sum(), 1e-9)}
    res["economyRatioPartTimeOverFrontline"] = res["partTime"]["economy"] / res["frontline"]["economy"]
    return res


def season_block(t, w, season):
    """Player-season units with >= 100 balls: in-sample and true-skill ratios (per season, pooled over seasons)."""
    us, ui = np.unique(season, return_inverse=True)
    out = {}
    for role, key in (("batting", t.bat), ("bowling", t.bowl)):
        unit = key.astype(np.int64) * len(us) + ui
        uu, uinv = np.unique(unit, return_inverse=True)
        size = len(uu)
        if role == "batting":
            f = w * t.faced
            B = bc(uinv, f, size); R = bc(uinv, f * t.runs, size); R2 = bc(uinv, f * t.runs ** 2, size)
            # batter dismissals attributed to the dismissed player's unit
            oi = np.searchsorted(uu, t.outp.astype(np.int64) * len(us) + ui)
            ok = t.out_any & (oi < size)
            ok[ok] &= uu[oi[ok]] == (t.outp[ok].astype(np.int64) * len(us) + ui[ok])
            D = bc(oi[ok], w[ok], size)
            e = B >= MIN_BALLS
            sr = 100 * R / np.maximum(B, 1e-9)
            r_in = quarter_ratio(sr, 100 * R, B, True, e)
            var = R2[e] / B[e] - (R[e] / B[e]) ** 2
            r_true, sd = true_skill_ratio(sr[e], 1e4 * var / B[e], True)
            p = D[e] / B[e]
            d_in = quarter_ratio(D / np.maximum(B, 1e-9), D, B, False, e)
            d_true, dsd = true_skill_ratio(p, p * (1 - p) / B[e], False)
            out[role] = {"units": int(e.sum()), "strikeRate": {"inSampleRatio": r_in, "trueSkillRatio": r_true, "trueSkillSD": sd},
                         "dismissalRate": {"inSampleRatio": d_in, "trueSkillRatio": d_true, "trueSkillSD": dsd}}
        else:
            l = w * t.legal
            L = bc(uinv, l, size); N = bc(uinv, w, size); C = bc(uinv, w * t.conceded, size)
            C2 = bc(uinv, w * t.conceded ** 2, size); W = bc(uinv, w * t.bwkt, size)
            e = L >= MIN_BALLS
            ec = 6 * C / np.maximum(L, 1e-9)
            r_in = quarter_ratio(ec, 6 * C, L, False, e)
            var = C2[e] / N[e] - (C[e] / N[e]) ** 2
            r_true, sd = true_skill_ratio(ec[e], 36 * var * N[e] / L[e] ** 2, False)
            p = W[e] / L[e]
            w_in = quarter_ratio(W / np.maximum(L, 1e-9), W, L, True, e)
            w_true, wsd = true_skill_ratio(p, p * (1 - p) / L[e], True)
            out[role] = {"units": int(e.sum()), "economy": {"inSampleRatio": r_in, "trueSkillRatio": r_true, "trueSkillSD": sd},
                         "wicketRate": {"inSampleRatio": w_in, "trueSkillRatio": w_true, "trueSkillSD": wsd}}
    return out


def by_rating(t, w, ratings):
    """Game only: quarters by the game's batting score and bowling score among players with >= 100 balls."""
    bat_score = np.array([ratings.get(p, {}).get("battingScore", np.nan) for p in t.players], float)
    bowl_score = np.array([ratings.get(p, {}).get("bowlingScore", np.nan) for p in t.players], float)
    _, ab = batting_block(t, w)
    _, ao = bowling_block(t, w)
    eb, eo = ab["elig"], ao["elig"]
    out = {"batting": {}, "bowling": {}}
    for name, num, den, rank, hi in (("strikeRate", 100 * ab["R"], ab["B"], bat_score, True),
                                     ("dismissalRate", ab["D"], ab["B"], bat_score, True),
                                     ("average", ab["R"], np.maximum(ab["D"], 1e-9), bat_score, True),
                                     ("dotPercent", 100 * ab["dots"], ab["B"], bat_score, True),
                                     ("boundaryPercent", 100 * ab["bdy"], ab["B"], bat_score, True)):
        out["batting"][name] = quarter_ratio(rank, num, den, hi, eb)
    for name, num, den in (("economy", 6 * ao["C"], ao["L"]), ("wicketRate", ao["W"], ao["L"]),
                           ("dotPercent", 100 * ao["dots"], ao["L"]), ("boundaryPercent", 100 * ao["bdy"], ao["L"])):
        out["bowling"][name] = quarter_ratio(bowl_score, num, den, True, eo)
    # quarter mean ratings, for the slope comparison
    ids = np.flatnonzero(eb)
    o = ids[np.argsort(bat_score[ids], kind="stable")]
    q = len(o) // 4
    out["battingScoreQuarterMeans"] = [float(bat_score[o[:q]].mean()), float(bat_score[o[-q:]].mean())]
    ids = np.flatnonzero(eo)
    o = ids[np.argsort(bowl_score[ids], kind="stable")]
    q = len(o) // 4
    out["bowlingScoreQuarterMeans"] = [float(bowl_score[o[:q]].mean()), float(bowl_score[o[-q:]].mean())]
    return out


def flatten(d, prefix=""):
    out = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        elif isinstance(v, (int, float, np.floating)) and v is not None and not isinstance(v, bool):
            out[key] = float(v)
    return out


def summary(t, w, ratings=None):
    bat, _ = batting_block(t, w)
    bowl, _ = bowling_block(t, w)
    s = {"batting": bat, "bowling": bowl, "splitHalf": split_half(t, w), "specialisation": specialisation(t, w)}
    if ratings is not None:
        s["byRating"] = by_rating(t, w, ratings)
    return s


def bootstrap(t, point, ratings=None, reps=BOOT):
    rng = np.random.default_rng(SEED)
    flat = flatten(point)
    draws = {k: [] for k in flat}
    for _ in range(reps):
        counts = rng.multinomial(t.n_matches, np.full(t.n_matches, 1 / t.n_matches)).astype(float)
        w = counts[t.m]
        f = flatten(summary(t, w, ratings))
        for k in draws:
            if k in f and np.isfinite(f[k]):
                draws[k].append(f[k])
    ci = {}
    for k, v in draws.items():
        if len(v) >= reps // 2:
            a = np.array(v)
            ci[k] = [float(np.percentile(a, 10)), float(np.percentile(a, 90)), float(np.percentile(a, 2.5)), float(np.percentile(a, 97.5))]
    return ci


def slopes(t, w, ratings):
    """Per-ball linear probability fits on faced balls: batter runs and striker dismissal on mean batting rating
    (batting score / 4) and the bowler's mean bowling rating (bowling score / 3), with phase indicators."""
    bat_score = np.array([ratings.get(p, {}).get("battingScore", np.nan) for p in t.players], float) / 4
    bowl_score = np.array([ratings.get(p, {}).get("bowlingScore", np.nan) for p in t.players], float) / 3
    f = t.faced & (w > 0)
    X = np.column_stack([np.ones(f.sum()), bat_score[t.bat[f]], bowl_score[t.bowl[f]],
                         t.phase[f] == 1, t.phase[f] == 2]).astype(float)
    out = {}
    for name, y in (("runsPerBall", t.runs[f].astype(float)), ("dismissalPerBall", t.striker_out[f].astype(float)),
                    ("boundaryPerBall", t.bdy[f].astype(float)), ("dotPerBall", (t.runs[f] == 0).astype(float))):
        beta, *_ = np.linalg.lstsq(X * np.sqrt(w[f])[:, None], y * np.sqrt(w[f]), rcond=None)
        out[name] = {"perBattingRatingPoint": float(beta[1]), "perBowlingRatingPoint": float(beta[2])}
    eb = np.isfinite(bat_score)
    out["ratingSD"] = {"battingMeanRatingAmongFacedBalls": float(np.nanstd(bat_score[t.bat[f]])),
                       "bowlingMeanRatingAmongFacedBalls": float(np.nanstd(bowl_score[t.bowl[f]]))}
    return out


TARGETS = ("dismissal", "boundary", "nonDot", "runs")
# Direction of "better" for the adjusted top / bottom ratios: (batter better when high, bowler better when high).
BETTER_HIGH = {"dismissal": (False, True), "boundary": (True, False), "nonDot": (True, False), "runs": (True, False)}


def target_values(t, name):
    return {"dismissal": t.striker_out, "boundary": t.bdy, "nonDot": t.runs > 0, "runs": t.runs.astype(float)}[name]


def fit_effects(t, w, yall, iterations=25):
    """Multiplicative batter and bowler effects on a per-ball rate over a phase baseline, on faced balls, fitted by
    alternating ratio updates without shrinkage. Returns the baseline, the effects and their expected events."""
    f = t.faced & (w > 0)
    y, ww, ph, bi, oi = yall[f].astype(float), w[f], t.phase[f], t.bat[f], t.bowl[f]
    size = len(t.players)
    base = np.array([np.sum(ww * y * (ph == k)) / np.sum(ww * (ph == k)) for k in range(3)])
    e0 = base[ph]
    mean = np.sum(ww * y) / np.sum(ww)
    disp = (np.sum(ww * (y - mean) ** 2) / np.sum(ww)) / mean  # variance / mean per ball (1 - p for a binary)
    a = np.ones(size); b = np.ones(size)
    na = bc(bi, ww, size)
    for _ in range(iterations):
        a = bc(bi, ww * y, size) / np.maximum(bc(bi, ww * e0 * b[oi], size), 1e-12)
        b = bc(oi, ww * y, size) / np.maximum(bc(oi, ww * e0 * a[bi], size), 1e-12)
        a /= np.sum(na * a) / np.sum(na)
    return {"base": base, "disp": disp, "a": a, "b": b,
            "Eb": bc(bi, ww * e0 * b[oi], size), "Eo": bc(oi, ww * e0 * a[bi], size),
            "nb": na, "no": bc(oi, ww, size),
            # repeated-match factor: sum of w^2 / sum of w per player (1 when every match counts once)
            "rb": bc(bi, ww * ww, size) / np.maximum(na, 1e-9), "ro": bc(oi, ww * ww, size) / np.maximum(bc(oi, ww, size), 1e-9)}


def crossed_effects(t, w, ratings=None):
    """Research prototype: phase- and opponent-adjusted player effects (fit_effects), then the true between-player
    SD of each effect by moments: the variance of the observed effects minus the sampling variance (dispersion x
    effect / expected events). For small effects the relative SD equals the SD on the log (and, for rare events, the
    logit) scale. The adjusted true-skill ratio is (1 + 1.271 SD) / (1 - 1.271 SD), oriented so that the better
    quarter is on top. With ratings (game), also the ball-weighted mean effect of the top-rated quarter over the
    bottom-rated quarter (top / bottom by rating, not by "better")."""
    out = {}
    bat_score = bowl_score = None
    if ratings is not None:
        bat_score = np.array([ratings.get(p, {}).get("battingScore", np.nan) for p in t.players], float)
        bowl_score = np.array([ratings.get(p, {}).get("bowlingScore", np.nan) for p in t.players], float)
    for name in TARGETS:
        fe = fit_effects(t, w, target_values(t, name))
        res = {"phaseBaseline": fe["base"].tolist(), "dispersion": float(fe["disp"])}
        for who, eff, n, E, r, hi, score in (("batter", fe["a"], fe["nb"], fe["Eb"], fe["rb"], BETTER_HIGH[name][0], bat_score),
                                             ("bowler", fe["b"], fe["no"], fe["Eo"], fe["ro"], BETTER_HIGH[name][1], bowl_score)):
            e = n >= MIN_BALLS
            var = eff[e].var(ddof=1) - np.mean(fe["disp"] * r[e] * eff[e] / np.maximum(E[e], 1e-9))
            sd = float(np.sqrt(var)) if var > 0 else 0.0
            top, bottom = 1 + TOPQ * sd, 1 - TOPQ * sd
            ratio = (top / bottom if hi else bottom / top) if bottom > 0 else None
            res[who] = {"players": int(e.sum()), "observedRelativeSD": float(eff[e].std(ddof=1)),
                        "trueRelativeSD": sd, "adjustedTrueSkillRatio": ratio}
            if score is not None:
                ids = np.flatnonzero(e & np.isfinite(score))
                o = ids[np.argsort(score[ids], kind="stable")]
                q = len(o) // 4
                lo, hi_ = o[:q], o[-q:]
                res[who]["adjustedByRatingRatio"] = float((eff[hi_] * n[hi_]).sum() / n[hi_].sum() / ((eff[lo] * n[lo]).sum() / n[lo].sum()))
        out[name] = res
    return out


def crossed_bootstrap(t, ratings=None, reps=100):
    rng = np.random.default_rng(SEED + 1)
    draws = {}
    for _ in range(reps):
        counts = rng.multinomial(t.n_matches, np.full(t.n_matches, 1 / t.n_matches)).astype(float)
        for k, v in flatten(crossed_effects(t, counts[t.m], ratings)).items():
            if np.isfinite(v):
                draws.setdefault(k, []).append(v)
    return {k: [float(np.percentile(v, 10)), float(np.percentile(v, 90)), float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]
            for k, v in draws.items() if len(v) >= reps // 2 and ("Ratio" in k or "trueRelativeSD" in k)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--real", type=Path, required=True)
    ap.add_argument("--game", type=Path, required=True, nargs="+", help="one or more c1-game-balls.ts outputs")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--boot", type=int, default=BOOT)
    a = ap.parse_args()
    real = json.loads(a.real.read_text())
    parts = [json.loads(p.read_text()) for p in a.game]
    game = {"players": {p["playerId"]: p for part in parts for p in part["players"]}, "setUp": parts[0]["setUp"],
            "repeats": sum(p["repeats"] for p in parts), "columns": {k: [x for p in parts for x in p["columns"][k]] for k in parts[0]["columns"]}}
    game["players"] = list(game["players"].values())
    ratings = {p["playerId"]: p for p in game["players"]}
    rc, gc = real["columns"], game["columns"]
    cohorts = {
        "all": None,
        "fullMembersOnly": np.array(rc["fullMemberMatch"]),
        "from2021": np.array([d >= "2021-01-01" for d in rc["date"]]),
    }
    result = {"version": "LC_STAGE_C_C1_SKILL_DIFFERENTIATION_V1", "attribution": {**real["attribution"], "note": ATTRIBUTION_NOTE},
              "researchOnly": True, "gameplayIntegrationPermitted": False,
              "minBalls": MIN_BALLS, "bootstrapReplicates": a.boot, "bootstrapSeed": SEED,
              "real": {}, "game": {}}
    for name, keep in cohorts.items():
        t = Table(rc, keep)
        w = np.ones(len(t.m))
        point = summary(t, w)
        point["matches"] = t.n_matches
        point["deliveries"] = int(len(t.m))
        point["perSeason"] = season_block(t, w, t.year)
        point["crossedEffects"] = crossed_effects(t, w)
        if name == "all":
            point["crossedEffectsBootstrap"] = crossed_bootstrap(t, reps=max(50, a.boot // 4))
        point["bootstrap"] = bootstrap(t, {k: v for k, v in point.items() if k in ("batting", "bowling", "splitHalf", "specialisation")}, reps=a.boot if name == "all" else max(100, a.boot // 4))
        result["real"][name] = point
        print(f"real {name}: {t.n_matches} matches, {len(t.m)} deliveries", flush=True)
    t = Table(gc)
    w = np.ones(len(t.m))
    point = summary(t, w, ratings)
    point["matches"] = t.n_matches
    point["deliveries"] = int(len(t.m))
    rep = np.array([int(x.rsplit("-r", 1)[1]) for x in gc["match"]])
    point["perSeason"] = season_block(t, w, rep.astype(str))
    point["perSeasonNote"] = "game season = one repeat of the 100-seed corpus (each team plays 25 matches)"
    point["crossedEffects"] = crossed_effects(t, w, ratings)
    point["crossedEffectsBootstrap"] = crossed_bootstrap(t, ratings, reps=max(50, a.boot // 4))
    point["slopes"] = slopes(t, w, ratings)
    point["bootstrap"] = bootstrap(t, {k: v for k, v in point.items() if k in ("batting", "bowling", "splitHalf", "specialisation", "byRating")}, ratings, reps=max(100, a.boot // 2))
    result["game"] = point
    result["game"]["setUp"] = game["setUp"]
    result["game"]["repeats"] = game["repeats"]
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(result, indent=1, default=lambda o: float(o)) + "\n")
    print("wrote", a.out)


if __name__ == "__main__":
    main()
