import { describe, expect, it } from "vitest";
import { TOURNAMENT_RUN_SCHEMA_ID, type Competition, type TournamentRun } from "@lcxxvi/contracts";
import { TOURNAMENT_PACK, competitionById } from "@lcxxvi/data";
import { viewTournament } from "@lcxxvi/projections";
import { fixtureSeed, tournamentMatchIdentity } from "../../apps/web/src/tournament/runner.js";
import { findTournamentBinding, tournamentComputerTeam, type TournamentMatchSetup } from "../../apps/web/src/tournament/tournament-binding.js";

// Tournament opposition lock: the worker finds the stored run and fixture a match belongs to from stored data only.
const competition = TOURNAMENT_PACK.competitions[0]!;
const run: TournamentRun = {
  schemaId: TOURNAMENT_RUN_SCHEMA_ID,
  runId: "run-binding-test",
  competitionId: competition.competitionId,
  competitionSha256: "a".repeat(64),
  seed: "tour-binding-seed",
  results: [],
};
const fixture = viewTournament(competition, []).fixtures[0]!;
const identity = tournamentMatchIdentity(run.runId, fixture.matchNumber);
const setup: TournamentMatchSetup = {
  format: competition.format,
  gameId: identity.gameId,
  matchId: identity.matchId,
  seed: fixtureSeed(run.seed, fixture.fixtureId),
  teamIds: [fixture.homeTeamId, fixture.awayTeamId],
  groundId: fixture.groundId,
};
const lookup = (id: string): Competition | null => competitionById(id) ?? null;

describe("tournament binding", () => {
  it("binds a match that carries exactly a stored run's fixture identity", () => {
    const binding = findTournamentBinding(setup, [run], lookup, () => null);
    expect(binding).toEqual({
      runId: run.runId,
      competitionId: competition.competitionId,
      fixtureId: fixture.fixtureId,
      teamIds: [fixture.homeTeamId, fixture.awayTeamId],
      auctionPlayerTeamId: null,
    });
  });

  it("does not bind a match whose game id looks like a tournament id but matches no stored run", () => {
    expect(findTournamentBinding(setup, [], lookup, () => null)).toBeNull();
    expect(findTournamentBinding(setup, [{ ...run, runId: "other-run" }], lookup, () => null)).toBeNull();
    expect(findTournamentBinding(setup, [{ ...run, seed: "different" }], lookup, () => null)).toBeNull();
    expect(findTournamentBinding({ ...setup, teamIds: [fixture.awayTeamId, fixture.homeTeamId] }, [run], lookup, () => null)).toBeNull();
    expect(findTournamentBinding({ ...setup, groundId: "elsewhere" }, [run], lookup, () => null)).toBeNull();
    expect(findTournamentBinding({ ...setup, format: "RED_BALL" }, [run], lookup, () => null)).toBeNull();
    expect(findTournamentBinding(setup, [run], () => null, () => null)).toBeNull();
  });

  it("reports the auction's team only when it plays in the fixture", () => {
    expect(findTournamentBinding(setup, [run], lookup, () => fixture.awayTeamId)?.auctionPlayerTeamId).toBe(fixture.awayTeamId);
    expect(findTournamentBinding(setup, [run], lookup, () => "not-in-fixture")?.auctionPlayerTeamId).toBeNull();
  });

  it("gives the computer the side the player did not pick, browser choice first, then the auction", () => {
    const binding = findTournamentBinding(setup, [run], lookup, () => fixture.awayTeamId)!;
    expect(tournamentComputerTeam(binding, fixture.homeTeamId)).toBe(fixture.awayTeamId);
    expect(tournamentComputerTeam(binding, null)).toBe(fixture.homeTeamId);
    expect(tournamentComputerTeam(binding, "not-in-fixture")).toBe(fixture.homeTeamId);
    expect(tournamentComputerTeam({ ...binding, auctionPlayerTeamId: null }, null)).toBeNull();
  });
});
