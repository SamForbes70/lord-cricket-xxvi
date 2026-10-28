/** Validates a frozen protocol before reading externally supplied evaluation results. */
import { readFileSync, writeFileSync } from "node:fs";
import { evaluate, validateProtocol } from "./research/m7k-evaluation.js";
const flags = new Map<string, string>();
for (const argument of process.argv.slice(2)) {
  const matched = /^--(protocol|results|training-targets|out)=(.+)$/.exec(argument);
  if (!matched || flags.has(matched[1]!)) throw new Error("M7K_EVALUATION_ARGUMENT");
  flags.set(matched[1]!, matched[2]!);
}
for (const name of ["protocol", "results", "training-targets", "out"]) if (!flags.has(name)) throw new Error(`M7K_EVALUATION_MISSING_${name}`);
const protocol = validateProtocol(JSON.parse(readFileSync(flags.get("protocol")!, "utf8")));
const results = JSON.parse(readFileSync(flags.get("results")!, "utf8"));
const targets = JSON.parse(readFileSync(flags.get("training-targets")!, "utf8"));
writeFileSync(flags.get("out")!, JSON.stringify(evaluate(protocol, results, targets), null, 2) + "\n");
