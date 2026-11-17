import { useEffect, useState } from "react";
import type { SuperOverCommand } from "@lcxxvi/contracts";
import type { SuperOverView } from "./protocol.js";

/**
 * Stage 14 super overs for a tied T20 exhibition (ICC standard; owner decision 17 November 2026).
 * The tactical captain chooses for the AI side; the player chooses for their own.
 */
const AGGRESSION_LABELS = ["Defend", "Careful", "Balanced", "Attacking", "All-out attack"];

export function SuperOverPanel(props: {
  view: SuperOverView;
  aiTeamId: string | null;
  busy: boolean;
  onStart: () => void;
  onCommand: (command: SuperOverCommand) => void;
}) {
  const { view, aiTeamId, busy, onStart, onCommand } = props;
  const name = (id: string | null | undefined) => (id ? (view.names[id] ?? id) : "");
  const pending = view.pending;
  const humanDecision = pending !== null && pending.teamId !== aiTeamId;
  const [batters, setBatters] = useState<string[]>([]);
  const [bowler, setBowler] = useState("");
  const choiceKey = view.choices.map((c) => c.id).join("|");
  useEffect(() => {
    setBatters(view.choices.slice(0, view.battersToName).map((c) => c.id));
    setBowler(view.choices[0]?.id ?? "");
  }, [choiceKey, view.battersToName]);
  const current = view.current;
  const strikerIsHuman = current !== null && current.battingTeamId !== aiTeamId;

  return (
    <section className="result" aria-labelledby="super-over-heading" data-testid="super-over-panel">
      <h2 id="super-over-heading">Super over</h2>
      {!view.started ? (
        <>
          <p>
            The match is tied. Under the ICC standard each side bats one over with up to three batters (two wickets end the
            innings). Super overs repeat until there is a winner. The tied match itself stays on the record as a tie.
          </p>
          <button type="button" className="primary" disabled={busy} onClick={onStart}>
            Play super over
          </button>
        </>
      ) : (
        <>
          {view.rounds.map((round) => (
            <p key={round.roundNumber} data-testid={`super-over-round-${round.roundNumber}`}>
              Super over {round.roundNumber}:{" "}
              {round.innings
                .map((i) => `${name(i.battingTeamId)} ${i.runs}/${i.wickets} (${i.legalBalls} ball${i.legalBalls === 1 ? "" : "s"})`)
                .join(" · ") || "about to start"}
            </p>
          ))}
          {view.phase === "COMPLETE" ? (
            <p role="status" data-testid="super-over-result">
              <strong>
                {view.winnerTeamId
                  ? `${name(view.winnerTeamId)} won the super over.`
                  : "No eligible players remain, so the match stays tied."}
              </strong>
            </p>
          ) : (
            <>
              {current && view.phase === "READY" && (
                <p data-testid="super-over-current">
                  {name(current.battingTeamId)} {current.runs}/{current.wickets} from {current.legalBalls} ball
                  {current.legalBalls === 1 ? "" : "s"}
                  {current.targetToWin !== null ? `, needing ${current.targetToWin} to win` : ""}. {name(current.strikerId)} faces{" "}
                  {name(current.bowlerId)}.{current.balls.length > 0 ? ` This over: ${current.balls.join(" ")}.` : ""}
                </p>
              )}
              {pending && !humanDecision && <p role="status">The tactical captain is choosing for {name(pending.teamId)}.</p>}
              {pending && humanDecision && pending.decision === "BATTERS" && (
                <fieldset disabled={busy}>
                  <legend>Choose {name(pending.teamId)}'s super-over batters, in order</legend>
                  {Array.from({ length: view.battersToName }, (_, index) => (
                    <label key={index}>
                      {index === 0 ? "Opener (on strike)" : index === 1 ? "Opener" : "Next in"}{" "}
                      <select
                        value={batters[index] ?? ""}
                        onChange={(event) => {
                          const next = [...batters];
                          next[index] = event.currentTarget.value;
                          setBatters(next);
                        }}
                      >
                        {view.choices.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <button
                    type="button"
                    disabled={new Set(batters).size !== view.battersToName}
                    onClick={() => onCommand({ kind: "SET_SUPER_OVER_BATTERS", teamId: pending.teamId, playerIds: batters })}
                  >
                    Confirm batters
                  </button>
                  {new Set(batters).size !== view.battersToName && <p>Choose {view.battersToName} different batters.</p>}
                </fieldset>
              )}
              {pending && humanDecision && pending.decision === "BOWLER" && (
                <fieldset disabled={busy}>
                  <legend>Choose {name(pending.teamId)}'s super-over bowler</legend>
                  <label>
                    Bowler{" "}
                    <select value={bowler} onChange={(event) => setBowler(event.currentTarget.value)}>
                      {view.choices.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" disabled={!bowler} onClick={() => onCommand({ kind: "SET_SUPER_OVER_BOWLER", teamId: pending.teamId, playerId: bowler })}>
                    Confirm bowler
                  </button>
                </fieldset>
              )}
              {view.phase === "READY" && current && (
                <div className="action-row">
                  {strikerIsHuman && current.strikerId && (
                    <label>
                      {name(current.strikerId)}'s intent{" "}
                      <select
                        defaultValue="3"
                        disabled={busy}
                        onChange={(event) =>
                          onCommand({ kind: "SET_SUPER_OVER_AGGRESSION", playerId: current.strikerId!, aggression: Number(event.currentTarget.value) })
                        }
                      >
                        {AGGRESSION_LABELS.map((label, value) => (
                          <option key={label} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button type="button" className="primary" disabled={busy} onClick={() => onCommand({ kind: "BOWL_SUPER_OVER_BALL" })}>
                    Bowl next ball
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
