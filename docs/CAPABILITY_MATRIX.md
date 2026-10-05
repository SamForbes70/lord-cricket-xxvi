# Capability matrix: Pass 12F / M6F

| Capability | Status and boundary |
| --- | --- |
| T20/ODI/red-ball match engines | Inherited unchanged from Pass 11 |
| M4 match persistence | Inherited; match-save listing remains compatible with additive season records |
| Fictional world | Frozen `fictional-eight-01`, 160 players / 8 teams / 8 grounds |
| T20 competition | `LC_T20_LEAGUE_01`, 14 rounds / 56 fixtures |
| Career condition/availability | Pass 12B |
| Training/readiness | Pass 12C; temporary only, no attribute growth |
| Off-screen fixture execution | Pass 12D, same `LC_T20_MATCH_V1` engine |
| League table and player projections | Pass 12E |
| Durable season aggregate | `LC_T20_SEASON_STATE_V1` implemented |
| Atomic season commits | Existing IndexedDB stores + writer lease + revision check; one transaction writes snapshot, command and projection |
| Rolling recovery | Three generations; newest valid checkpoint selected; corrupt generation preserved |
| Duplicate command safety | Same command ID cannot create another durable transition; conflicts rejected |
| Portable season save | `.lcxxvi` ZIP with manifest, canonical state, completion journal and projection |
| Complete season archive | `LC_T20_SEASON_ARCHIVE_V1`, immutable and allowed only after 56 reconciled fixtures |
| Import validation | Size/path/CRC/file-hash checks plus season/schedule/career hash validation and completion reconciliation |
| Projection rebuild evidence | Final projection rebuilt exactly from all 56 canonical completion records |
| Managed-fixture pause/resume | State valid immediately before managed fixture and after `USER_MATCH` completion |
| Resume and advance | Portable active save reloads and advances into next round without duplicate match-condition IDs |
| Fresh browser IndexedDB gate | Test source/bundle implemented; execution BLOCKED on current host before navigable origin loads |
| Management UI/navigation | Deferred to Pass 12G |
| Full human season acceptance | Deferred to Pass 12G |
| Tactical captain AI | Deferred to M7; baseline fixture captain remains explicit |
| Limited-overs DLS | Disabled |
| Model status | `SYNTHETIC_ALPHA` |
