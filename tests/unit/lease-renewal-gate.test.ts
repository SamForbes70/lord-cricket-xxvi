import { describe, expect, it } from "vitest";
import { createLeaseRenewalGate } from "../../apps/web/src/match/lease-renewal-gate.js";

describe("match worker lease renewal gate", () => {
  it("applies a failed renewal that overlapped no request", () => {
    const gate = createLeaseRenewalGate();
    const ticket = gate.begin("auto:game-a");
    // Another tab took the lease while this one was idle: the tab must become read only.
    expect(gate.failureApplies(ticket, "auto:game-a", false)).toBe(true);
  });

  it("ignores a renewal that failed because New exhibition released the lease while it was in flight", () => {
    const gate = createLeaseRenewalGate();
    const ticket = gate.begin("auto:game-a");
    // BOOT fresh: releases the lease, clears the active save and resets read only, all while the renewal is pending.
    gate.requestStarted();
    const activeSaveId: string | null = null;
    gate.requestFinished();
    expect(gate.failureApplies(ticket, activeSaveId, false)).toBe(false);
  });

  it("ignores a failed renewal that resolves while a request is still being handled", () => {
    const gate = createLeaseRenewalGate();
    const ticket = gate.begin("auto:game-a");
    gate.requestStarted();
    // LOAD_SAVE of the same save released and is retaking the lease: the id still matches, but the result is stale.
    expect(gate.failureApplies(ticket, "auto:game-a", false)).toBe(false);
    gate.requestFinished();
    expect(gate.failureApplies(ticket, "auto:game-a", false)).toBe(false);
  });

  it("ignores a renewal that began during a request even when it resolves afterwards", () => {
    const gate = createLeaseRenewalGate();
    gate.requestStarted();
    const ticket = gate.begin("auto:game-a");
    gate.requestFinished();
    expect(gate.failureApplies(ticket, "auto:game-a", false)).toBe(false);
  });

  it("ignores a renewal for a save that is no longer the active one", () => {
    const gate = createLeaseRenewalGate();
    const ticket = gate.begin("auto:game-a");
    expect(gate.failureApplies(ticket, "auto:game-b", false)).toBe(false);
    expect(gate.failureApplies(ticket, null, false)).toBe(false);
  });

  it("leaves an already read-only tab alone and checks again on the next quiet tick", () => {
    const gate = createLeaseRenewalGate();
    expect(gate.failureApplies(gate.begin("auto:game-a"), "auto:game-a", true)).toBe(false);
    gate.requestStarted();
    gate.requestFinished();
    // Multi-tab protection is unchanged: a later renewal with no overlapping request still marks the tab read only.
    expect(gate.failureApplies(gate.begin("auto:game-a"), "auto:game-a", false)).toBe(true);
  });
});
