# ADR 027: Pass 12G-R management application orchestration

## Status
Accepted for Pass 12G-R implementation.

## Decision
Use a single `CareerApplicationService` as the application boundary between React and the accepted Pass 12A-F domain/persistence systems. The service owns orchestration and durable command boundaries; it does not create an alternate simulator, league table, statistics store, fatigue model or database.

Interactive scheduled fixtures reuse the existing `LC_T20_MATCH_V1` controller. Two small functions are exported from the accepted off-screen fixture module so both fixture autopilot and interactive career matches share the exact XI-selection and completed-session condition-delta logic. No probability, scoring or match-engine coefficients are changed.

The management UI is modularised under `apps/web/src/career/` rather than extending the existing match `main.tsx` with authoritative career logic.

## Consequences

- The career UI cannot diverge from canonical season projection or career condition state.
- Managed simulated and played matches converge at one canonical completion ledger.
- A duplicate or tampered interactive match result is rejected before season mutation.
- Browser-local IndexedDB remains the only authoritative persistence implementation.
- Tactical captain AI remains explicitly out of scope for this pass.
