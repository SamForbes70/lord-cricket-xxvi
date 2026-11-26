import type { Ref } from "react";
import { POST_MATCH_ANALYSIS_RULES } from "@lcxxvi/projections";
import { DecisionItem, PhaseTable, TurningPoints } from "../match/PostMatchAnalysisPanel.js";
import type { ArchivedAnalysisResult } from "./archived-post-match-analysis.js";
import "../match/post-match-analysis.css";

/**
 * LC_POST_MATCH_ANALYSIS_ARCHIVE_V1, reopened from the career fixture list. The same phase table and turning
 * points as at full time; plan and field changes from the stored record without saying who made them; no
 * "your decisions" list. When the record cannot be rebuilt, a short note and nothing else.
 */
export function ArchivedPostMatchAnalysisPanel({ result, teamName, panelRef }: {
  result: ArchivedAnalysisResult;
  teamName: (teamId: string) => string;
  panelRef?: Ref<HTMLElement>;
}) {
  if (result.status !== "READY") {
    return (
      <section ref={panelRef} tabIndex={-1} className="post-match-analysis" data-testid="archived-post-match-analysis" data-status="UNAVAILABLE" aria-labelledby="apma-heading">
        <h4 id="apma-heading">Post-match analysis</h4>
        <p role="status" data-testid="apma-unavailable">Not available. {result.reason}</p>
      </section>
    );
  }
  const { analysis } = result;
  const sides = analysis.phases.map((p) => p.battingTeamId).filter((id) => (analysis.changeCounts[id] ?? 0) > 0);
  const total = analysis.changes.length;
  return (
    <section ref={panelRef} tabIndex={-1} className="post-match-analysis" data-testid="archived-post-match-analysis" data-status="READY"
      data-version={analysis.version} data-rules-version={analysis.rulesVersion} aria-labelledby="apma-heading">
      <h4 id="apma-heading">Post-match analysis</h4>
      <p className="pma-intro">
        Worked out again from this fixture&apos;s stored ball-by-ball record and its scorecard. Each line is something that
        happened. Where a change is listed next to what came after it, that is the order of events, not a claim that one
        caused the other.
      </p>
      {analysis.toss && <p data-testid="apma-toss">{analysis.toss}</p>}

      <PhaseTable phases={analysis.phases} teamName={teamName} headingLevel={5} idPrefix="apma" />
      <TurningPoints points={analysis.turningPoints} headingLevel={5} idPrefix="apma" />

      <section aria-labelledby="apma-changes-heading" data-testid="apma-changes">
        <h5 id="apma-changes-heading">Plan and field changes in the record</h5>
        <p className="pma-sub-intro" data-testid="apma-no-attribution">
          The stored record keeps what happened, not who decided it. These changes are not credited to you or to the
          computer captain, and the &quot;Your decisions&quot; list shown at full time is not repeated here.
        </p>
        {total === 0 ? (
          <p data-testid="apma-no-changes">The record has no batting plan, bowling plan or field changes for this match.</p>
        ) : (
          <>
            <p data-testid="apma-change-count">
              The record has {total} {total === 1 ? "change" : "changes"}:{" "}
              {sides.map((id) => `${analysis.changeCounts[id]} for ${teamName(id)}`).join(" and ")}.
            </p>
            {sides.map((teamId) => {
              const list = analysis.changes.filter((c) => c.teamId === teamId);
              return (
                <details key={teamId} className="pma-picks" data-testid={`apma-side-${teamId}`}>
                  <summary>Changes for {teamName(teamId)} ({list.length})</summary>
                  <ol className="pma-decisions">
                    {list.map((change, n) => (
                      <DecisionItem key={n} decision={change} />
                    ))}
                  </ol>
                </details>
              );
            })}
          </>
        )}
      </section>

      <details className="technical-details pma-footnote" data-testid="pma-footnote">
        <summary>What is and is not shown</summary>
        <ul>
          <li>Phase by phase and turning points use the same fixed rules as the analysis at full time ({analysis.rulesVersion}).</li>
          <li>
            Not shown: who made each change; the comparison of the eleven with the suggested eleven, since the record does not
            keep the squad and ratings as they stood on match day; and batter and bowler picks, which the ball-by-ball list below shows.
          </li>
          <li>
            A new bowler starts with the default bowling plan and field, so a bowling plan or field change lasts at most until the
            end of that over. Each change is compared with the setting in place just before it, worked out from the record the
            same way the match applies it. A change that left a setting as it was is not listed.
          </li>
          <li>Bowling plans and field settings showed no detectable effect on results in the current model, so what followed them is shown as a record only. Batting aggression showed a small effect at most.</li>
          <li>&quot;What followed&quot; covers the next {POST_MATCH_ANALYSIS_RULES.followLegalBalls / 6} overs of that innings.</li>
          <li>Analysis version {analysis.version}. Nothing here is saved; it is worked out again from the stored record each time.</li>
        </ul>
      </details>
    </section>
  );
}
