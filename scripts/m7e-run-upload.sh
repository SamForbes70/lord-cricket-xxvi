#!/usr/bin/env bash
# On an authorised local workstation: bash scripts/m7e-run-upload.sh /path/to/t20s_json.zip
# This is empirical RESEARCH. It does not install a gameplay model.
set -euo pipefail
if [[ $# -ne 1 ]]; then echo 'Usage: bash scripts/m7e-run-upload.sh /absolute/path/t20s_json.zip' >&2; exit 2; fi
cd "$(dirname "$0")/.."
archive="$1"
mkdir -p reference/m7e
python3 scripts/m7e-register-upload.py --input "$archive" --manifest reference/m7e/acquisition.json
python3 scripts/m7c-calibration.py extract --input "$archive" --out reference/m7e/reference.json --min-holdout 200
for offset in 0 50 100 150; do
  node --import tsx scripts/m7c-synthetic.ts --matches=50 --seed-offset="$offset" > "reference/m7e/synthetic-$offset.json"
done
python3 scripts/m7e-merge-synthetic.py --expected-count 200 --out reference/m7e/synthetic-200.json \
  reference/m7e/synthetic-0.json reference/m7e/synthetic-50.json \
  reference/m7e/synthetic-100.json reference/m7e/synthetic-150.json
python3 scripts/m7c-calibration.py compare --reference reference/m7e/reference.json \
  --synthetic reference/m7e/synthetic-200.json --out reference/m7e/comparison.json --min-holdout 200
python3 scripts/m7d-fit-candidate.py --reference reference/m7e/reference.json \
  --acquisition-manifest reference/m7e/acquisition.json \
  --candidate reference/m7e/candidate.json --evaluation reference/m7e/evaluation.json
printf '\nM7E completed: research-only reference/holdout evaluation. Gameplay remains SYNTHETIC_ALPHA.\n'
