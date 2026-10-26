# M3 human acceptance record

Status: Human match and replay checks PASS (owner report, 26 October 2026). See the evidence record below.
Automated Playwright keyboard runs are recorded separately.

Build commit: use SOURCE_COMMIT.txt in the delivered package.
Tester: ____________________  Date: ____________________
Browser and version: ____________________

Start the supplied app with `node start.mjs` and open the printed local address. No developer tools are needed for the match.

1. Choose teams, review/edit both XIs, captains and keepers. Confirm the sides.
2. Call the toss, then make the bat/bowl decision for the winning side.
3. Select the opening batters and first bowler. Try batting aggression, bowling effort and a legal named field.
4. Advance a delivery, then finish overs. Respond to every batter/bowler decision through both innings. Confirm that unavailable bowlers give visible reasons.
5. Finish the match and review the result and both scorecards. No additional delivery should be available.
6. Verify replay and scorecard. Change commentary/layout/text scale and verify again. Compare the displayed hashes.
7. Confirm the score, active batters/bowler, target and next decision fit at 1366×768 with no scrolling at 100% and 150% text scale. Briefly check a narrow view and keyboard navigation.

Result and scores: ____________________
Any hidden or blocked decision: ____________________
Replay verification result: ____________________
Pass / fail and notes: ____________________

M3 may be accepted after this full-match human check passes. M4 saves are implemented and tested separately; this historical checklist does not determine save availability.


## Owner evidence: 26 October 2026

Tester: Sam (repository owner), using Microsoft Edge on Windows.
Browser version, Windows version and exact viewport dimensions: not supplied.
The owner installed the acceptance branch ZIP with Node.js v24.22.0.
The owner supplied successful dependency installation and production build output.
The downloaded branch commit was not independently identified on the owner machine.

- Setup and first delivery: PASS by owner report.
- Both innings and match completion: PASS by owner report.
- Result: Silver Fen 67/7 (20.0); Westmere Isles 70/2 (13.2), winning by eight wickets.
- Replay: PASS. The pasted interface states “Replay and command resimulation match.”
- Accepted events: 307. Human requests: 82. Test autopilot requests: 0.
- Layout: PASS by owner report. Exact viewport and scale measurements remain unrecorded.
- Repeat verification after presentation changes: PASS by owner confirmation.
- Keyboard focus visibility: NOT RECORDED separately by the owner.
- Unavailable-bowler explanations and terminal button disabling: not individually recorded beyond the overall successful playthrough.

Event bytes SHA-256:
`a7b4c13e4b983c72dcc928a274fa0ab9269f278117973507fa0a0beea855a241`

Scorecard SHA-256:
`6edfbf41394ed88180b2d74bad274753137331b663e43c819ef89e7a8fc4681c`

The owner confirmed repeat verification passed; the second hash values were not pasted separately.
The original pasted interface showed 100% text scale and Comfortable layout.
This record confirms the reported human checks; it does not certify unrecorded measurements or individual checklist items.
The preserved owner release archive remains unavailable for direct comparison.
