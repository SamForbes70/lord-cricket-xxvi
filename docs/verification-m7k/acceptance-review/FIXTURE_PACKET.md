# Reviewed historical fixture packets

The runner accepts `LC_M7K_REVIEWED_FIXTURE_PACKET_V1` with a non-empty `fixtures` array.
Each entry follows `HistoricalFixtureSchema` in `scripts/research/m7k-historical-fixture.ts`.

The schema requires source identities, a review, a zero-state research seed, ordered commands and complete expected prefixes.
Historical incidents with non-zero prior scores require the preceding accepted commands; synthetic distributions cannot supply missing historical player credits.

The review contains a named reviewer, an ISO timestamp, source references, a conditions reference and ordered chronology.
Its five confirmation fields cover chronology, conditions, credits, physical ends and the next action.
A blank reference or a false confirmation rejects the packet.

Each expected prefix includes totals, all batter and bowler credits, extras, dismissals, penalties, ends, free-hit state and next action.
`SnapshotSchema` defines the exact fields.
The runner compares complete snapshots, so omitted players and incorrect attribution reject even when team totals agree.

The command is:

```sh
node --import tsx scripts/m7k-verify-historical-fixtures.ts --fixtures=/path/to/reviewed-packet.json --out=/path/to/new-report.json
```

The output path must be new.
The runner validates every fixture before publishing one report.
It records input hashes and leaves gameplay integration disabled.
A mechanical pass does not authenticate a reviewer's identity or establish facts absent from the cited evidence.
