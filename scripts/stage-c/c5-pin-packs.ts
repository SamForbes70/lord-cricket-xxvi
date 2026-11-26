/**
 * Stage C C5: pin every calibrated-t20-01 component hash in one pass, in dependency order.
 *  1. the skill pack (CALIBRATED_T20_PACK_SHA256);
 *  2. the delivery pack's manifest.base.skillPackSha256, then its own hash (CALIBRATED_T20_DELIVERY_PACK_SHA256);
 *  3. the model hash (CALIBRATED_T20_MODEL_HASH): SHA-256 of LC canonical JSON of the component hashes.
 * Research only; synthetic-alpha-01's packs are never touched. Without --write it only prints.
 *
 *   node --import tsx scripts/stage-c/c5-pin-packs.ts [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalStateBytes, sha256Hex } from "../../packages/simulation/src/determinism.js";

const SKILL = "packages/data/src/calibrated-t20-pack.ts";
const DELIVERY = "packages/data/src/calibrated-t20-delivery-pack.ts";
const write = process.argv.includes("--write");
const hashOf = async (path: string, name: string) => {
  const mod = await import(`../../${path.replace(/\.ts$/, ".js")}?t=${Date.now()}`) as Record<string, unknown>;
  return sha256Hex(canonicalStateBytes(mod[name]));
};
const replaceIn = (path: string, pattern: RegExp, value: string) => {
  const before = readFileSync(path, "utf8");
  const after = before.replace(pattern, value);
  if (!pattern.test(before)) throw new Error(`pattern not found in ${path}: ${pattern}`);
  if (write) writeFileSync(path, after);
};

const skillPackSha256 = await hashOf(SKILL, "CALIBRATED_T20_PACK");
replaceIn(SKILL, /CALIBRATED_T20_PACK_SHA256 = "[0-9a-f]{64}"/, `CALIBRATED_T20_PACK_SHA256 = "${skillPackSha256}"`);
replaceIn(DELIVERY, /skillPackSha256: "[0-9a-f]{64}"/, `skillPackSha256: "${skillPackSha256}"`);
const deliveryPackSha256 = await hashOf(DELIVERY, "CALIBRATED_T20_DELIVERY_PACK");
replaceIn(DELIVERY, /CALIBRATED_T20_DELIVERY_PACK_SHA256 = "[0-9a-f]{64}"/, `CALIBRATED_T20_DELIVERY_PACK_SHA256 = "${deliveryPackSha256}"`);
const components = { deliveryPackSha256, skillPackSha256 };
const modelHash = sha256Hex(canonicalStateBytes(components));
replaceIn(DELIVERY, /CALIBRATED_T20_MODEL_HASH = "[0-9a-f]{64}"/, `CALIBRATED_T20_MODEL_HASH = "${modelHash}"`);
console.log(JSON.stringify({ ...components, modelHash, written: write }));
