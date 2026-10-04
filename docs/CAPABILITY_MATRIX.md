# Capability matrix: Pass 09 / M4

| Capability | Status and boundary |
| --- | --- |
| M0 approved world | Original 160 players, 8 squads, 8 grounds; unchanged gameplay data |
| M1 scorer | Inherited supported scoring rules; unchanged |
| M2 match engine | `LC_T20_MATCH_V1`; unchanged rules/model/stage and `LC_T20_EVENT_CHAIN_V1` |
| M3 manual browser exhibition | Implemented automated capability; formal human acceptance record remains pending |
| UI authority | One worker; strict revisioned HUMAN requests; seed never returned in public views |
| M4 atomic persistence | Implemented with IndexedDB command-batch commits and durable acknowledgement |
| Autosave/resume | Implemented for every accepted manual setup/command; reload restores last durable revision |
| Checkpoints/recovery | Three rolling generations; bad newest checksum recovers an older valid generation into a new save while preserving the damaged source |
| Multi-tab writer safety | One writer lease; additional tab is read-only; storage revision is checked transactionally |
| Manual saves | Local copy slots implemented |
| Portable saves | `.lcxxvi` ZIP export/import implemented with staged validation, hashes, size/path/file-count checks and version pins |
| Save rehydration | Stored core is not trusted; setup is revalidated and command history resimulated before hash/state comparison |
| Tactical opponent AI | Unavailable; both teams are controlled manually |
| Variation | Stock only |
| M5 other formats | Deferred |
| M6 league/training | Deferred |
| M7 tactical AI/calibration | Deferred; SYNTHETIC_ALPHA |
| DLS, empirical realism, certified ICC rules | Disabled/unclaimed |
| Sam Forbes 161-player fantasy pack | Not included; later explicit opt-in pack with version/hash required |
