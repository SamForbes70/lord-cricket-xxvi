# Capability matrix: Pass 12G-R / M6G

| Capability | Status and boundary |
| --- | --- |
| T20 / ODI / five-day red-ball engines | Inherited and regression-tested; frozen core implementations unchanged |
| Fictional world | Frozen `fictional-eight-01`, 160 players, 8 teams, 8 grounds |
| T20 competition | 14 rounds, 56 fixtures, fixed schedule |
| New career | Implemented, one selected managed team and one season |
| Home / Career | Implemented |
| Squad | Implemented with availability, fatigue, readiness and training |
| Fixtures | Implemented for all 56 fixtures, managed fixtures identified |
| Statistics | Authoritative Pass 12E table, NRR, player stats and leaders |
| Settings | Text scale, density, reduced motion, season export/import |
| Training/readiness | Pass 12C semantics, temporary only, no permanent attribute growth |
| Off-screen matches | Pass 12D shared `LC_T20_MATCH_V1` execution |
| Managed simulated match | Implemented through the same shared engine and canonical completion path |
| Managed interactive match | Integrated with existing T20 UI using scheduled fixture seed/ground/XI and `USER_MATCH` completion boundary |
| Opponent tactical captain AI | Not implemented; deterministic baseline fixture captain remains explicit |
| Career progression | Explicit commands; progression stops before the managed fixture |
| Durable local season save | Existing Pass 12F IndexedDB repository, writer lease, revisions and rotating checkpoints |
| Recovery | Newest-valid checkpoint design inherited; damaged generation preserved |
| Portable season archive | Existing `.lcxxvi` format retained |
| Final season archive | Immutable after exactly 56 reconciled fixtures |
| Headless full-season acceptance | PASS: 14 rounds, 56 unique completions, 56 condition applications, projection rebuild and portable round-trip |
| Application-service tests | PASS in Node with repository test double |
| Inherited unit suite | PASS: 500 tests across 23 files |
| Browser IndexedDB / management acceptance | BLOCKED by host `ERR_BLOCKED_BY_ADMINISTRATOR` before application code executes |
| M3 human match acceptance | Pending, separate gate |
| Limited-overs DLS | Disabled |
| Multiyear career / transfers / contracts / finances / youth / international management | Not implemented by design |
| Model status | `SYNTHETIC_ALPHA`, no empirical-realism claim |
