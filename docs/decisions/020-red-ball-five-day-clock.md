# ADR 020: Five-day red-ball exhibition as a separate event-sourced match clock

## Status

Accepted for Pass 11 / M5B.

## Decision

Implement `LC_RED5_01` beside the accepted T20 and ODI engines rather than generalising the limited-overs orchestration in place. Red-ball receives distinct setup, match, event-chain, condition and scorecard identifiers while reusing the accepted scorer, deterministic random service, integer probability model, conditional delivery generator, frozen fictional world and M4 durable command boundary.

The red-ball engine stores innings order explicitly and permits up to four innings. It supports declaration between deliveries, a follow-on decision when the first-innings lead reaches 200 runs, `A,B,B,A` innings order when the follow-on is enforced, and a new ball after 480 legal balls of the current ball. Red-ball does not create a free hit after a no-ball.

The match clock is engine state, not UI state. The custom profile starts each day at 11:00, defers lunch and tea to an over boundary, completes an over already started at scheduled close, and applies a ten-minute innings interval that replaces rather than stacks with a coincident meal. Days one to four may continue to 18:30 while pursuing 90 legal overs. Day five activates the documented final-hour obligation at 17:00 and ends only when both scheduled time and the remaining legal-ball obligation are satisfied, unless a result occurs first. Final-hour rain delay reduces the obligation by six balls per complete four lost minutes.

Red-ball lost time is represented by a deterministic `ADD_RAIN_DELAY` system command. Pass 11 validates clock consequences and persistence of such delays but does not activate a stochastic weather scheduler or claim calibrated weather effects. Limited-overs DLS remains disabled.

All state transitions are event-sourced. A saved red-ball match is revalidated from the frozen setup and rehydrated by accepted command replay. Portable archives are accepted only for the explicit `LC_RED5_MATCH_V1` / `LC_RED5_EVENT_CHAIN_V1` / `LC_RED5_01` pin set.

The shared UI protocol remains `LC_T20_UI_V2` for persisted-request compatibility. `START.format` and the public view now include `RED_BALL`; format-specific commands are validated by the worker/controller boundary.

## Consequences

T20 and ODI deterministic regressions remain release gates. Red-ball can evolve under its own engine and event-chain identifiers without silently changing old saves. The implementation deliberately keeps a separate red-ball orchestration module because clock, declarations, follow-on and four-innings arbitration are materially different from limited-overs cricket.

The profile is a documented Lord Cricket XXVI simulation profile, not a claim of complete ICC Test-match conformity. Automatic weather scheduling, tactical opponent AI, empirical calibration and management/career systems remain separate capabilities.
