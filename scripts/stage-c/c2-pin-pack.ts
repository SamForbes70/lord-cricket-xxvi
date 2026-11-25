/**
 * Stage C C2: print the SHA-256 of CALIBRATED_T20_PACK (LC canonical JSON), and with --write pin it in
 * packages/data/src/calibrated-t20-pack.ts. Research only; synthetic-alpha-01's packs are never touched.
 *
 *   node --import tsx scripts/stage-c/c2-pin-pack.ts [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CALIBRATED_T20_PACK } from "../../packages/data/src/calibrated-t20-pack.js";
import { canonicalStateBytes, sha256Hex } from "../../packages/simulation/src/determinism.js";

const hash = sha256Hex(canonicalStateBytes(CALIBRATED_T20_PACK));
if (process.argv.includes("--write")) {
  const path = "packages/data/src/calibrated-t20-pack.ts";
  const text = readFileSync(path, "utf8").replace(/CALIBRATED_T20_PACK_SHA256 = "[0-9a-f]{64}"/, `CALIBRATED_T20_PACK_SHA256 = "${hash}"`);
  writeFileSync(path, text);
}
console.log(hash);
