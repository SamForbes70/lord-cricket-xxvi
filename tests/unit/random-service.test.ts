import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { it, expect } from "vitest";
import {
  canonicalJson,
  RandomAddressSchema,
  RANDOM_VERSION,
  STATE_HASH_VERSION,
} from "@lcxxvi/contracts";
import {
  createRandomService,
  createStateHasher,
  encodeRandomAddress,
  canonicalStateBytes,
  uint32ToUnit,
  sha256Hex,
  executeDeterminismRequest,
} from "@lcxxvi/simulation";
import vectors from "../fixtures/determinism/vectors.json" with { type: "json" };

const rng = createRandomService();
const hasher = createStateHasher();
const base = RandomAddressSchema.parse(vectors.addresses[0]!.address);
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
for (const v of vectors.addresses) {
  it(`matches independent address bytes, hash, uint32 and unit: ${v.id}`, () => {
    const address = RandomAddressSchema.parse(v.address);
    const before = JSON.stringify(address);
    Object.freeze(address);
    expect(hex(encodeRandomAddress(address))).toBe(v.utf8Hex);
    expect(new TextDecoder().decode(encodeRandomAddress(address))).toBe(
      v.encoded,
    );
    expect(sha256Hex(encodeRandomAddress(address))).toBe(v.sha256);
    expect(rng.uint32(address)).toBe(v.uint32);
    expect(uint32ToUnit(rng.uint32(address))).toBe(v.unit);
    expect(JSON.stringify(address)).toBe(before);
    expect(createHash("sha256").update(v.encoded, "utf8").digest("hex")).toBe(
      v.sha256,
    );
  });
}
for (const v of vectors.states) {
  it(`matches independent canonical state bytes/hash: ${v.id}`, () => {
    const before = JSON.stringify(v.value);
    expect(canonicalJson(v.value)).toBe(v.encoded);
    expect(hex(canonicalStateBytes(v.value))).toBe(v.utf8Hex);
    expect(hasher.hash(v.value)).toBe(v.sha256);
    expect(JSON.stringify(v.value)).toBe(before);
  });
}
// NIST NSRL published vectors. Expected values are literal constants, not generated.
for (const [name, message, expected] of [
  [
    "abc",
    "abc",
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  ],
  [
    "multi-block",
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
  [
    "million a",
    "a".repeat(1000000),
    "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
  ],
]) {
  it(`matches NIST SHA-256 ${name}`, () =>
    expect(sha256Hex(new TextEncoder().encode(message!))).toBe(expected));
}
it("hashes empty and padding-boundary byte messages without altering inputs", () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 127, 128, 129, 1024]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256);
    const before = bytes.slice();
    expect(sha256Hex(bytes)).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(bytes).toEqual(before);
  }
});
it("maps both uint32 endpoints to the exact half-open unit interval", () => {
  expect(uint32ToUnit(0)).toBe(0);
  expect(uint32ToUnit(0xffffffff)).toBe(0.9999999997671694);
  for (const bad of [-1, 4294967296, 1.1, Infinity, NaN, "1", null])
    expect(() => uint32ToUnit(bad as number)).toThrow("INVALID_UINT32");
});
it("is independent of call order, prediction draws, weather and repeat count", () => {
  const expected = rng.uint32(base);
  for (const v of [...vectors.addresses].reverse()) {
    rng.uint32(RandomAddressSchema.parse(v.address));
    expect(rng.uint32(base)).toBe(expected);
    expect(createRandomService().uint32(base)).toBe(expected);
  }
  expect(Object.isFrozen(rng)).toBe(true);
  expect(Object.isFrozen(hasher)).toBe(true);
});
it("addresses each delivered attempt separately even when legal-ball count stays unchanged", () => {
  const addresses = [7, 8, 9].map((eventOrdinal) => ({
    ...base,
    eventOrdinal,
  }));
  expect(new Set(addresses.map((a) => hex(encodeRandomAddress(a)))).size).toBe(
    3,
  );
  expect(new Set(addresses.map((a) => rng.uint32(a))).size).toBe(3);
  // No legal-ball count exists in the address contract; caller passes global attempt ordinal.
  expect(() => encodeRandomAddress({ ...base, legalBalls: 6 })).toThrow();
});
it("fails closed for unsupported versions and malformed address values", () => {
  for (const version of [
    "SHA256_COUNTER_V2",
    "",
    null,
    1,
    {},
    "LC_CANONICAL_JSON_V2_SHA256",
  ]) {
    expect(() => createRandomService(version)).toThrow(
      "UNSUPPORTED_RANDOM_VERSION",
    );
    expect(() => createStateHasher(version)).toThrow(
      "UNSUPPORTED_STATE_HASH_VERSION",
    );
  }
  for (const patch of [
    { domain: "COMMENTARY" },
    { seed: "" },
    { seed: "a".repeat(257) },
    { entityId: "" },
    { stageName: "" },
    { eventOrdinal: -1 },
    { eventOrdinal: 1.5 },
    { eventOrdinal: Number.MAX_SAFE_INTEGER + 1 },
    { drawIndex: "0" },
    { drawIndex: NaN },
    { drawIndex: Infinity },
    { extra: 1 },
  ])
    expect(() => encodeRandomAddress({ ...base, ...patch })).toThrow();
});
it("rejects non-JSON, hidden data and getters without evaluating getters", () => {
  let calls = 0;
  const getter = Object.defineProperty({}, "seed", {
    enumerable: true,
    get() {
      calls++;
      return "s";
    },
  });
  const hidden = Object.defineProperty({}, "hidden", { value: 1 });
  const decorated = Object.defineProperty([1], "hidden", { value: 1 });
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  for (const value of [
    getter,
    hidden,
    decorated,
    undefined,
    1n,
    NaN,
    Infinity,
    new Date(),
    new Map(),
    new Set(),
    new Array(1),
    { a: undefined },
    { [Symbol("a")]: 1 },
    cycle,
  ])
    expect(() => hasher.hash(value)).toThrow();
  expect(() => encodeRandomAddress(getter)).toThrow();
  expect(calls).toBe(0);
});
it("canonicalises insertion order, retains array order, and returns independent byte buffers", () => {
  expect(hasher.hash({ a: 1, b: 2 })).toBe(hasher.hash({ b: 2, a: 1 }));
  expect(hasher.hash([1, 2])).not.toBe(hasher.hash([2, 1]));
  const a = canonicalStateBytes({ a: 1 });
  a.fill(0);
  expect(new TextDecoder().decode(canonicalStateBytes({ a: 1 }))).toBe(
    '{"a":1}',
  );
  const shared = { x: 1 };
  expect(() => hasher.hash([shared, shared])).not.toThrow();
  expect(hasher.hash(Object.assign(Object.create(null), { a: 1 }))).toBe(
    hasher.hash({ a: 1 }),
  );
});
it("checks strict request boundaries and uses pinned versions", () => {
  const request = { kind: "RANDOM", version: RANDOM_VERSION, address: base };
  expect(executeDeterminismRequest(request)).toEqual({
    kind: "RANDOM",
    version: RANDOM_VERSION,
    uint32: rng.uint32(base),
    unit: uint32ToUnit(rng.uint32(base)),
  });
  expect(
    executeDeterminismRequest({
      kind: "HASH_STATE",
      version: STATE_HASH_VERSION,
      value: null,
    }),
  ).toEqual({
    kind: "HASH_STATE",
    version: STATE_HASH_VERSION,
    hash: hasher.hash(null),
  });
  for (const bad of [
    { ...request, version: "unknown" },
    { ...request, extra: 1 },
    { kind: "HASH_STATE", version: STATE_HASH_VERSION },
    { kind: "OTHER" },
  ])
    expect(() => executeDeterminismRequest(bad)).toThrow();
});
it("pins the production SHA implementation", () => {
  const pkg = JSON.parse(
    readFileSync("packages/simulation/package.json", "utf8"),
  );
  expect(pkg.dependencies["@noble/hashes"]).toBe("1.8.0");
});
