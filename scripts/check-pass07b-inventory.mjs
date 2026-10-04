/** Freeze verification across additive Pass 07B. No dependence on original ZIP at runtime. */
import {readFileSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
const inventory=JSON.parse(readFileSync("tests/fixtures/t20/pass07a-inventory.json","utf8"));
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
let frozen=0;
for(const [path,expected] of Object.entries(inventory.artifactHashes)){
  if(hash(readFileSync(path))!==expected)throw new Error(`FROZEN_07A_DRIFT ${path}`);
  frozen++;
}
const current=readdirSync("packages/contracts/schemas").filter(name=>name.endsWith(".json"));
const inherited=Object.keys(inventory.artifactHashes).filter(path=>path.startsWith("packages/contracts/schemas/"));
if(inherited.length!==91||current.length!==98)throw new Error(`ADDITIVE_SCHEMA_COUNT inherited=${inherited.length} current=${current.length}`);
const world=JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json","utf8"));
if(world.players.length!==160||world.teams.length!==8||world.grounds.length!==8)throw new Error("WORLD_CANON_DRIFT");
const seed=JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json","utf8"));
if(seed.recordCount!==100||seed.cases.length!==100)throw new Error("BAD_100_SEED_CORPUS");
console.log(JSON.stringify({status:"PASS",inheritedArtifactsByteIdentical:frozen,inheritedSchemasByteIdentical:91,
  allCurrentStrictSchemas:98,originalSourceArchiveHash:inventory.sourceArchiveSha256,
  world:{players:160,teams:8,grounds:8},seedCorpusHash:hash(readFileSync("tests/fixtures/t20/seed_corpus.json"))}));
