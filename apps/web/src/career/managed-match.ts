import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import {
  IndexedDbSaveRepository,
  ManagedBindingError,
  createManagedMatchBindings,
  type ManagedBinding,
  type ManagedMatchBindings,
} from "@lcxxvi/persistence";
import { CareerFixtureLaunchSchema, type CareerFixtureLaunch } from "../match/protocol.js";
import { regenerateManagedResult, type RegeneratedManagedResult } from "../match/managed-result.js";

const worldBytes = new TextEncoder().encode(worldText);

export const managedBindings: ManagedMatchBindings = createManagedMatchBindings(() => new Date().toISOString());
const matchRepository = new IndexedDbSaveRepository();

export function launchKind(launch: CareerFixtureLaunch): "STANDARD" | "ROSTER" {
  return launch.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER" ? "ROSTER" : "STANDARD";
}

/**
 * Writes the durable binding before the match is launched and returns the launch to use.
 * If the fixture already has a pending binding (for example after a closed tab), the stored launch is
 * returned so the same match is resumed rather than a second, different one being started.
 */
export async function recordManagedLaunch(rawLaunch: unknown): Promise<CareerFixtureLaunch> {
  const parsed = CareerFixtureLaunchSchema.parse(rawLaunch);
  const { bindings: existingBindings } = await managedBindings.list();
  const existing = existingBindings.find(
    (b) => b.careerSaveId === parsed.saveId && b.fixtureId === parsed.fixtureId && b.status !== "APPLIED",
  );
  if (existing?.status === "PENDING") return CareerFixtureLaunchSchema.parse(existing.launch);
  const launch = existing ? { ...parsed, matchGameId: existing.matchGameId } : parsed;
  const input = {
    careerKind: launchKind(launch),
    careerSaveId: launch.saveId,
    matchGameId: launch.matchGameId,
    matchId: launch.matchId,
    fixtureId: launch.fixtureId,
    seasonId: launch.seasonId,
    scheduleSha256: launch.scheduleSha256,
    careerStateSha256: launch.careerStateSha256,
    launch,
  };
  try {
    return CareerFixtureLaunchSchema.parse((await managedBindings.create(input)).launch);
  } catch (error) {
    if (error instanceof ManagedBindingError && error.code === "BINDING_CONFLICT") {
      const stored = await managedBindings.get(launch.matchGameId);
      if (stored?.status === "PENDING" && stored.careerSaveId === launch.saveId) return CareerFixtureLaunchSchema.parse(stored.launch);
    }
    throw error;
  }
}

/** The durable match for a binding: a completed or active recovered copy first, then the managed autosave. */
async function loadMatchFor(binding: ManagedBinding) {
  const direct = `auto:${binding.matchGameId}`;
  const saves = await matchRepository.list();
  const candidates = [
    ...saves.filter((save) => save.saveId.startsWith("recovered-") && save.matchGameId === binding.matchGameId && save.completed),
    ...saves.filter((save) => save.saveId.startsWith("recovered-") && save.matchGameId === binding.matchGameId && !save.completed),
    ...saves.filter((save) => save.saveId === direct),
  ];
  for (const candidate of candidates) {
    try {
      const loaded = await matchRepository.load(candidate.saveId);
      if (loaded) return loaded;
    } catch {
      /* a damaged candidate is skipped; the next candidate or the pending state stands */
    }
  }
  return null;
}

export type ManagedSettlement = {
  applied: string[];
  abandoned: string[];
  /** Pending bindings whose match is still in progress or missing. */
  pending: ManagedBinding[];
  errors: string[];
};

export type ManagedApply = (input: { binding: ManagedBinding; launch: CareerFixtureLaunch; result: Extract<RegeneratedManagedResult, { complete: true }> }) => Promise<void>;

/**
 * Applies every pending binding of one career whose match is complete, then marks it applied.
 * The apply callback must be idempotent (an identical completion is a no-op, a conflicting one throws).
 * A binding is cleared only after the career commit succeeded. Errors keep the binding and the match.
 */
export async function settleManagedMatches(options: {
  careerSaveId: string;
  careerKind: "STANDARD" | "ROSTER";
  isFixtureCompleted: (fixtureId: string) => boolean;
  apply: ManagedApply;
}): Promise<ManagedSettlement> {
  const outcome: ManagedSettlement = { applied: [], abandoned: [], pending: [], errors: [] };
  const { bindings, damaged } = await managedBindings.pendingForCareer(options.careerSaveId);
  for (const key of damaged) outcome.errors.push(`A saved career match link (${key}) is damaged. It was kept and not used.`);
  for (const binding of bindings.filter((b) => b.careerKind === options.careerKind)) {
    try {
      const parsed = CareerFixtureLaunchSchema.safeParse(binding.launch);
      if (!parsed.success) throw new Error(`The career link for ${binding.fixtureId} is not a valid launch. It was kept and not used.`);
      const loaded = await loadMatchFor(binding);
      const result = loaded ? regenerateManagedResult(loaded, parsed.data, worldBytes, worldManifest) : { complete: false as const };
      if (result.complete) {
        await options.apply({ binding, launch: parsed.data, result });
        await managedBindings.resolve(binding.matchGameId, "APPLIED", "RESULT_APPLIED");
        outcome.applied.push(binding.fixtureId);
      } else if (options.isFixtureCompleted(binding.fixtureId)) {
        await managedBindings.resolve(binding.matchGameId, "ABANDONED", "FIXTURE_COMPLETED_ELSEWHERE");
        outcome.abandoned.push(binding.fixtureId);
      } else outcome.pending.push(binding);
    } catch (error) {
      outcome.errors.push(error instanceof Error ? error.message : `The match for ${binding.fixtureId} could not be applied.`);
      outcome.pending.push(binding);
    }
  }
  return outcome;
}
