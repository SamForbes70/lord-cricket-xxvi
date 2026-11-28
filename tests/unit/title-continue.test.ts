import { describe, expect, it } from "vitest";
import { chooseContinue, type ContinueInput } from "../../apps/web/src/title-continue.js";

// CP12 (CD-046): the title screen's Continue is chosen only from what the game already stores.
const base: ContinueInput = { matchActiveId: null, matches: [], careerActiveId: null, careers: [] };
const match = { saveId: "auto:g1", title: "Aster Harbour v Copper Vale", phase: "AWAITING_BATTER", completed: false, updatedAt: "2026-11-28T10:00:00.000Z" };
const career = { saveId: "career-1", title: "Aster Harbour 2027", updatedAt: "2026-11-28T09:00:00.000Z", currentDate: "2027-03-01", completedFixtures: 4, currentSeasonNumber: 1 };

describe("title screen Continue", () => {
  it("offers nothing on a first launch", () => {
    expect(chooseContinue(base)).toBeNull();
  });

  it("resumes the active match while it is unfinished, and never a finished one", () => {
    expect(chooseContinue({ ...base, matchActiveId: "auto:g1", matches: [match] })).toMatchObject({ kind: "MATCH", href: "#exhibition", action: "Continue match", title: match.title, detail: "In progress: a batter to choose" });
    expect(chooseContinue({ ...base, matchActiveId: "auto:g1", matches: [{ ...match, phase: "READY" }] })?.detail).toBe("In progress: ready for the next ball");
    // A phase without its own words falls back to the saved-games label.
    expect(chooseContinue({ ...base, matchActiveId: "auto:g1", matches: [{ ...match, phase: "INNINGS_BREAK" }] })?.detail).toBe("In progress: innings break");
    expect(chooseContinue({ ...base, matchActiveId: "auto:g1", matches: [{ ...match, phase: "COMPLETE", completed: true }] })).toBeNull();
    // A saved match that is not the active one is not resumed by opening the match screen, so it is not offered.
    expect(chooseContinue({ ...base, matchActiveId: null, matches: [match] })).toBeNull();
  });

  it("resumes the active career, and picks the most recently saved of a match and a career", () => {
    expect(chooseContinue({ ...base, careerActiveId: "career-1", careers: [career] })).toMatchObject({ kind: "CAREER", href: "#career", action: "Continue career", detail: "Season 1 · 4/56 fixtures · Mon 1 March 2027" });
    const both = { matchActiveId: "auto:g1", matches: [match], careerActiveId: "career-1", careers: [career] };
    expect(chooseContinue(both)?.kind).toBe("MATCH");
    expect(chooseContinue({ ...both, careers: [{ ...career, updatedAt: "2026-11-28T11:00:00.000Z" }] })?.kind).toBe("CAREER");
  });

  it("opens the saved-career list, newest first, when careers are saved but none is active", () => {
    const older = { ...career, saveId: "career-0", title: "Copper Vale 2027", updatedAt: "2026-11-01T09:00:00.000Z" };
    expect(chooseContinue({ ...base, careers: [older, career] })).toMatchObject({ kind: "CAREER_LIST", href: "#career", title: "Choose from 2 saved careers", detail: "Most recent: Aster Harbour 2027" });
    // An active pointer to a save that no longer exists falls back to the list.
    expect(chooseContinue({ ...base, careerActiveId: "gone", careers: [career] })?.kind).toBe("CAREER_LIST");
  });
});
