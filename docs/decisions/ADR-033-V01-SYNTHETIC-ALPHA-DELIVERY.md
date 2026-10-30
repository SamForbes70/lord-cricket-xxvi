# ADR-033: autonomous V0.1 synthetic-alpha delivery

Status: adopted under the owner's standing brief, 30 October 2026.

## Decision

The delivery target is the original bounded V0.1 synthetic alpha.
The empirical M7K research track runs separately from ordinary product development.
Missing empirical data does not block unrelated UI, analytics, persistence or release-engineering work.

The original design permits a visibly labelled `SYNTHETIC_ALPHA` release.
Such a release still requires supported rules, deterministic replay, synthetic quality checks and release acceptance.
It cannot claim real-cricket calibration or complete ICC conformity.
M7K historical and untouched-cohort gates remain required for the corresponding research and promotion claims.

## Existing design boundaries retained

Limited-overs rain stays disabled until the verified DLS gate passes.
Prediction remains optional; super overs, injuries and DRS retain their existing disabled boundaries.
Multiyear careers, contracts, finances, youth systems and international management remain outside V0.1.
Appendix G's disabled model effects stay disabled until a versioned implementation and its gates exist.

No existing enabled capability or required V0.1 feature is removed by this decision.
The current T20 heuristic captain remains an implemented baseline, with tactical quality still requiring validation.
Sector bars and worm tables remain partial presentations; the queue retains the intended chart work.
Editing and roster import remain required product work with immutable historical snapshots.

## Release gate and authority

Product code must preserve supported historical saves and frozen versions.
New behaviour that changes results needs a separate version and compatibility tests.
Research-model promotion and public deployment require separate owner approval.
Reference-hardware, accessibility and release acceptance remain explicit gates.
A green test suite does not supply missing human observations or qualifying hardware measurements.

## Consequence

The next product slice is player pages and pitch inspection in batch 2.
The queue continues through match controls, analytics, career usability, opposition, weather and release engineering.
External evidence stays in a separate blocked track rather than becoming the only development queue.
