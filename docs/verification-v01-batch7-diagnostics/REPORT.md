# V0.1 Synthetic Quality Gates and Release-Scale Diagnostics (V01-024 and V01-025)

Generated via `node scripts/run-v01-batch7-gates.mjs` with structured output in `docs/verification-v01-batch7-diagnostics/results.json`.

Model status: **`SYNTHETIC_ALPHA` (`synthetic-alpha-01`)**. `empiricallyCalibrated: false`. Zero frozen scoring coefficients were modified and zero empirical-realism claims are made.

## 1. Synthetic Gameplay Quality Gates (`V01-024`)

Paired common-random-number sweeps (`n = 600` deliveries per cell across `T20`, `ODI`, and `RED_BALL`) verified directional sensitivity without modifying `synthetic-alpha-01`:

- **Batting skill (`82` vs `38` against `50` bowling)**:
  - `T20`: `105.83` vs `69.33` runs per `100` balls; `4.67` vs `6.17` dismissals per `100` balls.
  - `ODI`: `92.67` vs `56.50` runs per `100` balls; `4.00` vs `5.50` dismissals per `100` balls.
  - `RED_BALL`: `79.17` vs `46.00` runs per `100` balls; `2.33` vs `5.33` dismissals per `100` balls.
- **Bowling skill (`82` vs `38` against `55` batting)**:
  - Higher bowling skill consistently increased dismissal rates (`T20`: `5.83 > 5.17`; `ODI`: `5.00 > 4.67`; `RED_BALL`: `4.67 > 4.00` per `100` balls) and dot-ball share (`T20`: `63.00% > 60.17%`; `ODI`: `66.83% > 65.17%`; `RED_BALL`: `69.67% > 67.17%`). In `RED_BALL` at `n = 600` balls, raw runs per `100` deliveries were within single-boundary sampling noise (`58.00` vs `57.83`) because higher-skill attacking edges produced slightly more `4`s alongside `17%` higher wicket-taking.
- **Pitch assistance (`8200` vs `2800` seam and turn)** and **field geometry (`close attacking` vs `boundary defensive`)**:
  - Boundary-protective rings cut boundary percentage across all three formats (`T20`: `13.33% < 16.17%`; `ODI`: `9.33% < 11.50%`; `RED_BALL`: `7.17% < 7.83%`) and cut run rates across all three formats.
- **Degenerate-strategy exploitation gates (`12` paired default-world T20 fixtures across `8` teams and `8` grounds)**:
  - `EXPLOIT_ALWAYS_SLOG_4` elevated mean wickets lost (`9.50` vs `7.83` baseline; `8/12` all-out collapses vs `3/12`) and depressed mean first-innings runs (`85.83` vs `92.83`).
  - `EXPLOIT_ALWAYS_DEFEND_0` depressed mean first-innings runs (`74.08` vs `91.17` tactical captain).
  - Low-scoring baseline (`92.83` runs in `20` overs under `LC_FIXTURE_CAPTAIN_V1`) is explained by static `aggression = 2` throughout death overs under `synthetic-alpha-01` priors.

## 2. Cross-Format Replay (`300` Matches) and Release-Scale Diagnostics (`30,000` Innings, `V01-025`)

### Event-chain replay and independent resimulation (`100` full matches per format)

| Format | Matches | Replay passed | Resimulation passed | Accepted events | Stopping breakdown |
| --- | --- | --- | --- | --- | --- |
| `T20` | `100` | `100 / 100` | `100 / 100` | `32,798` | `WIN: 97`, `TIE: 3` |
| `ODI` | `100` | `100 / 100` | `100 / 100` | `49,962` | `WIN: 100` |
| `RED_BALL` | `100` | `100 / 100` | `100 / 100` | `109,410` | `WIN:TARGET_REACHED: 46`, `WIN:CHASE_COMPLETE_SHORT: 52`, `WIN:INNINGS_VICTORY: 2` |

### Reproducible `10,000`-innings Monte Carlo distributions per format (`seedPrefix = LC_V01_025_MC10K`)

| Format | Simulations | Mean runs (`95% CI`) | Mean wickets (`95% CI`) | Early / Middle / Late runs | Tails (`p05 / p50 / p95`) | All-out vs cap | Summary SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `T20` | `10,000` | `99.53` (`[99.09, 99.97]`) | `7.60` (`[7.56, 7.64]`) | `32.06 / 43.73 / 23.74` | `60 / 101 / 135` | `2,706 / 7,294` | `492dbfd6...724b35` |
| `ODI` | `10,000` | `136.76` (`[135.84, 137.68]`) | `9.94` (`[9.93, 9.94]`) | `43.92 / 87.00 / 5.84` | `66 / 133 / 221` | `9,650 / 350` | `94276910...0e3a86` |
| `RED_BALL` | `10,000` | `166.65` (`[165.51, 167.79]`) | `9.96` (`[9.95, 9.97]`) | `91.95 / 67.46 / 7.23` | `82 / 160 / 273` | `9,822 / 178` | `46545bc1...212224` |
