# ADR 030: M7H two-innings and player-history research boundaries

**Status:** ACCEPTED for OFFLINE RESEARCH ONLY, not gameplay promotion.

## Context

M7G fits scorer-compatible first-innings components using five latent scoring regimes but cannot evaluate target-driven second-innings outcomes. The available Cricsheet data records player identities and delivery results, but not Lord Cricket captain commands, shot physics, executed length or sufficient fielding/wicket-end facts. The M7G development holdout is already inspected and is no longer a pristine final evaluation set.

## Decision

1. Preserve all original match/probability/rules/RNG, season and persistence code byte-identically. Introduce a separate Python `LC_T20_CHASE_COMPONENTS_RESEARCH_V1` fitted from training matches only, with innings-two phase, wickets and *observable pre-delivery* required-rate buckets. Fitted five-tempo mixture labels derive only from completed **training** innings. Heldout scoring integrates latent likelihood sequentially without retrospective innings classification.
2. Simulate an independent first innings with the unchanged M7G research pack; feed its total + 1 as the chase target and terminate on target reached, all out or 120 legal balls. Holdout references explicitly exclude irregular/abandoned second innings, with exclusion counts. Continue to expose unseen heldout category failures and rare unsupported scoring events.
3. Validate every fitted second-innings category through the unchanged scorer using a research-only TypeScript adapter. Presentation-only unknown facts are explicitly tagged synthetic, not observations. Cross-language deterministic draw vectors and SHA-256 pack verification protect the offline research pack.
4. Resolve Cricsheet player names using `registry.people` stable person IDs, tally training exposure, and report the proportion of heldout delivery attempts covered by adequately exposed players. Evaluate *predictive binary marginals* from fixed 300-attempt shrinkage, not causal player skill or gameplay attributes. No observed tactical controls exist in these records, so captain strategy cannot be empirically calibrated from them.
5. Never attach either model to `LC_T20_MATCH_V1` or label them `EMPIRICALLY_VALIDATED`. New pack has `gameplayIntegrationPermitted=false`. The existing `synthetic-alpha-01` and save/version manifest remain accepted and unchanged.

## Consequences

Research reproduces target-driven innings and measured player-history gains, but the lower score tail fails. Rare legal outcomes, mixed cohort confounding, absent tactical inputs, new untouched forward-time testing, full gameplay replay/browser acceptance and actual performance benchmarks still block promotion. No silent corrections to old saves or coefficients are allowed.
