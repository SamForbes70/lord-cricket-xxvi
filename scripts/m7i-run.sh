#!/usr/bin/env bash
# Cricsheet ODC-By 1.0 https://cricsheet.org/licensing/
# Unmodified historical gameplay. Run with actual user-provided Cricsheet archive.
set -euo pipefail
if [[ $# -ne 1 ]]; then echo 'Usage: bash scripts/m7i-run.sh /absolute/path/to/t20s_json.zip' >&2; exit 2; fi
archive="$(realpath "$1")"
cd "$(dirname "$0")/.."
if [[ ! -s reference/m7g/reference.json || ! -s reference/m7g/LC_M7G_JOINT_CANDIDATE.json || ! -s reference/m7h/LC_M7H_CHASE_CANDIDATE.json ]]; then
  echo 'Rebuilding frozen M7H reference and model inputs from supplied ZIP'
  bash scripts/m7h-run.sh "$archive"
fi
mkdir -p reference/m7i
python3 scripts/m7i-rare-adjudication.py --archive "$archive" --reference reference/m7g/reference.json --output reference/m7i/LC_M7I_RARE_DELIVERY_REGISTER.json
python3 scripts/m7i-player-generalisation.py --archive "$archive" --reference reference/m7g/reference.json --output reference/m7i/LC_M7I_PLAYER_GENERALISATION.json
python3 scripts/m7i-tail-diagnostic.py --archive "$archive" --reference reference/m7g/reference.json \
 --first reference/m7g/LC_M7G_JOINT_CANDIDATE.json --second reference/m7h/LC_M7H_CHASE_CANDIDATE.json \
 --output reference/m7i/LC_M7I_CHASE_TAIL_DIAGNOSTIC.json --samples 600
python3 -m unittest discover -s tests -p 'test_m7i_quality.py' -v
printf 'M7I research outputs: reference/m7i. No gameplay model promotion.\n'
