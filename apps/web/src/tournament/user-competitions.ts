import {
  UserCompetitionPackSchema,
  UserCompetitionSchema,
  USER_COMPETITION_PACK_SCHEMA_ID,
  type CustomCompetitionStructure,
  type UserCompetition,
} from "@lcxxvi/contracts";

/**
 * Stage 15 user-authored tournaments (owner decision 5a: the parts that need no historical data). Builds, checks, exports
 * and imports competitions made from the fictional world's teams and grounds. Pure: no storage, no engine.
 */

export type WorldNames = { teams: { teamId: string; name: string }[]; grounds: { groundId: string; name: string }[] };
export type StructureChoice = "ROUND_ROBIN" | "DOUBLE_ROUND_ROBIN" | "ROUND_ROBIN_FINAL" | "GROUPS_KNOCKOUT" | "SERIES";
export type UserCompetitionDraft = {
  title: string;
  format: "T20" | "ODI";
  structure: StructureChoice;
  seriesMatches: 1 | 3 | 5 | 7;
  teamIds: string[];
  groundIds: string[];
};

/** Largest import file accepted, in bytes. A pack of 32 competitions is far smaller. */
export const USER_COMPETITION_PACK_MAX_BYTES = 256 * 1024;

const formatName = (format: "T20" | "ODI") => (format === "T20" ? "T20" : "one-day");

function summaryFor(format: "T20" | "ODI", structure: CustomCompetitionStructure, teams: number): string {
  const f = formatName(format);
  switch (structure.kind) {
    case "SERIES":
      return `A ${structure.matches}-match ${f} series.`;
    case "GROUPS_KNOCKOUT":
      return `A ${f} tournament for ${teams} teams: two groups, then semi-finals and a final.`;
    case "ROUND_ROBIN":
      return `A ${f} ${structure.legs === 2 ? "double " : ""}round robin for ${teams} teams${structure.finalTopTwo ? ", then a final between the top two" : ""}.`;
  }
}

/** Every team and ground must exist in the fictional world. */
export function checkAgainstWorld(c: UserCompetition, world: WorldNames): void {
  const teams = new Set(world.teams.map((t) => t.teamId));
  const grounds = new Set(world.grounds.map((g) => g.groundId));
  if (!c.teamIds.every((id) => teams.has(id))) throw new Error(`"${c.title}" names a team that is not in this world.`);
  if (!c.groundIds.every((id) => grounds.has(id))) throw new Error(`"${c.title}" names a ground that is not in this world.`);
}

/** Turns the form's choices into a checked competition, or throws a message the player can act on. */
export function buildUserCompetition(draft: UserCompetitionDraft, competitionId: string, world: WorldNames): UserCompetition {
  const title = draft.title.trim();
  if (!title) throw new Error("Give the tournament a name.");
  if (title.length > 80) throw new Error("The name can be at most 80 characters.");
  const teamIds = [...new Set(draft.teamIds)];
  const groundIds = [...new Set(draft.groundIds)];
  if (groundIds.length === 0) throw new Error("Choose at least one ground.");
  let structure: CustomCompetitionStructure;
  switch (draft.structure) {
    case "SERIES":
      if (teamIds.length !== 2) throw new Error("A series needs exactly two teams.");
      structure = { kind: "SERIES", matches: draft.seriesMatches };
      break;
    case "GROUPS_KNOCKOUT":
      if (teamIds.length < 6) throw new Error("Groups and knockouts need six to eight teams.");
      // Teams alternate between the groups in the order they were chosen.
      structure = { kind: "GROUPS_KNOCKOUT", groups: [teamIds.filter((_, i) => i % 2 === 0), teamIds.filter((_, i) => i % 2 === 1)] };
      break;
    case "ROUND_ROBIN_FINAL":
      if (teamIds.length < 3) throw new Error("A round robin with a final needs at least three teams.");
      structure = { kind: "ROUND_ROBIN", legs: 1, finalTopTwo: true };
      break;
    default:
      if (teamIds.length < 2) throw new Error("Choose at least two teams.");
      structure = { kind: "ROUND_ROBIN", legs: draft.structure === "DOUBLE_ROUND_ROBIN" ? 2 : 1, finalTopTwo: false };
  }
  const competition = UserCompetitionSchema.parse({
    competitionId,
    title,
    format: draft.format,
    sourceType: "USER_AUTHORED",
    worldPackId: "fictional-eight-01",
    teamIds,
    groundIds,
    structure,
    points: { win: 2, tie: 1, loss: 0 },
    summary: summaryFor(draft.format, structure, teamIds.length),
  });
  checkAgainstWorld(competition, world);
  return competition;
}

/** The file a player saves to share their tournaments. */
export function userCompetitionPackText(competitions: readonly UserCompetition[]): string {
  return JSON.stringify(UserCompetitionPackSchema.parse({ schemaId: USER_COMPETITION_PACK_SCHEMA_ID, competitions: [...competitions] }), null, 2) + "\n";
}

/**
 * Reads a shared file. The file is untrusted: it is size-limited, parsed as plain JSON, checked against the schema and
 * the world. Competitions whose id is already stored are skipped (a stored competition never changes).
 */
export function parseUserCompetitionPack(bytes: number, text: string, world: WorldNames, existingIds: ReadonlySet<string>): { added: UserCompetition[]; skipped: string[] } {
  if (bytes > USER_COMPETITION_PACK_MAX_BYTES) throw new Error("That file is too large to be a tournament pack.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not a tournament pack.");
  }
  const parsed = UserCompetitionPackSchema.safeParse(raw);
  if (!parsed.success) throw new Error("That file is not a valid tournament pack.");
  const added: UserCompetition[] = [];
  const skipped: string[] = [];
  const seen = new Set(existingIds);
  for (const c of parsed.data.competitions) {
    checkAgainstWorld(c, world);
    if (seen.has(c.competitionId)) skipped.push(c.title);
    else {
      added.push(c);
      seen.add(c.competitionId);
    }
  }
  return { added, skipped };
}
