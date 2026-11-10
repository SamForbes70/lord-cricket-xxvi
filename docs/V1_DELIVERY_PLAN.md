# Lord Cricket XXVI: Version 1.0 delivery plan

## Purpose

Version 1.0 is a finished cricket management game, with a persistent world and credible match decisions.
The current V0.1 target is a fictional, single-season synthetic alpha. It is not the full V1.0 game.
The [V0.1 backlog](V01_BACKLOG.json) retains its own acceptance criteria and remains the immediate delivery queue.

## Evidence boundary

The 19e15de baseline passed 687 local unit tests and a 56-fixture season acceptance.
Sam reported a successful match and save/reload on the 19e15de Windows package.
He later reported that the 852a3dc Windows package tested well, without specifying the actions.
See [the baseline audit](BASELINE_AUDIT_2026-11-10.md) for the exact evidence and limitations.
Do not infer current-head or owner-PC results from earlier runs.
A synthetic model is not an empirically validated model.

## Release sequence

### Gate 1: Reliable V0.1

- Complete V01-011 through V01-029 or record an explicit scope decision.
- Preserve an active match across management navigation and a fresh browser session.
- Verify save, recovery, archive import, replay and final season records.
- Complete the supported tactical controls, format-specific opponent decisions and synthetic quality gates.
- Run the accessibility and reference-hardware gates on recorded environments.
- Produce a versioned package from the tested revision and document unsupported rules.

### Gate 2: Persistent management beta

- Add a versioned world state and a multi-year calendar.
- Roll seasons forward without losing match, player and competition history.
- Add ageing, development, fatigue, injury, retirement and generated youth.
- Implement contracts, renewals, transfers, squad registration and budgets.
- Provide equivalent legal squad management for opposition teams.
- Run long-horizon simulations for player supply, finances and record consistency.
- Test upgrade and recovery from prior supported save versions.

### Gate 3: Cricket world and competition coverage

- Support first-class, List A and T20 domestic competitions and international fixtures.
- Model competition structures, qualification, scheduling and player availability.
- Support distinct domestic and international management roles and format responsibilities.
- Define a content pipeline for teams, grounds, players and competition rules.
- Record dataset provenance, distribution rights, attribution, validation and versions.
- Use fictional or otherwise authorised content where real-world rights are unresolved.
- Validate imports without changing historical save identities.

### Gate 4: Simulation and rules

- Specify versioned playing conditions for each supported format and competition.
- Verify scoring, dismissals, extras, innings closure and edge cases against reference fixtures.
- Implement rain and interruptions; label a method DLS only if the authorised method is available and verified.
- Use separate training, development and untouched evaluation cohorts for empirical model candidates.
- Evaluate score distributions, wicket rates, phase behaviour, chases, player uncertainty and tactical trade-offs.
- Publish model cards and retain old engine and model versions for supported saves.
- Keep empirical model promotion subject to the existing separate approval.

### Gate 5: Product depth and presentation

- Complete event-derived match, player, series and career statistics.
- Provide scorecards, commentary, worms, partnerships, wagon wheels and supported pitch maps.
- Complete player, contract, team, kit, emblem and competition editing.
- Validate custom content and define its effect on existing and new careers.
- Resolve the requested 3D presentation scope before claiming it is delivered.
- Conduct usability, keyboard, zoom, screen reader and performance acceptance.

### Gate 6: Release candidate and Version 1.0

- Freeze a versioned release candidate and test the exact distributable.
- Verify installation, updates, offline operation, backup, recovery and migration on supported platforms.
- Complete security, dependency, licensing and privacy reviews.
- Publish a capability matrix, known issues, player guide and support process.
- Reconcile all advertised features against acceptance evidence.
- Record the release decision. Public deployment requires its separate authorisation.

## Immediate execution order

1. Integrate reviewed V0.1 branches only after their current-head and current-base checks pass.
2. Complete durable managed-match recovery, including a fresh browser session and result handoff.
3. Deliver the remaining V0.1 career archives, opposition and release gates.
4. Implement a multi-season world as the first V1.0 management slice.
5. Expand competitions, content, simulation, editing and release operations through the gates above.

## Planning limits

The project has no verified V1.0 completion date or resourcing estimate.
Size the remaining slices after the current branch integrations and acceptance results.
Forecast using observed throughput, test duration, available specialist review and content rights.
