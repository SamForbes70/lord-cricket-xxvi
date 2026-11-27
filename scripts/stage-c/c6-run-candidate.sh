#!/usr/bin/env bash
# Stage C C6: fit one calibrated-t20-02 candidate (research only).
#   bash scripts/stage-c/c6-run-candidate.sh <out-dir> <params.json> [model=calibrated-t20-02]
# Writes the parameters into the -02 packs, pins the hashes, rebuilds, plays 800 matches on the FITTING seeds
# (corpus repeats 20 to 27, which no measurement uses: measurements use repeats 0 to 19) with captain V6 on both sides
# and the per-delivery harness, then scores the pre-registered objective (scripts/stage-c/c6-objective.py).
# Every step's exit code goes to <out-dir>/exits.log.
set -u
out="$1"; params="$2"; model="${3:-calibrated-t20-02}"; mkdir -p "$out"
REAL=/home/user/lcx-data/c1-real-calibration-balls.json
log() { echo "EXIT $1 $2" >> "$out/exits.log"; }
cp "$params" "$out/params.json"
if [ "$model" = "calibrated-t20-02" ]; then
  python3 -I scripts/stage-c/c6-apply-candidate.py "$params" > "$out/apply.log" 2>&1; log $? apply
  node --import tsx scripts/stage-c/c6-pin-packs.ts --write > "$out/pin.log" 2>&1; log $? pin
  NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b > "$out/tsc.log" 2>&1; log $? tsc
fi
start=$(date +%s)
for k in 0 1 2 3; do
  ( node --import tsx scripts/stage-c/c1-game-balls.ts "$out/cal-balls-$k.json" 2 $((20 + 2*k)) --model=$model --captain=V6 > "$out/cal-balls-$k.log" 2>&1; log $? "cal-balls-$k" ) &
done
wait
echo "games $(( $(date +%s) - start )) s" >> "$out/exits.log"
python3 -I scripts/stage-c/c6-objective.py --game "$out"/cal-balls-{0,1,2,3}.json --real $REAL --label "$(basename "$out")" --out "$out/objective.json" > "$out/objective.log" 2>&1; log $? objective
cat "$out/objective.log"
