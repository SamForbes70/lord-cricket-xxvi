import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { WorldPack } from "@lcxxvi/contracts";
import { isBowlingCapable } from "@lcxxvi/data";
import {
  BATTING_STYLE_TABLE,
  BOWLING_STYLE_TABLE,
  PERSONALITY_TRAITS,
  PLAYER_IDENTITY_VERSION,
  PLAYING_STYLE_RULES,
  derivePlayerIdentity,
  matchIntroduction,
  personalityTraits,
  playingStyle,
  storySoFar,
  type PlayingStyle,
  type PlayingStyleInput,
  type StoryRecord,
} from "@lcxxvi/projections";

// LC_PLAYER_IDENTITY_V1 (docs/pavilion/PLAYER_IDENTITY_V1.md).
const root = resolve(import.meta.dirname, "../..");
const world = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json"), "utf8")) as WorldPack;
const input = (p: WorldPack["players"][number]): PlayingStyleInput => ({
  playerId: p.playerId,
  role: p.role,
  bowlingStyle: p.bowlingStyle,
  skills: p.skills.T20!,
});
const allRows = [...BATTING_STYLE_TABLE, ...Object.values(BOWLING_STYLE_TABLE).flat()];

const emptyRecord: StoryRecord = {
  name: "Test Player",
  club: { name: "Aster Quay", relation: "CURRENT" },
  age: 24,
  retired: false,
  matches: 0,
  seasonsPlayed: 0,
  runs: 0,
  battingInnings: 0,
  highScore: null,
  fifties: 0,
  hundreds: 0,
  wickets: 0,
  bestBowling: null,
  playerOfTheMatchCount: 0,
  seasonAwardsWon: 0,
  recentMatches: [],
};
const bat = (seasonNumber: number, roundNumber: number, runs: number, notOut = false) =>
  ({ seasonNumber, roundNumber, batted: true, runs, notOut, bowled: false, wickets: 0, runsConceded: 0 });
const bowl = (seasonNumber: number, roundNumber: number, wickets: number, runsConceded: number) =>
  ({ seasonNumber, roundNumber, batted: false, runs: 0, notOut: false, bowled: true, wickets, runsConceded });

/** Every whole number written in the text must be one of the listed facts. */
function numbersAreFacts(text: string, facts: { value: number | string }[]) {
  const listed = new Set(facts.flatMap((f) => (typeof f.value === "number" ? [String(f.value)] : String(f.value).match(/\d+/g) ?? [])));
  for (const n of text.match(/\d+/g) ?? []) expect(listed, `${n} in "${text}"`).toContain(n);
}

afterEach(() => vi.restoreAllMocks());

describe("playing style", () => {
  test("every label in the default world rests on ratings at or above its thresholds", () => {
    for (const player of world.players) {
      const { primary, secondary } = playingStyle(input(player));
      for (const style of [primary, secondary].filter((s): s is PlayingStyle => s !== null)) {
        const row = allRows.find((r) => r.id === style.id);
        if (row) {
          for (const [skill, min] of row.needs) expect(player.skills.T20![skill], `${player.playerId} ${style.id} ${skill}`).toBeGreaterThanOrEqual(min);
          expect(style.basis.map((b) => b.value)).toEqual(row.needs.map(([skill]) => player.skills.T20![skill]));
        }
        if (style.id === "SPECIALIST_KEEPER") expect(player.skills.T20!.keeping).toBeGreaterThanOrEqual(PLAYING_STYLE_RULES.specialistKeeping);
      }
    }
  });

  test("hitters have the power, bowling labels need a bowler, keeping labels need a keeper", () => {
    for (const player of world.players) {
      const { primary, secondary } = playingStyle(input(player));
      for (const style of [primary, secondary]) {
        if (!style) continue;
        if (["FINISHER", "PACE_ENFORCER", "BOUNDARY_HITTER"].includes(style.id)) expect(player.skills.T20!.power).toBeGreaterThanOrEqual(PLAYING_STYLE_RULES.power);
        if (style.discipline === "BOWLING") expect(isBowlingCapable(player), player.playerId).toBe(true);
        if (style.discipline === "KEEPING") expect(player.role).toBe("KEEPER");
        if (/spinner/.test(style.label)) expect(["OFF_SPIN", "LEG_SPIN", "SLOW_LEFT_ARM", "LEFT_ARM_WRIST"]).toContain(player.bowlingStyle);
        if (/seam|pace|Fast|Medium/.test(style.label) && style.discipline === "BOWLING") expect(["FAST", "MEDIUM"]).toContain(player.bowlingStyle);
      }
    }
  });

  test("squads are distinctive: every club has at least ten different primary styles among twenty players", () => {
    for (const team of world.teams) {
      const labels = team.squadIds.map((id) => playingStyle(input(world.players.find((p) => p.playerId === id)!)).primary.label);
      expect(new Set(labels).size, team.teamId).toBeGreaterThanOrEqual(10);
    }
  });

  test("a player good at many things is named for the widest margin", () => {
    const skills = { ...world.players[0]!.skills.T20!, power: 70, rotation: 61, vsPace: 80, defence: 50, timing: 50, vsSpin: 50 };
    // Finisher's margin is min(2, 1) = 1; pace enforcer's is min(2, 15) = 2; boundary hitter's is 2 (later in the table).
    expect(playingStyle({ playerId: "x", role: "BATTER", bowlingStyle: null, skills }).primary.id).toBe("PACE_ENFORCER");
  });

  test("a bowler with no standout skill keeps the plain name of their bowling type, with no claimed basis", () => {
    const skills = { ...world.players[0]!.skills.T20!, control: 40, movement: 40, variation: 40 };
    const style = playingStyle({ playerId: "x", role: "BOWLER", bowlingStyle: "LEG_SPIN", skills }).primary;
    expect(style).toEqual({ id: "WRIST_SPINNER", label: "Leg-spinner", discipline: "BOWLING", basis: [] });
  });
});

describe("personality traits", () => {
  test("two different traits, stable for a player id and independent of ratings", () => {
    for (const player of world.players) {
      const [a, b] = personalityTraits(player.playerId);
      expect(a.id).not.toBe(b.id);
      const changed = { ...input(player), skills: { ...player.skills.T20!, power: 0, control: 100 } };
      expect(derivePlayerIdentity(changed).traits).toEqual(personalityTraits(player.playerId));
    }
    const used = new Set(world.players.flatMap((p) => personalityTraits(p.playerId).map((t) => t.id)));
    expect(used.size).toBe(PERSONALITY_TRAITS.length);
  });

  test("no trait claims a skill or a result", () => {
    const skillWords = /\b(bat|bowl|wicket|run|six|four|catch|keep|spin|pace|power|hit|score|win|lose|best|rating)/i;
    for (const trait of PERSONALITY_TRAITS) expect(`${trait.label} ${trait.flavour}`).not.toMatch(skillWords);
  });
});

describe("story so far", () => {
  test("a player yet to play says so, and states only the age it was given", () => {
    const story = storySoFar(emptyRecord, "BATTING");
    expect(story.text).toBe("Yet to play a league match for Aster Quay, aged 24.");
    expect(story.facts).toEqual([{ key: "age", value: 24 }]);
  });

  test("a batter's record, latest scores oldest first, honours and the next milestone, every number a fact", () => {
    const record: StoryRecord = {
      ...emptyRecord,
      matches: 21,
      seasonsPlayed: 2,
      runs: 468,
      battingInnings: 20,
      highScore: { runs: 77, notOut: true },
      fifties: 3,
      wickets: 1,
      bestBowling: { wickets: 1, runs: 12 },
      playerOfTheMatchCount: 2,
      recentMatches: [bat(2, 4, 12), bat(1, 14, 55), bat(2, 2, 0), bat(2, 3, 41, true), bat(2, 1, 9), bat(2, 5, 30)],
    };
    const story = storySoFar(record, "BATTING");
    expect(story.text).toBe(
      "21 league matches across 2 seasons, now with Aster Quay. 468 runs, best of 77 not out, 3 fifties; 1 wicket, best of 1/12. " +
        "Latest scores, oldest first: 9, 0, 41*, 12, 30. Player of the Match 2 times. 32 runs from 500 career runs.",
    );
    numbersAreFacts(story.text, story.facts);
  });

  test("a bowler leads with wickets and figures; a retired player gets no form line or milestone", () => {
    const record: StoryRecord = {
      ...emptyRecord,
      club: { name: "Aster Quay", relation: "LAST" },
      retired: true,
      matches: 30,
      seasonsPlayed: 3,
      runs: 40,
      battingInnings: 8,
      highScore: { runs: 11, notOut: false },
      wickets: 24,
      bestBowling: { wickets: 4, runs: 18 },
      recentMatches: [bowl(3, 1, 2, 20)],
    };
    const story = storySoFar(record, "BOWLING");
    expect(story.text).toBe("30 league matches across 3 seasons, last with Aster Quay. 24 wickets, best of 4/18; 40 runs, best of 11.");
    numbersAreFacts(story.text, story.facts);
    const active = storySoFar({ ...record, retired: false, club: { name: "Aster Quay", relation: "CURRENT" } }, "BOWLING");
    expect(active.text).toContain("Latest figures, oldest first: 2/20.");
    expect(active.text).toContain("1 wicket from 25 career wickets.");
    numbersAreFacts(active.text, active.facts);
  });
});

describe("determinism and isolation from the simulation", () => {
  test("the same input always gives the same identity, and inputs are not changed", () => {
    for (const player of world.players.slice(0, 40)) {
      const frozen = structuredClone(input(player));
      Object.freeze(frozen.skills);
      Object.freeze(frozen);
      const a = derivePlayerIdentity(frozen, emptyRecord);
      const b = derivePlayerIdentity(structuredClone(input(player)), structuredClone(emptyRecord));
      expect(a).toEqual(b);
      expect(a.version).toBe(PLAYER_IDENTITY_VERSION);
    }
  });

  test("it never calls Math.random or reads the clock", () => {
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    for (const player of world.players) derivePlayerIdentity(input(player), { ...emptyRecord, matches: 3, battingInnings: 3, runs: 30, recentMatches: [bat(1, 1, 30)] });
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  test("the module imports nothing from the simulation, its random stream or the probability tables", () => {
    const source = readFileSync(resolve(root, "packages/projections/src/player-identity-v1.ts"), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["./player-identity.js"]);
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/Math\.random|Date\.now|new Date|crypto\./);
  });
});

describe("match introductions", () => {
  test("a batter walking out and a bowler coming on, with the ratings behind the style", () => {
    const style: PlayingStyle = { id: "FINISHER", label: "Finisher", discipline: "BATTING", basis: [{ skill: "power", label: "power", value: 74 }, { skill: "rotation", label: "strike rotation", value: 66 }] };
    expect(matchIntroduction("Caro Harden", style, "BATTER")).toBe("New at the crease: Caro Harden, Finisher (power 74, strike rotation 66).");
    expect(matchIntroduction("Caro Harden", { id: "MEDIUM_PACER", label: "Medium pacer", discipline: "BOWLING", basis: [] }, "BOWLER")).toBe("Into the attack: Caro Harden, Medium pacer.");
  });
});
