#!/usr/bin/env bash
# Cricsheet ODC-By 1.0, https://cricsheet.org/licensing/
# Bounded M7F offline research only. Never installs a candidate into gameplay.
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "Usage: bash scripts/m7f-run.sh /absolute/path/to/t20s_json.zip" >&2
  exit 2
fi
cd "$(dirname "$0")/.."
archive="$1"
outdir="reference/m7f"
mkdir -p "$outdir"
python3 scripts/m7e-register-upload.py --input "$archive" --manifest "$outdir/acquisition.json"
python3 scripts/m7c-calibration.py extract --input "$archive" \
  --out "$outdir/reference.json" --min-holdout 200
python3 scripts/m7f-joint.py --archive "$archive" \
  --reference "$outdir/reference.json" --outdir "$outdir" --sim-matches 400
python3 -m unittest discover -s tests -p 'test_m7f_joint.py' -v
printf '\nM7F research model fitted. Gameplay model/save format UNCHANGED.\n'
