import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
const names = [
  "contracts",
  "domain",
  "simulation",
  "ai",
  "projections",
  "persistence",
  "data",
];
async function scan(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...(await scan(p)));
    else if (p.endsWith(".ts")) files.push(p);
  }
  return files;
}
for (const name of names) {
  const root = path.resolve(`packages/${name}/src`);
  for (const file of await scan(root)) {
    const text = await readFile(file, "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const spec = node.moduleSpecifier;
        if (spec && ts.isStringLiteral(spec)) {
          const mod = spec.text;
          if (mod.startsWith(".")) {
            const resolved = path.resolve(path.dirname(file), mod);
            if (!resolved.startsWith(root + path.sep))
              throw new Error(`Escaping package import: ${file}: ${mod}`);
          } else if (
            !(name === "contracts" && mod === "zod") &&
            !(
              name === "simulation" &&
              ["@noble/hashes/sha2", "@noble/hashes/utils"].includes(mod)
            ) &&
            !(name !== "contracts" && mod === "@lcxxvi/contracts") &&
            !(name === "simulation" && ["@lcxxvi/data", "@lcxxvi/domain"].includes(mod))
          )
            throw new Error(`Forbidden dependency ${file}: ${mod}`);
        }
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      )
        throw new Error(`Dynamic import requires architecture review: ${file}`);
      if (
        name !== "persistence" &&
        ts.isIdentifier(node) &&
        ["window", "document", "indexedDB", "fetch"].includes(node.text)
      )
        throw new Error(`Ambient API ${node.text}: ${file}`);
      if (
        ts.isPropertyAccessExpression(node) &&
        ["Math.random", "Date.now"].includes(node.getText(source))
      )
        throw new Error(`Ambient nondeterminism: ${file}`);
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(source) === "Date"
      )
        throw new Error(`Ambient clock: ${file}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}
console.log("All seven package dependency and ambient API boundaries passed");
