/** Production-compiled world/schema validation; independent Python oracle runs separately. */
import { readFileSync, readdirSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { validateT20MatchSetup, verifyFrozenWorldBytes, createRandomService } from "../packages/simulation/dist/index.js";
import { DefaultWorldManifestSchema, T20MatchSetupRequestSchema } from "../packages/contracts/dist/index.js";
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const raw = readFileSync("packages/data/worlds/fictional-eight-01.json");
const input = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const vectors = JSON.parse(readFileSync("packages/data/worlds/world-generation-vectors.json", "utf8"));
const {world} = verifyFrozenWorldBytes(raw,manifest);
DefaultWorldManifestSchema.parse(manifest);
T20MatchSetupRequestSchema.parse(input);
const snapshot = validateT20MatchSetup(input,raw,manifest);
if (!Object.isFrozen(snapshot) || !Object.isFrozen(snapshot.teams[0].xi[0].skills.T20))
  throw new Error("T20 match snapshots must be transitively immutable");
if (world.players.length !== 160 || world.teams.length !== 8 || world.grounds.length !== 8 || snapshot.teams.some(t=>t.xi.length!==11))
  throw new Error("M0 default world / T20 XI census mismatch");
const random = createRandomService();
for(const v of vectors.vectors) if(random.uint32(v.address)!==v.expectedUint32)
  throw new Error("WORLD_GENERATION reference vector mismatch");
const ajv = new Ajv2020.default({strict:true,allErrors:true});
addFormats.default(ajv);
const schemaFiles = readdirSync("packages/contracts/schemas").filter(n=>n.endsWith(".json")).sort();
for (const file of schemaFiles) {
  const schema = JSON.parse(readFileSync(`packages/contracts/schemas/${file}`,"utf8"));
  ajv.compile(schema);
}
if (schemaFiles.length < 91) throw new Error(`Missing inherited schemas: expected at least 91, got ${schemaFiles.length}`);
for (const [name,instance] of [["WorldPack",world],["DefaultWorldManifest",manifest],["T20MatchSetupRequest",input]]) {
  const validate=ajv.getSchema(`urn:lcxxvi:${name}:1`);
  if (!validate || !validate(instance)) throw new Error(`strict AJV rejected ${name}: ${JSON.stringify(validate?.errors)}`);
}
console.log(JSON.stringify({status:"PASS",world:{players:world.players.length,teams:world.teams.length,grounds:world.grounds.length},xi:snapshot.teams.map(t=>t.xi.length),addressVectors:vectors.vectors.length,strictAjvCompiledSchemas:schemaFiles.length,modelStatus:snapshot.modelStatus,worldHash:snapshot.versions.worldHash}));
