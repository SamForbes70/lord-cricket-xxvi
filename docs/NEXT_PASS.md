# Next pass: Pass 12G / M6G management UI and full-season acceptance

Entry condition: retain the frozen Pass 12A schedule, Pass 12B/12C career state, Pass 12D shared-engine fixture execution, Pass 12E season projection and Pass 12F durable `LC_T20_SEASON_STATE_V1` persistence/archive.

Bounded objective: expose the first complete management-season loop to a user. Add Home/Career/Squad/Fixtures/Statistics navigation for the single fictional T20 season; choose the controlled team; inspect condition/readiness and training; advance days/rounds; stop before the user's match; launch that match through the existing T20 UI; commit its shared `USER_MATCH` completion; simulate remaining fixtures; show table/leaders; autosave after each accepted management action; resume after reload; and finish on the immutable season archive screen.

Required gates: one complete 14-round / 56-match career from new game to archive; save/reload at round boundaries and immediately before/after the managed fixture; no duplicated fixture, fatigue, projection or stat after reload; keyboard navigation and 150% scale for management routes; export/delete/import of an active and completed season; final table/archive identical to a deterministic headless oracle; and a human acceptance checklist.

Do not add second-year careers, transfers, contracts, youth, injuries, DLS, real players or M7 tactical AI in the same pass.
