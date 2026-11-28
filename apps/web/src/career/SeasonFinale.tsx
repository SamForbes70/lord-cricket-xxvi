import { useEffect, useRef, useState } from "react";
import type { SeasonAwardsSummary, SeasonTeamTableRow } from "@lcxxvi/contracts";
import type { SeasonObjective, SeasonObjectiveStatus, SeasonReview, SquadSeasonLine } from "@lcxxvi/projections";
import "../data-table.css";
import { NoValue } from "../NoValue.js";

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
  /** LC_SEASON_REVIEW_V1: derived from the season's recorded results; null if it could not be built. */
  review: SeasonReview | null;
  teamName: (teamId: string) => string;
  playerName: (playerId: string) => string;
  onDone: () => void;
}

type Step = "TABLE" | "BOARD" | "STORY" | "AWARDS" | "SQUAD" | "AHEAD";
const STEP_NAMES: Record<Step, string> = {
  TABLE: "Champions",
  BOARD: "Board verdict",
  STORY: "The season in results",
  AWARDS: "Season awards",
  SQUAD: "Your cricketers",
  AHEAD: "Looking ahead",
};

const ordinalSuffix = (n: number) => {
  const tail = n % 100;
  return tail >= 11 && tail <= 13 ? "th" : ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10];
};
const economy = (runs: number, balls: number) => {
  const x100 = Math.round((runs * 600) / balls);
  return `${Math.floor(x100 / 100)}.${String(x100 % 100).padStart(2, "0")}`;
};
const overs = (balls: number) => (balls % 6 === 0 ? `${balls / 6}` : `${Math.floor(balls / 6)}.${balls % 6}`);
/** An empty cell: a dot to the eye, "none" to a screen reader. */
/* CD-048: "none", not "·", which is also the dot-ball mark. */
const NONE = <NoValue />;
const highScore = (line: SquadSeasonLine) => (line.highScore ? `${line.highScore.runs}${line.highScore.notOut ? "*" : ""}` : NONE);

/**
 * The season finale (E9), extended into the season review (LC_SEASON_REVIEW_V1, docs/pavilion/SEASON_REVIEW_V1.md):
 * the final table and how the title was won, the board's verdict, the season told from recorded results, the awards,
 * your cricketers' seasons and what is known about the next season, one step at a time, before the existing
 * end-of-season action. It only presents what the season already holds and changes nothing in the save or the rollover.
 */
export function SeasonFinale({ seasonLabel, table, focusTeamId, objective, objectiveStatus, awards, requestAwards, review, teamName, playerName, onDone }: SeasonFinaleProps) {
  const steps: Step[] = [
    "TABLE",
    ...(objective && objectiveStatus?.verdict ? (["BOARD"] as const) : []),
    ...(review && review.story.length > 0 ? (["STORY"] as const) : []),
    "AWARDS",
    ...(review && review.squad.length > 0 ? (["SQUAD"] as const) : []),
    ...(review?.ahead ? (["AHEAD"] as const) : []),
  ];
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const last = index >= steps.length - 1;
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    // Asked once when the finale opens; the parent re-renders when the awards arrive.
    requestAwards();
  }, []);
  useEffect(() => {
    // After Continue or Back, keyboard and screen-reader focus moves to the new step's heading.
    if (moved.current) heading.current?.focus();
  }, [index]);
  const go = (next: number) => {
    moved.current = true;
    setIndex(next);
  };
  const champion = table.find((row) => row.rank === 1) ?? null;
  const own = focusTeamId ? table.find((row) => row.teamId === focusTeamId) ?? null : null;
  const given = awards?.awards.filter((award) => award.status === "AWARDED" && award.winnerPlayerId) ?? [];
  const clubAwards = review?.awards.filter((award) => award.id.startsWith("CLUB_")) ?? [];
  const leagueEconomy = review?.awards.find((award) => award.id === "LEAGUE_BEST_ECONOMY") ?? null;
  const clubStory = review?.story.filter((item) => item.scope === "CLUB") ?? [];
  const leagueStory = review?.story.filter((item) => item.scope === "LEAGUE") ?? [];
  const h3 = (text: string) => (
    <h3 id="season-finale-heading" data-testid="season-finale-heading" ref={heading} tabIndex={-1}>{text}</h3>
  );
  const development = review?.development ?? null;
  const changeList = (lines: NonNullable<typeof development>["improved"]) =>
    lines.map((d) => `${playerName(d.playerId)} (${d.text.replace(/\.$/, "")})`).join("; ");

  return (
    <article className="career-panel season-finale" data-testid="season-finale" data-step={step} aria-labelledby="season-finale-heading">
      <p className="eyebrow">{seasonLabel} · SEASON REVIEW · {index + 1} OF {steps.length}<span className="sr-only">: {STEP_NAMES[step]}</span></p>
      {step === "TABLE" && (
        <>
          {h3(champion ? `${teamName(champion.teamId)} are champions` : "The season is over")}
          {review?.titleRace && <p data-testid="season-review-title-race">{review.titleRace.text}</p>}
          {review?.club ? (
            <p data-testid="season-review-club">{review.club.text}</p>
          ) : (
            own && champion && own.teamId !== champion.teamId && <p>{teamName(own.teamId)} finished {own.rank}{ordinalSuffix(own.rank)}.</p>
          )}
          <div className="table-wrap">
            <table className="data-table" data-testid="season-finale-table">
              <caption className="sr-only">Final league table{focusTeamId ? ". Your club's row is in bold." : ""}</caption>
              <thead><tr><th scope="col" className="num">Pos</th><th scope="col">Club</th><th scope="col" className="num"><abbr title="Played">P</abbr></th><th scope="col" className="num"><abbr title="Won">W</abbr></th><th scope="col" className="num"><abbr title="Lost">L</abbr></th><th scope="col" className="num"><abbr title="Points">Pts</abbr></th></tr></thead>
              <tbody>
                {[...table].sort((a, b) => a.rank - b.rank).map((row) => (
                  <tr key={row.teamId} data-own={row.teamId === focusTeamId || undefined}>
                    <td className="num">{row.rank}</td>
                    <td>{row.teamId === focusTeamId ? <strong>{teamName(row.teamId)}</strong> : teamName(row.teamId)}</td>
                    <td className="num">{row.played}</td><td className="num">{row.wins}</td><td className="num">{row.losses}</td><td className="num">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {step === "BOARD" && objective && objectiveStatus && (
        <>
          {h3(objectiveStatus.verdictLabel ?? "Board verdict")}
          <p data-testid="season-finale-verdict">{objectiveStatus.sentence}</p>
          <small>{objective.reason}</small>
        </>
      )}
      {step === "STORY" && review && (
        <>
          {h3("The season in results")}
          <p className="season-review-note">Picked from the recorded scorecards by fixed rules, in round order.</p>
          {clubStory.length > 0 && focusTeamId && (
            <section aria-labelledby="season-review-club-story">
              <h4 id="season-review-club-story">{teamName(focusTeamId)}</h4>
              <dl className="season-review-list" data-testid="season-review-club-story">
                {clubStory.map((item) => (
                  <div key={item.kind}><dt>{item.label}</dt><dd>{item.text}</dd></div>
                ))}
              </dl>
            </section>
          )}
          {leagueStory.length > 0 && (
            <section aria-labelledby="season-review-records">
              <h4 id="season-review-records">League bests of the season</h4>
              <dl className="season-review-list" data-testid="season-review-records">
                {leagueStory.map((item) => (
                  <div key={item.kind}><dt>{item.label}</dt><dd>{item.text}</dd></div>
                ))}
              </dl>
            </section>
          )}
        </>
      )}
      {step === "AWARDS" && (
        <>
          {h3("Season awards")}
          <section aria-labelledby="season-review-league-awards">
            <h4 id="season-review-league-awards">The league</h4>
            {awards === null ? (
              <p data-testid="season-finale-awards-pending">The awards are being worked out. They are also on the Statistics page.</p>
            ) : given.length === 0 && !leagueEconomy?.playerId ? (
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
                {leagueEconomy?.playerId && (
                  <div data-testid="season-review-league-economy">
                    <dt>{leagueEconomy.label}</dt>
                    <dd>
                      <strong>{playerName(leagueEconomy.playerId)}</strong>
                      {leagueEconomy.teamId ? ` (${teamName(leagueEconomy.teamId)})` : ""}: {leagueEconomy.value}
                      <small className="season-review-rule">{leagueEconomy.rule}</small>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </section>
          {clubAwards.length > 0 && focusTeamId && (
            <section aria-labelledby="season-review-club-awards">
              <h4 id="season-review-club-awards">{teamName(focusTeamId)}</h4>
              <dl className="season-finale-awards" data-testid="season-review-club-awards">
                {clubAwards.map((award) => (
                  <div key={award.id}>
                    <dt>{award.label}</dt>
                    <dd>
                      {award.playerId ? <><strong>{playerName(award.playerId)}</strong>: {award.value}</> : award.value}
                      {award.rule && <small className="season-review-rule">{award.rule}</small>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </>
      )}
      {step === "SQUAD" && review && (
        <>
          {h3("Your cricketers' seasons")}
          <p className="season-review-note">League matches for {focusTeamId ? teamName(focusTeamId) : "your club"} this season.</p>
          <div className="table-wrap">
            <table className="season-review-squad data-table" data-testid="season-review-squad">
              <caption className="sr-only">Season figures for your club's players</caption>
              <thead>
                <tr>
                  <th scope="col">Player</th><th scope="col" className="num"><abbr title="Matches">M</abbr></th><th scope="col" className="num">Runs</th>
                  <th scope="col" className="num"><abbr title="Highest score">HS</abbr></th><th scope="col" className="num"><abbr title="Wickets">Wkts</abbr></th>
                  <th scope="col" className="num"><abbr title="Economy: runs an over">Econ</abbr></th><th scope="col" className="num">Best</th>
                </tr>
              </thead>
              <tbody>
                {review.squad.map((line) => (
                  <tr key={line.playerId}>
                    <th scope="row">{playerName(line.playerId)}</th>
                    <td className="num">{line.matches}</td>
                    <td className="num">{line.innings > 0 ? line.runs : NONE}</td>
                    <td className="num">{highScore(line)}</td>
                    <td className="num">{line.legalBalls > 0 ? line.wickets : NONE}</td>
                    <td className="num">{line.legalBalls > 0 ? <span title={`${overs(line.legalBalls)} overs`}>{economy(line.runsConceded, line.legalBalls)}</span> : NONE}</td>
                    <td className="num">{line.bestBowling && line.legalBalls > 0 ? `${line.bestBowling.wickets}/${line.bestBowling.runs}` : NONE}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section aria-labelledby="season-review-milestones">
            <h4 id="season-review-milestones">League milestones this season</h4>
            {review.squad.some((line) => line.milestones.length > 0) ? (
              <ul className="season-review-milestones" data-testid="season-review-milestones">
                {review.squad.filter((line) => line.milestones.length > 0).map((line) => (
                  <li key={line.playerId}><strong>{playerName(line.playerId)}</strong>: {line.milestones.map((m) => m.text).join(" ")}</li>
                ))}
              </ul>
            ) : (
              <p data-testid="season-review-milestones">No league milestone was passed this season.</p>
            )}
          </section>
          <section aria-labelledby="season-review-development">
            <h4 id="season-review-development">Development before this season</h4>
            {development ? (
              <div data-testid="season-review-development">
                <p className="season-review-note">Skill changes recorded when Season {development.fromSeasonNumber} closed, for players then at your club.</p>
                {development.improved.length > 0 && <p><strong>Improved:</strong> {changeList(development.improved)}.</p>}
                {development.declined.length > 0 && <p><strong>Declined:</strong> {changeList(development.declined)}.</p>}
                {development.unchanged > 0 && (
                  <p>{development.unchanged} {development.unchanged === 1 ? "player was" : "players were"} unchanged in batting, bowling, fielding and keeping.</p>
                )}
              </div>
            ) : (
              <p data-testid="season-review-development">No season closed before this one in this career, so none is recorded yet. Development is recorded when a season closes.</p>
            )}
          </section>
        </>
      )}
      {step === "AHEAD" && review?.ahead && (
        <>
          {h3(`Looking ahead to Season ${review.ahead.nextSeasonNumber}`)}
          <ul className="season-review-ahead" data-testid="season-review-ahead">
            {review.ahead.sentences.map((sentence) => <li key={sentence.text}>{sentence.text}</li>)}
          </ul>
          <p className="season-review-note">Contract renewals are in the Office; the academy is on the Squad page.</p>
        </>
      )}
      <div className="action-row">
        {index > 0 && (
          <button type="button" data-testid="season-finale-back" onClick={() => go(index - 1)}>
            Back
          </button>
        )}
        <button type="button" className="primary" data-testid="season-finale-continue" onClick={() => (last ? onDone() : go(index + 1))}>
          {last ? "On to the end-of-season business" : `Continue: ${STEP_NAMES[steps[index + 1]!].toLowerCase()}`}
        </button>
        {!last && (
          <button type="button" data-testid="season-finale-skip" onClick={onDone}>
            Skip the review
          </button>
        )}
      </div>
    </article>
  );
}
