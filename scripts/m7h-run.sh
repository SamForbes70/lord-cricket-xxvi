#!/usr/bin/env bash
# Research only. User-provided Cricsheet archive is not redistributed.
# Cricsheet https://cricsheet.org/ ODC-By-1.0 https://cricsheet.org/licensing/
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo 'Usage: bash scripts/m7h-run.sh /absolute/path/to/t20s_json.zip' >&2
  exit 2
fi
archive="$(realpath "$1")"
cd "$(dirname "$0")/.."
# Rebuild the immutable M7G research baseline from the same uploaded source.
bash scripts/m7g-run.sh "$archive"
mkdir -p reference/m7h
python3 scripts/m7h-two-innings.py \
  --archive "$archive" \
  --reference reference/m7g/reference.json \
  --first reference/m7g/LC_M7G_JOINT_CANDIDATE.json \
  --outdir reference/m7h --sim-matches 400
python3 scripts/m7h-player-evidence.py \
  --archive "$archive" \
  --reference reference/m7g/reference.json \
  --output reference/m7h/LC_M7H_PLAYER_EXPOSURE_AUDIT.json
python3 scripts/m7h-player-predictive.py \
  --archive "$archive" \
  --reference reference/m7g/reference.json \
  --output reference/m7h/LC_M7H_PLAYER_PREDICTIVE_EVALUATION.json
python3 -m unittest discover -s tests -p 'test_m7h*.py' -v
npx vitest run tests/unit/m7h-research-chase.test.ts --maxWorkers=1 --no-file-parallelism
printf '\nM7H research results: reference/m7h. Gameplay model and saves are unchanged.\n'
