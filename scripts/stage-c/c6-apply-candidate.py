#!/usr/bin/env python3
"""Stage C C6: write one candidate's parameter values into the calibrated-t20-02 packs (research only).

Only the parameters named in the pre-registered fit statement (docs/pavilion/stage-c/C6_REFIT.md section 1) are
written; every other value of the packs stays as it is. Run scripts/stage-c/c6-pin-packs.ts --write afterwards.

  python3 -I scripts/stage-c/c6-apply-candidate.py <params.json>

params.json: {"timingPowerBoundary": int, "rotationDot": int,
              "catchPhase": {"T20_EARLY": int, "T20_MIDDLE": int, "T20_LATE": int},
              "bowledPhase": {...}, "lbwPhase": {...}}
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SKILL = ROOT / "packages/data/src/calibrated-t20-02-pack.ts"
DELIVERY = ROOT / "packages/data/src/calibrated-t20-02-delivery-pack.ts"
PHASES = ("T20_EARLY", "T20_MIDDLE", "T20_LATE")


def sub_once(text, pattern, repl):
    new, n = re.subn(pattern, repl, text, count=1, flags=re.S)
    if n != 1:
        raise SystemExit(f"pattern not found: {pattern}")
    return new


def main():
    p = json.loads(Path(sys.argv[1]).read_text())
    s = SKILL.read_text()
    t = int(p["timingPowerBoundary"])
    for k in ("4", "6"):
        s = sub_once(s, rf'("{k}": \{{ TIMING: )-?\d+(, POWER: )-?\d+', rf"\g<1>{t}\g<2>{t}")
    s = sub_once(s, r'("0": \{ CONTROL: 24000, ROTATION: )-?\d+', rf"\g<1>{int(p['rotationDot'])}")
    SKILL.write_text(s)
    d = DELIVERY.read_text()
    for ph in PHASES:
        c = int(p["catchPhase"][ph])
        d = sub_once(d, rf"(catchOpportunityPhaseBp: \{{.*?{ph}: \{{ AERIAL: )-?\d+(, EDGE: )-?\d+", rf"\g<1>{c}\g<2>{c}")
        d = sub_once(d, rf"(dismissalPhaseBp: \{{.*?{ph}: \{{ BOWLED: )-?\d+(, LBW: )-?\d+",
                     rf"\g<1>{int(p['bowledPhase'][ph])}\g<2>{int(p['lbwPhase'][ph])}")
    DELIVERY.write_text(d)
    print(json.dumps(p))


if __name__ == "__main__":
    main()
