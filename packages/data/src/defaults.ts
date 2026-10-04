import { FieldRegistrySchema, type Delegation } from "@lcxxvi/contracts";
export const USER_DELEGATION: Readonly<Delegation> = {
  battingOrder: false,
  bowlerSelection: false,
  battingTactics: false,
  bowlingTactics: false,
  declarations: false,
  followOn: false,
};
export const AI_DELEGATION: Readonly<Delegation> = {
  battingOrder: true,
  bowlerSelection: true,
  battingTactics: true,
  bowlingTactics: true,
  declarations: true,
  followOn: true,
};
export const NEUTRAL_PITCH = {
  seamBp: 5000,
  turnBp: 5000,
  variabilityBp: 5000,
  moistureBp: 5000,
  wearPoints: 0,
} as const;
export const NEUTRAL_GROUND_GEOMETRY = {
  sectorRadiiCm: [7000, 7000, 7000, 7000, 7000, 7000, 7000, 7000],
  outfieldSpeedBp: 5000,
} as const;
/** Stored configuration only; no weather schedule or stochastic transitions are generated. */
export const WEATHER_TRANSITION_WEIGHTS = {
  DRY: { DRY: 85, OVERCAST: 12, RAIN: 3 },
  OVERCAST: { DRY: 30, OVERCAST: 60, RAIN: 10 },
  RAIN: { DRY: 20, OVERCAST: 40, RAIN: 40 },
} as const;
export const WEATHER_SEGMENT_SECONDS = 1800;
/** Illustrative coordinates, not physical tracking. See ADR-004. */
export const FIELD_REGISTRY = FieldRegistrySchema.parse({
  registryId: "LC_FIELD_CONTRACT_01",
  referenceHand: "R",
  positions: [
    {
      slotId: "slip-1",
      sector: 7,
      angleDegrees: 315,
      depth: "INNER",
      insideCircle: true,
      legSide: false,
      behindSquare: true,
    },
    {
      slotId: "slip-2",
      sector: 7,
      angleDegrees: 300,
      depth: "INNER",
      insideCircle: true,
      legSide: false,
      behindSquare: true,
    },
    {
      slotId: "point",
      sector: 6,
      angleDegrees: 270,
      depth: "MIDDLE",
      insideCircle: true,
      legSide: false,
      behindSquare: false,
    },
    {
      slotId: "cover",
      sector: 5,
      angleDegrees: 225,
      depth: "MIDDLE",
      insideCircle: true,
      legSide: false,
      behindSquare: false,
    },
    {
      slotId: "mid-off",
      sector: 4,
      angleDegrees: 190,
      depth: "MIDDLE",
      insideCircle: true,
      legSide: false,
      behindSquare: false,
    },
    {
      slotId: "mid-on",
      sector: 4,
      angleDegrees: 170,
      depth: "MIDDLE",
      insideCircle: true,
      legSide: true,
      behindSquare: false,
    },
    {
      slotId: "midwicket",
      sector: 3,
      angleDegrees: 135,
      depth: "MIDDLE",
      insideCircle: true,
      legSide: true,
      behindSquare: false,
    },
    {
      slotId: "deep-square-leg",
      sector: 2,
      angleDegrees: 90,
      depth: "DEEP",
      insideCircle: false,
      legSide: true,
      behindSquare: false,
    },
    {
      slotId: "fine-leg",
      sector: 1,
      angleDegrees: 45,
      depth: "DEEP",
      insideCircle: false,
      legSide: true,
      behindSquare: true,
    },
    {
      slotId: "deep-cover",
      sector: 5,
      angleDegrees: 225,
      depth: "DEEP",
      insideCircle: false,
      legSide: false,
      behindSquare: false,
    },
    {
      slotId: "long-on",
      sector: 4,
      angleDegrees: 170,
      depth: "DEEP",
      insideCircle: false,
      legSide: true,
      behindSquare: false,
    },
  ],
});
export const T20_POWERPLAY_SLOTS = [
  "slip-1",
  "slip-2",
  "point",
  "cover",
  "mid-off",
  "mid-on",
  "midwicket",
  "deep-square-leg",
  "fine-leg",
] as const;
export const T20_LATER_SLOTS = [
  "deep-cover",
  "long-on",
  "point",
  "cover",
  "mid-off",
  "mid-on",
  "midwicket",
  "deep-square-leg",
  "fine-leg",
] as const;

/** ODI-only registry extends the inherited T20 names without changing T20 field choices. */
export const ODI_FIELD_REGISTRY = FieldRegistrySchema.parse({
  registryId: "LC_ODI_FIELD_01",
  referenceHand: "R",
  positions: [
    ...FIELD_REGISTRY.positions,
    {
      slotId: "long-off",
      sector: 4,
      angleDegrees: 190,
      depth: "DEEP",
      insideCircle: false,
      legSide: false,
      behindSquare: false,
    },
  ],
});
export const ODI_POWERPLAY_SLOTS = T20_POWERPLAY_SLOTS;
export const ODI_MIDDLE_SLOTS = T20_LATER_SLOTS;
export const ODI_LATE_SLOTS = [
  "deep-cover",
  "long-off",
  "long-on",
  "deep-square-leg",
  "fine-leg",
  "point",
  "cover",
  "mid-on",
  "midwicket",
] as const;
