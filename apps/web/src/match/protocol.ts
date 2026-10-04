import { z } from "zod";
import {
  T20CommandSchema,
  T20TeamSelectionSchema,
  type T20Command,
  type T20Scorecard,
  type InningsLedger,
  type BowlingPlan,
} from "@lcxxvi/contracts";

export const UI_VERSION = "LC_T20_UI_V1" as const;
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
const base = {
  version: z.literal(UI_VERSION),
  requestId: z.string().regex(/^ui-[0-9]+$/),
  expectedRevision: z.number().int().nonnegative(),
};
export const RequestSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal("BOOT") }),
  z.strictObject({
    ...base,
    type: z.literal("START"),
    selections: z.tuple([T20TeamSelectionSchema, T20TeamSelectionSchema]),
    groundId: z.string().min(1),
  }),
  z.strictObject({
    ...base,
    type: z.literal("COMMAND"),
    origin: z.literal("HUMAN"),
    command: T20CommandSchema,
  }),
  z.strictObject({ ...base, type: z.literal("VERIFY") }),
]);
export type Request = z.infer<typeof RequestSchema>;
export type Selection = z.infer<typeof T20TeamSelectionSchema>;
export type Action = T20Command extends infer C
  ? C extends T20Command
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
  }[];
  names: Record<string, string>;
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
  scorecard: T20Scorecard | null;
  resultText: string | null;
  eventCount: number;
  lastEventHash: string;
};
export type Verification = {
  revision: number;
  eventsSha256: string;
  scorecardSha256: string;
  eventCount: number;
  replay: true;
  resimulation: true;
  humanRequests: number;
  systemAutopilotRequests: 0;
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
};
