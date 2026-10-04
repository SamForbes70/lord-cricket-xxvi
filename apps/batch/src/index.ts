import { executeDeterminismRequest, executeProbabilityRequest, generateDelivery, validateT20MatchSetup, verifyFrozenWorldBytes, runFixtureT20, textT20Scorecard, projectT20Scorecard, eventChainManifest, replayT20Events, resimulateT20Commands } from "@lcxxvi/simulation";
import { evaluateScoringDelivery } from "@lcxxvi/domain";
import { readFile,writeFile } from "node:fs/promises";
import {
  BUILD_CAPABILITIES,
  CommandSchema,
  ScoringRequestSchema,
  canonicalJson,
  RandomRequestSchema,
  StateHashRequestSchema,
  ProbabilityRequestSchema,
  GenerateDeliveryRequestSchema,
} from "@lcxxvi/contracts";
const args = process.argv.slice(2);
try {
  if (args.length === 0 || args[0] === "status")
    console.log(canonicalJson(BUILD_CAPABILITIES));
  else if (args[0] === "validate-command" && args.length === 2 && args[1]) {
    CommandSchema.parse(JSON.parse(await readFile(args[1], "utf8")));
    console.log(
      "Command structure valid; authority, phase and rules not evaluated.",
    );
  } else if (args[0] === "score-delivery" && args.length === 2 && args[1]) {
    const request = ScoringRequestSchema.parse(
      JSON.parse(await readFile(args[1], "utf8")),
    );
    console.log(
      canonicalJson(
        evaluateScoringDelivery(request.context, request.resolution),
      ),
    );
  } else if (
    (args[0] === "random" || args[0] === "hash-state") &&
    args.length === 2 &&
    args[1]
  ) {
    const schema =
      args[0] === "random" ? RandomRequestSchema : StateHashRequestSchema;
    const request = schema.parse(JSON.parse(await readFile(args[1], "utf8")));
    console.log(canonicalJson(executeDeterminismRequest(request)));
  } else if (
    (args[0] === "probability" || args[0] === "sample-category") &&
    args.length === 2 && args[1]
  ) {
    const request = ProbabilityRequestSchema.parse(JSON.parse(await readFile(args[1], "utf8")));
    if ((args[0] === "probability" && request.kind !== "NORMALISE_CATEGORIES") ||
        (args[0] === "sample-category" && request.kind !== "SAMPLE_CATEGORY")) {
      throw new Error("COMMAND_REQUEST_KIND_MISMATCH");
    }
    console.log(canonicalJson(executeProbabilityRequest(request)));
  } else if (args[0] === "generate-delivery" && args.length === 2 && args[1]) {
    const request = GenerateDeliveryRequestSchema.parse(JSON.parse(await readFile(args[1], "utf8")));
    const generated = generateDelivery(request);
    // Integration adapter only. The scorer, never the generator, creates scored events.
    const scored = evaluateScoringDelivery(request.context, generated.resolution);
    console.log(canonicalJson({ generated, scored }));
  } else if (args[0] === "match-t20" && args.length<=3) {
    const request=JSON.parse(await readFile(args[1]??"tests/fixtures/world/t20-valid-setup.json","utf8"));
    const world=await readFile("packages/data/worlds/fictional-eight-01.json");
    const manifest=JSON.parse(await readFile("packages/data/worlds/fictional-eight-01.manifest.json","utf8"));
    const setup=validateT20MatchSetup(request,world,manifest);
    const game=runFixtureT20(setup),chain=eventChainManifest(game),scorecard=projectT20Scorecard(game);
    replayT20Events(setup,game.events,chain);resimulateT20Commands(game);
    if(args[2]) {
      await writeFile(args[2]+".events.json",canonicalJson(game.events)+"\n");
      await writeFile(args[2]+".scorecard.json",canonicalJson(scorecard)+"\n");
      await writeFile(args[2]+".manifest.json",canonicalJson({setupRequest:request,setup,executionManifest:game.executionManifest,chain,commands:game.commands})+"\n");
    }
    console.log(textT20Scorecard(game));
    console.log(`Validated ${game.events.length} events, ${game.core.globalAttemptOrdinal} attempts. Event chain ${chain.finalEventHash}.`);
  } else if (args[0] === "replay-t20" && args.length===2 && args[1]) {
    const archive=JSON.parse(await readFile(args[1],"utf8"));
    const events=JSON.parse(await readFile(args[1].replace(/\.manifest\.json$/,".events.json"),"utf8"));
    const world=await readFile("packages/data/worlds/fictional-eight-01.json");
    const published=JSON.parse(await readFile("packages/data/worlds/fictional-eight-01.manifest.json","utf8"));
    const trusted=validateT20MatchSetup(archive.setupRequest,world,published);
    if(canonicalJson(trusted)!==canonicalJson(archive.setup))throw new Error("ARCHIVED_SETUP_MISMATCH");
    const verified=replayT20Events(trusted,events,archive.chain);
    console.log(canonicalJson({status:"PASS",eventCount:verified.events.length,chain:eventChainManifest(verified)}));
  } else if (args[0] === "validate-world" && args.length <= 3) {
    const world = await readFile(args[1] ?? "packages/data/worlds/fictional-eight-01.json");
    const manifest = JSON.parse(await readFile(args[2] ?? "packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
    const verified = verifyFrozenWorldBytes(world, manifest);
    console.log(canonicalJson({status: "PASS", worldPackId: verified.world.packId,
      worldFileSha256: verified.manifest.worldFileSha256,
      worldCanonicalSha256: verified.manifest.worldCanonicalSha256,
      counts: {players: verified.world.players.length, teams: verified.world.teams.length,
        grounds: verified.world.grounds.length}, provenance: "FICTIONAL",
      modelStatus: verified.manifest.modelStatus}));
  } else if (args[0] === "setup-t20" && args.length >= 2 && args.length <= 4) {
    const request = JSON.parse(await readFile(args[1]!, "utf8"));
    const world = await readFile(args[2] ?? "packages/data/worlds/fictional-eight-01.json");
    const manifest = JSON.parse(await readFile(args[3] ?? "packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
    const snapshot = validateT20MatchSetup(request, world, manifest);
    console.log(canonicalJson(snapshot));
  } else {
    console.error(
      "Usage: npm run batch -- status | validate-command <file.json> | score-delivery <request.json> | random <request.json> | hash-state <request.json> | probability <request.json> | sample-category <request.json> | generate-delivery <request.json> | validate-world [world.json manifest.json] | setup-t20 <request.json> [world.json manifest.json] | match-t20 [request.json] [output-prefix] | replay-t20 <output-prefix.manifest.json>",
    );
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
