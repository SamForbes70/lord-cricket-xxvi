import type { PostMatchAnalysis, PostMatchAnalysisV2, PostMatchDecision, PostMatchMeasuredEffectV2 } from "@lcxxvi/projections";
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

/** V1 decisions (the archived view) carry a V1 effect key; V2 decisions carry their own note, measured under named versions. */
type DecisionLine = Pick<PostMatchDecision, "kind" | "when" | "summary" | "followed">
  & ({ measured: PostMatchDecision["measured"]; measuredNote?: undefined } | { measured: PostMatchMeasuredEffectV2; measuredNote: string });

export function DecisionItem({ decision }: { decision: DecisionLine }) {
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
      <p className="pma-measured">{decision.measuredNote ?? POST_MATCH_MEASURED_NOTES[decision.measured as PostMatchDecision["measured"]]}</p>
    </li>
  );
}

/** Phase by phase: the same table in the live and the archived analysis. */
export function PhaseTable({ phases, teamName, headingLevel = 4, idPrefix = "pma" }: {
  phases: PostMatchAnalysis["phases"];
  teamName: (teamId: string) => string;
  headingLevel?: 4 | 5;
  idPrefix?: string;
}) {
  const Heading = headingLevel === 4 ? "h4" : "h5";
  return (
    <section aria-labelledby={`${idPrefix}-phases-heading`} data-testid="pma-phases">
      <Heading id={`${idPrefix}-phases-heading`}>Phase by phase</Heading>
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
            {phases.map((innings) => (
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
  );
}

/** Turning points under the fixed V1 rule. */
export function TurningPoints({ points, headingLevel = 4, idPrefix = "pma" }: {
  points: PostMatchAnalysis["turningPoints"];
  headingLevel?: 4 | 5;
  idPrefix?: string;
}) {
  const Heading = headingLevel === 4 ? "h4" : "h5";
  return (
    <section aria-labelledby={`${idPrefix}-turning-heading`} data-testid="pma-turning-points">
      <Heading id={`${idPrefix}-turning-heading`}>Turning points</Heading>
      <p className="pma-sub-intro">
        The passages furthest from each innings&apos; own scoring rate, any run of three overs with three or more wickets,
        the biggest stand, and the death overs when the two sides differed widely. The same fixed rule applies to every match.
      </p>
      {points.length === 0 ? (
        <p>No passage met the rule in this match: scoring and wickets stayed close to each innings&apos; own rate.</p>
      ) : (
        <ol className="pma-turning">
          {points.map((point) => (
            <li key={`${point.kind}-${point.inningsIndex}-${point.fromOver}`} data-kind={point.kind}>{point.text}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** LC_POST_MATCH_ANALYSIS_V2: the versions the match records, and the versions and date of the evidence behind the notes. */
function VersionsSection({ analysis }: { analysis: PostMatchAnalysisV2 }) {
  const v = analysis.versions, e = analysis.evidence;
  return (
    <section aria-labelledby="pma-versions-heading" data-testid="pma-versions">
      <h4 id="pma-versions-heading">Model and versions</h4>
      <ul className="pma-versions">
        <li data-testid="pma-versions-model">
          {v.model
            ? <>Model: <code>{v.model}</code>, as recorded in this match&apos;s setup.</>
            : <>Model: not available from this match&apos;s record.</>}
        </li>
        <li data-testid="pma-versions-captain">
          {v.computerDecisions === 0 ? (
            <>No decision in this match is credited to the computer, so no computer captain version applies.</>
          ) : (
            <>
              Computer captain: not recorded. The match record keeps the computer&apos;s {v.computerDecisions}{" "}
              {v.computerDecisions === 1 ? "decision" : "decisions"} as commands, without the captain or batting policy version that chose them.
              This build&apos;s computer captain is <code>{v.buildCaptain.captain}</code> with batting policy <code>{v.buildCaptain.battingPolicy}</code>;
              a match started in an earlier build, or saved and resumed, can hold decisions from an earlier captain.
            </>
          )}
        </li>
        <li data-testid="pma-versions-evidence">
          Measured notes: tactical validation of {e.dateText}, model <code>{e.model}</code> with computer captain <code>{e.captain}</code>{" "}
          and batting policy <code>{e.battingPolicy}</code>, {e.matchesPerExperiment} simulated matches for each experiment.
          {!v.evidenceModelMatches && " This match's model is not the one the notes were measured under, so the notes do not describe this match's model."}
        </li>
      </ul>
    </section>
  );
}

/**
 * LC_POST_MATCH_ANALYSIS_V2. Presentation of a read-only analysis derived from the match record.
 * `focusTeamIds` are the sides the player managed: one against a computer opponent, both in a two-player match.
 */
export function PostMatchAnalysisPanel({ analysis, focusTeamIds, teamName }: {
  analysis: PostMatchAnalysisV2;
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

      <PhaseTable phases={analysis.phases} teamName={teamName} />
      <TurningPoints points={analysis.turningPoints} />

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

      <VersionsSection analysis={analysis} />

      <details className="technical-details pma-footnote" data-testid="pma-footnote">
        <summary>What is and is not measured</summary>
        <ul>
          <li>
            The measured notes come from the tactical validation of {analysis.evidence.dateText} (batting policy V3 page): {analysis.evidence.matchesPerExperiment} simulated
            matches for each experiment under <code>{analysis.evidence.model}</code>, with the computer captain <code>{analysis.evidence.captain}</code> and
            batting policy <code>{analysis.evidence.battingPolicy}</code> making every choice on both sides except the one under test, asked before every ball.
            They are simulated matches, not human play.
          </li>
          <li>
            Each experiment held one poor setting on one side for a whole match or innings. A single change during a match, as listed above, was not measured:
            the notes say what a setting did over whole matches.
          </li>
          <li>
            Batting order and the old selection rule showed clear effects on results; the weakest eleven did not show one the measurement could tell apart from none.
            Blocking every ball showed a clear effect; attacking every ball did not change results measurably.
          </li>
          <li>Bowler choice, the four bowling plans tested and the two-slip field held all innings showed no detectable effect on results, so what followed them is shown as a record only.</li>
          <li>Batting intent, the toss and the choice to bat or bowl were not measured.</li>
          <li>
            &quot;What followed&quot; covers the next {POST_MATCH_ANALYSIS_RULES.followLegalBalls / 6} overs of that innings. Picks made by the
            routine-picks setting are sent as your own commands, so they are listed as yours. A super over, if any, is not included.
          </li>
          <li>
            Analysis version {analysis.version}, with the {analysis.rulesVersion} rules for phases, turning points and what followed.
            Nothing here is saved; it is worked out again from the match record each time.
          </li>
        </ul>
      </details>
    </section>
  );
}
