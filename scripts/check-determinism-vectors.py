"""Independent stdlib check. Does not import or regenerate production results."""
import hashlib
import json
from pathlib import Path

vectors = json.loads(Path("tests/fixtures/determinism/vectors.json").read_text())
for group in ("addresses", "states"):
    for vector in vectors[group]:
        encoded = vector["encoded"].encode("utf8")
        assert encoded.hex() == vector["utf8Hex"], vector["id"]
        assert hashlib.sha256(encoded).hexdigest() == vector["sha256"], vector["id"]
        if group == "addresses":
            a = vector["address"]
            text = json.dumps([a[k] for k in ("seed", "domain", "entityId", "eventOrdinal", "stageName", "drawIndex")], ensure_ascii=False, separators=(",", ":"))
            text = "".join("\\u%04x" % ord(c) if 0xD800 <= ord(c) <= 0xDFFF else c for c in text)
            assert text == vector["encoded"], vector["id"]
            integer = int.from_bytes(hashlib.sha256(encoded).digest()[:4], "big")
            assert integer == vector["uint32"], vector["id"]
            assert integer / 4294967296 == vector["unit"], vector["id"]
print(f"PASS: {len(vectors['addresses'])} random-address and {len(vectors['states'])} state-hash vectors independently verified")
