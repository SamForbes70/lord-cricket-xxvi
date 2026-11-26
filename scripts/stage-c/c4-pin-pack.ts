/**
 * Stage C C4: print the SHA-256 of CALIBRATED_T20_DELIVERY_PACK and the calibrated model hash (LC canonical JSON of
 * { deliveryPackSha256, skillPackSha256 }), and with --write pin both in packages/data/src/calibrated-t20-delivery-pack.ts.
 * Research only; synthetic-alpha-01's packs are never touched.
 *
 *   node --import tsx scripts/stage-c/c4-pin-pack.ts [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CALIBRATED_T20_PACK } from "../../packages/data/src/calibrated-t20-pack.js";
import { CALIBRATED_T20_DELIVERY_PACK } from "../../packages/data/src/calibrated-t20-delivery-pack.js";
import { canonicalStateBytes, sha256Hex } from "../../packages/simulation/src/determinism.js";

const deliveryPackSha256 = sha256Hex(canonicalStateBytes(CALIBRATED_T20_DELIVERY_PACK));
const skillPackSha256 = sha256Hex(canonicalStateBytes(CALIBRATED_T20_PACK));
const modelHash = sha256Hex(canonicalStateBytes({ deliveryPackSha256, skillPackSha256 }));
if (process.argv.includes("--write")) {
  const path = "packages/data/src/calibrated-t20-delivery-pack.ts";
  const text = readFileSync(path, "utf8")
    .replace(/CALIBRATED_T20_DELIVERY_PACK_SHA256 = "[0-9a-f]{64}"/, `CALIBRATED_T20_DELIVERY_PACK_SHA256 = "${deliveryPackSha256}"`)
    .replace(/CALIBRATED_T20_MODEL_HASH = "[0-9a-f]{64}"/, `CALIBRATED_T20_MODEL_HASH = "${modelHash}"`);
  writeFileSync(path, text);
}
console.log(JSON.stringify({ deliveryPackSha256, skillPackSha256, modelHash }));
