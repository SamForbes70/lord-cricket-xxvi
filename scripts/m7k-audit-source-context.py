#!/usr/bin/env python3
"""Verifies registered event identities and extracts source observations for independent review."""
import argparse
import hashlib
import json
import zipfile
from collections import Counter
from pathlib import Path


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def identity(row):
    return tuple(row[key] for key in ("matchId", "innings", "over", "attempt", "sourceEventSha256"))


def addressed(match_id, innings, over, attempt, delivery):
    return {"matchId": match_id, "inning": innings - 1, "over": over, "attempt": attempt, "delivery": delivery}


def audit(archive, register, selection):
    rows = register["exceptions"]
    identities = [identity(row) for row in rows]
    if len(set(identities)) != len(identities):
        raise ValueError("Duplicate register identity")
    members = [identity(member) for case in selection["cases"] for member in case["memberIdentities"]]
    if len(set(members)) != len(members) or set(members) != set(identities):
        raise ValueError("Selection coverage differs from register")
    signatures = {}
    for case in selection["cases"]:
        if case["independentlyAdjudicated"] is not False or case["chronologyConfirmed"] is not False:
            raise ValueError("Source audit requires unapproved observations")
        if identity(case["representative"]) not in [identity(member) for member in case["memberIdentities"]]:
            raise ValueError("Representative is absent from its signature")
        for member in case["memberIdentities"]:
            signatures[identity(member)] = case["signatureSha256"]
    if selection["gameplayIntegrationPermitted"] is not False:
        raise ValueError("Source audit cannot authorise gameplay")
    records = []
    with zipfile.ZipFile(archive) as source:
        names = source.namelist()
        cache = {}
        for row in sorted(rows, key=identity):
            name = row["matchId"] + ".json"
            if names.count(name) != 1:
                raise ValueError(f"Missing or duplicate source match: {name}")
            if name not in cache:
                raw = source.read(name)
                cache[name] = (json.loads(raw), hashlib.sha256(raw).hexdigest())
            match, file_hash = cache[name]
            innings = match["innings"][row["innings"] - 1]
            sequence = [addressed(row["matchId"], row["innings"], over["over"], attempt, delivery)
                        for over in innings["overs"] for attempt, delivery in enumerate(over["deliveries"])]
            indices = [index for index, event in enumerate(sequence)
                       if (event["over"], event["attempt"]) == (row["over"], row["attempt"])]
            if len(indices) != 1:
                raise ValueError(f"Missing or duplicate source position: {identity(row)}")
            index = indices[0]
            event = sequence[index]
            if digest(event) != row["sourceEventSha256"]:
                raise ValueError(f"Source event hash mismatch: {identity(row)}")
            prior = [item["delivery"] for item in sequence[:index]]
            delivery = event["delivery"]
            neighbors = []
            for position in range(max(0, index - 1), min(len(sequence), index + 2)):
                item = sequence[position]
                neighbors.append({"relativePosition": position - index, "over": item["over"], "attempt": item["attempt"],
                                  "actualDeliveryLabel": item["delivery"].get("actual_delivery"), "sourceEventSha256": digest(item),
                                  "observedRuns": item["delivery"]["runs"], "observedExtras": item["delivery"].get("extras", {}),
                                  "observedWicketKinds": [wicket["kind"] for wicket in item["delivery"].get("wickets", [])]})
            info = match["info"]
            records.append({
                **{key: row[key] for key in ("matchId", "innings", "over", "attempt", "sourceEventSha256", "cohort", "reason")},
                "signatureSha256": signatures[identity(row)], "matchFileSha256": file_hash,
                "matchDates": info["dates"], "teams": info["teams"], "venue": info.get("venue"), "event": info.get("event"),
                "battingTeam": innings["team"], "observedInningsPenaltyRuns": innings.get("penalty_runs"),
                "actualDeliveryLabel": delivery.get("actual_delivery"),
                "batter": delivery["batter"], "nonStriker": delivery["non_striker"], "bowler": delivery["bowler"],
                "observedPriorDeliveryCount": len(prior),
                "observedPriorRunSum": sum(item["runs"]["total"] for item in prior),
                "observedPriorWicketKinds": dict(sorted(Counter(wicket["kind"] for item in prior for wicket in item.get("wickets", [])).items())),
                "observedCurrentRuns": delivery["runs"], "observedCurrentExtras": delivery.get("extras", {}),
                "observedCurrentWickets": delivery.get("wickets", []), "sourceNeighbors": neighbors,
                "sourceEventHashVerified": True, "independentlyAdjudicated": False, "chronologyConfirmed": False,
            })
    return {"version": "LC_M7K_SOURCE_CONTEXT_V1", "sourceCaseCount": len(records),
            "matchCount": len({row["matchId"] for row in records}), "signatureCount": len(set(signatures.values())),
            "acceptedFixtureCount": 0, "gameplayIntegrationPermitted": False,
            "contextMeaning": "Source array order and recorded values only; not umpire chronology, accepted totals or physical ends.",
            "events": records}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--register", default="docs/verification-m7j/LC_M7I_INPUT_REGISTER.json")
    parser.add_argument("--selection", default="docs/verification-m7k/LC_M7K_REPRESENTATIVE_REVIEW.json")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    register_bytes = Path(args.register).read_bytes()
    selection_bytes = Path(args.selection).read_bytes()
    selection = json.loads(selection_bytes)
    if selection["sourceSha256"] != hashlib.sha256(register_bytes).hexdigest():
        raise ValueError("Selection register hash mismatch")
    result = audit(args.archive, json.loads(register_bytes), selection)
    result.update(archiveSha256=hashlib.sha256(Path(args.archive).read_bytes()).hexdigest(),
                  registerSha256=hashlib.sha256(register_bytes).hexdigest(), selectionSha256=hashlib.sha256(selection_bytes).hexdigest())
    Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
    print(f"PASS: {result['sourceCaseCount']} events, {result['matchCount']} matches, {result['signatureCount']} signatures; zero adjudications.")


if __name__ == "__main__":
    main()
