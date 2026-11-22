import { describe, expect, test } from "vitest";
import { matchingPreset, planTrainingPreset, presetDirective, type TrainingPresetPlayer } from "../../apps/web/src/career/training-presets.js";

const player = (playerId: string, role: string, bat: number, bowl: number, fatigueBp = 0, directive: TrainingPresetPlayer["directive"] = "REST"): TrainingPresetPlayer =>
  ({ playerId, role, bowlingCapable: role === "BOWLER" || role === "ALLROUNDER", battingStrength: bat, bowlingStrength: bowl, fatigueBp, directive });
const squad = [
  player("keeper", "KEEPER", 60, 0),
  player("batter", "BATTER", 70, 0, 2500),
  player("bowler", "BOWLER", 30, 75, 1999),
  player("batting-allrounder", "ALLROUNDER", 68, 60, 2000),
  player("bowling-allrounder", "ALLROUNDER", 55, 66),
];

describe("training presets", () => {
  test("balanced sends each player to their main discipline", () => {
    expect(planTrainingPreset("BALANCED", squad).directives.map((entry) => entry.directive)).toEqual(
      ["FIELDING_PRACTICE", "BATTING_PRACTICE", "BOWLING_PRACTICE", "BATTING_PRACTICE", "BOWLING_PRACTICE"]);
  });
  test("freshen up rests players at or above the fatigue line and no one below it", () => {
    const plan = planTrainingPreset("FRESHEN_UP", squad);
    expect(plan.directives.map((entry) => entry.directive)).toEqual(["FIELDING_PRACTICE", "REST", "BOWLING_PRACTICE", "REST", "BOWLING_PRACTICE"]);
    expect(plan.summary).toBe("2 rested, 3 training. 3 changes.");
    expect(plan.changes.map((entry) => entry.playerId)).toEqual(["keeper", "bowler", "bowling-allrounder"]);
  });
  test("batting week and bowling and fielding week", () => {
    expect(new Set(planTrainingPreset("BATTING_WEEK", squad).directives.map((entry) => entry.directive))).toEqual(new Set(["BATTING_PRACTICE"]));
    expect(planTrainingPreset("BOWLING_FIELDING_WEEK", squad).directives.map((entry) => entry.directive)).toEqual(
      ["FIELDING_PRACTICE", "FIELDING_PRACTICE", "BOWLING_PRACTICE", "BOWLING_PRACTICE", "BOWLING_PRACTICE"]);
  });
  test("a squad that already matches a preset is recognised, and an override breaks the match", () => {
    const balanced = squad.map((entry) => ({ ...entry, directive: presetDirective("BALANCED", entry) }));
    expect(matchingPreset(balanced)).toBe("BALANCED");
    expect(planTrainingPreset("BALANCED", balanced).changes).toEqual([]);
    expect(matchingPreset([{ ...balanced[0]!, directive: "REST" }, ...balanced.slice(1)])).toBeNull();
    expect(matchingPreset([])).toBeNull();
  });
});
