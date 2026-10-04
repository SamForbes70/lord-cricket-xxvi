import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import {
  canonicalJson,
  randomAddressBytes,
  RANDOM_VERSION,
  STATE_HASH_VERSION,
  DeterminismRequestSchema,
  type RandomService,
  type StateHasher,
  type RandomAddress,
} from "@lcxxvi/contracts";

/** Synchronous portable SHA-256, pinned by package-lock.json. */
export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/** JSON escaping happens before UTF-8 encoding, including lone surrogates. */
export function canonicalStateBytes(value: unknown): Uint8Array {
  return utf8ToBytes(canonicalJson(value));
}

export function encodeRandomAddress(address: unknown): Uint8Array {
  // Reject accessors/non-JSON objects before schema parsing can read them.
  canonicalJson(address);
  return utf8ToBytes(randomAddressBytes(address));
}

export function uint32ToUnit(integer: number): number {
  if (!Number.isInteger(integer) || integer < 0 || integer > 0xffffffff)
    throw new Error("INVALID_UINT32: expected an integer in 0..4294967295");
  return integer / 4294967296;
}

export function createRandomService(
  version: unknown = RANDOM_VERSION,
): RandomService {
  if (version !== RANDOM_VERSION)
    throw new Error("UNSUPPORTED_RANDOM_VERSION: " + String(version));
  return Object.freeze({
    version: RANDOM_VERSION,
    uint32(address: Readonly<RandomAddress>) {
      const digest = sha256(encodeRandomAddress(address));
      return new DataView(
        digest.buffer,
        digest.byteOffset,
        digest.byteLength,
      ).getUint32(0, false);
    },
  });
}

export function createStateHasher(
  version: unknown = STATE_HASH_VERSION,
): StateHasher {
  if (version !== STATE_HASH_VERSION)
    throw new Error("UNSUPPORTED_STATE_HASH_VERSION: " + String(version));
  return Object.freeze({
    version: STATE_HASH_VERSION,
    hash(value: unknown) {
      return sha256Hex(canonicalStateBytes(value));
    },
  });
}

/** Shared strict request boundary for batch and worker adapters. No global cursor. */
export function executeDeterminismRequest(input: unknown) {
  canonicalJson(input);
  const request = DeterminismRequestSchema.parse(input);
  if (request.kind === "RANDOM") {
    const integer = createRandomService(request.version).uint32(
      request.address,
    );
    return {
      kind: request.kind,
      version: request.version,
      uint32: integer,
      unit: uint32ToUnit(integer),
    };
  }
  return {
    kind: request.kind,
    version: request.version,
    hash: createStateHasher(request.version).hash(request.value),
  };
}
