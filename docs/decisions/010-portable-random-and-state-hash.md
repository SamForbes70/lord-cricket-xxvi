# ADR 010: Portable deterministic draws and state hashes

Accepted for Pass 04. Implements design section 6 using the existing SHA256_COUNTER_V1 and LC_CANONICAL_JSON_V1_SHA256 identifiers.

## Algorithm and dependency

The simulation package pins @noble/hashes 1.8.0. Only its synchronous SHA-256 and byte/UTF-8 helpers are imported. The workspace lock pins the package integrity; no Node-only crypto API is used in production. The dependency boundary permits only these two subpaths in simulation. Node crypto and Python hashlib are independent verification tools, never production fallbacks. This is not a claim of FIPS certification or a dependency security audit.

Random input is the existing strict RandomAddress contract. JSON.stringify serialises a fixed six-position array: seed, domain, entityId, eventOrdinal, stageName, drawIndex. UTF-8 encoding follows JSON escaping. SHA-256 hashes those bytes. DataView reads the first four digest bytes as unsigned big-endian. Unit conversion divides by exactly 4294967296, making 0 inclusive and 1 exclusive. The base vector deliberately has its high bit set, exposing signed-int mistakes.

Unicode is not normalised. Composed/decomposed seeds differ. Lone surrogates become JSON escape sequences before UTF-8 encoding. Names, object property insertion order and locale do not enter address construction.

## Ownership and separation

The service is stateless and immutable. Repeating an address repeats its result; unrelated requests do not advance a cursor. Supported domains remain MATCH_DELIVERY, TOSS, WEATHER, AI_TIE_BREAK, CAREER_TRAINING, WORLD_GENERATION and PREDICTION. There is no commentary domain. Domain or stage separation means distinct encoded inputs, not a mathematical guarantee of collision-free 32-bit outputs.

Callers own draw allocation. For deliveries eventOrdinal MUST be the global delivery attempt index, including wides, no-balls and dead attempts. It is not the legal-ball count or the envelope sequence including administrative events. Stages include legality, contact, sector, fielding, running and dismissal. Allocate different drawIndex values to different variables in a stage. Repeated addresses are deliberately accepted to support replayable queries; this service cannot infer accidental variable reuse or an incorrect caller-supplied ordinal.

Both factory functions reject an explicitly unsupported version. Requests carry literal algorithm versions and reject unknown fields. No fallback algorithm, ambient seed, timer, random call or mutable draw counter exists. UI rendering does not call the service. A small worker adapter is exercised through a separate test harness; it is not yet the full state-owning match worker.

## Canonical state boundary

State hashes are lowercase SHA-256 hex over UTF-8 LC_CANONICAL_JSON_V1 bytes. There is no added prefix or hidden field projection. Callers must supply exactly the authoritative state they intend to hash and validate its domain contract separately. The hash does not prove cricket legality or authenticate its author.

Canonical encoding sorts keys in JavaScript UTF-16 order, preserves array order and serialises finite numbers using JavaScript JSON number encoding (including negative zero as zero). It rejects undefined, non-finite numbers, bigint, functions, symbols, class instances, cycles, sparse/decorated arrays and accessors. Pass 04 also rejects non-enumerable own properties instead of silently dropping hidden data. Valid JSON wire values retain their original V1 bytes; no new valid-data encoding is introduced. Object descriptors/prototypes are inspected without invoking ordinary getters; hostile JavaScript Proxy traps are outside this parsed-JSON boundary.

Input mutation does not occur. Shared references without cycles are encoded by value. Byte-encoding functions allocate independent buffers. This is a project codec, not an RFC 8785 implementation. Resource limits for untrusted archives, full replay coordination, event hash-chain validation and transactional save integrity are deferred.

## Evidence

Three NIST NSRL SHA-256 constants test abc, the standard multi-block message and one million a characters. Frozen independent fixtures cover 24 addresses and eight manually specified canonical-state strings; Python hashlib generated their expected digests and checks them without importing production TypeScript. Node crypto separately verifies address digests and padding-boundary byte messages. Browser and worker tests compare against the same fixed bytes and outputs, including recovery from an invalid worker request.

References: [NIST NSRL test data](https://www.nist.gov/itl/ai/ai-standards-and-guidelines-group/nsrl-test-data), [noble-hashes source](https://github.com/paulmillr/noble-hashes), installed package 1.8.0 declarations/source and lockfile. Actual tested runtime results are in PASS_04_REPORT.md; no wider browser matrix is implied.
