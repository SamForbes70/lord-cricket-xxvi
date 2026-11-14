import {
  PROBABILITY_VERSION, RANDOM_VERSION, RosterT20ExecutionManifestSchema, SCORING_ENGINE_VERSION,
  T20_CONDITIONS_VERSION, T20_EVENT_CHAIN_VERSION, canonicalJson,
  type StagedRosterPack, type T20Command, type T20CommandReceipt, type T20MatchEvent,
} from "@lcxxvi/contracts";
import { SYNTHETIC_ALPHA_PACK } from "@lcxxvi/data";
import { createStateHasher } from "./determinism.js";
import { prepareRosterMatch } from "./roster-import.js";
import { executeT20Command, replayT20EventsFromInitial, eventChainManifest, T20_CONDITION_POLICY_HASH, type T20Core, type T20Session } from "./t20-match.js";
import type { FrozenT20Setup } from "./world-setup.js";

const hash = createStateHasher().hash;
const verifiedSessions = new WeakMap<object, string>();
const fail = (message: string): never => { throw new Error(`LC_ROSTER_T20_${message}`); };

function sessionIntegrityDigest(session: RosterT20Session): string {
  const lastEv = session.events.at(-1);
  const firstEv = session.events[0];
  return hash({
    setupVersion: session.setup.setupVersion,
    rosterPackHash: session.setup.rosterPackHash,
    manifestEngine: session.executionManifest.engine,
    manifestSetupHash: session.executionManifest.setupHash,
    revision: session.revision,
    genesisHash: session.genesisHash,
    lastEventHash: session.lastEventHash,
    eventCount: session.events.length,
    firstEventHash: firstEv ? firstEv.eventHash : null,
    tailEventHash: lastEv ? lastEv.eventHash : null,
    commandCount: session.commands.length,
    core: session.core,
  });
}

type Prepared = ReturnType<typeof prepareRosterMatch>;
export type RosterT20Setup = Omit<FrozenT20Setup, "setupVersion"> & {
  readonly setupVersion: "LC_T20_ROSTER_SETUP_V2";
  readonly rosterPackHash: string;
};
export type RosterT20Session = Omit<T20Session, "setup" | "executionManifest"> & {
  setup: RosterT20Setup;
  executionManifest: ReturnType<typeof RosterT20ExecutionManifestSchema.parse>;
};

function setupFromPrepared(prepared: Prepared, sourceHash: string): RosterT20Setup {
  if (prepared.format !== "T20" || prepared.teams.length !== 2) fail("FORMAT");
  const setup = {
    setupVersion: "LC_T20_ROSTER_SETUP_V2" as const,
    gameId: prepared.gameId, matchId: prepared.matchId, seed: prepared.seed, format: "T20" as const,
    teams: prepared.teams as unknown as FrozenT20Setup["teams"], ground: prepared.ground,
    versions: { schema: "1.0.0" as const, engine: "LC_T20_ROSTER_SETUP_V2", random: RANDOM_VERSION,
      rules: prepared.rulesId, rulesHash: prepared.rulesHash, model: SYNTHETIC_ALPHA_PACK.manifest.modelId,
      modelHash: prepared.modelHash, worldHash: prepared.worldHash },
    stagePackHash: prepared.stagePackHash, modelStatus: "SYNTHETIC_ALPHA" as const,
    worldSeed: sourceHash, fixtureOnly: true as const, rosterPackHash: prepared.rosterPackHash,
  };
  Object.freeze(setup.versions);
  return Object.freeze(setup);
}

export function createRosterT20Session(pack: StagedRosterPack, request: unknown): RosterT20Session {
  const prepared = prepareRosterMatch(pack, request);
  const setup = setupFromPrepared(prepared, pack.sourceHash);
  const setupHash = hash(setup);
  const executionManifest = RosterT20ExecutionManifestSchema.parse({
    engine: "LC_T20_MATCH_ROSTER_V2", eventChain: T20_EVENT_CHAIN_VERSION,
    conditionPolicy: T20_CONDITIONS_VERSION, conditionPolicyHash: T20_CONDITION_POLICY_HASH,
    setupHash, worldHash: setup.versions.worldHash, rulesHash: setup.versions.rulesHash,
    modelHash: setup.versions.modelHash, stagePackHash: setup.stagePackHash, randomVersion: RANDOM_VERSION,
    scoringVersion: SCORING_ENGINE_VERSION, probabilityVersion: PROBABILITY_VERSION,
  });
  const core: T20Core = { phase: "SETUP", setupHash, tossWinnerId: null, tossCallerId: null,
    battingFirstId: null, activeInningsIndex: 0, innings: [], globalAttemptOrdinal: 0, result: null,
    fieldSlots: [], bowlingPlan: null, battingPlans: {}, pitch: structuredClone(setup.ground.pitchPrior),
    fatigueBp: Object.fromEntries(setup.teams.flatMap(team => team.playerIds).map(id => [id, 0])) };
  const genesisHash = hash([T20_EVENT_CHAIN_VERSION, setupHash, hash(executionManifest)]);
  const session: RosterT20Session = { setup, executionManifest, core, revision: 0,
    events: [], receipts: {}, commands: [], genesisHash, lastEventHash: genesisHash };
  verifiedSessions.set(session, sessionIntegrityDigest(session));
  return session;
}

export function executeRosterT20Command(input: RosterT20Session, command: unknown): { session: RosterT20Session; receipt: T20CommandReceipt } {
  const expectedHash = verifiedSessions.get(input);
  if (!expectedHash) fail("SESSION_UNVERIFIED");
  if (sessionIntegrityDigest(input) !== expectedHash) fail("SESSION_TAMPERED");
  const result = executeT20Command(input as unknown as T20Session, command);
  const session = result.session as unknown as RosterT20Session;
  verifiedSessions.set(session, sessionIntegrityDigest(session));
  return { session, receipt: result.receipt };
}

export function rehydrateRosterT20Session(raw: unknown, pack: StagedRosterPack): RosterT20Session {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("SAVE_SHAPE");
  const stored = raw as Partial<RosterT20Session>;
  const setup = stored.setup;
  if (!setup) throw new Error("LC_ROSTER_T20_SAVE_SETUP");
  if (setup.setupVersion !== "LC_T20_ROSTER_SETUP_V2" || !Array.isArray(setup.teams) || setup.teams.length !== 2) fail("SAVE_SETUP");
  let rebuilt = createRosterT20Session(pack, {
    gameId: setup.gameId, matchId: setup.matchId, seed: setup.seed, format: "T20",
    selection: { groundId: setup.ground.groundId, teams: setup.teams.map(team => ({
      teamId: team.teamId, playerIds: [...team.playerIds], captainId: team.captainId, keeperId: team.keeperId,
    })) },
  });
  if (canonicalJson(rebuilt.setup) !== canonicalJson(setup)) fail("SAVE_SETUP_MISMATCH");
  if (!Array.isArray(stored.commands)) fail("SAVE_COMMANDS");
  for (const command of stored.commands as T20Command[]) rebuilt = executeRosterT20Command(rebuilt, command).session;
  if (stored.revision !== rebuilt.revision || hash(stored.core) !== hash(rebuilt.core) ||
      hash(stored.events as T20MatchEvent[]) !== hash(rebuilt.events) || hash(stored.commands) !== hash(rebuilt.commands) || hash(stored.receipts) !== hash(rebuilt.receipts) ||
      hash(stored.executionManifest) !== hash(rebuilt.executionManifest) || stored.genesisHash !== rebuilt.genesisHash ||
      stored.lastEventHash !== rebuilt.lastEventHash) fail("SAVE_REPLAY_MISMATCH");
  return rebuilt;
}

export function replayRosterT20Session(session: RosterT20Session, pack: StagedRosterPack): T20Session {
  const validated = rehydrateRosterT20Session(session, pack);
  const setup = validated.setup;
  const initial = createRosterT20Session(pack, {
    gameId: setup.gameId, matchId: setup.matchId, seed: setup.seed, format: "T20",
    selection: { groundId: setup.ground.groundId, teams: setup.teams.map(team => ({
      teamId: team.teamId, playerIds: [...team.playerIds], captainId: team.captainId, keeperId: team.keeperId,
    })) },
  });
  return replayT20EventsFromInitial(initial as unknown as T20Session, validated.events, eventChainManifest(validated as unknown as T20Session));
}
