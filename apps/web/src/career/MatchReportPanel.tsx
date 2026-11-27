import type { ReactNode } from "react";
import type { MatchReport } from "@lcxxvi/projections";

export const matchReportSeenKey = (save: string, season: string, fixture: string) =>
  JSON.stringify(["lcxxvi-match-report-seen", save, season, fixture]);

/** Per-viewer convenience only: whether this browser has dismissed a report. Never part of the career save. */
export function readReportSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
export function writeReportSeen(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* the report simply shows again next time */
  }
}

interface MatchReportPanelProps {
  report: MatchReport;
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  teamName: (teamId: string) => string;
  playerName: (playerId: string) => string;
  /** The manager's own selection note, kept from the previous Home panel. */
  children?: ReactNode;
}

/**
 * The match report shown on Home after a managed fixture (E1). Open, it is the first thing on the page;
 * closed, it is a one-line result with a way back to the report.
 */
export function MatchReportPanel({ report, open, onClose, onOpen, teamName, playerName, children }: MatchReportPanelProps) {
  const eyebrow = `LAST TIME OUT · ROUND ${report.roundNumber}`;
  if (!open) {
    return (
      <article className="career-panel score-notebook" data-testid="match-report-summary">
        <p className="eyebrow">{eyebrow}</p>
        <h3>{report.resultLine}</h3>
        <ul className="last-result-scores" data-testid="match-report-scores" aria-label="Scores">
          {report.innings.map((innings) => (
            <li key={innings.battingTeamId}>
              <span>{teamName(innings.battingTeamId)}</span>{" "}
              <strong>{innings.runs}/{innings.wickets}</strong> <small>({innings.overs} overs)</small>
            </li>
          ))}
        </ul>
        {children}
        <button type="button" data-testid="match-report-open" onClick={onOpen}>
          Read the match report
        </button>
      </article>
    );
  }
  return (
    <article className="career-panel score-notebook match-report" data-testid="match-report" data-outcome={report.outcome} aria-labelledby="match-report-headline">
      <p className="eyebrow">{eyebrow} · MATCH REPORT</p>
      <h3 id="match-report-headline" data-testid="match-report-headline">{report.headline}</h3>
      <p className="match-report-result" data-testid="match-report-result">{report.resultLine}</p>
      <div className="match-report-innings">
        {report.innings.map((innings) => (
          <section key={innings.battingTeamId} aria-label={`${teamName(innings.battingTeamId)} innings`}>
            <h4>
              {teamName(innings.battingTeamId)}{" "}
              <strong>{innings.runs}/{innings.wickets}</strong> <small>({innings.overs} overs)</small>
            </h4>
            <ul aria-label="Leading batters">
              {innings.topBatters.map((batter) => (
                <li key={batter.playerId}>
                  {playerName(batter.playerId)} {batter.runs}{batter.notOut ? "*" : ""} ({batter.ballsFaced})
                </li>
              ))}
            </ul>
            <p className="match-report-bowling-label">Bowling for {teamName(report.innings.find((other) => other.battingTeamId !== innings.battingTeamId)?.battingTeamId ?? "")}</p>
            <ul aria-label="Leading bowlers">
              {innings.topBowlers.map((bowler) => (
                <li key={bowler.playerId}>
                  {playerName(bowler.playerId)} {bowler.wickets}/{bowler.runsConceded} ({bowler.overs})
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <dl className="match-report-facts">
        {report.playerOfTheMatch && (
          <div data-testid="match-report-potm">
            <dt>Player of the match</dt>
            <dd>
              <strong>{playerName(report.playerOfTheMatch.playerId)}</strong>
              {report.playerOfTheMatch.teamId ? ` (${teamName(report.playerOfTheMatch.teamId)})` : ""}
              {report.playerOfTheMatch.line ? `: ${report.playerOfTheMatch.line}` : ""}
            </dd>
          </div>
        )}
        {report.turningPoint && (
          <div data-testid="match-report-turning-point">
            <dt>Where it turned</dt>
            <dd>{report.turningPoint.text}</dd>
          </div>
        )}
        {report.bestPartnership && report.bestPartnership.runs > 0 && (
          <div data-testid="match-report-partnership">
            <dt>Best stand</dt>
            <dd>{report.bestPartnership.text}</dd>
          </div>
        )}
        {report.tableMove && (
          <div data-testid="match-report-table">
            <dt>The table</dt>
            <dd>{report.tableMove.text}</dd>
          </div>
        )}
      </dl>
      {children}
      <button type="button" className="primary" data-testid="match-report-close" onClick={onClose}>
        Back to the clubhouse
      </button>
    </article>
  );
}
