import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  availabilityLabel,
  careerPhaseLabel,
  enumLabel,
  matchPhaseLabel,
  NO_VALUE_TEXT,
  roleLabel,
} from "../../apps/web/src/display-labels.js";

// CP02B (CD-030): the project's style rule is no en or em dashes. The web app's source is scanned whole (string
// literals, JSX text and comments), so a dash cannot reach a screen through a label, a placeholder or a template.
const ROOT = "apps/web/src";
const DASH = /[–—]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx|ts)$/.test(entry.name) ? [path] : [];
  });
}

describe("CP02B UI strings", () => {
  test("no en or em dash in any web app source file", () => {
    const files = sourceFiles(ROOT);
    expect(files.filter((file) => file.endsWith(".tsx")).length).toBeGreaterThan(30);
    const found: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (DASH.test(line)) found.push(`${relative(".", file)}:${index + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
    expect(found).toEqual([]);
  });

  test("the scan itself sees both dashes", () => {
    expect(DASH.test("a – b")).toBe(true);
    expect(DASH.test("a — b")).toBe(true);
    expect(DASH.test("a - b")).toBe(false);
  });
});

// CP02B (CD-031): stored values shown in words. Display only; the stored spelling is untouched.
describe("CP02B display labels", () => {
  test("stored upper-case values read as sentence case", () => {
    expect(enumLabel("BATTING_PRACTICE")).toBe("Batting practice");
    expect(enumLabel("FIELDING_PRACTICE")).toBe("Fielding practice");
    expect(enumLabel("NORMAL")).toBe("Normal");
    expect(enumLabel("GOOD")).toBe("Good");
    expect(enumLabel("YORKER")).toBe("Yorker");
    expect(enumLabel("STUMPS")).toBe("Stumps");
    expect(enumLabel("OFF")).toBe("Off stump");
    expect(enumLabel("AGE_AND_WORKLOAD")).toBe("Age and workload");
    expect(enumLabel("Already words")).toBe("Already words");
  });

  test("roles, availability and phases have friendly words", () => {
    expect(roleLabel("ALLROUNDER")).toBe("All-rounder");
    expect(roleLabel("KEEPER")).toBe("Keeper");
    expect(availabilityLabel("AVAILABLE")).toBe("Available");
    expect(availabilityLabel("UNAVAILABLE")).toBe("Unavailable");
    expect(careerPhaseLabel("ACTIVE")).toBe("In progress");
    expect(careerPhaseLabel("COMPLETE")).toBe("Season complete");
    expect(matchPhaseLabel("AWAITING_BATTER")).toBe("Awaiting batter");
    expect(matchPhaseLabel("COMPLETE")).toBe("Finished");
  });

  test("a missing value is the word none, never a dash or a dot", () => {
    expect(NO_VALUE_TEXT).toBe("none");
  });
});
