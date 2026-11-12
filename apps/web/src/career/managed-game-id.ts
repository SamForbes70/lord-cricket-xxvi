import { createStateHasher } from "@lcxxvi/simulation";

const slotHash = createStateHasher().hash;
const SCOPED_PREFIX = /^cm-[a-f0-9]{12}-/;

/**
 * Builds a deterministic, career-slot-scoped match gameId that fits within the 64-char GameIdSchema
 * so independent career copies or imported archives of the same season never collide in IndexedDB.
 */
export function managedMatchGameId(careerSaveId: string, fixtureId: string): string {
  const tag = slotHash({ version: "LC_MANAGED_SLOT_V1", careerSaveId }).slice(0, 12);
  return `cm-${tag}-${fixtureId}`;
}

/** Accepts both slot-scoped gameIds and legacy V0.1 `career-match-<fixtureId>` gameIds. */
export function isValidManagedMatchGameId(matchGameId: string, fixtureId: string): boolean {
  if (matchGameId === `career-match-${fixtureId}`) return true;
  return SCOPED_PREFIX.test(matchGameId) && matchGameId.slice(16) === fixtureId;
}
