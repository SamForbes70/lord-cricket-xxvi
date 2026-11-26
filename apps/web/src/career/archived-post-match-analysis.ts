import { T20_LATER_SLOTS, T20_POWERPLAY_SLOTS } from "@lcxxvi/data";
import { projectArchivedPostMatchAnalysis, type ArchivedPostMatchAnalysis } from "@lcxxvi/projections";
import type { T20SeasonMatchCompletion } from "@lcxxvi/contracts";
import type { CareerReplayOutcome } from "./service.js";

/** The legal balls before which a new bowler's default field uses the powerplay positions (engine `defaultSlots`). */
export const T20_DEFAULT_FIELD = { powerplay: T20_POWERPLAY_SLOTS, later: T20_LATER_SLOTS, powerplayLegalBalls: 36 } as const;

export type ArchivedAnalysisResult =
  | { status: "READY"; analysis: ArchivedPostMatchAnalysis }
  | { status: "UNAVAILABLE"; reason: string };

/**
 * LC_POST_MATCH_ANALYSIS_ARCHIVE_V1 for one completed career fixture, from the archive replay the fixture list
 * already loads and verifies. Anything that does not line up (no archive, a damaged archive, events that do not add
 * up to the stored scorecard, a different match) gives no analysis rather than a wrong one.
 */
export function archivedPostMatchAnalysis(
  outcome: CareerReplayOutcome,
  completion: T20SeasonMatchCompletion,
  names: (playerId: string) => string,
  teamName: (teamId: string) => string,
): ArchivedAnalysisResult {
  if (outcome.status === "UNAVAILABLE") {
    return { status: "UNAVAILABLE", reason: "This fixture has no stored ball-by-ball record, which the analysis is worked out from." };
  }
  if (outcome.status === "DAMAGED") {
    return { status: "UNAVAILABLE", reason: "The stored ball-by-ball record for this fixture could not be verified, so no analysis is shown." };
  }
  const { replay, archive } = outcome;
  const session = replay.session;
  const mismatch = { status: "UNAVAILABLE", reason: "The stored ball-by-ball record does not match this fixture's scorecard, so no analysis is shown." } as const;
  if (archive.fixtureId !== completion.fixtureId || archive.matchId !== completion.matchId || session.setup.matchId !== completion.matchId ||
    replay.scorecardSha256 !== completion.scorecardSha256) return mismatch;
  try {
    const teams = session.setup.teams.map((t) => ({ teamId: t.teamId, playerIds: [...t.playerIds], keeperId: t.keeperId }));
    const players = teams.flatMap((t) => t.playerIds);
    return {
      status: "READY",
      analysis: projectArchivedPostMatchAnalysis({
        events: session.events,
        scorecard: completion.scorecard,
        teams,
        names: Object.fromEntries(players.map((id) => [id, names(id)])),
        teamNames: Object.fromEntries(teams.map((t) => [t.teamId, teamName(t.teamId)])),
        defaultField: T20_DEFAULT_FIELD,
      }),
    };
  } catch {
    return mismatch;
  }
}
