#!/usr/bin/env python3
"""Stage C C6: calibrated-t20-01 against calibrated-t20-02, both under captain V6, with paired 95% intervals.

RESEARCH ONLY. The statistics and paired match bootstrap of scripts/pavilion-batting-v3-summary.py (loaded from that
file, unchanged), with dismissal kinds per 100 legal balls added for the powerplay and middle overs as well as the
death. Reads scripts/stage-c/c4-delivery-balls.ts files for the same seeds (before = calibrated-t20-01, after =
calibrated-t20-02), and optionally the matching c1-game-balls.ts files for the death split by striker class.

  python3 -I scripts/stage-c/c6-summary.py --before <g files> --after <g files> [--balls-before ... --balls-after ...] --label <text> --out <json>
"""
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bv3", HERE.parent / "pavilion-batting-v3-summary.py")
bv3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bv3)

base_stats = bv3.stats_g


def stats_g():
    st = base_stats()
    r = lambda a, b, k=1: (lambda m: k * m[a].sum(axis=-1) / m[b].sum(axis=-1))
    for name in ("powerplay", "middle"):
        for k in bv3.KINDS:
            st[f"{name}.kindPer100LegalBalls.{k}"] = r(f"{name}.kind.{k}", f"{name}.legal", 100)
    return st


bv3.stats_g = stats_g
if __name__ == "__main__":
    sys.argv[0] = str(HERE / "c6-summary.py")
    bv3.main()
