import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CompetitionSchema, CustomCompetitionSchema, UserCompetitionRecordSchema, UserCompetitionSchema, USER_COMPETITION_SCHEMA_ID, type TournamentResult, type UserCompetition } from "@lcxxvi/contracts";
import { TOURNAMENT_PACK } from "@lcxxvi/data";
import { viewTournament } from "@lcxxvi/projections";
import { playTournamentFixture } from "../../apps/web/src/tournament/runner.js";
import {
  buildUserCompetition,
  parseUserCompetitionPack,
  userCompetitionPackText,
  USER_COMPETITION_PACK_MAX_BYTES,
  type UserCompetitionDraft,
} from "../../apps/web/src/tournament/user-competitions.js";

// Stage 15 user-authored tournaments (owner decision 17 November 2026, answer 5a: the parts that need no historical data).
const root = resolve(import.meta.dirname, "../..");
const worldBytes = new Uint8Array(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json")));
const manifest = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.manifest.json"), "utf8"));
const world = JSON.parse(new TextDecoder().decode(worldBytes)) as { teams: { teamId: string; name: string }[]; grounds: { groundId: string; name: string }[] };
const names = Object.fromEntries(world.teams.map((t) => [t.teamId, t.name]));
const teams = world.teams.map((t) => t.teamId);
const grounds = world.grounds.map((g) => g.groundId);

const draft = (over: Partial<UserCompetitionDraft>): UserCompetitionDraft => ({
  title: "Harbour Cup",
  format: "T20",
  structure: "ROUND_ROBIN",
  seriesMatches: 3,
  teamIds: teams.slice(0, 3),
  groundIds: grounds.slice(0, 2),
  ...over,
});

describe("Stage 15 user-authored tournaments", () => {
  it("builds every structure from the form's choices", () => {
    const rr = buildUserCompetition(draft({}), "user-a", world);
    expect(rr).toMatchObject({ sourceType: "USER_AUTHORED", structure: { kind: "ROUND_ROBIN", legs: 1, finalTopTwo: false }, points: { win: 2, tie: 1, loss: 0 } });
    expect(rr.summary).toBe("A T20 round robin for 3 teams.");
    expect(buildUserCompetition(draft({ structure: "DOUBLE_ROUND_ROBIN" }), "user-b", world).structure).toEqual({ kind: "ROUND_ROBIN", legs: 2, finalTopTwo: false });
    expect(buildUserCompetition(draft({ structure: "ROUND_ROBIN_FINAL", format: "ODI" }), "user-c", world).summary).toBe(
      "A one-day round robin for 3 teams, then a final between the top two.",
    );
    const groups = buildUserCompetition(draft({ structure: "GROUPS_KNOCKOUT", teamIds: teams.slice(0, 7) }), "user-d", world);
    expect(groups.structure).toEqual({ kind: "GROUPS_KNOCKOUT", groups: [[teams[0], teams[2], teams[4], teams[6]], [teams[1], teams[3], teams[5]]] });
    expect(buildUserCompetition(draft({ structure: "SERIES", seriesMatches: 5, teamIds: teams.slice(0, 2) }), "user-e", world).structure).toEqual({ kind: "SERIES", matches: 5 });
  });

  it("explains what is wrong with a choice the structure cannot take", () => {
    expect(() => buildUserCompetition(draft({ title: "  " }), "user-x", world)).toThrow("Give the tournament a name.");
    expect(() => buildUserCompetition(draft({ groundIds: [] }), "user-x", world)).toThrow("Choose at least one ground.");
    expect(() => buildUserCompetition(draft({ teamIds: teams.slice(0, 1) }), "user-x", world)).toThrow("Choose at least two teams.");
    expect(() => buildUserCompetition(draft({ structure: "SERIES" }), "user-x", world)).toThrow("A series needs exactly two teams.");
    expect(() => buildUserCompetition(draft({ structure: "GROUPS_KNOCKOUT", teamIds: teams.slice(0, 5) }), "user-x", world)).toThrow("six to eight teams");
    expect(() => buildUserCompetition(draft({ structure: "ROUND_ROBIN_FINAL", teamIds: teams.slice(0, 2) }), "user-x", world)).toThrow("at least three teams");
    expect(() => buildUserCompetition(draft({ teamIds: ["team-01", "team-99"] }), "user-x", world)).toThrow("not in this world");
    // A user-authored id always starts with "user-", so it can never collide with a curated competition.
    expect(() => buildUserCompetition(draft({}), "eight-nations-cup", world)).toThrow();
  });

  it("keeps curated and user-authored competitions apart, and both work through the tournament code", () => {
    for (const c of TOURNAMENT_PACK.competitions) {
      expect(CustomCompetitionSchema.parse(c)).toEqual(c);
      expect(UserCompetitionSchema.safeParse(c).success).toBe(false);
      expect(CompetitionSchema.parse(c)).toEqual(c);
    }
    const mine = buildUserCompetition(draft({}), "user-f", world);
    expect(CustomCompetitionSchema.safeParse(mine).success).toBe(false);
    expect(CompetitionSchema.parse(mine)).toEqual(mine);
    expect(UserCompetitionRecordSchema.parse({ schemaId: USER_COMPETITION_SCHEMA_ID, competition: mine }).competition).toEqual(mine);
  });

  it("plays a user-authored round robin to a winner on the engines", () => {
    const c = buildUserCompetition(draft({ teamIds: ["team-02", "team-05", "team-07"], groundIds: ["ground-03"] }), "user-play", world);
    const results: TournamentResult[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const view = viewTournament(c, results);
      if (!view.next) break;
      results.push(playTournamentFixture({ competition: c, fixture: view.next, runId: "user-run", runSeed: "user-seed", worldBytes, worldManifest: manifest, teamName: (id) => names[id] ?? id }));
    }
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.resultText.length > 0)).toBe(true);
    expect(viewTournament(c, results).outcome.status).not.toBe("IN_PROGRESS");
  }, 120_000);

  it("saves tournaments to a file and loads them back, treating the file as untrusted", () => {
    const a = buildUserCompetition(draft({}), "user-g", world);
    const b = buildUserCompetition(draft({ title: "Fen Series", structure: "SERIES", teamIds: teams.slice(2, 4) }), "user-h", world);
    const text = userCompetitionPackText([a, b]);
    const loaded = parseUserCompetitionPack(text.length, text, world, new Set(["user-g"]));
    expect(loaded.added).toEqual([b]);
    expect(loaded.skipped).toEqual(["Harbour Cup"]);
    expect(() => parseUserCompetitionPack(USER_COMPETITION_PACK_MAX_BYTES + 1, text, world, new Set())).toThrow("too large");
    expect(() => parseUserCompetitionPack(5, "{nope", world, new Set())).toThrow("not a tournament pack");
    expect(() => parseUserCompetitionPack(2, "{}", world, new Set())).toThrow("not a valid tournament pack");
    const curated = JSON.stringify({ schemaId: "LC_USER_COMPETITION_PACK_V1", competitions: [TOURNAMENT_PACK.competitions[0]] });
    expect(() => parseUserCompetitionPack(curated.length, curated, world, new Set())).toThrow("not a valid tournament pack");
    const foreign: UserCompetition = { ...a, competitionId: "user-i", teamIds: ["team-01", "team-42"] };
    const bad = JSON.stringify({ schemaId: "LC_USER_COMPETITION_PACK_V1", competitions: [foreign] });
    expect(() => parseUserCompetitionPack(bad.length, bad, world, new Set())).toThrow("not in this world");
  });
});
