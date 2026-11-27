/** Freeze verification across additive Pass 07B. No dependence on original ZIP at runtime.
 * Checks the current inventory (refreshed 25 and 27 November 2026, regenerate with scripts/generate-t20-inventory.mjs).
 * The Pass 07A inventory is kept unchanged as the historical record; every Pass 07A hash except the
 * entries listed in SUPERSEDED_07A must still appear unchanged in the current inventory, so a refresh
 * cannot quietly loosen the 07A freeze. See docs/verification-pass07a/INVENTORY_REFRESH_2026-11-25.md and
 * INVENTORY_REFRESH_2026-11-27.md. */
import {readFileSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
const historicalPath="tests/fixtures/t20/pass07a-inventory.json";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
if(hash(readFileSync(historicalPath))!=="9fe7817690cb2c7ccc3cb87fe5117961b67d28f5485bba1df524fa28e2663d57")
  throw new Error("HISTORICAL_07A_INVENTORY_CHANGED");
const historical=JSON.parse(readFileSync(historicalPath,"utf8"));
const inventory=JSON.parse(readFileSync("tests/fixtures/t20/current-inventory.json","utf8"));
// Pass 07A entries whose bytes have changed since: the lockfile (dependency updates) and five in-memory
// request schemas widened by Stage C (pull request #143, merged as 899f911) to accept calibrated-t20-01, and again by
// C6 (pull request #174, merged as 976ee76) to accept calibrated-t20-02.
const SUPERSEDED_07A=new Set(["package-lock.json",...["GenerateDeliveryRequestSchema","NormaliseCategoriesRequestSchema",
  "ProbabilityContextSchema","ProbabilityRequestSchema","SampleCategoryRequestSchema"]
  .map(name=>`packages/contracts/schemas/${name}.json`)]);
let retained=0;
for(const [path,expected] of Object.entries(historical.artifactHashes)){
  if(SUPERSEDED_07A.has(path))continue;
  if(inventory.artifactHashes[path]!==expected)throw new Error(`FROZEN_07A_NOT_RETAINED ${path}`);
  retained++;
}
let frozen=0;
for(const [path,expected] of Object.entries(inventory.artifactHashes)){
  if(hash(readFileSync(path))!==expected)throw new Error(`FROZEN_INVENTORY_DRIFT ${path}`);
  frozen++;
}
const current=readdirSync("packages/contracts/schemas").filter(name=>name.endsWith(".json"));
const inherited=Object.keys(inventory.artifactHashes).filter(path=>path.startsWith("packages/contracts/schemas/"));
if(inherited.length!==inventory.inheritedSchemaCount||current.length!==inherited.length)
  throw new Error(`ADDITIVE_SCHEMA_COUNT inherited=${inherited.length} current=${current.length}`);
const world=JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json","utf8"));
if(world.players.length!==160||world.teams.length!==8||world.grounds.length!==8)throw new Error("WORLD_CANON_DRIFT");
const seed=JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json","utf8"));
if(seed.recordCount!==100||seed.cases.length!==100)throw new Error("BAD_100_SEED_CORPUS");
console.log(JSON.stringify({status:"PASS",inventory:inventory.id,inventoryCommit:inventory.historicalCommit,
  inheritedArtifactsByteIdentical:frozen,pass07aArtifactsRetained:retained,inheritedSchemasByteIdentical:inherited.length,
  allCurrentStrictSchemas:current.length,originalSourceArchiveHash:inventory.sourceArchiveSha256,
  world:{players:160,teams:8,grounds:8},seedCorpusHash:hash(readFileSync("tests/fixtures/t20/seed_corpus.json"))}));
