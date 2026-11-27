/**
 * Stage C C6: pin every calibrated-t20-02 component hash in one pass, in dependency order (as c5-pin-packs.ts does for
 * calibrated-t20-01, which this script never touches).
 *  1. the skill pack (CALIBRATED_T20_02_PACK_SHA256);
 *  2. the delivery pack's manifest.base.skillPackSha256, then its own hash (CALIBRATED_T20_02_DELIVERY_PACK_SHA256);
 *  3. the tactics pack: calibrated-t20-01's LC_CALIBRATED_T20_TACTICS_V1, shared unchanged (its hash is only read);
 *  4. the model hash (CALIBRATED_T20_02_MODEL_HASH): SHA-256 of LC canonical JSON of the component hashes.
 * Research only. Without --write it only prints.
 *
 *   node --import tsx scripts/stage-c/c6-pin-packs.ts [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalStateBytes, sha256Hex } from "../../packages/simulation/src/determinism.js";

const SKILL = "packages/data/src/calibrated-t20-02-pack.ts";
const DELIVERY = "packages/data/src/calibrated-t20-02-delivery-pack.ts";
const TACTICS = "packages/data/src/calibrated-t20-tactics-pack.ts";
const write = process.argv.includes("--write");
const hashOf = async (path: string, name: string) => {
  const mod = await import(`../../${path.replace(/\.ts$/, ".js")}?t=${Date.now()}`) as Record<string, unknown>;
  return sha256Hex(canonicalStateBytes(mod[name]));
};
const replaceIn = (path: string, pattern: RegExp, value: string) => {
  const before = readFileSync(path, "utf8");
  if (!pattern.test(before)) throw new Error(`pattern not found in ${path}: ${pattern}`);
  if (write) writeFileSync(path, before.replace(pattern, value));
};

const skillPackSha256 = await hashOf(SKILL, "CALIBRATED_T20_02_PACK");
replaceIn(SKILL, /CALIBRATED_T20_02_PACK_SHA256 = "[0-9a-f]{64}"/, `CALIBRATED_T20_02_PACK_SHA256 = "${skillPackSha256}"`);
replaceIn(DELIVERY, /skillPackSha256: "[0-9a-f]{64}"/, `skillPackSha256: "${skillPackSha256}"`);
const deliveryPackSha256 = await hashOf(DELIVERY, "CALIBRATED_T20_02_DELIVERY_PACK");
replaceIn(DELIVERY, /CALIBRATED_T20_02_DELIVERY_PACK_SHA256 = "[0-9a-f]{64}"/, `CALIBRATED_T20_02_DELIVERY_PACK_SHA256 = "${deliveryPackSha256}"`);
const tacticsPackSha256 = await hashOf(TACTICS, "CALIBRATED_T20_TACTICS_PACK");
const pinnedTactics = /CALIBRATED_T20_TACTICS_PACK_SHA256 = "([0-9a-f]{64})"/.exec(readFileSync(TACTICS, "utf8"))?.[1];
if (pinnedTactics !== tacticsPackSha256) throw new Error("the shared tactics pack does not match its pinned hash");
const components = { deliveryPackSha256, skillPackSha256, tacticsPackSha256 };
const modelHash = sha256Hex(canonicalStateBytes(components));
replaceIn(DELIVERY, /CALIBRATED_T20_02_MODEL_HASH = "[0-9a-f]{64}"/, `CALIBRATED_T20_02_MODEL_HASH = "${modelHash}"`);
console.log(JSON.stringify({ ...components, modelHash, written: write }));
