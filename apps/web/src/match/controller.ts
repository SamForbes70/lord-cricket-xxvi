import { projectT20MatchAnalytics } from "@lcxxvi/projections";
import {
  type T20Session,
  type RosterT20Session,
  createRosterT20Session,
  executeRosterT20Command,
  rehydrateRosterT20Session,
  replayRosterT20Session,
  verifyFrozenWorldBytes,
  validateT20MatchSetup,
  createT20Session,
  executeT20Command,
  replayT20Events,
  resimulateT20Commands,
  projectT20Scorecard,
  eventChainManifest,
  canonicalStateBytes,
  sha256Hex,
  validateT20Field,
  rehydrateT20Session,
  conditionDeltaFromCompletedT20Session,
} from "@lcxxvi/simulation";
import {
  FIELD_REGISTRY,
  FROZEN_WORLD_PINS,
  isBowlingCapable,
  MODEL_PACK_SHA256,
  DELIVERY_STAGE_PACK_SHA256,
} from "@lcxxvi/data";
import { type T20Command, type DeliveryRecorded, type NewGameWorldCopy, type StagedRosterPack } from "@lcxxvi/contracts";
import { validateNewGameWorldCopy } from "../world/new-game-world.js";
import {
  PINS,
  UI_VERSION,
  RequestSchema,
  type Catalog,
  type Response,
  type View,
  type Verification,
  type Request,
  type CareerMatchResult,
} from "./protocol.js";

/** Owned by one production worker. Seed injection exists for Node tests only; it is never a wire message. */
export function createMatchController(
  worldBytes: Uint8Array,
  manifest: unknown,
  privateSeed: () => string,
  privateIdentity: () => { gameId: string; matchId: string } = () => ({
    gameId: "human-exhibition",
    matchId: "human-t20",
  }),
) {
  const { world } = verifyFrozenWorldBytes(worldBytes, manifest);
  const catalog: Catalog = {
    teams: world.teams.map((t) => {
      const players = t.squadIds.map(
        (id) => world.players.find((p) => p.playerId === id)!,
      );
      const keeper = players.find((p) => p.role === "KEEPER")!;
      const bowlers = players
        .filter((p) => p.playerId !== keeper.playerId && isBowlingCapable(p))
        .slice(0, 6);
      const xi = [
        keeper,
        ...bowlers,
        ...players.filter((p) => p !== keeper && !bowlers.includes(p)),
      ].slice(0, 11);
      return {
        id: t.teamId,
        name: t.name,
        players: players.map((p) => ({
          id: p.playerId,
          name: p.name,
          role: p.role,
          style: p.bowlingStyle,
          canBowl: isBowlingCapable(p),
        })),
        suggested: {
          teamId: t.teamId,
          playerIds: xi.map((p) => p.playerId),
          captainId: xi[0]!.playerId,
          keeperId: keeper.playerId,
        },
      };
    }),
    grounds: world.grounds.map((g) => ({ id: g.groundId, name: g.name })),
  };
  let session: T20Session | null = null;
  let rosterPack: StagedRosterPack | null = null;
  let careerFixture: Extract<Request, { type: "START" }>["careerFixture"] | null = null;
  let displayWorld = world;
  function setWorldCopy(copy: NewGameWorldCopy | null) {
    displayWorld = rosterPack?.world ?? (copy ? validateNewGameWorldCopy(copy, world).world : world);
  }
  function bindCareerFixture(fixture: typeof careerFixture) {
    setWorldCopy(fixture?.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V2" ? fixture.worldCopy : null);
    careerFixture = fixture;
  }
  const seen = new Map<string, { request: string; response: Response }>();
  const audit: {
    requestId: string;
    origin: "HUMAN" | "AI";
    commandKind: string;
    engineActorId: string;
  }[] = [];
  const hash = (v: unknown) => sha256Hex(canonicalStateBytes(v));
  function view(): View | null {
    if (!session) return null;
    const s = session,
      c = s.core,
      l = c.innings[c.activeInningsIndex],
      i = l?.innings;
    const names = Object.fromEntries(
      s.setup.teams.flatMap((t) => t.xi.map((p) => [p.playerId, displayWorld.players.find(player => player.playerId === p.playerId)?.name ?? p.name])),
    );
    const tn = (id: string | null) =>
      displayWorld.teams.find((t) => t.teamId === id)?.name ?? "";
    const decisionTeamId =
      c.phase === "TOSS"
        ? s.setup.teams[0].teamId
        : c.phase === "AWAITING_INNINGS"
          ? c.tossWinnerId
          : c.phase === "AWAITING_BATTER"
            ? i!.battingTeamId
            : c.phase === "AWAITING_BOWLER"
              ? i!.bowlingTeamId
              : null;
    const decision = {
      TOSS: `${tn(decisionTeamId)}: call the toss`,
      AWAITING_INNINGS: `${tn(c.tossWinnerId)} won the toss: choose bat or bowl`,
      AWAITING_BATTER: `${tn(decisionTeamId)}: select ${i?.northBatterId === null && i.southBatterId === null ? "the opening batter" : "the next batter"}`,
      AWAITING_BOWLER: `${tn(decisionTeamId)}: select a bowler`,
      READY: "Ready: set tactics or advance play",
      COMPLETE: "Match complete: review the scorecard",
    };
    const candidates = (
      s.setup.teams.find((t) => t.teamId === decisionTeamId)?.xi ?? []
    ).map((p) => {
      let reason = "";
      if (c.phase === "AWAITING_BATTER")
        reason = l!.batting[p.playerId]!.dismissed
          ? "Already dismissed"
          : [i!.northBatterId, i!.southBatterId].includes(p.playerId)
            ? "Already batting"
            : "";
      if (c.phase === "AWAITING_BOWLER")
        reason =
          p.playerId === l!.keeperId
            ? "Designated keeper"
            : p.bowlingStyle === null
              ? "Not a bowler"
              : i!.previousOverBowlerId === p.playerId
                ? "Bowled the previous over"
                : l!.bowling[p.playerId]!.legalBalls >= 24
                  ? "Four-over limit reached"
                  : "";
      return { id: p.playerId, name: names[p.playerId] ?? p.name, reason };
    });
    let advanceReason =
      c.phase === "COMPLETE"
        ? "Match complete"
        : c.phase !== "READY"
          ? "Complete the next decision first"
          : "";
    if (c.phase === "READY" && l) {
      try {
        const striker =
          i!.strikerEnd === "NORTH" ? i!.northBatterId : i!.southBatterId;
        const p = s.setup.teams
          .flatMap((t) => t.xi)
          .find((p) => p.playerId === striker)!;
        validateT20Field(c.fieldSlots, l.outfieldIds, p.batHand, i!.legalBalls);
      } catch {
        advanceReason =
          "Field is invalid for this striker. Apply a legal named field before advancing.";
      }
    }
    const commentary = s.events.map((e) => {
      let text = e.type.replaceAll("_", " ").toLowerCase(),
        short = text;
      if (e.type === "DELIVERY_RECORDED") {
        const d = (e.payload as { event: DeliveryRecorded }).event;
        const runs =
          d.batRuns + Object.values(d.extras).reduce((a, b) => a + b, 0);
        short = d.dismissal
          ? "W"
          : d.legality === "WIDE"
            ? `${runs}wd`
            : d.legality === "NO_BALL"
              ? `${runs}nb`
              : String(runs);
        text = `Innings ${d.inningsIndex + 1}, delivery ${d.deliveryIndex + 1}: ${names[d.bowlerId]} to ${names[d.strikerId]}. ${runs} run${runs === 1 ? "" : "s"}${d.legality === "LEGAL" ? "" : ` (${d.legality.toLowerCase()})`}.${d.dismissal ? ` ${names[d.dismissal.playerId]} out, ${d.dismissal.kind.toLowerCase().replaceAll("_", " ")}.` : ""}`;
      } else if (e.type === "TOSS_RESOLVED") {
        const p = e.payload as { winnerId: string; coin: string };
        text = `Toss: ${p.coin.toLowerCase()}. ${tn(p.winnerId)} won.`;
        short = text;
      } else if (e.type === "BATTER_SELECTED") {
        text = `${names[(e.payload as { playerId: string }).playerId]} comes in to bat.`;
        short = text;
      } else if (e.type === "BOWLER_SELECTED") {
        text = `${names[(e.payload as { playerId: string }).playerId]} will bowl.`;
        short = text;
      }
      return { sequence: e.sequence, text, short };
    });
    const r = c.result;
    const resultText =
      c.phase === "COMPLETE" && r
        ? r.kind === "TIE"
          ? "Match tied"
          : `${tn(r.winnerTeamId)} won by ${r.marginRuns ?? r.marginWickets} ${r.marginType?.toLowerCase()}`
        : null;
    return {
      format: "T20",
      revision: s.revision,
      phase: c.phase,
      nextDecision: decision[c.phase as keyof typeof decision] ?? c.phase,
      decisionTeamId,
      teams: s.setup.teams.map((t) => ({
        id: t.teamId,
        name: tn(t.teamId),
        captainId: t.captainId,
        keeperId: t.keeperId,
        playerIds: [...t.playerIds],
        ...(displayWorld.packId !== world.packId ? { colours: [...displayWorld.teams.find(team => team.teamId === t.teamId)!.colours] as [string, string] } : {}),
      })),
      names,
      ground: displayWorld.grounds.find(ground => ground.groundId === s.setup.ground.groundId)?.name ?? s.setup.ground.name,
      innings: structuredClone(c.innings),
      activeIndex: c.activeInningsIndex,
      candidates,
      bowlingPlan: structuredClone(c.bowlingPlan),
      battingPlans: structuredClone(c.battingPlans),
      fieldSlots: structuredClone(c.fieldSlots),
      positions: FIELD_REGISTRY.positions.map((p) => p.slotId),
      advanceReason,
      commentary,
      scorecard: c.phase === "COMPLETE" ? projectT20Scorecard(s) : null,
      analytics: c.phase === "COMPLETE" ? projectT20MatchAnalytics(s.events, projectT20Scorecard(s)) : null,
      resultText,
      eventCount: s.events.length,
      lastEventHash: s.lastEventHash,
    };
  }
  function careerResult(): CareerMatchResult | null {
    if (!careerFixture || careerFixture.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER" || !session || session.core.phase !== "COMPLETE") return null;
    const scorecard = projectT20Scorecard(session);
    const scorecardSha256 = hash(scorecard);
    const conditionDelta = conditionDeltaFromCompletedT20Session({
      seasonId: careerFixture.seasonId,
      fixtureId: careerFixture.fixtureId,
      matchId: careerFixture.matchId,
      matchDayDate: careerFixture.matchDayDate,
      session,
    });
    const sourceCompletionSha256 = hash({
      source: "USER_MATCH",
      seasonId: careerFixture.seasonId,
      fixtureId: careerFixture.fixtureId,
      matchId: careerFixture.matchId,
      scorecardSha256,
      finalEventHash: session.lastEventHash,
    });
    return {
      resultVersion: "LC_CAREER_USER_MATCH_RESULT_V1",
      seasonId: careerFixture.seasonId,
      scheduleSha256: careerFixture.scheduleSha256,
      fixtureId: careerFixture.fixtureId,
      matchId: careerFixture.matchId,
      fixtureOrdinal: careerFixture.fixtureOrdinal,
      roundNumber: careerFixture.roundNumber,
      matchDayDate: careerFixture.matchDayDate,
      homeTeamId: careerFixture.homeTeamId,
      awayTeamId: careerFixture.awayTeamId,
      selectedTeams: [structuredClone(careerFixture.selections[0]), structuredClone(careerFixture.selections[1])],
      scorecard,
      scorecardSha256,
      finalEventHash: session.lastEventHash,
      sourceCompletionSha256,
      conditionDelta,
    };
  }

  function verify(): Verification {
    if (!session || session.core.phase !== "COMPLETE")
      throw new Error(
        "Complete the match before verifying its final scorecard.",
      );
    const replay = rosterPack
      ? replayRosterT20Session(session as unknown as RosterT20Session, rosterPack)
      : replayT20Events(session.setup, session.events, eventChainManifest(session));
    const score = projectT20Scorecard(session);
    if (hash(projectT20Scorecard(replay)) !== hash(score))
      throw new Error("Replay scorecard mismatch.");
    if (!rosterPack) resimulateT20Commands(session);
    return {
      revision: session.revision,
      eventsSha256: hash(session.events),
      scorecardSha256: hash(score),
      eventCount: session.events.length,
      replay: true,
      resimulation: true,
      humanRequests: audit.filter(a => a.origin === "HUMAN").length,
      systemAutopilotRequests: audit.filter(a => a.origin === "AI").length,
    };
  }
  function execute(request: Extract<Request, { type: "COMMAND" }>) {
    if (!session) throw new Error("Start a match first.");
    const cmd = request.command;
    if (cmd.kind === "CONFIRM_TEAMS")
      throw new Error(
        "Team confirmation is only available through match setup.",
      );
    if (
      cmd.commandId !== request.requestId ||
      cmd.expectedRevision !== request.expectedRevision
    )
      throw new Error("Command envelope mismatch.");
    const l = session.core.innings[session.core.activeInningsIndex];
    const teamId =
      "teamId" in cmd.payload
        ? cmd.payload.teamId
        : cmd.kind === "SET_BATTING_PLAN"
          ? l?.innings.battingTeamId
          : l?.innings.bowlingTeamId;
    const expectedActor = cmd.kind === "ADVANCE" ? "SYSTEM" : `USER:${teamId}`;
    if (cmd.actorId !== (request.origin === "AI" ? (cmd.kind === "ADVANCE" ? "SYSTEM" : `AI:${teamId}`) : expectedActor))
      throw new Error(
        "Only human-owned or explicitly delegated AI-owned commands may change the team decision.",
      );
    session = rosterPack
      ? executeRosterT20Command(session as unknown as RosterT20Session, cmd).session as unknown as T20Session
      : executeT20Command(session, cmd).session;
    audit.push({
      requestId: request.requestId,
      origin: request.origin,
      commandKind: cmd.kind,
      engineActorId: cmd.actorId,
    });
  }
  function restore(raw: unknown, rawRosterPack: StagedRosterPack | null = null): void {
    rosterPack = rawRosterPack;
    session = rosterPack ? rehydrateRosterT20Session(raw, rosterPack) as unknown as T20Session : rehydrateT20Session(raw, worldBytes, manifest);
    bindCareerFixture(null);
    seen.clear();
    audit.splice(
      0,
      audit.length,
      ...session.commands.map((cmd) => ({
        requestId: cmd.commandId,
        origin: cmd.actorId.startsWith("AI:") ? "AI" as const : "HUMAN" as const,
        commandKind: cmd.kind,
        engineActorId: cmd.actorId,
      })),
    );
  }
  function snapshot(): T20Session | null {
    return session ? structuredClone(session) : null;
  }
  function currentResponse(
    requestId: string,
    error: string | null = null,
  ): Response {
    return {
      version: UI_VERSION,
      requestId,
      revision: session?.revision ?? 0,
      pins: PINS,
      catalog: session ? null : structuredClone(catalog),
      view: view(),
      error,
      verification: null,
      careerResult: careerResult(),
      ...(careerFixture?.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER" && session?.core.phase === "COMPLETE" ? { rosterCareerSession: structuredClone(session) } : {}),
    };
  }
  return {
    restore,
    setWorldCopy,
    snapshot,
    /** The career launch this controller is currently bound to, if any. */
    boundFixture: () => careerFixture,
    currentResponse,
    handle(raw: unknown): Response {
      let id = "invalid",
        error: string | null = null,
        verification: Verification | null = null;
      let request: Request | undefined;
      try {
        request = RequestSchema.parse(raw);
        id = request.requestId;
        const prior = seen.get(id);
        if (prior) {
          if (prior.request !== JSON.stringify(request))
            throw new Error("Request ID already used with different content.");
          return structuredClone(prior.response);
        }
        if (request.type === "BOOT" && request.careerFixture) {
          if (session && (session.setup.gameId !== request.careerFixture.matchGameId || session.setup.matchId !== request.careerFixture.matchId))
            throw new Error("Recovered match does not match the scheduled career fixture.");
          bindCareerFixture(request.careerFixture);
        }
        if (
          request.type !== "BOOT" &&
          request.expectedRevision !== (session?.revision ?? 0)
        )
          throw new Error(
            "Stale revision. Review the current decision and try again.",
          );
        if (request.type === "START") {
          if (request.format !== "T20")
            throw new Error("T20 controller received a non-T20 start.");
          if (session) throw new Error("A match is already in progress.");
          if (request.careerFixture && request.worldCopy) throw new Error("A career match cannot replace its world copy.");
          if (request.rosterPack && (request.worldCopy || (request.careerFixture && request.careerFixture.launchVersion !== "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER"))) throw new Error("An imported roster cannot replace a career or edited world.");
          if (request.careerFixture?.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER" && JSON.stringify(request.rosterPack) !== JSON.stringify(request.careerFixture.rosterPack)) throw new Error("Career roster binding mismatch.");
          rosterPack = request.rosterPack ?? null;
          bindCareerFixture(request.careerFixture ?? null);
          if (!request.careerFixture) setWorldCopy(request.worldCopy ?? null);
          if (careerFixture) {
            if (careerFixture.matchId !== request.careerFixture?.matchId || careerFixture.groundId !== request.groundId)
              throw new Error("Career fixture binding mismatch.");
            if (careerFixture.homeTeamId !== request.selections[0].teamId || careerFixture.awayTeamId !== request.selections[1].teamId)
              throw new Error("Career fixture team order mismatch.");
            if (JSON.stringify(careerFixture.selections) !== JSON.stringify(request.selections))
              throw new Error("Career fixture XI snapshot mismatch.");
          }
          const identity = careerFixture
            ? { gameId: careerFixture.matchGameId, matchId: careerFixture.matchId }
            : privateIdentity();
          if (rosterPack) {
            const draft = createRosterT20Session(rosterPack, { ...identity, seed: careerFixture ? careerFixture.matchSeed : privateSeed(), format: "T20", selection: { groundId: request.groundId, teams: request.selections } });
            const cmd: T20Command = { kind: "CONFIRM_TEAMS", payload: {}, actorId: "SYSTEM", commandId: id, expectedRevision: 0 };
            session = executeRosterT20Command(draft, cmd).session as unknown as T20Session;
            displayWorld = rosterPack.world;
            audit.push({ requestId: id, origin: "HUMAN", commandKind: "CONFIRM_TEAMS", engineActorId: "SYSTEM" });
          } else {
          const setup = validateT20MatchSetup(
            {
              setupVersion: "LC_T20_SETUP_V1",
              setup: {
                schemaVersion: "1.0.0",
                ...identity,
                format: "T20",
                worldPackId: FROZEN_WORLD_PINS.worldPackId,
                rulesId: "LC_T20_01",
                modelId: "synthetic-alpha-01",
                randomId: "SHA256_COUNTER_V1",
                seed: careerFixture ? careerFixture.matchSeed : privateSeed(),
                teamIds: request.selections.map((t) => t.teamId),
                groundId: request.groundId,
                capabilities: {
                  limitedOversRain: false,
                  superOver: false,
                  injuries: false,
                  prediction: false,
                },
              },
              worldFileSha256: FROZEN_WORLD_PINS.worldFileSha256,
              worldCanonicalSha256: PINS.worldHash,
              rulesHash: PINS.rulesHash,
              modelHash: MODEL_PACK_SHA256,
              stagePackHash: DELIVERY_STAGE_PACK_SHA256,
              selectedTeams: request.selections,
            },
            worldBytes,
            manifest,
          );
          const draft = createT20Session(setup);
          for (const [key, value] of Object.entries(PINS))
            if (
              draft.executionManifest[
                key as keyof typeof draft.executionManifest
              ] !== value
            )
              throw new Error("Worker build identity mismatch.");
          const cmd: T20Command = {
            kind: "CONFIRM_TEAMS",
            payload: {},
            actorId: "SYSTEM",
            commandId: id,
            expectedRevision: 0,
          };
          session = executeT20Command(draft, cmd).session;
          audit.push({
            requestId: id,
            origin: "HUMAN",
            commandKind: "CONFIRM_TEAMS",
            engineActorId: "SYSTEM",
          });
          }
        } else if (request.type === "COMMAND") execute(request);
        else if (request.type === "VERIFY") verification = verify();
      } catch (e) {
        // Do not serialise private requests, Zod input values, stacks or setup state.
        error =
          e instanceof Error && e.name !== "ZodError"
            ? e.message
            : "Invalid request. Check selections, required fields and supported settings.";
      }
      const response: Response = {
        version: UI_VERSION,
        requestId: id,
        revision: session?.revision ?? 0,
        pins: PINS,
        catalog: session ? null : structuredClone(catalog),
        view: view(),
        error,
        verification,
        careerResult: careerResult(),
        ...(careerFixture?.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER" && session?.core.phase === "COMPLETE" ? { rosterCareerSession: structuredClone(session) } : {}),
      };
      if (request && !error)
        seen.set(id, {
          request: JSON.stringify(request),
          response: structuredClone(response),
        });
      return response;
    },
  };
}
