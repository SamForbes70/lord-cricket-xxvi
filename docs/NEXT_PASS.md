# Next pass: Pass 11 / M5B red-ball exhibition and match clock

Entry condition: retain all accepted T20, ODI, deterministic replay and M4 durability gates. Keep the ODI custom profile and its machine-readable edge corpus frozen unless a documented defect requires a versioned correction.

Bounded objective: implement the `LC_RED5_01` five-day exhibition profile as a separate match state machine using the existing scorer, deterministic random service, conditional delivery generator, event-chain/replay model and persistence framework. Add two innings per team, session and day clocks, lunch, tea and stumps, declarations between deliveries, optional follow-on at a 200-run first-innings lead, new-ball availability after 480 legal balls, red-ball weather/lost-time handling and the documented final-hour rule.

Build an independent red-ball clock and rules corpus before enabling the profile in the browser. Do not add league management, contracts, transfers, DLS, tactical captain AI or empirical calibration in M5B.
