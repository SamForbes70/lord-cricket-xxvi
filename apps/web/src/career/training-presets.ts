import type { TrainingDirective } from "@lcxxvi/contracts";

/**
 * Squad training presets (E10). A preset is only a way to choose the existing per-player directive for
 * everyone at once: applying one issues the same command the per-player control issues. Nothing new is saved.
 */

/** Starting value, a design choice to tune after playtests: fatigue at or above this is rested by "Freshen up". */
export const FRESHEN_UP_FATIGUE_BP = 2000;

export type TrainingPresetId = "BALANCED" | "FRESHEN_UP" | "BATTING_WEEK" | "BOWLING_FIELDING_WEEK";

export const TRAINING_PRESETS: readonly { id: TrainingPresetId; label: string; description: string }[] = [
  { id: "BALANCED", label: "Balanced", description: "Each player works on their main discipline." },
  { id: "FRESHEN_UP", label: "Freshen up", description: "Tired players rest; the others work on their main discipline." },
  { id: "BATTING_WEEK", label: "Batting week", description: "Everyone bats." },
  { id: "BOWLING_FIELDING_WEEK", label: "Bowling and fielding week", description: "Bowlers bowl; everyone else fields." },
];

export interface TrainingPresetPlayer {
  playerId: string;
  role: string;
  bowlingCapable: boolean;
  battingStrength: number;
  bowlingStrength: number;
  fatigueBp: number;
  directive: TrainingDirective;
}

function mainDiscipline(player: TrainingPresetPlayer): TrainingDirective {
  if (player.role === "KEEPER") return "FIELDING_PRACTICE";
  if (player.bowlingCapable && player.bowlingStrength >= player.battingStrength) return "BOWLING_PRACTICE";
  return "BATTING_PRACTICE";
}

export function presetDirective(preset: TrainingPresetId, player: TrainingPresetPlayer): TrainingDirective {
  switch (preset) {
    case "BALANCED":
      return mainDiscipline(player);
    case "FRESHEN_UP":
      return player.fatigueBp >= FRESHEN_UP_FATIGUE_BP ? "REST" : mainDiscipline(player);
    case "BATTING_WEEK":
      return "BATTING_PRACTICE";
    case "BOWLING_FIELDING_WEEK":
      return player.bowlingCapable ? "BOWLING_PRACTICE" : "FIELDING_PRACTICE";
  }
}

export interface TrainingPresetPlan {
  directives: { playerId: string; directive: TrainingDirective }[];
  /** Only the players whose directive would change. */
  changes: { playerId: string; directive: TrainingDirective }[];
  summary: string;
}

export function planTrainingPreset(preset: TrainingPresetId, players: readonly TrainingPresetPlayer[]): TrainingPresetPlan {
  const directives = players.map((player) => ({ playerId: player.playerId, directive: presetDirective(preset, player) }));
  const changes = directives.filter((entry, index) => entry.directive !== players[index]!.directive);
  const rested = directives.filter((entry) => entry.directive === "REST").length;
  const summary = `${rested} rested, ${directives.length - rested} training. ${changes.length} ${changes.length === 1 ? "change" : "changes"}.`;
  return { directives, changes, summary };
}

/** The preset every player's current directive matches, if any. */
export function matchingPreset(players: readonly TrainingPresetPlayer[]): TrainingPresetId | null {
  return TRAINING_PRESETS.find((preset) => players.length > 0 && players.every((player) => presetDirective(preset.id, player) === player.directive))?.id ?? null;
}
