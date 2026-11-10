import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { projectT20Scorecard, runFixtureT20, validateT20MatchSetup } from "@lcxxvi/simulation";
import { csvCell, scorecardCsv, scorecardRows } from "../../apps/web/src/match/scorecard-export.js";
import type { View } from "../../apps/web/src/match/protocol.js";

describe("scorecard export", () => {
  test("escapes spreadsheet formulas, quotes, commas, newlines and missing values", () => {
    expect(csvCell("  =SUM(1,2)")).toBe('"\'  =SUM(1,2)"');
    expect(csvCell("\t@run")).toBe('"\'\t@run"');
    expect(csvCell("\u0000+1")).toBe('"\'\u0000+1"');
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(0)).toBe('"0"');
  });
  test("exports totals and player credits from an authoritative completed scorecard", () => {
    const setup = validateT20MatchSetup(JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8")), readFileSync("packages/data/worlds/fictional-eight-01.json"), JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8")));
    const card = projectT20Scorecard(runFixtureT20(setup));
    const view = { format: "T20", scorecard: card, names: {}, teams: [], ground: "Ground", resultText: null } as unknown as View;
    const rows = scorecardRows(view);
    card.innings.forEach((innings, index) => {
      const label = `Innings ${index + 1}`;
      expect(rows.find(row => row[0] === label && row[1] === "Total")?.[3]).toBe(`${innings.runs}/${innings.wickets}`);
      expect(Object.values(innings.batting).reduce((sum, batter) => sum + batter.runs, 0) + Object.values(innings.extras).reduce((sum, extra) => sum + extra, 0)).toBe(innings.runs);
      expect(rows.filter(row => row[0] === label && (row[1] === "Out" || row[1] === "Not out / did not bat")).reduce((sum, row) => sum + Number(row[3]), 0)).toBe(Object.values(innings.batting).reduce((sum, batter) => sum + batter.runs, 0));
    });
    expect(scorecardCsv(rows).startsWith("\ufeff")).toBe(true);
    expect(scorecardCsv(rows)).toContain("synthetic-alpha-01 (SYNTHETIC_ALPHA)");
    expect(scorecardRows({ ...view, scorecard: null })).toEqual([]);
  });
});
