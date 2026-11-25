# Project Pavilion: product direction correction of 25 November 2026, and the owner's decisions

This records the owner's "Product Direction Correction" of 25 November 2026 and the decisions that followed it. It changes no code and marks no gate as passed.

## The direction, in summary

- **Objective:** an exceptionally enjoyable cricket management game, not only a sophisticated statistical simulator. The measure of success is that people voluntarily continue playing.
- **Corrective actions:**
  1. Audit the ancestry of `main`, and integrate #125 and #126, which had been merged into intermediate branches only.
  2. Verify the latest `main` together, and produce a Windows acceptance build.
  3. Investigate the cricket correctness of existing systems.
  4. Label the win chance experimental, or make it optional, until it is validated.
  5. Continue P04 stages B and C under the existing versioning and approval rules.
- **Tracks:**
  - cricket intelligence, 40%;
  - entertainment and experience, 40%: bounded prototypes of match presentation, player identity, scouting and recruitment, which do not wait for calibration;
  - reliability and integration, 20%.
- **Milestone:** one exceptionally enjoyable, complete T20 season with eight clubs. It covers pre-season, recruitment, development, tactical match management, presentation, league progression, season conclusions and off-season decisions. Substantial world expansion is deferred until this is accepted.
- **Tactical validation:** controlled experiments comparing good against deliberately poor management, reporting effect sizes, uncertainty and limitations.
- **Human acceptance:** run the match and career protocols. Record voluntary replay, memorable moments, player attachment, tactical comprehension and the wish to start another season. Enjoyment scores are never invented.
- **Reporting:** every work package is reported as proposed, implemented, integrated into `main`, verified, human-tested or accepted.

## Owner decisions, 25 November 2026

The owner said "go with all your recommendations" to the 14 questions put in the session.

| # | Question | Decision |
| --- | --- | --- |
| 1 | Merge #136 (#125 and #126 into `main`) when CI passes | Yes, first |
| 2 | Merge #137 (win chance experimental, closed until opened) when CI passes | Yes |
| 3 | Merge #138 (stage B batting policy, captain V3) when CI passes | Yes |
| 4 | Build the Windows acceptance package after 1 to 3 and a passing `main` | Yes |
| 5 | Fix career match-day selection and fixture bowling shares | A new versioned selection policy and fixture bowling choice, for new careers and for existing careers from their next season. Completed and in-progress seasons keep V1, so their records and replays are unchanged. |
| 6 | Imported-roster suggested eleven | Fix now (#140) |
| 7 | "won by 1 runs" and "1 wickets" | Fix now (#140) |
| 8 | Red-ball autopilot bowling, rain powerplay, follow-on after a lost day, red-ball second-innings declaration | Defer until the T20 milestone is accepted. Exception: shorten the T20 rain powerplay, as a versioned rules change, when T20 rain is next worked on. |
| 9 | Stage C's first target | Realistic skill differentiation (player skill and tactics must produce noticeable differences) |
| 10 | Six-bowler minimum in the suggested eleven | Keep six for now. Measure five against six with the tactical-validation script. |
| 11 | "Player development" in tactical validation | The career training programme, over a season |
| 12 | Tolerances for the nine statistical criteria (`DIRECTION_2026-11-25.md`, section 2) | Accepted as provisional. Reviewed when stage C produces measurements. No criterion is passed until the owner accepts the measured results. |
| 13 | Playtests | The match playtest starts once the Windows package from 4 exists. The career-season evaluation waits for the career fix from 5. The owner arranges participants. |
| 14 | Old pull request #97 | Reviewed. The owner asked for it to be updated with `main` and re-run in CI before any merge. |

## Findings that informed these decisions

- **Ancestry audit:** the head commits of all 125 merged pull requests were checked against `main` at `c5d91c6`. Only #125 and #126 were missing. #136 integrates them.
- **Cricket-correctness review:** findings with file and line evidence are summarised in #140 and in the career-fix pull request. The most serious:
  - In career league fixtures, every side fielded one specialist batter, at number 9 or 10.
  - The fixture autopilot shared the overs equally among all bowlers.
- **Tactical validation:** #139, `TACTICAL_VALIDATION.md`.
  - Batting composition and order decide matches (70 to 79% of decided matches).
  - Aggression matters a little (about 57%).
  - Bowling choice, bowling plan, field and bowler skill make no measurable difference under `synthetic-alpha-01`.
