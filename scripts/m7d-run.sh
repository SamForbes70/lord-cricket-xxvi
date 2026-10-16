#!/usr/bin/env bash
# Run on a network-enabled host authorised to download from cricsheet.org.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p reference
python3 scripts/m7d-acquire.py --out reference/t20s_json.zip --manifest reference/acquisition.json
python3 scripts/m7c-calibration.py extract --input reference/t20s_json.zip --out reference/m7c-reference.json --min-holdout 200
node --import tsx scripts/m7c-synthetic.ts --matches=200 > reference/m7c-synthetic-200.json
python3 scripts/m7c-calibration.py compare --reference reference/m7c-reference.json --synthetic reference/m7c-synthetic-200.json --out reference/m7c-comparison.json --min-holdout 200
python3 scripts/m7d-fit-candidate.py --reference reference/m7c-reference.json --acquisition-manifest reference/acquisition.json --candidate reference/m7d-candidate.json --evaluation reference/m7d-evaluation.json
printf '\nM7D researcher outputs created in reference/ (NOT a gameplay model).\n'
