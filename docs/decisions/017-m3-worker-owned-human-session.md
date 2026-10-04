# ADR 017: Worker-owned manual T20 exhibition

Status: implemented; human acceptance remains a separate release gate.

The Pass 07B engine, rules, model, conditional delivery stage, event-chain protocol and original 160-player world remain byte-identical. One module Web Worker owns one validated `LC_T20_MATCH_V1` session. The page holds received public projections and unsubmitted form drafts, never an authoritative match reducer or random service.

The additive `LC_T20_UI_V1` boundary validates strict, revisioned BOOT, START, COMMAND and VERIFY requests. A request ID cannot be reused with different content. Successful duplicate requests return their original receipt projection. Revision mismatch or invalid engine commands leave the session unchanged. Only one UI request is in flight. Build pins are checked against the worker execution manifest and again by the page.

A cryptographically generated match seed is created inside the production worker and never sent to the page, persisted, displayed or included in error diagnostics. The public projection deliberately selects known fields rather than serialising a session/setup object. Worker errors omit request contents, validation input values and stacks. This is an information boundary for the UI, not a defence against an owner using developer tools to inspect their own browser memory.

Both sides are manually controlled. Suggested starting XIs are static pre-match form defaults. They do not select match decisions. No fixture autopilot or tactical captain AI runs in the production UI. Team-specific actions use USER:<teamId>. The inherited API requires SYSTEM for CONFIRM_TEAMS and ADVANCE; the adapter retains these exact commands while recording a separate HUMAN origin audit. Page messages cannot choose AI actors or fixture injection. The existing fixture runner is unchanged and remains test-only.

Scores and commentary come from accepted engine events and their authoritative reducers. Display density, commentary verbosity and text scale do not enter the engine protocol. Final verification replays the complete event chain, compares scorecards, then resimulates the original accepted commands byte-for-byte inside the worker. Only verification hashes and counts are returned.

The stock variation is the only implemented variation and has a visible disabled explanation. Invalid fields are rejected visibly with no optimistic update. Batter/bowler eligibility is displayed with disabled reasons and still enforced by the engine. Completing an over stops at every manual decision; the completed match rejects further deliveries.

No durability is claimed. Save is disabled, no IndexedDB is used, and closing/reloading loses this session. A worker failure disables further actions and explains that a new match is required. M4 remains responsible for atomic persistence and crash recovery. No seed/import/export hooks were added to the UI.

The historical engineering shell is retained at /engineering.html to preserve its contract smoke test. It is explicitly labelled as a historical shell; the normal application entry point is the interactive exhibition. Legacy batch status remains scoped to the inherited headless binary, not a claim about the new web UI.
