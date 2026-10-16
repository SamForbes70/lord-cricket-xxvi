# ADR-031: M7I empirical outcome exceptions and promotion boundary

Status: ACCEPTED FOR RESEARCH TOOLING ONLY, 2026-10-16.

## Decision

1. Retain every exceptional real Cricsheet delivery as a source-addressed, machine-auditable exception, not a forced normal scoring resolution. Preserve source SHA-256 and the exact named reason.
2. Do not extend the normative scorer or accepted probability generator in this pass. The existing `validateDeliveryResolution` explicitly rejects penalties and non-standard no-ball channel counts. `DeliveryRecorded` represents one dismissal per delivery. Observed Cricsheet multi-wicket rows and retirements cannot simply be converted without a versioned, independently reviewed rule contract. Wicket-end, completed-runs and fielders require evidence absent from the source for some events.
3. The matched second-innings cohort retains **33 exceptional attempted deliveries** from M7H. The new broader M7I register additionally audits the first innings, for 69 exceptions across both innings. Those denominators differ from M7H's 33, and are not a sudden increase in unsupported second-innings events.
4. Use the same frozen training/development split and frozen M7G/M7H probability models. No re-fitting, no model coefficient changes, no gameplay model replacement. Previously inspected development data is **not** an untouched future evaluation set.
5. Measure generalisation using Cricsheet registry people IDs, fixed historical 300-attempt shrinkage, and stratification by opponent exposure, date, competition. These are observational associations and cannot establish intrinsic skill/tactical causation.
6. Diagnose chase P10 by training-defined target tertiles and innings termination; no tuning against the already inspected development cohort. Record future independent test requirement.

## Consequences

- Exceptional scoring events remain not supported by the research sampler. Do not claim 100% event coverage.
- For a future scorer model version, make independent hand-authored fixtures for penalty awards, retired-out administration, legal no-ball values, multi-wicket bookkeeping and boundary-overthrow combinations before touching production contracts. Validate cricket law and Cricsheet encoding separately.
- Future probability packs must use explicit model IDs and retain `synthetic-alpha-01` for historical save/replay compatibility.
- Playwright browser acceptance is environment-dependent and remains an independent gate.

Cricsheet data attribution: https://cricsheet.org/ ; ODC-By 1.0 https://cricsheet.org/licensing/ . Source archive is not redistributed.
