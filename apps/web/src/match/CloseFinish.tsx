import type { Action, ScenarioStatus, View } from "./protocol.js";

export function isCloseFinish(id: string) {
  return id === "t20-death-overs-chase" || id === "t20-defend-19";
}

export type Passage = {
  saveId: string;
  label: string;
  runs: number;
  wickets: number;
  balls: number;
  stopAt: number;
  boundaries: number;
  stopping: boolean;
};

export function boundaryCount(view: View) {
  return Object.values(view.innings[view.activeIndex]!.batting).reduce(
    (n, batter) => n + batter.fours + batter.sixes,
    0,
  );
}

export function passageReport(passage: Passage, view: View) {
  const innings = view.innings[view.activeIndex]!.innings;
  const balls = innings.legalBalls - passage.balls;
  const wickets = innings.wickets - passage.wickets;
  const runs = innings.runs - passage.runs;
  return `${passage.label}: ${runs} run${runs === 1 ? "" : "s"}, ${wickets} wicket${wickets === 1 ? "" : "s"} in ${balls} legal ball${balls === 1 ? "" : "s"}. Boundaries: ${boundaryCount(view) - passage.boundaries}.`;
}

export function CloseFinish({
  view,
  scenario,
  disabled,
  playing,
  report,
  command,
  stop,
  replay,
}: {
  view: View;
  scenario: ScenarioStatus;
  disabled: boolean;
  playing: boolean;
  report: string;
  command: (action: Action, label: string) => void;
  stop: () => void;
  replay: () => void;
}) {
  const ledger = view.innings[view.activeIndex]!;
  const i = ledger.innings;
  const chasing = scenario.playerTeamId === i.battingTeamId;
  const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const plan = view.bowlingPlan;
  return (
    <section className="panel close-finish" aria-label="Captain’s highlights">
      <h2>Captain’s highlights</h2>
      {!scenario.outcome && (
        <p>
          <strong>{chasing ? "Your chase" : "Your defence"}</strong>
          {" · "}
          {Math.max(0, (i.targetToWin ?? 0) - i.runs)} needed from{" "}
          {120 - i.legalBalls} balls · {10 - i.wickets} wickets in hand
        </p>
      )}
      {report && (
        <p role="status" className="passage-report">
          {report}
        </p>
      )}
      {scenario.outcome ? (
        <>
          <p>
            What was your plan? What did it cost you? What would you try
            differently?
          </p>
          <button disabled={disabled} onClick={replay}>
            Play again
          </button>
        </>
      ) : playing ? (
        <button onClick={stop}>Stop after this command</button>
      ) : view.phase === "READY" ? (
        <>
          <p>
            {chasing
              ? `Set the intent for ${view.names[striker ?? ""] ?? "the striker"}. The partner keeps their own plan.`
              : "Set the bowler’s line, length and effort for this spell."}{" "}
            Play pauses at a wicket, your next selection, the final two overs or
            after two overs.
          </p>
          <div className="action-row">
            {chasing && striker ? (
              <>
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
                  { kind: "ADVANCE", payload: { scope: "OVER" } },
                  "Keep the plan",
                )
              }
            >
              Keep the plan and play
            </button>
          </div>
        </>
      ) : view.decisionTeamId === scenario.playerTeamId &&
        view.phase === "AWAITING_BOWLER" ? (
        <div>
          <p>
            Give a bowler the over with their initial plan, or use the selection
            below to set a custom plan before bowling.
          </p>
          <div className="action-row">
            {view.candidates
              .filter((c) => !c.reason)
              .map((c) => {
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
                            teamId: scenario.playerTeamId,
                            bowlerId: c.id,
                          },
                        },
                        c.name + " to bowl",
                      )
                    }
                  >
                    {c.name} · {24 - (record?.legalBalls ?? 0)} balls available
                    · {record?.wickets ?? 0}/{record?.runsConceded ?? 0}
                  </button>
                );
              })}
          </div>
        </div>
      ) : (
        <p>
          {view.decisionTeamId === scenario.playerTeamId
            ? view.nextDecision
            : "Opposition captain choosing."}
        </p>
      )}
    </section>
  );
}
