import type { PostMatchAnalysis, PostMatchDecision } from "@lcxxvi/projections";
import { POST_MATCH_MEASURED_NOTES, POST_MATCH_ANALYSIS_RULES } from "@lcxxvi/projections";
import "./post-match-analysis.css";

const PHASE_LABEL = { POWERPLAY: "Powerplay", MIDDLE: "Middle", DEATH: "Death" } as const;
const KIND_LABEL: Record<PostMatchDecision["kind"], string> = {
  SELECTION: "Selection",
  TOSS: "Toss",
  INNINGS_CHOICE: "Bat or bowl",
  BATTING_PLAN: "Batting plan",
  BOWLING_PLAN: "Bowling plan",
  FIELD: "Field",
  BOWLER: "Bowler",
  BATTER: "Batter",
};

function overs(legalBalls: number): string {
  return legalBalls % 6 === 0 ? `${legalBalls / 6}` : `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function DecisionItem({ decision }: { decision: PostMatchDecision }) {
  return (
    <li className="pma-decision" data-kind={decision.kind} data-measured={decision.measured}>
      <p className="pma-decision-head">
        <span className="pma-when">{decision.when}</span>
        <span className="pma-kind">{KIND_LABEL[decision.kind]}</span>
      </p>
      <p>{decision.summary}</p>
      {decision.followed && (
        <p className="pma-followed">
          <span className="pma-label">What followed: </span>
          {decision.followed}
        </p>
      )}
      <p className="pma-measured">{POST_MATCH_MEASURED_NOTES[decision.measured]}</p>
    </li>
  );
}

/**
 * LC_POST_MATCH_ANALYSIS_V1. Presentation of a read-only analysis derived from the match record.
 * `focusTeamIds` are the sides the player managed: one against a computer opponent, both in a two-player match.
 */
export function PostMatchAnalysisPanel({ analysis, focusTeamIds, teamName }: {
  analysis: PostMatchAnalysis;
  focusTeamIds: readonly string[];
  teamName: (teamId: string) => string;
}) {
  // The managed sides first, then any other side the player gave a command for (for example an opponent batter's plan).
  const teamIds = analysis.phases.map((p) => p.battingTeamId);
  const sides = [
    ...focusTeamIds.filter((id) => teamIds.includes(id)),
    ...teamIds.filter((id) => !focusTeamIds.includes(id) && analysis.decisions.some((d) => d.teamId === id && d.actor === "USER")),
  ];
  return (
    <section className="post-match-analysis" data-testid="post-match-analysis" data-version={analysis.version} aria-labelledby="pma-heading">
      <h3 id="pma-heading">Post-match analysis</h3>
      <p className="pma-intro">
        Built only from this match&apos;s recorded balls, decisions and scorecard. Each line is something that happened.
        Where a decision is listed next to what came after it, that is the order of events, not a claim that one caused
        the other.
      </p>

      <section aria-labelledby="pma-phases-heading" data-testid="pma-phases">
        <h4 id="pma-phases-heading">Phase by phase</h4>
        <div className="pma-table-wrap">
          <table className="pma-phases">
            <caption className="sr-only">Runs and wickets by phase for each innings</caption>
            <thead>
              <tr>
                <th scope="col">Batting side</th>
                {POST_MATCH_ANALYSIS_RULES.phases.map((p) => (
                  <th scope="col" key={p.phase}>
                    {PHASE_LABEL[p.phase]} <span className="pma-sub">overs {p.fromOver} to {p.toOver}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.phases.map((innings) => (
                <tr key={innings.inningsIndex} data-testid={`pma-phase-row-${innings.inningsIndex}`}>
                  <th scope="row">
                    {teamName(innings.battingTeamId)}
                    <span className="pma-sub">{innings.runs}/{innings.wickets} ({overs(innings.legalBalls)} overs)</span>
                  </th>
                  {innings.lines.map((line) => (
                    <td key={line.phase}>
                      {line.reached ? (
                        <>
                          <strong>{line.runs}/{line.wickets}</strong>
                          <span className="pma-sub">{overs(line.legalBalls)} overs</span>
                        </>
                      ) : (
                        <span className="pma-sub">Not reached</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="pma-turning-heading" data-testid="pma-turning-points">
        <h4 id="pma-turning-heading">Turning points</h4>
        <p className="pma-sub-intro">
          The passages furthest from each innings&apos; own scoring rate, any run of three overs with three or more wickets,
          the biggest stand, and the death overs when the two sides differed widely. The same fixed rule applies to every match.
        </p>
        {analysis.turningPoints.length === 0 ? (
          <p>No passage met the rule in this match: scoring and wickets stayed close to each innings&apos; own rate.</p>
        ) : (
          <ol className="pma-turning">
            {analysis.turningPoints.map((point) => (
              <li key={`${point.kind}-${point.inningsIndex}-${point.fromOver}`} data-kind={point.kind}>{point.text}</li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="pma-decisions-heading" data-testid="pma-decisions">
        <h4 id="pma-decisions-heading">Your decisions and what followed</h4>
        {sides.map((teamId) => {
          const managed = focusTeamIds.includes(teamId);
          const mine = analysis.decisions.filter((d) => d.teamId === teamId && (d.actor === "USER" || (managed && d.actor === "SETUP" && d.kind === "SELECTION")));
          const timeline = mine.filter((d) => d.kind !== "BATTER" && d.kind !== "BOWLER");
          const picks = mine.filter((d) => d.kind === "BATTER" || d.kind === "BOWLER");
          const delegated = analysis.commandCounts[teamId]?.ai ?? 0;
          return (
            <div key={teamId} className="pma-side" data-testid={`pma-side-${teamId}`}>
              {sides.length > 1 && <h5>For {teamName(teamId)}</h5>}
              <ol className="pma-decisions">
                {timeline.map((d, n) => <DecisionItem key={`t${n}`} decision={d} />)}
              </ol>
              {picks.length > 0 && (
                <details className="pma-picks">
                  <summary>Batter and bowler picks ({picks.length})</summary>
                  <ol className="pma-decisions">
                    {picks.map((d, n) => <DecisionItem key={`p${n}`} decision={d} />)}
                  </ol>
                </details>
              )}
              {managed && delegated > 0 && (
                <p className="pma-sub" data-testid="pma-delegated">
                  The computer captain made {delegated} {delegated === 1 ? "decision" : "decisions"} for {teamName(teamId)}; they are not listed here.
                </p>
              )}
            </div>
          );
        })}
      </section>

      <details className="technical-details pma-footnote" data-testid="pma-footnote">
        <summary>What is and is not measured</summary>
        <ul>
          <li>
            The measured notes come from the tactical validation of 25 November 2026: 200 simulated matches for each kind of
            decision, comparing good and deliberately poor management under the current model. They are simulated matches, not human play.
          </li>
          <li>Who is picked and the batting order showed clear effects on results. Batting aggression showed a small effect at most.</li>
          <li>Bowler choice, bowling plans and field settings showed no detectable effect on results in the current model, so what followed them is shown as a record only.</li>
          <li>Batting intent, the toss and the choice to bat or bowl were not measured.</li>
          <li>
            &quot;What followed&quot; covers the next {POST_MATCH_ANALYSIS_RULES.followLegalBalls / 6} overs of that innings. Picks made by the
            routine-picks setting are sent as your own commands, so they are listed as yours. A super over, if any, is not included.
          </li>
          <li>Analysis version {analysis.version}. Nothing here is saved; it is worked out again from the match record each time.</li>
        </ul>
      </details>
    </section>
  );
}
