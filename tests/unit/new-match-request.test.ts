import { describe, expect, it } from "vitest";
import { NEW_MATCH_REQUEST_MS, requestNewMatch, takeNewMatchRequest } from "../../apps/web/src/new-match-request.js";

// CP12B: the title screen's request for a new match lives in page memory only and is taken once.
describe("new match request from the title screen", () => {
  it("is absent until asked for", () => {
    takeNewMatchRequest();
    expect(takeNewMatchRequest(1_000)).toBe(false);
  });

  it("is taken once", () => {
    requestNewMatch(10_000);
    expect(takeNewMatchRequest(10_500)).toBe(true);
    expect(takeNewMatchRequest(10_600)).toBe(false);
  });

  it("lapses after a minute, and is cleared when taken late", () => {
    requestNewMatch(10_000);
    expect(takeNewMatchRequest(10_000 + NEW_MATCH_REQUEST_MS)).toBe(false);
    expect(takeNewMatchRequest(10_000 + 1)).toBe(false);
  });

  it("ignores a request stamped in the future", () => {
    requestNewMatch(20_000);
    expect(takeNewMatchRequest(19_000)).toBe(false);
  });
});
