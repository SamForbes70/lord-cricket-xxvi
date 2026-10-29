# Acceptance reconciliation after baseline recovery

The baseline builds, deterministic checks, owner-archive comparison and supported browser automation have recorded passing results.
The owner also reports a successful Windows Edge playthrough.
This reconciliation preserves the difference between completed work and missing owner-PC automation.
It does not certify an empirical model or reference-hardware performance.

## Gate matrix

| Gate | Status | Evidence and limit |
| --- | --- | --- |
| Historical source identity | PASS | Accepted commit exists; 894 owner source files match historical Git bytes. |
| Dependency/toolchain acceptance | PASS in recorded runs | Pinned installation, build, schemas, typecheck and lint; exact versions belong to logs. |
| Scoring and determinism | PASS in recorded runs | Scoring fixtures, RNG/probability/generator vectors and fixed T20 runtime corpus. |
| Complete career | PASS in recorded runs | Headless 14-round/56-fixture acceptance and browser completion/reload/export/import. |
| Linux Chromium/Firefox | PASS in recorded runs | Baseline and layout follow-up include UI, persistence, formats and career evidence. |
| Hosted Windows Chromium/Firefox | PASS in recorded runs | Six match UI tests and four portable career tests on native Windows runners. |
| Owner-PC installation/build | PASS by supplied output | Node v24.22.0; successful `npm.cmd ci` and `npm.cmd run build`. |
| Owner-PC Chromium/Firefox automation | INCOMPLETE | Supplied run on `c5dc22a`: 609 unit tests and six UI tests pass; career three pass, Firefox save assertion fails. PR #12 fixes the test; updated owner result is pending. |
| Owner Windows Edge match | PASS by owner report | Full match, usable layout and repeated replay verification; exact result/hashes in the human record. |
| Formal human metadata | PARTIAL | Exact Windows/browser versions, tested commit and viewport dimensions were not supplied. |
| Individual human checklist observations | PARTIAL | Keyboard-focus visibility, unavailable-bowler explanations and terminal controls lack separate observations. |
| Preserved release comparison | PASS | 23 manifest hashes, 894 historical source files and 16 HTTP asset checks. |
| Reference-hardware performance | NOT RUN | Hosted CI timing and cloud Node diagnostics are not four-core/8 GB browser benchmarks. |
| Empirical model promotion | NOT APPROVED | Gameplay remains `SYNTHETIC_ALPHA`; M7K research is separate. |

## Human evidence retained

Tester: Sam, Windows Edge, reported 26 October 2026.
Silver Fen: 67/7 after 20 overs.
Westmere Isles: 70/2 after 13.2 overs, winning by eight wickets.
The interface reports replay and command resimulation agreement.
It records 307 accepted events, 82 human requests and zero test-autopilot requests.
The owner confirms repeat verification after presentation changes.

Event bytes SHA-256: `a7b4c13e4b983c72dcc928a274fa0ab9269f278117973507fa0a0beea855a241`.
Scorecard SHA-256: `6edfbf41394ed88180b2d74bad274753137331b663e43c819ef89e7a8fc4681c`.
The second displayed hashes were not pasted separately.
The pasted view initially shows 100% text scale; the later layout verdict is the owner's report.

The existing successful playthrough remains evidence.
Missing metadata must remain NOT RECORDED until supplied; it must not be inferred from hosted browser versions.
The same distinction applies to the precise commit of the downloaded owner ZIP.

## Issue #1 disposition

Issue #1 explicitly requests browser automation on an authorised local Windows host.
Hosted Windows automation establishes Windows runtime/browser coverage, but does not fulfil the location-specific wording.
The local Edge playthrough establishes human use, but does not establish a local automated Chromium/Firefox suite.
Consequently, issue #1 remains open with that residual gate identified.
Closing it requires either the missing local result or an explicit amendment accepting the substitute evidence.
Authorisation to complete this reconciliation is not evidence that the missing tests ran.

This step completes the evidence reconciliation; it does not relabel the unresolved gate as PASS.
No repeat human match is demanded merely to recreate already supplied results.
A later release check can collect the missing metadata and individual observations.

## Source records

- [M3_HUMAN_ACCEPTANCE.md](M3_HUMAN_ACCEPTANCE.md) retains the reported match and its limits.
- [OWNER_RELEASE_COMPARISON.md](codex-migration/OWNER_RELEASE_COMPARISON.md) retains original-release identity and HTTP checks.
- [LAYOUT_ACCEPTANCE_FOLLOWUP.md](codex-migration/LAYOUT_ACCEPTANCE_FOLLOWUP.md) retains browser bounds and CI failure diagnoses.
- [WINDOWS_ACCEPTANCE_HANDOFF.md](codex-migration/WINDOWS_ACCEPTANCE_HANDOFF.md) retains the local commands for any later run.
- [PR #2](https://github.com/SamForbes70/lord-cricket-xxvi/pull/2) records the merged acceptance work.
