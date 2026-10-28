/** Measures unchanged engine operations in a worker without using timings to choose cricket outcomes. */
import worldText from "../../packages/data/worlds/fictional-eight-01.json?raw";
import manifestText from "../../packages/data/worlds/fictional-eight-01.manifest.json?raw";
import t20Text from "../fixtures/world/t20-valid-setup.json?raw";
import redText from "../fixtures/world/red5-valid-setup.json?raw";
import { validateT20MatchSetup, validateRed5MatchSetup, runFixtureT20, runFixtureRed5, generateSeasonSchedule, createCareerDayStateV2, advanceCareerDayV2, simulateOffscreenRound } from "@lcxxvi/simulation";
import { FROZEN_WORLD_PINS, T20_LEAGUE_COMPETITION } from "@lcxxvi/data";
import { applyT20SeasonMatchCompletion, completionFromOffscreenOutcome, createT20SeasonProjection } from "@lcxxvi/projections";
import { sealT20SeasonState } from "@lcxxvi/persistence";
const scope = globalThis as unknown as { onmessage: (() => void) | null; postMessage: (value: unknown) => void };
scope.onmessage = async () => {
  try {
    const bytes = new TextEncoder().encode(worldText), manifest = JSON.parse(manifestText);
    const t20Ms: number[] = [], red5Ms: number[] = [], eventHashes: string[] = [];
    for (let sample = 0; sample < 20; sample++) {
      const request = JSON.parse(t20Text); request.setup.seed = `acceptance-t20-${sample}`;
      const setup = validateT20MatchSetup(request, bytes, manifest), began = performance.now();
      const session = runFixtureT20(setup); t20Ms.push(performance.now() - began);
      if (session.core.phase !== "COMPLETE") throw new Error("BENCHMARK_T20_INCOMPLETE");
      eventHashes.push(session.lastEventHash);
    }
    for (let sample = 0; sample < 20; sample++) {
      const request = JSON.parse(redText); request.setup.seed = `acceptance-red5-${sample}`;
      const setup = validateRed5MatchSetup(request, bytes, manifest), began = performance.now();
      const session = runFixtureRed5(setup); red5Ms.push(performance.now() - began);
      if (session.core.phase !== "COMPLETE") throw new Error("BENCHMARK_RED5_INCOMPLETE");
      eventHashes.push(session.lastEventHash);
    }
    const schedule = generateSeasonSchedule({ scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1", seasonId: "season-acceptance-performance", gameId: "game-acceptance-performance", competitionId: "LC_T20_LEAGUE_01", worldPackId: "fictional-eight-01", worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
      seasonSeed: "acceptance-league-fixed-seed", startDate: "2027-01-03", teamIds: [...T20_LEAGUE_COMPETITION.teamIds], groundIds: [...T20_LEAGUE_COMPETITION.groundIds], homeGroundIds: { ...T20_LEAGUE_COMPETITION.homeGroundIds } });
    let career = createCareerDayStateV2({ careerId: "career-acceptance-performance", schedule });
    let projection = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule });
    const completedMatches = [], began = performance.now();
    for (const round of schedule.rounds) {
      while (career.currentDate < round.matchDayDate) career = advanceCareerDayV2(career).state;
      const execution = simulateOffscreenRound({ schedule, careerState: career, roundNumber: round.roundNumber, worldBytes: bytes, worldManifest: manifest });
      for (const outcome of execution.result.outcomes) {
        const completion = completionFromOffscreenOutcome(schedule, outcome);
        projection = applyT20SeasonMatchCompletion({ state: projection, competition: T20_LEAGUE_COMPETITION, schedule, completion });
        completedMatches.push(completion);
      }
      career = execution.careerState;
    }
    const leagueMs = performance.now() - began;
    if (completedMatches.length !== 56) throw new Error("BENCHMARK_LEAGUE_INCOMPLETE");
    const state = await sealT20SeasonState({ seasonStateVersion: "LC_T20_SEASON_STATE_V1", seasonId: schedule.seasonId, gameId: schedule.gameId, careerId: career.careerId, controlledTeamId: "team-01", schedule, careerState: career, projection, completedMatches, revision: 56, phase: "COMPLETE" });
    scope.postMessage({ ok: true, t20Ms, red5Ms, leagueMs, eventHashes, state });
  } catch (error) { scope.postMessage({ ok: false, error: String(error) }); }
};
