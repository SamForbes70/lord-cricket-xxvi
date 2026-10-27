# Status and quality evidence

The parent report is `../STATUS_AND_QUALITY_REPORT.md`.
`PROTOCOL.json` freezes the cohort before execution; `DIAGNOSTIC_COMMANDS.json` records both actual runs.
`QUALITY_SUMMARY.json` separates first innings, chase endings, phases and fixed target bands.
The raw JSON runs preserve every sampled match and timing; the deterministic projection excludes timing only.
`VALIDATION_COMMANDS.json` records local gate commands and exact exit codes.
`BROWSER_COMMAND.json` records browser invocation and runtime configuration.
`pr3-review.json` records the separately reviewed PR #3 head, green checks and evidence hashes.
`PROTECTED_SOURCE_CHECK.json` records package/lock/worker preservation.
`issue-1-before.json` preserves the issue description before the reconciliation append.
`SHA256SUMS` covers evidence files recursively, except itself.

Reproduction from the repository root:

```sh
node --import tsx scripts/m7c-synthetic.ts --matches=96 --seed-offset=0 > /tmp/quality-first.json
node --import tsx scripts/m7c-synthetic.ts --matches=96 --seed-offset=0 > /tmp/quality-repeat.json
python3 scripts/summarise-synthetic-quality.py --input /tmp/quality-first.json --repeat /tmp/quality-repeat.json --protocol docs/verification-status-quality/PROTOCOL.json --out /tmp/quality-summary.json
python3 -m unittest discover -s tests -p test_synthetic_quality_summary.py -v
```

No game model changes or real-data validation claims arise from this reproduction.
Timing fields and raw file hashes vary by run; per-match non-runtime output must agree for the declared cohort.
