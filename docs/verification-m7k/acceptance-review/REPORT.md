# M7K acceptance review: steps 2–6

M7K acceptance remains incomplete. The available records cannot establish historical incident facts, provide 200 untouched evaluation matches or qualify the current cloud host as reference hardware.

This review records the requested steps on 29 October 2026, Australia/Brisbane. It preserves SF's earlier confirmation and all historical evidence flags. No gameplay model is promoted.

## Steps 2–3: executable reviewed incident intake

`scripts/m7k-verify-historical-fixtures.ts` accepts a versioned packet of externally reviewed incidents. It validates the match, event and file hashes against the committed source index before executing commands.

Each packet requires cited chronology, playing conditions, reviewer details and explicit confirmation of credits, physical ends and next actions. Every command requires a complete expected snapshot, including all batter and bowler lines, extras, dismissals, awards and occupied ends.

The runner compares every prefix against those expectations. It checks event replay and recovery from both older and current checkpoints. Unknown sources, incomplete prefixes, incorrect credits and inconsistent decisions reject. The CLI publishes no report after validation failure and never overwrites an existing output.

Output includes packet and source-index hashes. A mechanical pass records review declarations; it does not independently authenticate them. Expected snapshots must come from reviewed evidence, rather than candidate output.

No complete incident-specific packet has been supplied. The seven engineering fixtures and two conditional source probes remain separate from accepted historical fixtures. Their tests cannot replace missing umpire chronology, match-specific conditions or actual physical ends.

## Step 4: broader untouched-cohort search

The task downloads Cricsheet's complete men's archive, including international and domestic formats. The inventory now filters by `info.match_type`, so ODI, Test, domestic one-day and unknown formats cannot inflate the T20 count.

`ALL_MALE_FORWARD_T20.json` records 18 T20 candidates strictly after 14 October 2026. The complete archive has SHA-256 `d9c9821830336f33d84645ee522c89daf161addcbcf54f8c86b7baba824fe00d`.

The broader archive therefore supplies no additional qualifying-date candidates beyond the earlier T20 inventory. Eligibility review can only reduce this count. The protocol requires 200 evaluation matches. Outcomes remain unanalyzed, and the task performs no fitting or empirical evaluation.

Raw licensed data stays outside Git. The inventory retains dates and hashes. Previously inspected development matches remain excluded from untouched evaluation.

## Step 5: hardware acceptance

The existing probes cover command acknowledgement, T20 and five-day matches, a complete league and IndexedDB save/load. Their recorded cloud observations remain available in the preceding completion report.

This task has no supplied four-core, 8 GB reference-laptop result or complete application-memory measurement. Repeating cloud timings cannot establish that gate. Reference-hardware acceptance remains blocked; no timing or memory value is invented.

## Step 6: acceptance decision

| Gate | Decision | Evidence needed to clear it |
| --- | --- | --- |
| Historical incident acceptance | BLOCKED | Complete incident-specific decisions, references and expected prefixes. |
| Candidate replay and recovery | PASS for available engineering fixtures | Run the admitted historical packets when supplied. |
| Untouched-cohort evaluation | BLOCKED | At least 200 eligible new evaluation matches; freeze candidate and protocol before opening outcomes. |
| Reference hardware and memory | BLOCKED | Qualifying host measurements and complete application-memory evidence. |
| Overall M7K acceptance | NOT ACCEPTED | Clear all prerequisite gates and review their results. |
| Gameplay promotion | NOT AUTHORISED | Separate explicit owner approval after acceptance. |

The updated owner-PC collector result also remains pending under issue #1. This task excludes the owner's step 1 and does not infer its completion.

Production simulation, contracts, dependency pins, existing saves and `synthetic-alpha-01` remain unchanged. The committed work improves the executable intake and evidence search; it does not claim that missing external gates passed.

## Verification saved with this commit

| Check | Fresh result |
| --- | --- |
| TypeScript unit suite | PASS: 638 tests across 40 files. |
| Python discovery | PASS: 94 tests. |
| Production smoke | PASS: 23 tests. |
| Candidate browser recovery | PASS: 30 tests across Chromium and Firefox. |
| Historical intake tests | PASS: 14 synthetic tests, including CLI failure and non-overwrite paths. |
| Schemas, build, typecheck and lint | PASS: 167 schemas and unchanged package boundaries. |
| Scorer and deterministic vectors | PASS: scoring, RNG, probability and generator checks. |

`VALIDATION.json`, `COMMANDS.json` and retained logs record these results. `SHA256SUMS` protects the evidence files.
The browser runs use normal browser sandboxes on the approved execution host.
The simulation worker retains SHA-256 `60df03f74ca1595fab9ec8a6c041445f8f1c039b0d634503fe8913f31c83dac4`.
The available archive search and acceptance review are complete; the blocked evidence gates are not.
