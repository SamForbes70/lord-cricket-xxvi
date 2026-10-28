"""Summarises fixed-seed T20 diagnostics while separating censored chase outcomes."""
import argparse
import hashlib
import json
import math
from pathlib import Path

PHASES = ("POWERPLAY", "MIDDLE", "DEATH")
COUNTERS = ("runs", "wickets", "legalBalls", "attempts", "dots", "boundaries")


def percentile(values, probability):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(probability * len(ordered)) - 1)] if ordered else None


def validate_innings(innings):
    for key in (*COUNTERS, "illegals"):
        value = innings[key]
        if type(value) is not int or value < 0:
            raise ValueError(f"Invalid innings counter: {key}")
    if innings["wickets"] > 10 or innings["legalBalls"] > 120:
        raise ValueError("Innings exceeds T20 limits")
    if innings["attempts"] != innings["legalBalls"] + innings["illegals"]:
        raise ValueError("Attempt accounting mismatch")
    if innings["dots"] + innings["boundaries"] > innings["attempts"]:
        raise ValueError("Overlapping dot/boundary totals")
    for phase in PHASES:
        for key in COUNTERS:
            value = innings["phases"][phase][key]
            if type(value) is not int or value < 0:
                raise ValueError("Invalid phase counter")
    for key in COUNTERS:
        if sum(innings["phases"][phase][key] for phase in PHASES) != innings[key]:
            raise ValueError(f"Phase reconciliation mismatch: {key}")


def termination(innings, target=None):
    if target is not None and innings["runs"] >= target:
        return "CHASE_WON"
    if innings["wickets"] == 10:
        return "ALL_OUT"
    if innings["legalBalls"] == 120:
        return "ALLOCATION_END"
    raise ValueError("Nonterminal innings in completed-match diagnostic")


def cohort(innings):
    if not innings:
        return {"count": 0}
    totals = {key: sum(item[key] for item in innings) for key in (*COUNTERS, "illegals")}
    attempts = totals["attempts"]
    phases = {}
    for phase in PHASES:
        counters = {key: sum(item["phases"][phase][key] for item in innings) for key in COUNTERS}
        phases[phase] = {**counters,
                         "runsPerLegalOver": 6 * counters["runs"] / counters["legalBalls"] if counters["legalBalls"] else None,
                         "dotAttemptFraction": counters["dots"] / counters["attempts"] if counters["attempts"] else None,
                         "boundaryAttemptFraction": counters["boundaries"] / counters["attempts"] if counters["attempts"] else None}
    return {"count": len(innings), "meanRuns": totals["runs"] / len(innings),
            "meanWickets": totals["wickets"] / len(innings),
            "scorePercentiles": {f"p{int(p * 100)}": percentile([item["runs"] for item in innings], p) for p in (.1, .5, .9)},
            "totals": totals, "dotAttemptFraction": totals["dots"] / attempts if attempts else None,
            "boundaryAttemptFraction": totals["boundaries"] / attempts if attempts else None,
            "illegalAttemptFraction": totals["illegals"] / attempts if attempts else None,
            "runsPerLegalOver": 6 * totals["runs"] / totals["legalBalls"] if totals["legalBalls"] else None,
            "phases": phases}


def summarise(source, protocol):
    rows = source["rows"]
    if not rows or len(rows) != source["matches"] or len(rows) != protocol["matches"]:
        raise ValueError("Sample count mismatch")
    expected = [f"{protocol['seedPrefix']}{protocol['seedOffset'] + i:06d}" for i in range(len(rows))]
    if [row["seed"] for row in rows] != expected:
        raise ValueError("Seed cohort differs from the frozen protocol")
    first, second = [], []
    groups = {name: [] for name in ("CHASE_WON", "ALL_OUT", "ALLOCATION_END")}
    first_groups = {name: [] for name in ("ALL_OUT", "ALLOCATION_END")}
    band_rows = {band["name"]: [] for band in protocol["targetBands"]}
    for row in rows:
        a, b = row["first"], row["second"]
        validate_innings(a)
        validate_innings(b)
        first_groups[termination(a)].append(a)
        outcome = termination(b, a["runs"] + 1)
        groups[outcome].append(b)
        first.append(a)
        second.append(b)
        bands = [band for band in protocol["targetBands"] if a["runs"] + 1 >= band["min"] and (band["max"] is None or a["runs"] + 1 <= band["max"])]
        if len(bands) != 1:
            raise ValueError("Target bands do not partition the cohort")
        band_rows[bands[0]["name"]].append(row)
    targets = {}
    for name, members in band_rows.items():
        targets[name] = {"matches": len(members), "successfulChases": sum(termination(row["second"], row["first"]["runs"] + 1) == "CHASE_WON" for row in members),
                         "ties": sum(row["first"]["runs"] == row["second"]["runs"] for row in members),
                         "first": cohort([row["first"] for row in members]),
                         "secondDescriptiveCensored": cohort([row["second"] for row in members])}
    return {"version": "LC_BOUNDED_SYNTHETIC_QUALITY_SUMMARY_V1", "modelStatus": "SYNTHETIC_ALPHA",
            "empiricalValidation": False, "coefficientChanges": False,
            "matches": len(rows), "modelId": source["modelId"], "modelHash": source["modelHash"],
            "worldSha256": source["worldSha256"], "firstInnings": cohort(first),
            "firstByTermination": {name: cohort(items) for name, items in first_groups.items()},
            "secondInningsDescriptiveCensored": cohort(second),
            "secondByTermination": {name: cohort(items) for name, items in groups.items()},
            "ties": sum(row["first"]["runs"] == row["second"]["runs"] for row in rows),
            "targetBands": targets,
            "limits": ["One pairing, ground and baseline policy; not a population-matched real-cricket cohort.",
                       "Successful chase totals are censored and reported separately.",
                       "Target bands are fixed descriptive bands, not calibrated thresholds.",
                       "Runtime measurements exclude human decisions and do not certify reference-browser budgets."]}


def deterministic_projection(source):
    return {**{key: value for key, value in source.items() if key not in ("runtime", "rows")},
            "rows": [{key: value for key, value in row.items() if key != "elapsedMs"} for row in source["rows"]]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--repeat", required=True)
    parser.add_argument("--protocol", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    source = json.loads(Path(args.input).read_text())
    repeat = json.loads(Path(args.repeat).read_text())
    protocol = json.loads(Path(args.protocol).read_text())
    result = summarise(source, protocol)
    summarise(repeat, protocol)
    projection = deterministic_projection(source)
    if projection != deterministic_projection(repeat):
        raise ValueError("Repeated diagnostic diverges")
    result["repeatability"] = {"matchesCompared": len(source["rows"]), "allNonRuntimeFieldsEqual": True,
                               "canonicalSha256": hashlib.sha256(json.dumps(projection, sort_keys=True, separators=(",", ":")).encode()).hexdigest()}
    result["inputs"] = {name: hashlib.sha256(Path(path).read_bytes()).hexdigest() for name, path in (("input", args.input), ("repeat", args.repeat), ("protocol", args.protocol))}
    Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
    print(f"PASS: {result['matches']} matched repeated simulations; separate first/chase cohorts reconciled.")


if __name__ == "__main__":
    main()
