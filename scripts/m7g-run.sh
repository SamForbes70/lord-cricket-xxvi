#!/usr/bin/env bash
# Cricsheet ODC-By 1.0, https://cricsheet.org/licensing/
# Offline, research-only fit. Does not alter production model, engine or saves.
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "Usage: bash scripts/m7g-run.sh /absolute/path/to/t20s_json.zip" >&2
  exit 2
fi
cd "$(dirname "$0")/.."
archive="$1"
mkdir -p reference/m7g
python3 scripts/m7e-register-upload.py --input "$archive" --manifest reference/m7g/acquisition.json
python3 scripts/m7c-calibration.py extract --input "$archive" --out reference/m7g/reference.json --min-holdout 200
python3 scripts/m7g-full-joint.py --archive "$archive" --reference reference/m7g/reference.json \
  --outdir reference/m7g --sim-innings 600
python3 -m unittest discover -s tests -p 'test_m7g_joint.py' -v
printf '\nM7G empirical research evidence written to reference/m7g. Gameplay pack and saves remain UNCHANGED.\n'
