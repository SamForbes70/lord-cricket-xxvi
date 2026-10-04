# ADR 003: Explicit protocol and deterministic boundaries

Accepted for Pass 01. Administrative event payloads were named but not fully specified in Appendix A. protocol.ts supplies discriminated, strict shapes for every named event and section 19 command, plus SET_BOWLING_PLAN and SET_DELEGATION. Events contain changed substructures and IDs. They cannot carry arbitrary JSON. Actor wire IDs are USER:<team>, AI:<team> or SYSTEM. Validation of actor ownership is deferred.

Indexes for innings, delivery attempts and completed overs are zero-based. Event sequence starts at one and is scoped to gameId to match section 20 storage keys. matchId remains on each envelope. A game-wide sequence allocation service is deferred. Receipts allow null eventRange for no-event acknowledgements; revision/range reconciliation belongs to the future transaction coordinator.

MatchResult is a strict union: unused margins are null. TIE/DRAW/NO_RESULT also have null marginType. INNINGS uses positive marginRuns. Matching the result to actual innings is a future mandatory domain validator.

Stable IDs are derived only from explicit immutable namespace/source keys with a length-prefixed namespace; they do not consume randomness or inspect mutable display properties. LC_CANONICAL_JSON_V1 sorts object keys by JavaScript UTF-16 order, preserves array order, normalises negative zero, rejects non-finite/non-JSON/cyclic input and does not invoke object accessors. It is a project codec, not a claim of RFC 8785 compatibility.

SHA256_COUNTER_V1 remains an interface. Its address encoder emits the exact positional JSON tuple from section 6. No hash service, random draw, integer softmax or sampler is implemented. Exact versions AND hashes must match the caller-supplied allow-list. Production support lists remain empty until implementations/packs are approved; test versions are fixtures only.
