"""Verifies selected historical event hashes against a separately retained Cricsheet archive."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

MATCHES = {"1391336", "660185", "1142915", "222678", "1050219", "306991", "1275051"}


def verify(archive, register):
    records = []
    with zipfile.ZipFile(archive) as source:
        names = set(source.namelist())
        for row in register["exceptions"]:
            if row["matchId"] not in MATCHES:
                continue
            name = row["matchId"] + ".json"
            if name not in names:
                raise ValueError(f"Missing selected match: {name}")
            raw = source.read(name)
            match = json.loads(raw)
            innings = match["innings"][row["innings"] - 1]
            over = next(over for over in innings["overs"] if over["over"] == row["over"])
            delivery = over["deliveries"][row["attempt"]]
            addressed = {"matchId": row["matchId"], "inning": row["innings"] - 1,
                         "over": row["over"], "attempt": row["attempt"], "delivery": delivery}
            canonical = json.dumps(addressed, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            actual = hashlib.sha256(canonical.encode()).hexdigest()
            if actual != row["sourceEventSha256"]:
                raise ValueError(f"Source event hash mismatch: {name}, innings {row['innings']}, over {row['over']}, attempt {row['attempt']}")
            info = match["info"]
            records.append({
                **{key: row[key] for key in ("matchId", "innings", "over", "attempt", "cohort", "reason", "sourceEventSha256")},
                "actualDeliveryLabel": delivery.get("actual_delivery"),
                "matchFileSha256": hashlib.sha256(raw).hexdigest(),
                "matchDates": info["dates"], "teams": info["teams"],
                "event": info.get("event"), "venue": info.get("venue"),
                "sourceEventHashVerified": True,
                "independentlyAdjudicated": False, "chronologyConfirmed": False,
            })
    if {row["matchId"] for row in records} != MATCHES:
        raise ValueError("Batch does not cover every selected match")
    return {"version": "LC_M7K_SOURCE_BATCH_V1", "archiveSha256": hashlib.sha256(Path(archive).read_bytes()).hexdigest(),
            "matchCount": len(MATCHES), "eventCount": len(records),
            "gameplayIntegrationPermitted": False, "events": records}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--register", default="docs/verification-m7j/LC_M7I_INPUT_REGISTER.json")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    result = verify(args.archive, json.loads(Path(args.register).read_text()))
    result["registerSha256"] = hashlib.sha256(Path(args.register).read_bytes()).hexdigest()
    Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
    print(f"PASS: {result['eventCount']} events across {result['matchCount']} selected matches; zero adjudications.")


if __name__ == "__main__":
    main()
