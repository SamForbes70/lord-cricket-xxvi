import type { Competition, TournamentRun } from "@lcxxvi/contracts";
import { viewTournament } from "@lcxxvi/projections";
import type { TournamentBinding } from "../match/protocol.js";
import { fixtureSeed, tournamentMatchIdentity } from "./runner.js";

/** The parts of a match session's setup that fix which tournament fixture it is. */
export type TournamentMatchSetup = {
  format: string;
  gameId: string;
  matchId: string;
  seed: string;
  teamIds: readonly string[];
  groundId: string;
};

/**
 * Finds the stored tournament run and fixture a match belongs to, from stored data only: each run's competition is
 * expanded into its fixtures (the same derivation the Tournaments screen uses), and the match must carry exactly that
 * fixture's game id, match id, seed, teams (home first) and ground. The game id string is never parsed.
 *
 * `auctionPlayerTeamId` is the team the player bid for in the run's stored auction, or null (no auction, or the
 * computer bid for every team). It is reported as the player's team only when it is one of the fixture's two teams.
 */
export function findTournamentBinding(
  setup: TournamentMatchSetup,
  runs: readonly TournamentRun[],
  competitionFor: (competitionId: string) => Competition | null,
  auctionPlayerTeamId: (runId: string) => string | null,
): TournamentBinding | null {
  if (setup.format !== "T20" && setup.format !== "ODI") return null;
  for (const run of runs) {
    const competition = competitionFor(run.competitionId);
    if (!competition || competition.format !== setup.format) continue;
    let fixtures;
    try {
      fixtures = viewTournament(competition, run.results).fixtures;
    } catch {
      continue;
    }
    for (const fixture of fixtures) {
      const identity = tournamentMatchIdentity(run.runId, fixture.matchNumber);
      if (
        identity.gameId !== setup.gameId ||
        identity.matchId !== setup.matchId ||
        fixtureSeed(run.seed, fixture.fixtureId) !== setup.seed ||
        setup.teamIds[0] !== fixture.homeTeamId ||
        setup.teamIds[1] !== fixture.awayTeamId ||
        setup.groundId !== fixture.groundId
      )
        continue;
      const teamIds: [string, string] = [fixture.homeTeamId, fixture.awayTeamId];
      const bid = auctionPlayerTeamId(run.runId);
      return {
        runId: run.runId,
        competitionId: competition.competitionId,
        fixtureId: fixture.fixtureId,
        teamIds,
        auctionPlayerTeamId: bid !== null && teamIds.includes(bid) ? bid : null,
      };
    }
  }
  return null;
}

/**
 * The side the computer captain plays in a tournament fixture: the fixture's other team from the player's. The player's
 * team is the per-browser choice made on the Tournaments screen, else the team bid for in the run's auction (the same
 * order the Tournaments screen uses). Null when neither names one of the fixture's teams.
 */
export function tournamentComputerTeam(binding: TournamentBinding, browserChoice: string | null): string | null {
  const player = browserChoice !== null && binding.teamIds.includes(browserChoice) ? browserChoice : binding.auctionPlayerTeamId;
  if (player === null) return null;
  return binding.teamIds[0] === player ? binding.teamIds[1] : binding.teamIds[0];
}
