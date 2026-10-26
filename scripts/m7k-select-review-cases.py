#!/usr/bin/env python3
"""Selects source-addressed review cases without approving their scoring interpretation."""
import argparse
import hashlib
import json
from pathlib import Path

IDENTITY = ("matchId", "innings", "over", "attempt", "sourceEventSha256")


def identity(row):
    return tuple(row[key] for key in IDENTITY)


def select_cases(source, adjudication):
    source_rows = source["exceptions"]
    routes = {identity(row): row for row in adjudication["exceptions"]}
    if len(routes) != len(adjudication["exceptions"]):
        raise ValueError("Duplicate adjudication identity")
    if len({identity(row) for row in source_rows}) != len(source_rows):
        raise ValueError("Duplicate source identity")
    if set(routes) != {identity(row) for row in source_rows}:
        raise ValueError("Source and adjudication identities differ")
    groups = {}
    for row in source_rows:
        route = routes[identity(row)]
        if row["reason"] != route["reason"] or row["cohort"] != route["cohort"]:
            raise ValueError("Source and adjudication metadata differ")
        if route["autoApproved"] is not False:
            raise ValueError("Review selection requires unapproved source cases")
        signature = json.dumps({
            "reason": row["reason"], "disposition": route["disposition"],
            "innings": row["innings"], "preFreeHit": row["preFreeHit"],
            "observedComponents": row["observedComponents"],
        }, sort_keys=True, separators=(",", ":"))
        groups.setdefault(signature, []).append(row)
    selected = []
    for signature, members in sorted(groups.items()):
        members.sort(key=lambda row: (row["cohort"] != "training", identity(row)))
        representative = members[0]
        route = routes[identity(representative)]
        kinds = {wicket["kind"] for wicket in representative["observedComponents"]["wickets"]}
        mismatch = bool(kinds - {"retired out", "retired not out"}) and representative["reason"] == "UNSUPPORTED_WICKET_TYPE"
        selected.append({
            "signatureSha256": hashlib.sha256(signature.encode()).hexdigest(),
            "signature": json.loads(signature),
            "representative": {key: representative[key] for key in (*IDENTITY, "cohort")},
            "memberIdentities": [dict(zip(IDENTITY, identity(row))) for row in members],
            "memberCount": len(members),
            "reviewStatus": "AWAITING_EXTERNAL_EVIDENCE",
            "routingWarning": "NON_RETIREMENT_WICKET_REQUIRES_SEPARATE_LAWS_REVIEW" if mismatch else None,
            "inheritedEvidenceRequest": route["requiredEvidence"],
            "independentlyAdjudicated": False,
            "chronologyConfirmed": False,
        })
    return {
        "version": "LC_M7K_REPRESENTATIVE_REVIEW_V1",
        "gameplayIntegrationPermitted": False,
        "sourceCaseCount": len(source_rows), "representativeCount": len(selected),
        "coverageMeaning": "Observed signatures only; not verified chronology or complete laws coverage.",
        "cases": selected,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="docs/verification-m7j/LC_M7I_INPUT_REGISTER.json")
    parser.add_argument("--adjudication", default="docs/verification-m7j/LC_M7J_ADJUDICATION_REGISTER.json")
    parser.add_argument("--out", default="docs/verification-m7k/LC_M7K_REPRESENTATIVE_REVIEW.json")
    args = parser.parse_args()
    source_bytes = Path(args.source).read_bytes()
    route_bytes = Path(args.adjudication).read_bytes()
    if json.loads(route_bytes)["inputSha256"] != hashlib.sha256(source_bytes).hexdigest():
        raise ValueError("Adjudication input hash differs from source bytes")
    result = select_cases(json.loads(source_bytes), json.loads(route_bytes))
    result["sourceSha256"] = hashlib.sha256(source_bytes).hexdigest()
    result["adjudicationSha256"] = hashlib.sha256(route_bytes).hexdigest()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Selected {result['representativeCount']} observed signatures from {result['sourceCaseCount']} cases; zero adjudications.")


if __name__ == "__main__":
    main()
