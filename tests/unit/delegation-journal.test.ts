import { describe, expect, test } from "vitest";
import { appendDelegationChange, delegationForTeam, replayDelegationJournal } from "../../apps/web/src/match/delegation-journal.js";

const empty = { version: "LC_DELEGATION_JOURNAL_V1", changes: [] };
const first = { commandId: "one", expectedRevision: 0, matchRevision: 4, teamId: "team-a", categories: ["BOWLER"] };

describe("delegation choice history", () => {
  test("replays per-team choices and accepts an identical retry", () => {
    const one = appendDelegationChange(empty, first);
    const two = appendDelegationChange(one, { commandId: "two", expectedRevision: 1, matchRevision: 6, teamId: "team-b", categories: ["BATTER"] });
    expect(appendDelegationChange(two, first)).toEqual(two);
    expect(delegationForTeam(two, "team-a")).toEqual(["BOWLER"]);
    expect(delegationForTeam(two, "team-b")).toEqual(["BATTER"]);
    expect(delegationForTeam(two, "team-c")).toEqual([]);
    expect(replayDelegationJournal(JSON.parse(JSON.stringify(two)))).toEqual(two);
  });
  test("rejects conflicts, stale changes and invalid histories", () => {
    const one = appendDelegationChange(empty, first);
    expect(() => appendDelegationChange(one, { ...first, categories: [] })).toThrow("DELEGATION_DUPLICATE_CONFLICT");
    expect(() => appendDelegationChange(one, { ...first, commandId: "other" })).toThrow("DELEGATION_STALE_REVISION");
    expect(() => appendDelegationChange(one, { ...first, commandId: "other", expectedRevision: 1, matchRevision: 3 })).toThrow("DELEGATION_STALE_MATCH");
    expect(() => replayDelegationJournal({ ...one, changes: [first, first] })).toThrow("DELEGATION_JOURNAL_INVALID");
    expect(() => appendDelegationChange(empty, { ...first, categories: ["BOWLER", "BOWLER"] })).toThrow();
    expect(() => replayDelegationJournal({ version: "LC_DELEGATION_JOURNAL_V2", changes: [] })).toThrow();
  });
});
