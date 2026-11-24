import { canonicalJson, type NewGameWorldCopy, type StagedRosterPack } from "@lcxxvi/contracts";
import type { T20Session } from "@lcxxvi/simulation";
import { createMatchController } from "./controller.js";
import { CareerFixtureLaunchSchema, UI_VERSION, type CareerFixtureLaunch, type CareerMatchResult } from "./protocol.js";

export type SavedManagedMatch = {
  session: unknown;
  rosterPack?: StagedRosterPack | null;
  worldCopy?: NewGameWorldCopy | null;
};

export type RegeneratedManagedResult =
  | { complete: false }
  | { complete: true; careerResult: CareerMatchResult | null; rosterCareerSession: unknown | null; t20Session: T20Session | null };

/**
 * Rebuilds the career result from a durable match checkpoint and its validated launch, with no live
 * match tab. It uses the same controller binding checks as the match page, so a match that does not
 * belong to the launch (wrong game, match, world copy or roster) is rejected rather than reinterpreted.
 * Nothing is inferred: an incomplete match yields `complete: false`.
 */
export function regenerateManagedResult(
  saved: SavedManagedMatch,
  rawLaunch: unknown,
  worldBytes: Uint8Array,
  manifest: unknown,
): RegeneratedManagedResult {
  const launch: CareerFixtureLaunch = CareerFixtureLaunchSchema.parse(rawLaunch);
  const roster = saved.rosterPack ?? null;
  if (
    launch.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER" ||
    launch.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V4_LIFECYCLE"
  ) {
    if (!roster || canonicalJson(roster) !== canonicalJson(launch.rosterPack)) {
      throw new Error("The saved match belongs to a different roster.");
    }
  } else if (roster) {
    throw new Error("The saved match belongs to an imported roster, not this career.");
  }
  const copy = saved.worldCopy ?? null;
  // A roster-pack match (V3, V4) stores no world copy: persistence keeps one world type per save, and the names come
  // from the hash-checked launch, which the BOOT below binds. This is the same rule the match worker applies when it
  // rebinds a saved match. Only a V2 launch (an edited world without a roster pack) stores its copy with the match.
  const expectedCopy = roster ? null : launch.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V2" ? launch.worldCopy : null;
  if (canonicalJson(copy) !== canonicalJson(expectedCopy)) throw new Error("The saved match belongs to a different world copy.");

  const controller = createMatchController(worldBytes, manifest, () => "regeneration-never-draws");
  if (roster) controller.restore(saved.session, roster);
  else controller.restore(saved.session);
  const bound = controller.handle({
    version: UI_VERSION,
    type: "BOOT",
    requestId: "ui-1",
    expectedRevision: 0,
    careerFixture: launch,
  });
  if (bound.error) throw new Error(bound.error);
  if (controller.snapshot()?.core.phase !== "COMPLETE") return { complete: false };
  const response = controller.currentResponse("ui-2");
  if (response.error) throw new Error(response.error);
  return {
    complete: true,
    careerResult: response.careerResult ?? null,
    rosterCareerSession: response.rosterCareerSession ?? null,
    t20Session: roster ? null : (controller.snapshot() as T20Session | null),
  };
}
