import {
  PROBABILITY_VERSION, RANDOM_VERSION, RosterRed5ExecutionManifestSchema, SCORING_ENGINE_VERSION,
  RED5_CONDITIONS_VERSION, RED5_EVENT_CHAIN_VERSION, canonicalJson,
  type StagedRosterPack, type Red5Command, type Red5CommandReceipt, type Red5MatchEvent,
} from "@lcxxvi/contracts";
import { SYNTHETIC_ALPHA_PACK } from "@lcxxvi/data";
import { createStateHasher } from "./determinism.js";
import { createRed5Clock } from "./red-ball-clock.js";
import { prepareRosterMatch } from "./roster-import.js";
import { executeRed5Command, replayRed5EventsFromInitial, red5EventChainManifest, RED5_CONDITION_POLICY_HASH, type Red5Core, type Red5Session } from "./red-ball-match.js";
import type { FrozenRed5Setup } from "./world-setup.js";

const hash = createStateHasher().hash;
const verifiedSessions = new WeakMap<object, string>();
const fail = (message: string): never => { throw new Error(`LC_ROSTER_RED5_${message}`); };

type Prepared = ReturnType<typeof prepareRosterMatch>;
export type RosterRed5Setup = Omit<FrozenRed5Setup, "setupVersion"> & {
  readonly setupVersion: "LC_RED5_ROSTER_SETUP_V2";
  readonly rosterPackHash: string;
};
export type RosterRed5Session = Omit<Red5Session, "setup" | "executionManifest"> & {
  setup: RosterRed5Setup;
  executionManifest: ReturnType<typeof RosterRed5ExecutionManifestSchema.parse>;
};

function setupFromPrepared(prepared: Prepared, sourceHash: string): RosterRed5Setup {
  if (prepared.format !== "RED_BALL" || prepared.teams.length !== 2) fail("FORMAT");
  const setup = {
    setupVersion: "LC_RED5_ROSTER_SETUP_V2" as const,
    gameId: prepared.gameId, matchId: prepared.matchId, seed: prepared.seed, format: "RED_BALL" as const,
    teams: prepared.teams as unknown as FrozenRed5Setup["teams"], ground: prepared.ground,
    versions: { schema: "1.0.0" as const, engine: "LC_RED5_ROSTER_SETUP_V2", random: RANDOM_VERSION,
      rules: prepared.rulesId, rulesHash: prepared.rulesHash, model: SYNTHETIC_ALPHA_PACK.manifest.modelId,
      modelHash: prepared.modelHash, worldHash: prepared.worldHash },
    stagePackHash: prepared.stagePackHash, modelStatus: "SYNTHETIC_ALPHA" as const,
    worldSeed: sourceHash, fixtureOnly: true as const, rosterPackHash: prepared.rosterPackHash,
  };
  Object.freeze(setup.versions);
  return Object.freeze(setup);
}

export function createRosterRed5Session(pack: StagedRosterPack, request: unknown): RosterRed5Session {
  const prepared = prepareRosterMatch(pack, request);
  const setup = setupFromPrepared(prepared, pack.sourceHash);
  const setupHash = hash(setup);
  const executionManifest = RosterRed5ExecutionManifestSchema.parse({
    engine: "LC_RED5_MATCH_ROSTER_V2", eventChain: RED5_EVENT_CHAIN_VERSION,
    conditionPolicy: RED5_CONDITIONS_VERSION, conditionPolicyHash: RED5_CONDITION_POLICY_HASH,
    setupHash, worldHash: setup.versions.worldHash, rulesHash: setup.versions.rulesHash,
    modelHash: setup.versions.modelHash, stagePackHash: setup.stagePackHash, randomVersion: RANDOM_VERSION,
    scoringVersion: SCORING_ENGINE_VERSION, probabilityVersion: PROBABILITY_VERSION,
  });
  const core: Red5Core = { phase: "SETUP", setupHash, tossWinnerId: null, tossCallerId: null,
    battingFirstId: null, inningsOrder: [], activeInningsIndex: 0, innings: [], declared: [], globalAttemptOrdinal: 0, result: null,
    fieldSlots: [], bowlingPlan: null, battingPlans: {}, pitch: structuredClone(setup.ground.pitchPrior),
    fatigueBp: Object.fromEntries(setup.teams.flatMap(team => team.playerIds).map(id => [id, 0])),
    clock: createRed5Clock(), followOnEnforced: false, newBallsTaken: 0 };
  const genesisHash = hash([RED5_EVENT_CHAIN_VERSION, setupHash, hash(executionManifest)]);
  const session: RosterRed5Session = { setup, executionManifest, core, revision: 0,
    events: [], receipts: {}, commands: [], genesisHash, lastEventHash: genesisHash };
  verifiedSessions.set(session, hash(session));
  return session;
}

export function executeRosterRed5Command(input: RosterRed5Session, command: unknown): { session: RosterRed5Session; receipt: Red5CommandReceipt } {
  const expectedHash = verifiedSessions.get(input);
  if (!expectedHash) fail("SESSION_UNVERIFIED");
  if (hash(input) !== expectedHash) fail("SESSION_TAMPERED");
  const result = executeRed5Command(input as unknown as Red5Session, command);
  const session = result.session as unknown as RosterRed5Session;
  verifiedSessions.set(session, hash(session));
  return { session, receipt: result.receipt };
}

export function rehydrateRosterRed5Session(raw: unknown, pack: StagedRosterPack): RosterRed5Session {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("SAVE_SHAPE");
  const stored = raw as Partial<RosterRed5Session>;
  const setup = stored.setup;
  if (!setup) throw new Error("LC_ROSTER_RED5_SAVE_SETUP");
  if (setup.setupVersion !== "LC_RED5_ROSTER_SETUP_V2" || !Array.isArray(setup.teams) || setup.teams.length !== 2) fail("SAVE_SETUP");
  let rebuilt = createRosterRed5Session(pack, {
    gameId: setup.gameId, matchId: setup.matchId, seed: setup.seed, format: "RED_BALL",
    selection: { groundId: setup.ground.groundId, teams: setup.teams.map(team => ({
      teamId: team.teamId, playerIds: [...team.playerIds], captainId: team.captainId, keeperId: team.keeperId,
    })) },
  });
  if (canonicalJson(rebuilt.setup) !== canonicalJson(setup)) fail("SAVE_SETUP_MISMATCH");
  if (!Array.isArray(stored.commands)) fail("SAVE_COMMANDS");
  for (const command of stored.commands as Red5Command[]) rebuilt = executeRosterRed5Command(rebuilt, command).session;
  if (stored.revision !== rebuilt.revision || hash(stored.core) !== hash(rebuilt.core) ||
      hash(stored.events as Red5MatchEvent[]) !== hash(rebuilt.events) || hash(stored.commands) !== hash(rebuilt.commands) || hash(stored.receipts) !== hash(rebuilt.receipts) ||
      hash(stored.executionManifest) !== hash(rebuilt.executionManifest) || stored.genesisHash !== rebuilt.genesisHash ||
      stored.lastEventHash !== rebuilt.lastEventHash) fail("SAVE_REPLAY_MISMATCH");
  return rebuilt;
}

export function replayRosterRed5Session(session: RosterRed5Session, pack: StagedRosterPack): Red5Session {
  const validated = rehydrateRosterRed5Session(session, pack);
  const setup = validated.setup;
  const initial = createRosterRed5Session(pack, {
    gameId: setup.gameId, matchId: setup.matchId, seed: setup.seed, format: "RED_BALL",
    selection: { groundId: setup.ground.groundId, teams: setup.teams.map(team => ({
      teamId: team.teamId, playerIds: [...team.playerIds], captainId: team.captainId, keeperId: team.keeperId,
    })) },
  });
  return replayRed5EventsFromInitial(initial as unknown as Red5Session, validated.events, red5EventChainManifest(validated as unknown as Red5Session));
}
