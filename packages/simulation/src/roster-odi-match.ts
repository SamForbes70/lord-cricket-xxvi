import {
  PROBABILITY_VERSION, RANDOM_VERSION, RosterODIExecutionManifestSchema, SCORING_ENGINE_VERSION,
  ODI_CONDITIONS_VERSION, ODI_EVENT_CHAIN_VERSION, canonicalJson,
  type StagedRosterPack, type ODICommand, type ODICommandReceipt, type ODIMatchEvent,
} from "@lcxxvi/contracts";
import { SYNTHETIC_ALPHA_PACK } from "@lcxxvi/data";
import { createStateHasher } from "./determinism.js";
import { prepareRosterMatch } from "./roster-import.js";
import { executeODICommand, replayODIEventsFromInitial, odiEventChainManifest, ODI_CONDITION_POLICY_HASH, type ODICore, type ODISession } from "./odi-match.js";
import type { FrozenODISetup } from "./world-setup.js";

const hash = createStateHasher().hash;
const verifiedSessions = new WeakMap<object, string>();
const fail = (message: string): never => { throw new Error(`LC_ROSTER_ODI_${message}`); };

type Prepared = ReturnType<typeof prepareRosterMatch>;
export type RosterODISetup = Omit<FrozenODISetup, "setupVersion"> & {
  readonly setupVersion: "LC_ODI_ROSTER_SETUP_V2";
  readonly rosterPackHash: string;
};
export type RosterODISession = Omit<ODISession, "setup" | "executionManifest"> & {
  setup: RosterODISetup;
  executionManifest: ReturnType<typeof RosterODIExecutionManifestSchema.parse>;
};

function setupFromPrepared(prepared: Prepared, sourceHash: string): RosterODISetup {
  if (prepared.format !== "ODI" || prepared.teams.length !== 2) fail("FORMAT");
  const setup = {
    setupVersion: "LC_ODI_ROSTER_SETUP_V2" as const,
    gameId: prepared.gameId, matchId: prepared.matchId, seed: prepared.seed, format: "ODI" as const,
    teams: prepared.teams as unknown as FrozenODISetup["teams"], ground: prepared.ground,
    versions: { schema: "1.0.0" as const, engine: "LC_ODI_ROSTER_SETUP_V2", random: RANDOM_VERSION,
      rules: prepared.rulesId, rulesHash: prepared.rulesHash, model: SYNTHETIC_ALPHA_PACK.manifest.modelId,
      modelHash: prepared.modelHash, worldHash: prepared.worldHash },
    stagePackHash: prepared.stagePackHash, modelStatus: "SYNTHETIC_ALPHA" as const,
    worldSeed: sourceHash, fixtureOnly: true as const, rosterPackHash: prepared.rosterPackHash,
  };
  Object.freeze(setup.versions);
  return Object.freeze(setup);
}

export function createRosterODISession(pack: StagedRosterPack, request: unknown): RosterODISession {
  const prepared = prepareRosterMatch(pack, request);
  const setup = setupFromPrepared(prepared, pack.sourceHash);
  const setupHash = hash(setup);
  const executionManifest = RosterODIExecutionManifestSchema.parse({
    engine: "LC_ODI_MATCH_ROSTER_V2", eventChain: ODI_EVENT_CHAIN_VERSION,
    conditionPolicy: ODI_CONDITIONS_VERSION, conditionPolicyHash: ODI_CONDITION_POLICY_HASH,
    setupHash, worldHash: setup.versions.worldHash, rulesHash: setup.versions.rulesHash,
    modelHash: setup.versions.modelHash, stagePackHash: setup.stagePackHash, randomVersion: RANDOM_VERSION,
    scoringVersion: SCORING_ENGINE_VERSION, probabilityVersion: PROBABILITY_VERSION,
  });
  const core: ODICore = { phase: "SETUP", setupHash, tossWinnerId: null, tossCallerId: null,
    battingFirstId: null, activeInningsIndex: 0, innings: [], globalAttemptOrdinal: 0, result: null,
    fieldSlots: [], bowlingPlan: null, battingPlans: {}, pitch: structuredClone(setup.ground.pitchPrior),
    fatigueBp: Object.fromEntries(setup.teams.flatMap(team => team.playerIds).map(id => [id, 0])) };
  const genesisHash = hash([ODI_EVENT_CHAIN_VERSION, setupHash, hash(executionManifest)]);
  const session: RosterODISession = { setup, executionManifest, core, revision: 0,
    events: [], receipts: {}, commands: [], genesisHash, lastEventHash: genesisHash };
  verifiedSessions.set(session, hash(session));
  return session;
}

export function executeRosterODICommand(input: RosterODISession, command: unknown): { session: RosterODISession; receipt: ODICommandReceipt } {
  const expectedHash = verifiedSessions.get(input);
  if (!expectedHash) fail("SESSION_UNVERIFIED");
  if (hash(input) !== expectedHash) fail("SESSION_TAMPERED");
  const result = executeODICommand(input as unknown as ODISession, command);
  const session = result.session as unknown as RosterODISession;
  verifiedSessions.set(session, hash(session));
  return { session, receipt: result.receipt };
}

export function rehydrateRosterODISession(raw: unknown, pack: StagedRosterPack): RosterODISession {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("SAVE_SHAPE");
  const stored = raw as Partial<RosterODISession>;
  const setup = stored.setup;
  if (!setup) throw new Error("LC_ROSTER_ODI_SAVE_SETUP");
  if (setup.setupVersion !== "LC_ODI_ROSTER_SETUP_V2" || !Array.isArray(setup.teams) || setup.teams.length !== 2) fail("SAVE_SETUP");
  let rebuilt = createRosterODISession(pack, {
    gameId: setup.gameId, matchId: setup.matchId, seed: setup.seed, format: "ODI",
    selection: { groundId: setup.ground.groundId, teams: setup.teams.map(team => ({
      teamId: team.teamId, playerIds: [...team.playerIds], captainId: team.captainId, keeperId: team.keeperId,
    })) },
  });
  if (canonicalJson(rebuilt.setup) !== canonicalJson(setup)) fail("SAVE_SETUP_MISMATCH");
  if (!Array.isArray(stored.commands)) fail("SAVE_COMMANDS");
  for (const command of stored.commands as ODICommand[]) rebuilt = executeRosterODICommand(rebuilt, command).session;
  if (stored.revision !== rebuilt.revision || hash(stored.core) !== hash(rebuilt.core) ||
      hash(stored.events as ODIMatchEvent[]) !== hash(rebuilt.events) || hash(stored.commands) !== hash(rebuilt.commands) || hash(stored.receipts) !== hash(rebuilt.receipts) ||
      hash(stored.executionManifest) !== hash(rebuilt.executionManifest) || stored.genesisHash !== rebuilt.genesisHash ||
      stored.lastEventHash !== rebuilt.lastEventHash) fail("SAVE_REPLAY_MISMATCH");
  return rebuilt;
}

export function replayRosterODISession(session: RosterODISession, pack: StagedRosterPack): ODISession {
  const validated = rehydrateRosterODISession(session, pack);
  const setup = validated.setup;
  const initial = createRosterODISession(pack, {
    gameId: setup.gameId, matchId: setup.matchId, seed: setup.seed, format: "ODI",
    selection: { groundId: setup.ground.groundId, teams: setup.teams.map(team => ({
      teamId: team.teamId, playerIds: [...team.playerIds], captainId: team.captainId, keeperId: team.keeperId,
    })) },
  });
  return replayODIEventsFromInitial(initial as unknown as ODISession, validated.events, odiEventChainManifest(validated as unknown as ODISession));
}
