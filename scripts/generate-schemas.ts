import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { z } from "zod";
import * as coreContracts from "../packages/contracts/src/index.js";
import * as m7jResearchContracts from "../packages/contracts/src/m7j-adjudication.js";
const contracts = {...coreContracts, ...m7jResearchContracts};
const dir = "packages/contracts/schemas";
await mkdir(dir, { recursive: true });
const names: string[] = [];
for (const [name, value] of Object.entries(contracts).sort(([a], [b]) =>
  a < b ? -1 : a > b ? 1 : 0,
)) {
  if (!name.endsWith("Schema") || !(value instanceof z.ZodType)) continue;
  const schema = {
    ...z.toJSONSchema(value, {
      target: "draft-2020-12",
      unrepresentable: "throw",
      override: ({ zodSchema, jsonSchema }) => {
        if (zodSchema instanceof z.ZodTuple && !zodSchema.def.rest) {
          jsonSchema.minItems = zodSchema.def.items.length;
          jsonSchema.maxItems = zodSchema.def.items.length;
          jsonSchema.items = false;
        }
      },
    }),
    $id: `urn:lcxxvi:${name.replace(/Schema$/, "")}:1`,
    title: name.replace(/Schema$/, ""),
  };
  const text = JSON.stringify(schema, null, 2) + "\n";
  const path = `${dir}/${name}.json`;
  names.push(`${name}.json`);
  if (process.argv.includes("--check")) {
    if ((await readFile(path, "utf8")) !== text)
      throw new Error(`Stale schema: ${path}`);
  } else await writeFile(path, text);
}
if (process.argv.includes("--check")) {
  const actual = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  if (JSON.stringify(actual) !== JSON.stringify(names.sort()))
    throw new Error("Schema file set drift");
}
console.log(
  `${names.length} JSON Schemas ${process.argv.includes("--check") ? "verified" : "generated"}`,
);
