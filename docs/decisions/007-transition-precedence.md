# ADR 007: Recorded event order and decision precedence

Accepted for the Pass 02 reference corpus; implementation follows in Pass 03. This resolves the different emphasis in Appendix C and section 19 without dropping either statistical over completion or terminal precedence.

1. Record DELIVERY_RECORDED.
2. If it is the sixth qualifying legal ball, record OVER_COMPLETED for statistics.
3. Arbitrate target/result first, then innings completion. Record INNINGS_COMPLETED and MATCH_COMPLETED where applicable.
4. Only if play continues, process scheduled intervals or delays.
5. Only then request the next batter, then next bowler, in that order.

Recording OVER_COMPLETED does not itself trigger a bowler-selection prompt. A terminal boundary suppresses selection and interval actions. A sixth-ball catch in a continuing innings leaves an empty dismissed-striker end for the incoming batter; the survivor faces from the other end next over. Selection commands and their events do not appear in the delivery batch before the decision is made.

## Clock sampling points

Clock cases state their before/after sample points and all charged durations. They are reference expectations, not evidence of a clock implementation.

| Case | Time and decision                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C01  | Starts 17:59:20; 40-second wicket delivery lands at 18:00 with three balls remaining in the over. Charge 90-second wicket delay. At 18:01:30 request batter; stumps remains pending until over completion.                     |
| C02  | Starts 12:59:20; innings-ending sixth-ball wicket lands at 13:00. Add 90 seconds for wicket, 60 seconds for over and one 600-second innings interval. At 13:12:30 choose the next innings; do not add a second lunch interval. |
| C03  | Cleared 20-minute rain delay moves 17:10 to 17:30. Five complete four-minute blocks reduce final-hour obligation from 90 to 60 balls, with 12 already delivered unchanged.                                                     |
| C04  | New ball at 12:00 after 480 legal balls. Charge 120 seconds; at 12:02 ball age is zero while innings remains at 480 balls.                                                                                                     |
| C05  | Winning single lands at 18:00 on the final scheduled ball. Match completion takes precedence over stumps. No delay is charged after the match has finished.                                                                    |

C02 represents the supplied custom profile's explicit interval replacement rule. It is not a claim about all real competition playing conditions. C03 includes weather clearance as part of its supplied input scenario, not a generated forecast. C05's early terminal return follows Appendix C's result-first orchestration.
