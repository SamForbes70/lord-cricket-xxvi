/**
 * Regenerate the current T20 frozen-artefact inventory checked by `npm run t20:inventory`.
 * Scope is the Pass 07A inventory's non-schema paths plus every generated schema on disk.
 * The Pass 07A inventory itself is a historical record and is never rewritten.
 * Usage: node scripts/generate-t20-inventory.mjs <id> [commit]   (commit defaults to HEAD)
 */
import {readFileSync,readdirSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
const historicalPath="tests/fixtures/t20/pass07a-inventory.json",currentPath="tests/fixtures/t20/current-inventory.json";
const id=process.argv[2];if(!id)throw new Error("USAGE: node scripts/generate-t20-inventory.mjs <id> [commit]");
const commit=execFileSync("git",["rev-parse",process.argv[3]??"HEAD"],{encoding:"utf8"}).trim();
const historical=JSON.parse(readFileSync(historicalPath,"utf8"));
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const schemas=readdirSync("packages/contracts/schemas").filter(name=>name.endsWith(".json"))
  .map(name=>`packages/contracts/schemas/${name}`);
const others=Object.keys(historical.artifactHashes).filter(path=>!path.startsWith("packages/contracts/schemas/"));
const paths=[...new Set([...others,...schemas])].sort();
const artifactHashes=Object.fromEntries(paths.map(path=>[path,hash(readFileSync(path))]));
const inventory={id,sourceArchiveSha256:historical.sourceArchiveSha256,historicalCommit:commit,
  inheritedSchemaCount:schemas.length,artifactHashes};
writeFileSync(currentPath,JSON.stringify(inventory,null,2)+"\n");
console.log(JSON.stringify({written:currentPath,id,historicalCommit:commit,artifacts:paths.length,schemas:schemas.length}));
