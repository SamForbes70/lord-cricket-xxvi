/** Validates externally reviewed fixture packets against the committed source index. */
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { createHash } from "node:crypto";
import { verifyHistoricalFixture } from "./research/m7k-historical-fixture.js";
const flags = new Map<string, string>();
for (const argument of process.argv.slice(2)) {
  const match = /^--(fixtures|out)=(.+)$/.exec(argument);
  if (!match || flags.has(match[1]!)) throw new Error("M7K_FIXTURE_ARGUMENT");
  flags.set(match[1]!, match[2]!);
}
for (const flag of ["fixtures", "out"]) if (!flags.has(flag)) throw new Error(`M7K_FIXTURE_MISSING_${flag}`);
const packetBytes = readFileSync(flags.get("fixtures")!, "utf8");
const packet = z.strictObject({ version: z.literal("LC_M7K_REVIEWED_FIXTURE_PACKET_V1"), fixtures: z.array(z.unknown()).min(1) })
  .parse(JSON.parse(packetBytes));
const sourceBytes = readFileSync("docs/verification-m7k/source-context/SOURCE_CONTEXT.json", "utf8");
const source = JSON.parse(sourceBytes);
const reports = packet.fixtures.map(fixture => verifyHistoricalFixture(fixture, source.events));
if (new Set(reports.map(row => row.sourceEventSha256)).size !== reports.length) throw new Error("M7K_FIXTURE_DUPLICATE_SOURCE");
writeFileSync(flags.get("out")!, JSON.stringify({ version: "LC_M7K_REVIEWED_FIXTURE_REPORT_V1", generatedAtUtc: new Date().toISOString(),
  fixturePacketSha256: createHash("sha256").update(packetBytes).digest("hex"), sourceIndexSha256: createHash("sha256").update(sourceBytes).digest("hex"),
  reports, gameplayIntegrationPermitted: false }, null, 2) + "\n", { flag: "wx" });
