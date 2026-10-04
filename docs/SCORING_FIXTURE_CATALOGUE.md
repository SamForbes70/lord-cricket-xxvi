# Pass 02 fixture catalogue

All expected values are reference specifications. Delivery input validators, LC_SCORING_V1 and innings ledger reducers now execute; terminal aggregate, clock, storage and NRR engines do not.

| ID        | Category   | Scenario                                                 | Evidence in Pass 02                           |
| --------- | ---------- | -------------------------------------------------------- | --------------------------------------------- |
| F01       | deliveries | Wide at five legal balls                                 | Scorer/reducer comparison + fixture audit     |
| F02       | deliveries | No-ball hit for four                                     | Scorer/reducer comparison + fixture audit     |
| F03       | deliveries | No-ball with two byes                                    | Scorer/reducer comparison + fixture audit     |
| F04       | deliveries | Single on sixth legal ball                               | Scorer/reducer comparison + fixture audit     |
| F05       | deliveries | Striker caught on sixth ball                             | Scorer/reducer comparison + fixture audit     |
| F06       | deliveries | Free hit followed by wide                                | Scorer/reducer comparison + fixture audit     |
| F07       | deliveries | Winning automatic wide                                   | Scorer/reducer comparison + fixture audit     |
| F08       | deliveries | Two needed, legal six                                    | Scorer/reducer comparison + fixture audit     |
| F09       | deliveries | All out level in chase                                   | Scorer/reducer comparison + fixture audit     |
| RO1       | deliveries | Run-out after one completed run, attempting second       | Scorer/reducer comparison + fixture audit     |
| RO1-SIXTH | deliveries | Run-out after one completed run, attempting second       | Scorer/reducer comparison + fixture audit     |
| RO2       | deliveries | Run-out after one completed run, attempting second       | Scorer/reducer comparison + fixture audit     |
| RO2-SIXTH | deliveries | Run-out after one completed run, attempting second       | Scorer/reducer comparison + fixture audit     |
| RO3       | deliveries | Run-out after one completed run, attempting second       | Scorer/reducer comparison + fixture audit     |
| RO3-SIXTH | deliveries | Run-out after one completed run, attempting second       | Scorer/reducer comparison + fixture audit     |
| RO4       | deliveries | Run-out after one completed run, attempting second       | Scorer/reducer comparison + fixture audit     |
| RO4-SIXTH | deliveries | Run-out after one completed run, attempting second       | Scorer/reducer comparison + fixture audit     |
| S01       | deliveries | Legal dot                                                | Scorer/reducer comparison + fixture audit     |
| S02       | deliveries | Two bat runs                                             | Scorer/reducer comparison + fixture audit     |
| S03       | deliveries | Single bye                                               | Scorer/reducer comparison + fixture audit     |
| S04       | deliveries | Four leg-byes                                            | Scorer/reducer comparison + fixture audit     |
| S05       | deliveries | Wide boundary                                            | Scorer/reducer comparison + fixture audit     |
| S06       | deliveries | Free hit followed by another no-ball                     | Scorer/reducer comparison + fixture audit     |
| S07       | deliveries | Free-hit aerial ball stopped                             | Scorer/reducer comparison + fixture audit     |
| S08       | deliveries | Early dead ball                                          | Scorer/reducer comparison + fixture audit     |
| S09       | deliveries | Caught and bowled                                        | Scorer/reducer comparison + fixture audit     |
| S10       | deliveries | STUMPED on a wide                                        | Scorer/reducer comparison + fixture audit     |
| S11       | deliveries | HIT_WICKET on a wide                                     | Scorer/reducer comparison + fixture audit     |
| S12       | deliveries | Winning automatic no-ball                                | Scorer/reducer comparison + fixture audit     |
| S13       | deliveries | Red-ball no-ball                                         | Scorer/reducer comparison + fixture audit     |
| S14       | deliveries | Target reached on final allocated ball                   | Scorer/reducer comparison + fixture audit     |
| S15       | deliveries | Legal BOWLED                                             | Scorer/reducer comparison + fixture audit     |
| S16       | deliveries | Legal LBW                                                | Scorer/reducer comparison + fixture audit     |
| S17       | deliveries | Legal HIT_WICKET                                         | Scorer/reducer comparison + fixture audit     |
| S18       | deliveries | Run-out on a free hit                                    | Scorer/reducer comparison + fixture audit     |
| S19       | deliveries | First innings allocation exhausted                       | Scorer/reducer comparison + fixture audit     |
| S20       | deliveries | Legal four                                               | Scorer/reducer comparison + fixture audit     |
| S21       | deliveries | Single leg-bye                                           | Scorer/reducer comparison + fixture audit     |
| S22       | deliveries | Wide plus completed single                               | Scorer/reducer comparison + fixture audit     |
| S23       | deliveries | No-ball and single off bat                               | Scorer/reducer comparison + fixture audit     |
| S24       | deliveries | No-ball and two leg-byes                                 | Scorer/reducer comparison + fixture audit     |
| S25       | deliveries | No-ball run-out after one completed bat run              | Scorer/reducer comparison + fixture audit     |
| S26       | deliveries | Wide run-out after one completed run                     | Scorer/reducer comparison + fixture audit     |
| S27       | deliveries | ODI delivered no-ball                                    | Scorer/reducer comparison + fixture audit     |
| S28       | deliveries | Three completed bat runs                                 | Scorer/reducer comparison + fixture audit     |
| I01       | invalid    | Wide and no-ball together                                | Scorer/reducer comparison + fixture audit     |
| I02       | invalid    | Bat runs and byes together                               | Scorer/reducer comparison + fixture audit     |
| I03       | invalid    | Byes and leg-byes together                               | Scorer/reducer comparison + fixture audit     |
| I04       | invalid    | Leg-bye without attempted stroke                         | Scorer/reducer comparison + fixture audit     |
| I05       | invalid    | Caught on no-ball                                        | Scorer/reducer comparison + fixture audit     |
| I06       | invalid    | Bowled on free hit                                       | Scorer/reducer comparison + fixture audit     |
| I07       | invalid    | LBW on wide                                              | Scorer/reducer comparison + fixture audit     |
| I08       | invalid    | Non-striker caught                                       | Scorer/reducer comparison + fixture audit     |
| I09       | invalid    | Run-out receives unknown fielder                         | Scorer/reducer comparison + fixture audit     |
| I10       | invalid    | Boundary with physical running                           | Scorer/reducer comparison + fixture audit     |
| I11       | invalid    | No-ball automatic run incorrectly swaps ends             | Scorer/reducer comparison + fixture audit     |
| I12       | invalid    | Duplicate starting batters                               | Scorer/reducer comparison + fixture audit     |
| I13       | invalid    | Dead ball scores                                         | Scorer/reducer comparison + fixture audit     |
| I14       | invalid    | Penalty scoring reserved                                 | Scorer/reducer comparison + fixture audit     |
| I15       | invalid    | Negative run count                                       | Scorer/reducer comparison + fixture audit     |
| I16       | invalid    | Fractional physical run count                            | Scorer/reducer comparison + fixture audit     |
| I17       | invalid    | Illegal unknown property                                 | Scorer/reducer comparison + fixture audit     |
| I18       | invalid    | Score overflow                                           | Scorer/reducer comparison + fixture audit     |
| I19       | invalid    | Post-winning-extra contact not truncated                 | Scorer/reducer comparison + fixture audit     |
| I20       | invalid    | Premature immediate penalty                              | Scorer/reducer comparison + fixture audit     |
| I21       | invalid    | Allotted balls already exhausted                         | Scorer/reducer comparison + fixture audit     |
| I22       | invalid    | Red-ball free-hit state                                  | Scorer/reducer comparison + fixture audit     |
| I23       | invalid    | Stumping by outfielder                                   | Scorer/reducer comparison + fixture audit     |
| I24       | invalid    | Catch without bat contact                                | Scorer/reducer comparison + fixture audit     |
| I25       | invalid    | Dismissed batter still occupies an end                   | Scorer/reducer comparison + fixture audit     |
| I26       | invalid    | Both ends assigned to survivor                           | Scorer/reducer comparison + fixture audit     |
| I27       | invalid    | Attempt index before legal-ball count                    | Scorer/reducer comparison + fixture audit     |
| I28       | invalid    | Limited-overs profile with unlimited allocation          | Scorer/reducer comparison + fixture audit     |
| I29       | invalid    | Third T20 innings                                        | Scorer/reducer comparison + fixture audit     |
| F10       | terminal   | Follow-on innings victory                                | Authored and schema-validated; engine not run |
| F11       | terminal   | Fourth innings target                                    | Authored and schema-validated; engine not run |
| F12       | terminal   | Final day expires with scores level but chase incomplete | Authored and schema-validated; engine not run |
| T01       | terminal   | Completed fourth innings level                           | Authored and schema-validated; engine not run |
| C01       | clock      | Wicket at 18:00 with three balls left                    | Authored and schema-validated; engine not run |
| C02       | clock      | Lunch and innings completion coincide                    | Authored and schema-validated; engine not run |
| C03       | clock      | Twenty-minute final-hour rain delay                      | Authored and schema-validated; engine not run |
| C04       | clock      | New ball accepted at 80 overs                            | Authored and schema-validated; engine not run |
| C05       | clock      | Win on final scheduled ball                              | Authored and schema-validated; engine not run |
| F13       | deferred   | Retry committed command                                  | Authored and schema-validated; engine not run |
| F14       | deferred   | Abort provisional over                                   | Authored and schema-validated; engine not run |
| F15       | deferred   | All out in 12 overs                                      | Authored and schema-validated; engine not run |
| F16       | deferred   | Chase in 9 overs and 3 balls                             | Authored and schema-validated; engine not run |
