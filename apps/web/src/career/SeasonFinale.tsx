import { useEffect, useState } from "react";
import type { SeasonAwardsSummary, SeasonTeamTableRow } from "@lcxxvi/contracts";
import type { SeasonObjective, SeasonObjectiveStatus } from "@lcxxvi/projections";

export const seasonFinaleSeenKey = (save: string, season: string) => JSON.stringify(["lcxxvi-season-finale-seen", save, season]);

/** Per-viewer convenience only: whether this browser has been through a season's finale. Never part of the career save. */
export function readFinaleSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
export function writeFinaleSeen(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* the finale simply shows again next time */
  }
}

interface SeasonFinaleProps {
  seasonLabel: string;
  table: readonly SeasonTeamTableRow[];
  focusTeamId: string | null;
  objective: SeasonObjective | null;
  objectiveStatus: SeasonObjectiveStatus | null;
  /** Null until the awards have been worked out for this season. */
  awards: SeasonAwardsSummary | null;
  /** Asks for the season awards to be worked out; safe to call more than once. */
  requestAwards: () => void;
  teamName: (teamId: string) => string;
  playerName: (playerId: string) => string;
  onDone: () => void;
}

/**
 * The season finale (E9): the final table, the board's verdict and the awards, one step at a time,
 * before the existing end-of-season action. It only presents what the season already holds and
 * changes nothing in the save or the rollover.
 */
export function SeasonFinale({ seasonLabel, table, focusTeamId, objective, objectiveStatus, awards, requestAwards, teamName, playerName, onDone }: SeasonFinaleProps) {
  const steps = ["TABLE", ...(objective && objectiveStatus?.verdict ? ["BOARD"] : []), "AWARDS"] as const;
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const last = index >= steps.length - 1;
  useEffect(() => {
    // Asked once when the finale opens; the parent re-renders when the awards arrive.
    requestAwards();
  }, []);
  const champion = table.find((row) => row.rank === 1) ?? null;
  const own = focusTeamId ? table.find((row) => row.teamId === focusTeamId) ?? null : null;
  const given = awards?.awards.filter((award) => award.status === "AWARDED" && award.winnerPlayerId) ?? [];

  return (
    <article className="career-panel season-finale" data-testid="season-finale" data-step={step} aria-labelledby="season-finale-heading">
      <p className="eyebrow">{seasonLabel} · SEASON FINALE · {index + 1} OF {steps.length}</p>
      {step === "TABLE" && (
        <>
          <h3 id="season-finale-heading" data-testid="season-finale-heading">
            {champion ? `${teamName(champion.teamId)} are champions` : "The season is over"}
          </h3>
          {own && champion && own.teamId !== champion.teamId && <p>{teamName(own.teamId)} finished {own.rank}{["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][own.rank % 10]}.</p>}
          <div className="table-wrap">
            <table data-testid="season-finale-table">
              <thead><tr><th>Pos</th><th>Club</th><th>P</th><th>W</th><th>L</th><th>Pts</th></tr></thead>
              <tbody>
                {[...table].sort((a, b) => a.rank - b.rank).map((row) => (
                  <tr key={row.teamId} data-own={row.teamId === focusTeamId || undefined}>
                    <td>{row.rank}</td>
                    <td>{row.teamId === focusTeamId ? <strong>{teamName(row.teamId)}</strong> : teamName(row.teamId)}</td>
                    <td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {step === "BOARD" && objective && objectiveStatus && (
        <>
          <h3 id="season-finale-heading" data-testid="season-finale-heading">{objectiveStatus.verdictLabel}</h3>
          <p data-testid="season-finale-verdict">{objectiveStatus.sentence}</p>
          <small>{objective.reason}</small>
        </>
      )}
      {step === "AWARDS" && (
        <>
          <h3 id="season-finale-heading" data-testid="season-finale-heading">Season awards</h3>
          {awards === null ? (
            <p data-testid="season-finale-awards-pending">The awards are being worked out. They are also on the Statistics page.</p>
          ) : given.length === 0 ? (
            <p>No awards were given this season.</p>
          ) : (
            <dl className="season-finale-awards" data-testid="season-finale-awards">
              {given.map((award) => (
                <div key={award.category}>
                  <dt>{award.label}</dt>
                  <dd>
                    <strong>{playerName(award.winnerPlayerId!)}</strong>
                    {award.winnerTeamId ? ` (${teamName(award.winnerTeamId)})` : ""}
                    {award.headlineStat ? `: ${award.headlineStat}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
      <div className="action-row">
        <button type="button" className="primary" data-testid="season-finale-continue" onClick={() => (last ? onDone() : setIndex(index + 1))}>
          {last ? "On to the end-of-season business" : "Continue"}
        </button>
        {!last && (
          <button type="button" data-testid="season-finale-skip" onClick={onDone}>
            Skip the finale
          </button>
        )}
      </div>
    </article>
  );
}
