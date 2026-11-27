# Creative production ledger

Studio Production Directive 05 (Creative Production). One row per pass. A row moves through these statuses in order and never skips one:

| Status | Meaning |
| --- | --- |
| PROPOSED | Scope written down; nothing built |
| DESIGNED | Design or specification recorded and reviewed in a pull request |
| IMPLEMENTED | Code or assets on a branch with local checks recorded |
| INTEGRATED | Merged to `main` with both hosted checks green on the final head |
| VERIFIED | Evidence captured from `main` (screenshots, measurements) and recorded |
| HUMAN TESTED | A person played it and their observations are recorded, quoted |
| ACCEPTED | The owner's own words accepting it are quoted with the date |

An agent may move a row as far as VERIFIED. HUMAN TESTED needs a recorded person's observations; ACCEPTED needs the owner's quoted words. Neither is ever set by an agent on its own judgement.

| Pass | Subject | Status | Revision | Evidence | Pull request | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CP01 | Creative audit and baseline of the current game | IMPLEMENTED | audited `976ee76` | [CP01_CREATIVE_AUDIT.md](CP01_CREATIVE_AUDIT.md), [CREATIVE_DEFECT_REGISTER.md](CREATIVE_DEFECT_REGISTER.md), 126 screenshots in `cp01/screens/`, capture script `scripts/cp01-capture.mjs` | draft, branch `pavilion/cp01-creative-audit` | Self-assessed baseline 42 of 100, not acceptance. 54 defects (P0 0, P1 12, P2 27, P3 15). Documentation and a capture script only; no game code changed. Not yet merged, so not INTEGRATED |

Proposed later passes (subjects are a proposal until the directive's pass list is recorded): CP02 tokens, type scale and leftovers; CP03 shared components, headers and navigation; CP04 live match layout and controls; CP05 field, ball and moments; CP06 scorecard and commentary; CP07 statistical visualisation; CP08 player and club identity; CP09 Clubhouse; CP10 career rewards and progression; CP11 sound and music; CP12 onboarding and accessibility; CP13 performance, polish and final verification. They are not entered as rows until each is started.
