import { it, expect } from "vitest";
import {
  canonicalJson,
  randomAddressBytes,
  stableId,
  IDSchema,
} from "@lcxxvi/contracts";
it("canonicalises object order without altering array order", () => {
  expect(canonicalJson({ z: 1, a: { b: 2, a: 3 } })).toBe(
    '{"a":{"a":3,"b":2},"z":1}',
  );
  expect(canonicalJson([2, 1])).toBe("[2,1]");
  expect(canonicalJson({ a: -0 })).toBe('{"a":0}');
});
it("rejects non-JSON and cyclic values", () => {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  for (const v of [
    undefined,
    NaN,
    Infinity,
    1n,
    () => 0,
    new Date(),
    cycle,
    new Array(2),
  ])
    expect(() => canonicalJson(v)).toThrow();
});
it("rejects getters without running them", () => {
  let ran = false;
  const x = {
    get a() {
      ran = true;
      return 1;
    },
  };
  expect(() => canonicalJson(x)).toThrow("accessors");
  expect(ran).toBe(false);
});
it("encodes the normative fixed random-address tuple without drawing", () => {
  const address = {
    seed: "s1",
    domain: "MATCH_DELIVERY",
    entityId: "m1",
    eventOrdinal: 7,
    stageName: "legality",
    drawIndex: 0,
  };
  expect(randomAddressBytes(address)).toBe(
    '["s1","MATCH_DELIVERY","m1",7,"legality",0]',
  );
  expect(randomAddressBytes({ ...address, eventOrdinal: 8 })).not.toBe(
    randomAddressBytes(address),
  );
});
it("stable identity is deterministic and unambiguous across namespaces", () => {
  expect(stableId("pack", "p1")).toBe("4:pack:p1");
  expect(stableId("a", "b:c")).not.toBe(stableId("a:b", "c"));
  expect(IDSchema.safeParse("constructor").success).toBe(false);
  expect(() => stableId("pack", "")).toThrow();
});

it("does not invoke array accessors", () => {
  let called = false;
  const values = [1];
  Object.defineProperty(values, "0", {
    get() {
      called = true;
      return 1;
    },
    enumerable: true,
  });
  expect(() => canonicalJson(values)).toThrow();
  expect(called).toBe(false);
});
