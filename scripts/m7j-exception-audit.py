#!/usr/bin/env python3
"""M7J source-addressed adjudication queue, not an automatic Cricsheet repair.

Uses the frozen M7I register. These are provisional routing decisions, NOT
findings that each record can be adjudicated solely from the supplied JSON.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path

RULES = {
    "UNSUPPORTED_WICKET_TYPE": (
        "RETIRED_OUT_SEPARATE_DEAD_BALL_COMMAND",
        "NEEDS_UMPIRE_AND_CHRONOLOGY_CONFIRMATION",
        "Confirm retirement was voluntary/non-injury and occurred when ball dead; inspect any scored runs separately.",
        "MCC-25.4",
    ),
    "UNSUPPORTED_EXTRA_TYPE": (
        "FIVE_RUN_PENALTY_SEPARATE_ADMINISTRATION",
        "NEEDS_UMPIRE_AWARD_REASON_AND_BENEFICIARY",
        "Penalty cannot be absorbed into bowler debit or credited as ordinary delivery runs.",
        "MCC-18.6;MCC-41.17",
    ),
    "WIDE_WICKET_MASK": (
        "WIDE_HIT_WICKET_ALREADY_SUPPORTED_BY_CORE_SCORER",
        "NEEDS_FIELD_AND_ENDS_ADJUDICATION",
        "Wide may accompany hit wicket; verify striker, ends, and conditions in the core rules.",
        "MCC-35;MCC-22",
    ),
    "INVALID_LEGALITY_CHANNEL": (
        "NO_BALL_MULTI_EXTRA_SOURCE_ATTRIBUTION",
        "UNRESOLVED",
        "MCC 21.15 provides one automatic no-ball run; extra total cannot be reclassified without umpire evidence.",
        "MCC-21.15;MCC-21.16",
    ),
    "FREE_HIT_MASK": (
        "FREE_HIT_PROHIBITED_DISMISSAL",
        "CONFLICT_REQUIRES_SOURCE_REVIEW",
        "Do not accept caught/bowled wickets on a confirmed free hit without correcting the source chronology.",
        "MCC-21;PLAYING-CONDITIONS",
    ),
    "MULTI_WICKET_UNSUPPORTED": (
        "MULTIPLE_DISMISSALS_RECORDED_SAME_DELIVERY",
        "CONFLICT_REQUIRES_EVENT_ORDER_REVIEW",
        "Delivery becomes dead at the first dismissal; separately confirmed post-dead retirement might be possible.",
        "MCC-20.1.1.3;MCC-25.4",
    ),
    "BOUNDARY_DISMISSAL_OR_ALLOWANCE": (
        "BOUNDARY_PLUS_RUN_OUT",
        "CONFLICT_REQUIRES_OVERTHROW_CHRONOLOGY",
        "Boundary usually deadens ball; determine order and whether overthrow/award; never double-score.",
        "MCC-18.8;MCC-19.8;MCC-20.1",
    ),
}

def make_report(register: dict, source_sha256: str) -> dict:
    assert register.get("exceptionCount") == 69
    rows = []
    seen = set()
    for x in register["exceptions"]:
        reason = x["reason"]
        if reason not in RULES:
            raise ValueError(f"Unknown case, stop rather than silently classify: {reason}")
        key=(x["matchId"],x["innings"],x["over"],x["attempt"],x["sourceEventSha256"])
        if key in seen: raise ValueError("duplicate exception identity")
        seen.add(key)
        mechanism, disposition, required, law = RULES[reason]
        rows.append({
            "matchId":x["matchId"], "innings":x["innings"],"over":x["over"],
            "attempt":x["attempt"],"sourceEventSha256":x["sourceEventSha256"],
            "cohort":x["cohort"],"reason":reason,"mechanism":mechanism,
            "disposition":disposition,"requiredEvidence":required,"lawReference":law,
            "autoApproved":False,
        })
    counts=collections.Counter(row["reason"] for row in rows)
    by_status=collections.Counter(row["disposition"] for row in rows)
    return {
        "version":"LC_M7J_SOURCE_ADJUDICATION_REGISTER_V1",
        "modelStatus":"RESEARCH_ONLY",
        "gameplayIntegrationPermitted":False,
        "inputSha256":source_sha256,
        "exceptionCount":len(rows),
        "countByReason":dict(sorted(counts.items())),
        "countByDisposition":dict(sorted(by_status.items())),
        "automaticallyAccepted":0,
        "exceptions":rows,
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--register",default="docs/verification-m7j/LC_M7I_INPUT_REGISTER.json")
    parser.add_argument("--out",default="docs/verification-m7j/LC_M7J_ADJUDICATION_REGISTER.json")
    args=parser.parse_args()
    source=Path(args.register).read_bytes()
    register=json.loads(source)
    result=make_report(register,hashlib.sha256(source).hexdigest())
    out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,sort_keys=True,indent=2)+"\n")
    print("M7J entries",result["exceptionCount"],"automaticallyAccepted",result["automaticallyAccepted"])
    print(json.dumps(result["countByReason"],sort_keys=True))

if __name__=="__main__":main()
