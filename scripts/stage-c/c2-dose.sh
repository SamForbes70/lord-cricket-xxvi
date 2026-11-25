#!/usr/bin/env bash
# Stage C C2: run the dose-response conditions for one model in parallel and print per-point log effects.
#   bash scripts/stage-c/c2-dose.sh <out-dir> [model=calibrated-t20-01]
set -euo pipefail
out="$1"; model="${2:-calibrated-t20-01}"; mkdir -p "$out"
for c in bat30 bat70 bowl30 bowl70 var30 var70; do
  node --import tsx scripts/stage-c/c1-game-dose-response.ts "$out/$c.json" "$c" "--model=$model" 2>/dev/null &
done
wait
python3 -I - "$out" <<'PY'
import json, math, sys
d = {c: json.load(open(f"{sys.argv[1]}/{c}.json"))["results"][0] for c in ("bat30","bat70","bowl30","bowl70","var30","var70")}
nd = lambda r: 1 - r["dotPerBall"]
out = {}
for who, lo, hi in (("batting","bat30","bat70"), ("bowling","bowl30","bowl70"), ("variation","var30","var70")):
    for k, f in (("runs", lambda r: r["runsPerBall"]), ("boundary", lambda r: r["boundaryPerBall"]), ("nonDot", nd), ("dismissal", lambda r: r["strikerDismissalPerBall"])):
        out[f"{who}.{k}"] = math.log(f(d[hi]) / f(d[lo])) / 40
out["firstInningsRuns"] = {c: d[c]["firstInningsBatRuns"] for c in d}
json.dump(out, open(f"{sys.argv[1]}/per-point.json", "w"), indent=1)
print(json.dumps({k: (round(v, 4) if isinstance(v, float) else v) for k, v in out.items()}))
PY
