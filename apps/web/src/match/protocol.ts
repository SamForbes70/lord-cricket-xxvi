import { z } from "zod";
import type { MatchAnalytics } from "@lcxxvi/projections";
import type { SaveSummary } from "@lcxxvi/persistence";
import {
  T20CommandSchema,
  Red5CommandSchema,
  T20TeamSelectionSchema,
  NewGameWorldCopySchema,
  StagedRosterPackSchema,
  DelegationCategorySchema,
  type DelegationJournal,
  type T20Command,
  type T20Scorecard,
  type ODIScorecard,
  type Red5Scorecard,
  type Red5Command,
  type InningsLedger,
  type BowlingPlan,
  type MatchConditionDelta,
} from "@lcxxvi/contracts";

export const UI_VERSION = "LC_T20_UI_V2" as const;
// Shared build identity. No seed, setup object, random service or private diagnostics cross this boundary.
export const PINS = Object.freeze({
  engine: "LC_T20_MATCH_V1",
  eventChain: "LC_T20_EVENT_CHAIN_V1",
  worldHash: "f4cbe33f4a2ea41385143cc03ab6d64e94a356f8af75e30483a68de87bdca252",
  rulesHash: "7c67aec8e3aef8be7b849775d83bad64847338e03326848ec1f1d0d99c6fa745",
  modelHash: "d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab",
  stagePackHash:
    "34efa3037702e44a134ea38b414eab3e97c6f79f10b3e5458bc2ab05412e5d7a",
});

export const ODI_PINS = Object.freeze({
  engine: "LC_ODI_MATCH_V1",
  eventChain: "LC_ODI_EVENT_CHAIN_V1",
  worldHash: PINS.worldHash,
  rulesHash: "81f8ec39a793e3761dac2d477a7fc7d4981df2e69b262e88160cb93141c28ee5",
  modelHash: PINS.modelHash,
  stagePackHash: PINS.stagePackHash,
});


export const RED5_PINS = Object.freeze({
  engine: "LC_RED5_MATCH_V1",
  eventChain: "LC_RED5_EVENT_CHAIN_V1",
  worldHash: PINS.worldHash,
  rulesHash: "819b388b1947f71c6228b21680687472760bfcf4a872f0f41cc9508e65928800",
  modelHash: PINS.modelHash,
  stagePackHash: PINS.stagePackHash,
});
export const RED5_ARCHIVE_PINS = Object.freeze({
  engine: RED5_PINS.engine,eventChain:RED5_PINS.eventChain,random:"SHA256_COUNTER_V1",model:"synthetic-alpha-01",modelHash:RED5_PINS.modelHash,rules:"LC_RED5_01",rulesHash:RED5_PINS.rulesHash,worldHash:RED5_PINS.worldHash,
});

export const ARCHIVE_PINS = Object.freeze({
  engine: PINS.engine,
  eventChain: PINS.eventChain,
  random: "SHA256_COUNTER_V1",
  model: "synthetic-alpha-01",
  modelHash: PINS.modelHash,
  rules: "LC_T20_01",
  rulesHash: PINS.rulesHash,
  worldHash: PINS.worldHash,
});
export const ODI_ARCHIVE_PINS = Object.freeze({
  engine: ODI_PINS.engine,
  eventChain: ODI_PINS.eventChain,
  random: "SHA256_COUNTER_V1",
  model: "synthetic-alpha-01",
  modelHash: ODI_PINS.modelHash,
  rules: "LC_ODI_01",
  rulesHash: ODI_PINS.rulesHash,
  worldHash: ODI_PINS.worldHash,
});
const base = {
  version: z.literal(UI_VERSION),
  requestId: z.string().regex(/^ui-[0-9]+$/),
  expectedRevision: z.number().int().nonnegative(),
};
const careerFixtureShape = {
  saveId: z.string().min(1).max(160),
  seasonId: z.string().min(1).max(128),
  scheduleSha256: z.string().regex(/^[a-f0-9]{64}$/),
  fixtureId: z.string().min(1).max(128),
  fixtureOrdinal: z.number().int().min(0).max(55),
  roundNumber: z.number().int().min(1).max(14),
  matchDayDate: z.iso.date(),
  homeTeamId: z.string().min(1).max(128),
  awayTeamId: z.string().min(1).max(128),
  groundId: z.string().min(1).max(128),
  matchId: z.string().min(1).max(128),
  matchGameId: z.string().min(1).max(128),
  matchSeed: z.string().min(1).max(256),
  selections: z.tuple([T20TeamSelectionSchema, T20TeamSelectionSchema]),
  careerStateSha256: z.string().regex(/^[a-f0-9]{64}$/),
  managedTeamId: z.string().min(1).max(128).optional(),
};
export const CareerFixtureLaunchSchema = z.discriminatedUnion("launchVersion", [
  z.strictObject({ ...careerFixtureShape, launchVersion: z.literal("LC_CAREER_USER_MATCH_LAUNCH_V1") }),
  z.strictObject({ ...careerFixtureShape, launchVersion: z.literal("LC_CAREER_USER_MATCH_LAUNCH_V2"), worldCopy: NewGameWorldCopySchema }),
  z.strictObject({ ...careerFixtureShape, launchVersion: z.literal("LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER"), rosterPack: StagedRosterPackSchema }),
]);

export const RequestSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal("BOOT"), fresh: z.boolean().optional(), careerFixture: CareerFixtureLaunchSchema.nullable().optional() }),
  z.strictObject({
    ...base,
    type: z.literal("START"),
    format: z.enum(["T20", "ODI", "RED_BALL"]).default("T20"),
    selections: z.tuple([T20TeamSelectionSchema, T20TeamSelectionSchema]),
    groundId: z.string().min(1),
    careerFixture: CareerFixtureLaunchSchema.nullable().optional(),
    worldCopy: NewGameWorldCopySchema.nullable().optional(),
    rosterPack: StagedRosterPackSchema.nullable().optional(),
  }),
  z.strictObject({
    ...base,
    type: z.literal("COMMAND"),
    origin: z.enum(["HUMAN", "AI"]),
    command: z.union([T20CommandSchema, Red5CommandSchema]),
  }),
  z.strictObject({ ...base, type: z.literal("AI_STEP"), teamId: z.string().min(1).max(128), delegated: z.boolean().optional() }),
  z.strictObject({ ...base, type: z.literal("SET_DELEGATION"), teamId: z.string().min(1).max(128), expectedDelegationRevision: z.number().int().nonnegative(), categories: z.array(DelegationCategorySchema).max(6).refine(values => new Set(values).size === values.length) }),
  z.strictObject({ ...base, type: z.literal("VERIFY") }),
  z.strictObject({ ...base, type: z.literal("REBUILD_ANALYTICS") }),
  z.strictObject({ ...base, type: z.literal("CANCEL_ANALYTICS"), targetRequestId: z.string().regex(/^ui-[0-9]+$/) }),
  z.strictObject({ ...base, type: z.literal("LIST_SAVES") }),
  z.strictObject({
    ...base,
    type: z.literal("MANUAL_SAVE"),
    title: z.string().trim().min(1).max(80),
  }),
  z.strictObject({
    ...base,
    type: z.literal("LOAD_SAVE"),
    saveId: z.string().min(1).max(160),
  }),
  z.strictObject({
    ...base,
    type: z.literal("DELETE_SAVE"),
    saveId: z.string().min(1).max(160),
  }),
  z.strictObject({
    ...base,
    type: z.literal("EXPORT_SAVE"),
    saveId: z.string().min(1).max(160).nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal("IMPORT_SAVE"),
    archive: z.instanceof(Uint8Array),
  }),
]);
export type Request = z.infer<typeof RequestSchema>;
export type Selection = z.infer<typeof T20TeamSelectionSchema>;
export type Action = (T20Command | Red5Command) extends infer C
  ? C extends T20Command | Red5Command
    ? Pick<C, "kind" | "payload">
    : never
  : never;
export type PublicPlayer = {
  id: string;
  name: string;
  role: string;
  style: string | null;
  canBowl: boolean;
};
export type Catalog = {
  teams: {
    id: string;
    name: string;
    players: PublicPlayer[];
    suggested: Selection;
  }[];
  grounds: { id: string; name: string }[];
};
export type Candidate = { id: string; name: string; reason: string };
export type View = {
  format: "T20" | "ODI" | "RED_BALL";
  revision: number;
  phase: string;
  nextDecision: string;
  decisionTeamId: string | null;
  teams: {
    id: string;
    name: string;
    captainId: string;
    keeperId: string;
    playerIds: string[];
    colours?: [string, string];
  }[];
  names: Record<string, string>;
  hands: Record<string, "L" | "R">;
  ground: string;
  innings: InningsLedger[];
  activeIndex: number;
  candidates: Candidate[];
  bowlingPlan: BowlingPlan | null;
  battingPlans: Record<
    string,
    { aggression: number; intent: "NORMAL" | "ROTATE" | "PROTECT" }
  >;
  fieldSlots: { slotId: string; playerId: string }[];
  positions: string[];
  advanceReason: string;
  commentary: { sequence: number; text: string; short: string }[];
  scorecard: T20Scorecard | ODIScorecard | Red5Scorecard | null;
  analytics?: MatchAnalytics | null;
  resultText: string | null;
  eventCount: number;
  lastEventHash: string;
  redBall?: { day:number; localSeconds:number; finalHourActive:boolean; finalHourBallsRemaining:number; followOnEnforced:boolean; newBallAvailable:boolean; declared:boolean[] } | null;
};
export type Verification = {
  revision: number;
  eventsSha256: string;
  scorecardSha256: string;
  eventCount: number;
  replay: true;
  resimulation: true;
  humanRequests: number;
  systemAutopilotRequests: number;
};
export type PersistenceView = {
  saveId: string | null;
  durableRevision: number | null;
  savedAt: string | null;
  readOnly: boolean;
  recovered: boolean;
  recoveredFromGeneration: number | null;
  saves: SaveSummary[];
};
export type CareerMatchResult = {
  resultVersion: "LC_CAREER_USER_MATCH_RESULT_V1";
  seasonId: string;
  scheduleSha256: string;
  fixtureId: string;
  matchId: string;
  fixtureOrdinal: number;
  roundNumber: number;
  matchDayDate: string;
  homeTeamId: string;
  awayTeamId: string;
  selectedTeams: [Selection, Selection];
  scorecard: T20Scorecard;
  scorecardSha256: string;
  finalEventHash: string;
  sourceCompletionSha256: string;
  conditionDelta: MatchConditionDelta;
};

export type Response = {
  version: typeof UI_VERSION;
  requestId: string;
  revision: number;
  pins: typeof PINS;
  catalog: Catalog | null;
  view: View | null;
  error: string | null;
  verification: Verification | null;
  persistence?: PersistenceView;
  archive?: Uint8Array | null;
  careerResult?: CareerMatchResult | null;
  rosterCareerSession?: unknown;
  acknowledgement?: { commandId: string; committedRevision: number; fromSequence: number; toSequence: number; lastEventHash: string };
  analyticsRebuild?: { state: "COMPLETE" | "CANCELLED"; applied: number; total: number };
  delegation?: DelegationJournal;
};
export type AnalyticsProgress = { type: "ANALYTICS_PROGRESS"; version: typeof UI_VERSION; pins: typeof PINS; requestId: string; applied: number; total: number };
