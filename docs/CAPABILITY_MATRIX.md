# Capability matrix: Pass 13 M7A on Pass 12G-R

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
| Tactical captain AI | Additive deterministic public-view policy and fully autonomous T20 batch adapter tested; NOT yet opponent controlled in playable UI. Pass 12D fixture captain unchanged |
| Career progression | Explicit commands; progression stops before the managed fixture |
| Durable local season save | Existing Pass 12F IndexedDB repository, writer lease, revisions and rotating checkpoints |
| Recovery | Newest-valid checkpoint design inherited; damaged generation preserved |
| Portable season archive | Existing `.lcxxvi` format retained |
| Final season archive | Immutable after exactly 56 reconciled fixtures |
| Headless full-season acceptance | PASS: 14 rounds, 56 unique completions, 56 condition applications, projection rebuild and portable round-trip |
| Application-service tests | PASS in Node with repository test double |
| Inherited unit suite | PASS 507/507 tests across 24 files in two resource-controlled shards (497 and 10). Combined resource-contentious execution timed out, sharded acceptance is green |
| Browser IndexedDB / management acceptance | BLOCKED by host `ERR_BLOCKED_BY_ADMINISTRATOR` before application code executes |
| M3 human match acceptance | Pending, separate gate |
| Limited-overs DLS | Disabled |
| Multiyear career / transfers / contracts / finances / youth / international management | Not implemented by design |
| Match analytics | New T20 event-derived Manhattan, worm, partnerships, eight shot sectors; completed-match display wired. Browser acceptance blocked |
| M7 quality diagnostic | 64 seeded matches, 128 innings; 84.875 mean runs; empirical validation pending |
| Performance diagnostic | Node match p95 479.93 ms, environment-specific; reference browser/56-match/save/load budgets not accepted |
| Model status | `SYNTHETIC_ALPHA`, no empirical-realism claim |
