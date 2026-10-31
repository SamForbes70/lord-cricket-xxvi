import { readFileSync } from "node:fs";
import { createStagedRosterPack } from "@lcxxvi/simulation";
import { createRosterSeason, simulateNextRosterSeasonFixture, validateRosterSeasonState } from "../apps/web/src/career/roster-season.js";
const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
const pack = createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "full-season", world: { ...world, players } }), world.rulesIds, ["stock"]);
let state = createRosterSeason(pack, { careerId: "career", controlledTeamId: world.teams[0].teamId, seasonId: "season", gameId: "game", seasonSeed: "full-season", startDate: "2027-01-03" });
while (state.phase !== "COMPLETE") { state = simulateNextRosterSeasonFixture(state, pack); if (state.outcomes.length % 4 === 0) console.log(`${state.outcomes.length}/56`); }
validateRosterSeasonState(JSON.parse(JSON.stringify(state)), pack);
if (state.outcomes.length !== 56 || state.projection.table.some(row => row.played !== 14)) throw new Error("FULL_SEASON_MISMATCH");
console.log("Full roster season PASS: 56 fixtures; eight teams played 14 matches.");
