# Deterministic service vectors

vectors.json is a frozen oracle, not production-generated output. Its 24 addresses use Python stdlib positional JSON encoding and hashlib SHA-256; lone UTF-16 surrogates are explicitly escaped. Its eight canonical-state strings were specified manually, then hashed by Python. The Python check independently recomputes bytes, digests, unsigned integers and unit conversions, but never rewrites the file. Node tests use production code against these values and also compare SHA-256 with Node crypto.

Canonical state examples include UTF-16 ordering of supplementary characters, numeric object keys, negative zero, number exponents, escaping, array order and nested state. This is an LC codec corpus, not an RFC 8785 certification suite.

The three NIST SHA-256 vectors in random-service.test.ts are literal published constants from https://www.nist.gov/itl/ai/ai-standards-and-guidelines-group/nsrl-test-data. They cover abc, the standard multi-block message and one million a characters.

The two request files exercise the compiled batch CLI. The separate tests/runtime harness bundles the same production service and worker adapter for browser checks; it is not shipped as the game UI and does not simulate matches.
