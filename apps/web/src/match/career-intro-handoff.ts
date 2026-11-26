import type { CareerIntroSummary } from "@lcxxvi/projections";

/**
 * LC_PLAYER_IDENTITY_V2: the read-only career summary handed from the career screen to the match view with a managed
 * fixture. It is held in memory only, for this page: never in sessionStorage, IndexedDB, the launch, the managed
 * binding or an export, so no persisted format changes. After a page reload the match falls back to the V1
 * style-only introductions until the career launches the match again ("Play match" resumes it and hands it over).
 */
let current: CareerIntroSummary | null = null;

export function handOverCareerIntro(summary: CareerIntroSummary | null): void {
  current = summary ? Object.freeze(structuredClone(summary)) : null;
}

/** The summary for this managed match, or null (exhibitions, quick matches, roster careers, or after a reload). */
export function careerIntroFor(matchGameId: string | null | undefined): CareerIntroSummary | null {
  return matchGameId && current && current.matchGameId === matchGameId ? current : null;
}
