# Scenario quality execution evidence

`scenarios.json.protocol.json` records the cohort before the final run.
`scenarios.json` records 128 policy runs, 64 repeat checks and grouped results.
`COMMANDS.json` records the initial grid run and the full gate commands.
`FINAL_SCENARIO_COMMAND.json` records the final invocation after tightening CLI parsing and naming policy-run counts.
`CLI_NEGATIVE_CHECKS.json` records explicit rejection of malformed and unsupported arguments.
`PRESERVATION.json` records unchanged protected sources and the compiled worker hash.
The final typecheck and lint logs apply to that final CLI revision.
The initial and final runs describe the same declared cohort and policy summaries.
No empirical acceptance, new model or reference-browser performance result is claimed.
The harness's deterministic repeats compare every result field, rather than timing measurements.
`SHA256SUMS` covers all retained files except itself.
