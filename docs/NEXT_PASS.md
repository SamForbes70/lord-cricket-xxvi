# Lord Cricket XXVI - NEXT PASS after M7J

**M7K started:** owner-authorised planning and research evidence work in [draft PR #3](https://github.com/SamForbes70/lord-cricket-xxvi/pull/3).
It remains unmerged. See [current status](CURRENT_STATUS.md) for acceptance and the immediate engineering activities.

Baseline: M7J committed source (record exact hash in PASS_22_M7J_REPORT.md).

Priorities:

1. Obtain independently adjudicated representative cases from the 69-row M7I register, including full umpire chronology, match playing conditions, award beneficiary, ground-end metadata and reliable extras credit. Preserve original source hashes and decisions.
2. Version a new *production-capable* delivery/administration event stream and innings ledger only when every required invariant, interrupted save/replay path and old-schema version negotiation has fixtures. Do not write v2 events into v1 saved matches.
3. Resolve remaining anomalies: repeated No-ball extras, free-hit inconsistency, boundary + run-out ordering, multiple dismissals in one source row, true retired-out timing. Never silently coerce invalid source evidence into legal events.
4. Assemble a research candidate with full traceable scorer integration and test two-innings match cohorts, strength variation, fatigue, captain tactical ablations and unbiased opponent/competition comparison. Model evaluation must use a *new untouched* forward-time cohort, not the repeatedly inspected M7E-H development holdout.
5. Keep `synthetic-alpha-01` intact for historical save replay. Linux and hosted Windows browser runs pass; Sam reports a successful Windows Edge playthrough.
   Owner-PC automation and unrecorded human checklist details remain separate evidence gaps. Run performance budgets on reference hardware before M8.

M7J is a safe research-rule prerequisite, NOT gameplay-ready completion of those tasks. Details and fixture evidence: ADR-032 and `docs/M7J_RUNBOOK.md`.
