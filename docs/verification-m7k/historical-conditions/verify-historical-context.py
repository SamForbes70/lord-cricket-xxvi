"""Checks historical source hashes and builds unapproved rule-context observations."""
import argparse
import copy
import hashlib
import json
import subprocess
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def html_text(path):
    parser = Text()
    parser.feed(path.read_text())
    return " ".join(" ".join(parser.parts).split())


def verify(raw, manifest):
    for source in manifest["sources"]:
        path = raw / source["sourceId"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError(f"Source hash mismatch: {source['sourceId']}")
    pdf = subprocess.check_output(["pdftotext", "-layout", str(raw / "icc-t20-2012-saca.pdf"), "-"], text=True)
    pages = pdf.split("\f")
    first = " ".join(pages[0].split())
    clause = " ".join(pages[17].split())
    if "from 1st October 2012" not in first or "24.2 Free Hit after a foot-fault no ball" not in clause:
        raise ValueError("2012 conditions date or clause locator differs")
    if "called for a foot fault (Law 24.5)" not in clause or "5.18" not in clause:
        raise ValueError("2012 foot-fault scope or printed page differs")
    mirror = html_text(raw / "silo-handbook.html")
    start = mirror.index("These playing conditions are applicable to all Twenty20 Internationals from 1st October 2013")
    end = mirror.index("24.2 Free Hit after a foot-fault no ball", start)
    if "called for a foot fault (Law 24.5)" not in mirror[end:end + 700]:
        raise ValueError("2013 mirror lacks the T20I foot-fault provision")
    if "23rd October 2005 (50-over match)" not in html_text(raw / "nzc-2005.html"):
        raise ValueError("Excluded scorecard identity differs")
    unrelated = subprocess.check_output(["pdftotext", str(raw / "foothill-handbook.pdf"), "-"], text=True)
    if "INTER CLUB" not in unrelated or "2020/2021 school year" not in unrelated:
        raise ValueError("Excluded handbook identity differs")
    report = html_text(raw / "cricketweb-2005.html")
    if "21 October 2005" not in report or "South Africa 133" not in report or "New Zealand 134-5" not in report:
        raise ValueError("Contemporary match report anchors differ")
    context_bytes = (ROOT / "docs/verification-m7k/source-context/SOURCE_CONTEXT.json").read_bytes()
    if hashlib.sha256(context_bytes).hexdigest() != manifest["sourceContextSha256"]:
        raise ValueError("Source context hash mismatch")
    context = json.loads(context_bytes)
    register = json.loads((ROOT / "docs/verification-m7j/LC_M7I_INPUT_REGISTER.json").read_text())
    hashes = {row["sourceEventSha256"] for row in register["exceptions"] if row["reason"] == "FREE_HIT_MASK"}
    cases = []
    for row in context["events"]:
        if row["reason"] != "FREE_HIT_MASK":
            continue
        previous = next(item for item in row["sourceNeighbors"] if item["relativePosition"] == -1)
        if previous["observedExtras"].get("noballs") != 1:
            raise ValueError("Expected preceding source no-ball differs")
        if row["independentlyAdjudicated"] is not False or row["chronologyConfirmed"] is not False:
            raise ValueError("Source observations must remain unapproved")
        references = {"533293": ["icc-t20-2012-saca.pdf"], "660185": ["silo-handbook.html"]}.get(row["matchId"], [])
        cases.append({
            **{key: row[key] for key in ("matchId", "innings", "over", "attempt", "sourceEventSha256", "cohort", "matchDates")},
            "precedingSourceEventSha256": previous["sourceEventSha256"],
            "precedingObservedExtras": previous["observedExtras"],
            "ruleContextReferences": references,
            "ruleContextStatus": "STANDARD_CONTEXT_RETRIEVED_MATCH_ADOPTION_UNCONFIRMED" if references else "CONTEMPORARY_CONDITIONS_NOT_RETRIEVED",
            "noBallCauseConfirmed": False, "applicableConditionsConfirmed": False,
            "independentlyAdjudicated": False, "chronologyConfirmed": False,
            "freeHitEligibility": "UNCONFIRMED", "reviewStatus": "AWAITING_EXTERNAL_EVIDENCE",
        })
    if len(cases) != 5 or {row["sourceEventSha256"] for row in cases} != hashes:
        raise ValueError("Free-hit source coverage differs")
    return {"version": "LC_M7K_HISTORICAL_RULE_CONTEXT_V1", "sourceCaseCount": len(cases), "acceptedFixtureCount": 0,
            "gameplayIntegrationPermitted": False, "sourceContextSha256": manifest["sourceContextSha256"],
            "checkedSourceCount": len(manifest["sources"]), "cases": cases}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--negative-out", type=Path)
    args = parser.parse_args()
    manifest = json.loads((HERE / "SOURCES.json").read_text())
    result = verify(args.raw_dir, manifest)
    if args.negative_out:
        rejected = []
        for kind in ("source-hash", "context-hash"):
            changed = copy.deepcopy(manifest)
            if kind == "source-hash":
                changed["sources"][0]["sha256"] = "0" * 64
            else:
                changed["sourceContextSha256"] = "0" * 64
            try:
                verify(args.raw_dir, changed)
            except ValueError as error:
                rejected.append({"check": kind, "status": "PASS_REJECTED", "error": str(error)})
            else:
                raise ValueError(f"Tampered provenance accepted: {kind}")
        args.negative_out.write_text(json.dumps(rejected, indent=2) + "\n")
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(f"PASS: {result['checkedSourceCount']} source hashes and content checks; five cases remain unapproved.")


if __name__ == "__main__":
    main()
