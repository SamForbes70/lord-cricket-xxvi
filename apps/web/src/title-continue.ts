import {
  IndexedDbPersistentWorldRepository,
  IndexedDbSaveRepository,
  IndexedDbSeasonRepository,
} from "@lcxxvi/persistence";
import { formatGameDate } from "./career/format.js";
import { matchPhaseLabel } from "./display-labels.js";

/**
 * CP12 (CD-046): what the title screen's Continue action resumes. Read only from what the game already stores: the
 * match and career "active save" pointers the match worker and the career screen already keep, and the save catalogue
 * rows with their `updatedAt` stamps. Nothing is written, and no new key, field or preference is added: following the
 * link opens the screen that already resumes the active save on its own (`#exhibition` restores the active match,
 * `#career` loads the active career).
 */
export type ContinueTarget = {
  kind: "MATCH" | "CAREER" | "CAREER_LIST";
  href: "#exhibition" | "#career";
  /** Short label for the button, such as "Continue match". */
  action: string;
  /** The save's own title. */
  title: string;
  /** One line of plain detail under the title. */
  detail: string;
  updatedAt: string;
};

export type ContinueMatchRow = { saveId: string; title: string; phase: string; completed: boolean; updatedAt: string };
export type ContinueCareerRow = {
  saveId: string;
  title: string;
  updatedAt: string;
  currentDate: string;
  completedFixtures: number;
  currentSeasonNumber?: number;
};

export type ContinueInput = {
  matchActiveId: string | null;
  matches: readonly ContinueMatchRow[];
  careerActiveId: string | null;
  careers: readonly ContinueCareerRow[];
};

/** Where a saved match stands, in words for the Continue detail line. */
const MATCH_STAGE: Record<string, string> = {
  TOSS: "at the toss",
  AWAITING_INNINGS: "bat or bowl to choose",
  AWAITING_FOLLOW_ON: "the follow-on to decide",
  AWAITING_BATTER: "a batter to choose",
  AWAITING_BOWLER: "a bowler to choose",
  READY: "ready for the next ball",
};

/** Plural helper for counts in the detail line. */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Picks the Continue target. A match counts only when it is the active match and is not finished (a finished match has
 * nothing to resume); a career counts when it is the active career. When both exist, the one saved most recently wins.
 * When no career is active but careers are saved, Continue opens the saved-career list, newest first. Exported for tests.
 */
export function chooseContinue(input: ContinueInput): ContinueTarget | null {
  const candidates: ContinueTarget[] = [];
  const match = input.matchActiveId ? input.matches.find((row) => row.saveId === input.matchActiveId) : undefined;
  if (match && !match.completed && match.phase !== "COMPLETE") {
    candidates.push({
      kind: "MATCH",
      href: "#exhibition",
      action: "Continue match",
      title: match.title,
      detail: `In progress: ${MATCH_STAGE[match.phase] ?? matchPhaseLabel(match.phase).toLowerCase()}`,
      updatedAt: match.updatedAt,
    });
  }
  const career = input.careerActiveId ? input.careers.find((row) => row.saveId === input.careerActiveId) : undefined;
  if (career) {
    const season = career.currentSeasonNumber ? `Season ${career.currentSeasonNumber} · ` : "";
    candidates.push({
      kind: "CAREER",
      href: "#career",
      action: "Continue career",
      title: career.title,
      detail: `${season}${career.completedFixtures}/56 fixtures · ${formatGameDate(career.currentDate)}`,
      updatedAt: career.updatedAt,
    });
  }
  if (candidates.length > 0) {
    // ISO timestamps compare by code point; the newest save wins, and a tie keeps the match (the more specific place).
    return candidates.reduce((best, next) => (next.updatedAt > best.updatedAt ? next : best));
  }
  if (input.careers.length > 0) {
    const newest = [...input.careers].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))[0]!;
    return {
      kind: "CAREER_LIST",
      href: "#career",
      action: "Saved careers",
      title: `Choose from ${plural(input.careers.length, "saved career")}`,
      detail: `Most recent: ${newest.title}`,
      updatedAt: newest.updatedAt,
    };
  }
  return null;
}

/** One set of read-only repositories for the page, so returning to the title does not open more connections. */
let repositories: {
  match: IndexedDbSaveRepository;
  season: IndexedDbSeasonRepository;
  world: IndexedDbPersistentWorldRepository;
} | null = null;

/** Reads the stored pointers and catalogue rows. Any storage failure (blocked storage, private mode) means no Continue. */
export async function readContinueTarget(): Promise<ContinueTarget | null> {
  try {
    if (typeof indexedDB === "undefined") return null;
    repositories ??= {
      match: new IndexedDbSaveRepository(),
      season: new IndexedDbSeasonRepository(),
      world: new IndexedDbPersistentWorldRepository(),
    };
    const { match: matchRepository, season: seasonRepository, world: worldRepository } = repositories;
    const [matchActiveId, matches, worldActiveId, seasonActiveId, worlds, seasons] = await Promise.all([
      matchRepository.activeSaveId(),
      matchRepository.list(),
      worldRepository.activeSaveId(),
      seasonRepository.activeSaveId(),
      worldRepository.list(),
      seasonRepository.list(),
    ]);
    return chooseContinue({
      matchActiveId,
      matches,
      // The same order the career screen boots in: a persistent world first, then a single-season save.
      careerActiveId: worldActiveId ?? seasonActiveId,
      careers: [
        ...worlds.map((row) => ({ ...row, currentSeasonNumber: row.currentSeasonNumber })),
        ...seasons.map((row) => ({ ...row })),
      ],
    });
  } catch {
    return null;
  }
}
