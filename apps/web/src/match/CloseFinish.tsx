import type { Action, View } from "./protocol.js";

export function isCloseFinish(id: string) {
  return id === "t20-death-overs-chase" || id === "t20-defend-19";
}

export type Passage = {
  saveId: string;
  label: string;
  runs: number;
  wickets: number;
  balls: number;
  requiredRate: number | null;
  stopAt: number;
  boundaries: number;
  stopping: boolean;
  sequence: number;
  inningsIndex: number;
};

export function requiredRate(view: View) {
  const i = view.innings[view.activeIndex]!.innings;
  const left = (view.format === "ODI" ? 300 : 120) - i.legalBalls;
  return i.targetToWin && left > 0
    ? (Math.max(0, i.targetToWin - i.runs) * 6) / left
    : 0;
}

export function boundaryCount(view: View, inningsIndex = view.activeIndex) {
  return Object.values(view.innings[inningsIndex]!.batting).reduce(
    (n, batter) => n + batter.fours + batter.sixes,
    0,
  );
}

export function passageReport(passage: Passage, view: View) {
  const innings = view.innings[passage.inningsIndex]!.innings;
  const balls = innings.legalBalls - passage.balls;
  const wickets = innings.wickets - passage.wickets;
  const runs = innings.runs - passage.runs;
  const cues =
    view.fieldPresentation?.recentHighlights.filter(
      (c) =>
        c.inningsIndex === passage.inningsIndex &&
        c.sequence > passage.sequence,
    ) ?? [];
  const singles = cues.filter((c) => c.batRuns === 1).length;
  const decisive =
    cues.find((c) => c.fieldOutcome === "DROP") ??
    [...cues].reverse().find((c) => c.dismissalKind || c.boundary !== "NONE");
  const decisiveText = !decisive ? "" : decisive.fieldOutcome === "DROP"
    ? `${decisive.overBallLabel} · Dropped chance off ${decisive.bowlerName}. ${decisive.runsScored} runs from the delivery.`
    : decisive.headline.startsWith(decisive.overBallLabel) ? decisive.headline : `${decisive.overBallLabel} · ${decisive.headline}`;
  const bowler = cues.at(-1);
  const quota = view.format === "ODI" ? 60 : 24;
  const allocation =
    bowler &&
    view.innings[passage.inningsIndex]?.bowling[bowler.bowlerId]?.legalBalls ===
      quota
      ? ` ${bowler.bowlerName} has completed the allocation.`
      : "";
  return `${passage.label}: ${runs} run${runs === 1 ? "" : "s"}, ${wickets} wicket${wickets === 1 ? "" : "s"} in ${balls} legal ball${balls === 1 ? "" : "s"}. Boundaries: ${boundaryCount(view, passage.inningsIndex) - passage.boundaries}. Recorded singles: ${singles}.${decisiveText ? " " + decisiveText : ""}${allocation}`;
}

export function CloseFinish({
  view,
  playerTeamId,
  finished,
  disabled,
  playing,
  report,
  command,
  select,
  stop,
  replay,
}: {
  view: View;
  playerTeamId: string;
  finished: boolean;
  disabled: boolean;
  playing: boolean;
  report: string;
  command: (action: Action, label: string) => void;
  select: (action: Action) => void;
  stop: () => void;
  replay?: (() => void) | undefined;
}) {
  if (!view.innings[view.activeIndex])
    return (
      <section className="panel close-finish">
        <h2>Captain’s highlights</h2>
        <p>{view.nextDecision}</p>
      </section>
    );
  const limit = view.format === "ODI" ? 300 : 120;
  const quota = limit / 5;
  const ledger = view.innings[view.activeIndex]!;
  const i = ledger.innings;
  const chasing = playerTeamId === i.battingTeamId;
  const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const plan = view.bowlingPlan;
  const legalBowlers = view.candidates.filter((c) => !c.reason);
  const ballsBowled = (id: string) => ledger.bowling[id]?.legalBalls ?? 0;
  const byWorkload = [...legalBowlers].sort(
    (a, b) => ballsBowled(b.id) - ballsBowled(a.id),
  );
  const variedWorkloads = [
    ...new Set([byWorkload[0], byWorkload.at(-1), byWorkload[1]]),
  ].filter((c) => c !== undefined);
  return (
    <section className="panel close-finish" aria-label="Captain’s highlights">
      <h2>Captain’s highlights</h2>
      {!finished && (
        <p>
          <strong>{chasing ? "At the crease" : "In the field"}</strong>
          {" · "}
          {i.targetToWin
            ? Math.max(0, i.targetToWin - i.runs) + " needed from "
            : ""}
          {Math.max(0, limit - i.legalBalls)} balls left · {10 - i.wickets}{" "}
          wickets in hand
        </p>
      )}
      {view.fieldPresentation && (
        <FieldRead
          view={view}
          opponent={view.teams.find((t) => t.id !== playerTeamId)?.id}
        />
      )}
      {report && (
        <p role="status" className="passage-report">
          {report}
        </p>
      )}
      {finished ? (
        <>
          <p>
            What was your plan? What did it cost you? What would you try
            differently?
          </p>
          {replay && (
            <button disabled={disabled} onClick={replay}>
              Play again
            </button>
          )}
        </>
      ) : playing ? (
        <button onClick={stop}>Stop after this command</button>
      ) : view.phase === "READY" ? (
        <>
          <p>
            {chasing
              ? `Set the intent for ${view.names[striker ?? ""] ?? "the striker"}. The partner keeps their own plan.`
              : "Set the bowler’s line, length and effort for this spell."}{" "}
            Play pauses at a wicket, the required rate reaching ten an over, your
            next selection, the final two overs or after two overs.
          </p>
          <div className="action-row">
            {chasing && striker ? (
              <>
                {i.targetToWin && (
                  <button
                    disabled={disabled}
                    onClick={() =>
                      command(
                        {
                          kind: "SET_BATTING_PLAN",
                          payload: {
                            playerId: striker,
                            aggression: 1,
                            intent: "PROTECT",
                          },
                        },
                        "Protect the striker",
                      )
                    }
                  >
                    Protect {view.names[striker]} · three dots would leave{" "}
                    {limit - i.legalBalls > 3
                      ? (
                          ((i.targetToWin - i.runs) * 6) /
                          (limit - i.legalBalls - 3)
                        ).toFixed(1) + " per over"
                      : "no full scoring passage"}
                  </button>
                )}
                <button
                  disabled={disabled}
                  onClick={() =>
                    command(
                      {
                        kind: "SET_BATTING_PLAN",
                        payload: {
                          playerId: striker,
                          aggression: 2,
                          intent: "ROTATE",
                        },
                      },
                      "Rotate strike",
                    )
                  }
                >
                  Rotate strike · take the singles
                </button>
                <button
                  disabled={disabled}
                  onClick={() =>
                    command(
                      {
                        kind: "SET_BATTING_PLAN",
                        payload: {
                          playerId: striker,
                          aggression: 4,
                          intent: "NORMAL",
                        },
                      },
                      "Attack the boundary",
                    )
                  }
                >
                  Attack the boundary · risk the wicket
                </button>
              </>
            ) : !chasing && plan ? (
              <>
                <button
                  disabled={disabled}
                  onClick={() =>
                    command(
                      {
                        kind: "SET_BOWLING_PLAN",
                        payload: {
                          ...plan,
                          line: "OFF",
                          length: "GOOD",
                          effort: "CONSERVE",
                        },
                      },
                      "Hold the channel",
                    )
                  }
                >
                  Hold the channel · conserve effort
                </button>
                <button
                  disabled={disabled}
                  onClick={() =>
                    command(
                      {
                        kind: "SET_BOWLING_PLAN",
                        payload: {
                          ...plan,
                          line: "STUMPS",
                          length: "YORKER",
                          effort: "MAXIMUM",
                        },
                      },
                      "Attack the stumps",
                    )
                  }
                >
                  Attack the stumps · risk a missed yorker
                </button>
              </>
            ) : null}
            <button
              disabled={disabled}
              onClick={() =>
                command(
                  { kind: "ADVANCE", payload: { scope: "DELIVERY" } },
                  "Keep the plan",
                )
              }
            >
              Keep the plan and play
            </button>
          </div>
        </>
      ) : view.decisionTeamId === playerTeamId &&
        view.phase === "AWAITING_BATTER" ? (
        <div>
          <p>{view.nextDecision}</p>
          <div className="action-row">
            {batterOptions(view).map((c) => (
              <button
                key={c.id}
                disabled={disabled}
                onClick={() =>
                  select({
                    kind: "SET_BATTER",
                    payload: { teamId: playerTeamId, playerId: c.id },
                  })
                }
              >
                Send in {c.name}
                <small>
                  {view.hands[c.id] === "L" ? "Left" : "Right"} handed · Power{" "}
                  {c.batting!.power} · Rotation {c.batting!.rotation} · Defence{" "}
                  {c.batting!.defence}
                </small>
              </button>
            ))}
          </div>
        </div>
      ) : view.decisionTeamId === playerTeamId &&
        view.phase === "AWAITING_BOWLER" ? (
        <div>
          <p>
            Compare spells, or use the full XI below to choose another bowler
            and set a custom plan.
          </p>
          <div className="action-row">
            {variedWorkloads.map((c) => {
              const record = ledger.bowling[c.id];
              return (
                <button
                  key={c.id}
                  disabled={disabled}
                  data-passage-bowler={c.id}
                  onClick={() =>
                    command(
                      {
                        kind: "SET_BOWLER",
                        payload: {
                          teamId: playerTeamId,
                          bowlerId: c.id,
                        },
                      },
                      c.name + " to bowl",
                    )
                  }
                >
                  {c.name} · {quota - (record?.legalBalls ?? 0)} balls available
                  · {record?.wickets ?? 0}/{record?.runsConceded ?? 0}
                  <small>{bowlerRead(view, c.id, quota)}</small>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p>
          {view.decisionTeamId === playerTeamId
            ? view.nextDecision
            : "Opposition captain choosing."}
        </p>
      )}
    </section>
  );
}

function batterOptions(view: View) {
  const remaining = view.candidates.filter((c) => !c.reason && c.batting);
  const selected = [];
  for (const skill of ["power", "rotation", "defence"] as const) {
    const option = [...remaining].sort(
      (a, b) => b.batting![skill] - a.batting![skill],
    )[0];
    if (!option) break;
    selected.push(option);
    remaining.splice(remaining.indexOf(option), 1);
  }
  return selected;
}

function bowlerRead(view: View, id: string, quota: number) {
  const ledger = view.innings[view.activeIndex]!;
  const cues =
    view.fieldPresentation?.recentHighlights
      .filter((c) => c.bowlerId === id && c.inningsIndex === view.activeIndex)
      .slice(-6) ?? [];
  const remaining =
    (view.format === "ODI" ? 300 : 120) - ledger.innings.legalBalls;
  const finalOptions = view.candidates.filter(
    (c) =>
      c.id !== id &&
      (c.reason === "" || c.id === ledger.innings.previousOverBowlerId) &&
      (ledger.bowling[c.id]?.legalBalls ?? 0) <= quota - 6,
  );
  const reserve =
    remaining === 12
      ? " Final over available to " +
        finalOptions.map((c) => c.name).join(", ") +
        "."
      : remaining > 12 && (ledger.bowling[id]?.legalBalls ?? 0) >= quota - 6
        ? " This spends their final over."
        : "";
  const fatigue = view.fatigueBp?.[id];
  return (
    (fatigue === undefined
      ? ""
      : "Fatigue " + Math.round(fatigue / 100) + "%. ") +
    (cues.length
      ? `Last ${cues.length} recorded deliveries: ${cues.reduce((n, c) => n + c.runsScored, 0)} runs.`
      : "No recent deliveries recorded.") +
    reserve
  );
}

function FieldRead({
  view,
  opponent,
}: {
  view: View;
  opponent: string | undefined;
}) {
  const field = view.fieldPresentation!;
  const cues = field.recentHighlights.filter(
    (c) => c.inningsIndex === view.activeIndex,
  );
  const opposition = view.teams.find((t) => t.id === opponent);
  const note = opponent && view.captainNotes?.[opponent];
  const observed = cues.filter((c) =>
    opposition?.playerIds.includes(c.bowlerId),
  );
  const yorkers = observed.filter((c) => c.executedLength === "YORKER");
  const dots = cues.slice(-6);
  return (
    <div className="field-read">
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label="Current field placements"
      >
        <ellipse
          cx="100"
          cy="100"
          rx="90"
          ry="82"
          fill="#266149"
          stroke="#adcaa0"
          strokeWidth="2"
        />
        <ellipse
          cx="100"
          cy="100"
          rx="50"
          ry="44"
          fill="none"
          stroke="#adcaa0"
          strokeDasharray="3 4"
        />
        <rect x="96" y="88" width="8" height="24" fill="#e2c79a" />
        {field.positions
          .filter((p) => p.occupiedByPlayerId)
          .map((p) => (
            <circle
              key={p.slotId}
              cx={p.point.x10 / 10}
              cy={p.point.y10 / 10}
              r="4"
              fill="#fff6d6"
            >
              <title>
                {p.occupiedByName}: {p.label}
              </title>
            </circle>
          ))}
      </svg>
      <div>
        <strong>{field.legality.phaseLabel}</strong>
        <p>{field.legality.outsideCircleCount} outside the circle</p>
        {dots.length > 0 && (
          <div
            className="delivery-strip"
            aria-label="Latest recorded deliveries"
          >
            {dots.map((c) => (
              <span key={c.sequence} title={c.headline}>
                {c.dismissalKind
                  ? "W"
                  : c.legality === "WIDE"
                    ? "Wd"
                    : c.legality === "NO_BALL"
                      ? "Nb"
                      : c.runsScored || "·"}
              </span>
            ))}
          </div>
        )}
        {note && (
          <p className="scout-note">
            <b>{view.names[opposition!.captainId]}</b> · {note}
          </p>
        )}
        {!note && yorkers.length >= 2 && (
          <p>
            {opposition?.name} have landed {yorkers.length} yorkers in their
            last {observed.length} recorded deliveries.
          </p>
        )}
      </div>
    </div>
  );
}
