/**
 * CP12B: Quick match, Guided first match and Custom match on the title screen start a new match, while Continue (and
 * any other way into `#exhibition`) resumes the active one as before. The title screen marks the request here, in this
 * page's memory only: nothing is stored, so no key, field or preference is added, and a reload or a new tab opened on
 * `#exhibition` resumes exactly as before. The match screen takes the request once, as it boots.
 */
let requestedAt = 0;

/** How long a request stays valid: the same minute the quick match flag already allows. */
export const NEW_MATCH_REQUEST_MS = 60_000;

/** Marks that the player asked the title screen for a new match. */
export function requestNewMatch(now: number = Date.now()): void {
  requestedAt = now;
}

/** Takes the request (it is cleared either way) and says whether it is still current. */
export function takeNewMatchRequest(now: number = Date.now()): boolean {
  const at = requestedAt;
  requestedAt = 0;
  return at > 0 && now - at >= 0 && now - at < NEW_MATCH_REQUEST_MS;
}
