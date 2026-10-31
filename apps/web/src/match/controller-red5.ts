import {
  type Red5Session,
  type RosterRed5Session,
  createRosterRed5Session, executeRosterRed5Command, rehydrateRosterRed5Session, replayRosterRed5Session,
  verifyFrozenWorldBytes,
  validateRed5MatchSetup,
  createRed5Session,
  executeRed5Command,
  replayRed5Events,
  resimulateRed5Commands,
  projectRed5Scorecard,
  red5EventChainManifest,
  canonicalStateBytes,
  sha256Hex,
  validateRed5Field,
  rehydrateRed5Session,
} from "@lcxxvi/simulation";
import {
  FIELD_REGISTRY,
  FROZEN_WORLD_PINS,
  isBowlingCapable,
  MODEL_PACK_SHA256,
  DELIVERY_STAGE_PACK_SHA256,
} from "@lcxxvi/data";
import { type Red5Command, type DeliveryRecorded, type NewGameWorldCopy, type StagedRosterPack } from "@lcxxvi/contracts";
import { validateNewGameWorldCopy } from "../world/new-game-world.js";
import {
  PINS,
  RED5_PINS,
  UI_VERSION,
  RequestSchema,
  type Catalog,
  type Response,
  type View,
  type Verification,
  type Request,
} from "./protocol.js";

/** Owned by one production worker. Seed injection exists for Node tests only; it is never a wire message. */
export function createRed5MatchController(
  worldBytes: Uint8Array,
  manifest: unknown,
  privateSeed: () => string,
  privateIdentity: () => { gameId: string; matchId: string } = () => ({
    gameId: "human-exhibition",
    matchId: "human-red5",
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
  let session: Red5Session | null = null;
  let rosterPack: StagedRosterPack | null = null;
  let displayWorld = world;
  function setWorldCopy(copy: NewGameWorldCopy | null) {
    displayWorld = rosterPack?.world ?? (copy ? validateNewGameWorldCopy(copy, world).world : world);
  }
  const seen = new Map<string, { request: string; response: Response }>();
  const audit: {
    requestId: string;
    origin: "HUMAN";
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
          : c.phase === "AWAITING_FOLLOW_ON"
            ? c.battingFirstId
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
      AWAITING_FOLLOW_ON: `${tn(decisionTeamId)}: choose whether to enforce the follow-on`,
      READY: "Ready: set tactics, declare, take a new ball if available, or advance play",
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
        validateRed5Field(c.fieldSlots, l.outfieldIds, p.batHand);
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
        ? r.kind === "DRAW" ? "Match drawn"
          : r.kind === "TIE" ? "Match tied"
          : r.marginType === "INNINGS" ? `${tn(r.winnerTeamId)} won by an innings and ${r.marginRuns} run${r.marginRuns === 1 ? "" : "s"}`
          : `${tn(r.winnerTeamId)} won by ${r.marginRuns ?? r.marginWickets} ${r.marginType?.toLowerCase()}`
        : null;
    return {
      format: "RED_BALL",
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
      scorecard: c.phase === "COMPLETE" ? projectRed5Scorecard(s) : null,
      resultText,
      eventCount: s.events.length,
      lastEventHash: s.lastEventHash,
      redBall: {
        day: c.clock.day, localSeconds: c.clock.localSeconds, finalHourActive: c.clock.finalHourActive,
        finalHourBallsRemaining: c.clock.finalHourBallsRemaining, followOnEnforced: c.followOnEnforced,
        newBallAvailable: !!l && l.innings.ballAgeLegalBalls >= 480 && l.innings.legalBalls % 6 === 0, declared: [...c.declared],
      },
    };
  }
  function verify(): Verification {
    if (!session || session.core.phase !== "COMPLETE")
      throw new Error(
        "Complete the match before verifying its final scorecard.",
      );
    const replay = rosterPack ? replayRosterRed5Session(session as unknown as RosterRed5Session, rosterPack)
      : replayRed5Events(session.setup, session.events, red5EventChainManifest(session));
    const score = projectRed5Scorecard(session);
    if (hash(projectRed5Scorecard(replay)) !== hash(score))
      throw new Error("Replay scorecard mismatch.");
    if (!rosterPack) resimulateRed5Commands(session);
    return {
      revision: session.revision,
      eventsSha256: hash(session.events),
      scorecardSha256: hash(score),
      eventCount: session.events.length,
      replay: true,
      resimulation: true,
      humanRequests: audit.length,
      systemAutopilotRequests: 0,
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
    const expectedActor = cmd.kind === "ADVANCE" || cmd.kind === "ADD_RAIN_DELAY" ? "SYSTEM" : `USER:${teamId}`;
    if (cmd.actorId !== expectedActor)
      throw new Error(
        "Only human commands are accepted by this match interface.",
      );
    session = rosterPack ? executeRosterRed5Command(session as unknown as RosterRed5Session, cmd).session as unknown as Red5Session : executeRed5Command(session, cmd).session;
    audit.push({
      requestId: request.requestId,
      origin: "HUMAN",
      commandKind: cmd.kind,
      engineActorId: cmd.actorId,
    });
  }
  function restore(raw: unknown, rawRosterPack: StagedRosterPack | null = null): void {
    rosterPack = rawRosterPack;
    session = rosterPack ? rehydrateRosterRed5Session(raw, rosterPack) as unknown as Red5Session : rehydrateRed5Session(raw, worldBytes, manifest);
    setWorldCopy(null);
    seen.clear();
    audit.splice(
      0,
      audit.length,
      ...session.commands.map((cmd) => ({
        requestId: cmd.commandId,
        origin: "HUMAN" as const,
        commandKind: cmd.kind,
        engineActorId: cmd.actorId,
      })),
    );
  }
  function snapshot(): Red5Session | null {
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
    };
  }
  return {
    restore,
    setWorldCopy,
    snapshot,
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
        if (
          request.type !== "BOOT" &&
          request.expectedRevision !== (session?.revision ?? 0)
        )
          throw new Error(
            "Stale revision. Review the current decision and try again.",
          );
        if (request.type === "START") {
          if (request.format !== "RED_BALL")
            throw new Error("Red-ball controller received a non-red-ball start.");
          if (session) throw new Error("A match is already in progress.");
          if (request.careerFixture) throw new Error("Career fixtures require T20.");
          if (request.rosterPack && request.worldCopy) throw new Error("Choose either a roster or an edited world.");
          rosterPack = request.rosterPack ?? null;
          setWorldCopy(request.worldCopy ?? null);
          if (rosterPack) {
            const draft = createRosterRed5Session(rosterPack, { ...privateIdentity(), seed: privateSeed(), format: "RED_BALL", selection: { groundId: request.groundId, teams: request.selections } });
            const cmd: Red5Command = { kind: "CONFIRM_TEAMS", payload: {}, actorId: "SYSTEM", commandId: id, expectedRevision: 0 };
            session = executeRosterRed5Command(draft, cmd).session as unknown as Red5Session;
            displayWorld = rosterPack.world;
            audit.push({ requestId: id, origin: "HUMAN", commandKind: "CONFIRM_TEAMS", engineActorId: "SYSTEM" });
          } else {
          const setup = validateRed5MatchSetup(
            {
              setupVersion: "LC_RED5_SETUP_V1",
              setup: {
                schemaVersion: "1.0.0",
                ...privateIdentity(),
                format: "RED_BALL",
                worldPackId: FROZEN_WORLD_PINS.worldPackId,
                rulesId: "LC_RED5_01",
                modelId: "synthetic-alpha-01",
                randomId: "SHA256_COUNTER_V1",
                seed: privateSeed(),
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
              worldCanonicalSha256: RED5_PINS.worldHash,
              rulesHash: RED5_PINS.rulesHash,
              modelHash: MODEL_PACK_SHA256,
              stagePackHash: DELIVERY_STAGE_PACK_SHA256,
              selectedTeams: request.selections,
            },
            worldBytes,
            manifest,
          );
          const draft = createRed5Session(setup);
          for (const [key, value] of Object.entries(RED5_PINS))
            if (
              draft.executionManifest[
                key as keyof typeof draft.executionManifest
              ] !== value
            )
              throw new Error("Worker build identity mismatch.");
          const cmd: Red5Command = {
            kind: "CONFIRM_TEAMS",
            payload: {},
            actorId: "SYSTEM",
            commandId: id,
            expectedRevision: 0,
          };
          session = executeRed5Command(draft, cmd).session;
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
