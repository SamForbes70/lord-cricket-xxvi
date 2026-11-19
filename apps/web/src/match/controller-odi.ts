import { strandingReasons } from "./bowler-plan.js";
import {
  createMatchAnalyticsCache,
  projectInMatchTacticalAssistant,
  projectLiveFieldPresentation,
  projectMatchAudioCues,
  computeMatchAward,
  projectMatchCommentary,
} from "@lcxxvi/projections";
import {
  type ODISession,
  type RosterODISession,
  createRosterODISession, executeRosterODICommand, rehydrateRosterODISession, replayRosterODISession,
  verifyFrozenWorldBytes,
  validateODIMatchSetup,
  createODISession,
  executeODICommand,
  replayODIEvents,
  resimulateODICommands,
  projectODIScorecard,
  odiEventChainManifest,
  canonicalStateBytes,
  sha256Hex,
  validateODIField,
  rehydrateODISession,
} from "@lcxxvi/simulation";
import {
  ODI_FIELD_REGISTRY,
  FROZEN_WORLD_PINS,
  isBowlingCapable,
  MODEL_PACK_SHA256,
  DELIVERY_STAGE_PACK_SHA256,
} from "@lcxxvi/data";
import {
  type ODICommand,
  type AudioCue,
  type CommentaryEntry,
  type NewGameWorldCopy,
  type StagedRosterPack,
  type InMatchTacticalAssistantView,
  type LiveFieldPresentation,
  type MatchAwardRecord,
} from "@lcxxvi/contracts";
import { validateNewGameWorldCopy } from "../world/new-game-world.js";
import {
  PINS,
  ODI_PINS,
  UI_VERSION,
  RequestSchema,
  type Catalog,
  type Response,
  type View,
  type Verification,
  type Request,
} from "./protocol.js";

/** Owned by one production worker. Seed injection exists for Node tests only; it is never a wire message. */
export function createODIMatchController(
  worldBytes: Uint8Array,
  manifest: unknown,
  privateSeed: () => string,
  privateIdentity: () => { gameId: string; matchId: string } = () => ({
    gameId: "human-exhibition",
    matchId: "human-odi",
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
          batHand: p.batHand,
        })),
        suggested: {
          teamId: t.teamId,
          playerIds: xi.map((p) => p.playerId),
          captainId: xi[0]!.playerId,
          keeperId: keeper.playerId,
        },
      };
    }),
    grounds: world.grounds.map((g) => ({ id: g.groundId, name: g.name, seamBp: g.pitchPrior.seamBp, turnBp: g.pitchPrior.turnBp })),
  };
  let session: ODISession | null = null;
  let rosterPack: StagedRosterPack | null = null;
  let displayWorld = world;
  function setWorldCopy(copy: NewGameWorldCopy | null) {
    displayWorld = rosterPack?.world ?? (copy ? validateNewGameWorldCopy(copy, world).world : world);
  }
  const seen = new Map<string, { request: string; response: Response }>();
  const audit: {
    requestId: string;
    origin: "HUMAN" | "AI";
    commandKind: string;
    engineActorId: string;
  }[] = [];
  const hash = (v: unknown) => sha256Hex(canonicalStateBytes(v));
  const analyticsCache = createMatchAnalyticsCache(2);
  let cachedAssistantSession: ODISession | null = null;
  let cachedAssistantRevision = -1;
  let cachedDisplayWorld: typeof displayWorld | null = null;
  let cachedAssistant: InMatchTacticalAssistantView | null = null;
  let cachedFieldPresentation: LiveFieldPresentation | null = null;
  let cachedMatchAward: MatchAwardRecord | null = null;
  let cachedCommentary: CommentaryEntry[] = [];
  let cachedAudioCues: AudioCue[] = [];
  function view(): View | null {
    if (!session) return null;
    const s = session,
      c = s.core,
      l = c.innings[c.activeInningsIndex],
      i = l?.innings;
    analyticsCache.update(s.events);
    const scorecard = c.phase === "COMPLETE" ? projectODIScorecard(s) : null;
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
                : l!.bowling[p.playerId]!.legalBalls >= 60
                  ? "Ten-over limit reached"
                  : "";
      const { power, rotation, defence } = p.skills.ODI;
      return { id: p.playerId, name: names[p.playerId] ?? p.name, reason,
        ...(c.phase === "AWAITING_BATTER" ? { batting: { power, rotation, defence } } : {}) };
    });
    if (c.phase === "AWAITING_BOWLER" && l && i) {
      // Refuse a bowler whose over would leave the rest of the innings impossible to bowl (five-bowler sides).
      const xi = s.setup.teams.find((t) => t.teamId === decisionTeamId)?.xi ?? [];
      const stranding = strandingReasons(
        xi.map((p) => ({ id: p.playerId, eligible: p.playerId !== l.keeperId && p.bowlingStyle !== null, legalBalls: l.bowling[p.playerId]?.legalBalls ?? 0 })),
        Math.ceil((300 - i.legalBalls) / 6),
        60,
      );
      for (const candidate of candidates) if (!candidate.reason && stranding.has(candidate.id)) candidate.reason = stranding.get(candidate.id)!;
    }
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
        validateODIField(c.fieldSlots, l.outfieldIds, p.batHand, i!.legalBalls);
      } catch {
        advanceReason =
          "Field is invalid for this striker. Apply a legal named field before advancing.";
      }
    }
    const r = c.result;
    const hands = Object.fromEntries(
      s.setup.teams.flatMap((team) => team.xi.map((player) => [player.playerId, player.batHand])),
    );
    const groundDisplayName =
      displayWorld.grounds.find((ground) => ground.groundId === s.setup.ground.groundId)?.name ??
      s.setup.ground.name;
    if (
      cachedAssistantSession !== s ||
      cachedAssistantRevision !== s.revision ||
      cachedDisplayWorld !== displayWorld
    ) {
      const teamNames = Object.fromEntries(
        s.setup.teams.map((t) => [t.teamId, tn(t.teamId)]),
      );
      cachedCommentary = projectMatchCommentary({
        format: "ODI",
        events: s.events,
        playerNames: names,
        teamNames,
        teamIds: [s.setup.teams[0].teamId, s.setup.teams[1].teamId],
        groundName: groundDisplayName,
        presentationKey: `lcxxvi-commentary:ODI:${s.setup.matchId}`,
      }).entries;
      cachedAudioCues = projectMatchAudioCues({
        format: "ODI",
        matchId: s.setup.matchId,
        commentaryEntries: cachedCommentary,
      }).cues;
      cachedAssistant = projectInMatchTacticalAssistant({
        format: "ODI",
        phase: c.phase,
        innings: c.innings,
        activeIndex: c.activeInningsIndex,
        events: s.events,
        names,
        hands,
        pitch: c.pitch,
        fatigueBpByPlayerId: c.fatigueBp,
        activeBattingPlans: c.battingPlans,
        activeBowlingPlan: c.bowlingPlan,
        activeFieldSlots: c.fieldSlots,
        outfieldIds: l?.outfieldIds ?? [],
        bowlerVariationsByPlayerId: Object.fromEntries(
          s.setup.teams.flatMap((t) => t.xi.map((p) => [p.playerId, p.variations])),
        ),
      });
      cachedFieldPresentation = projectLiveFieldPresentation({
        format: "ODI",
        phase: c.phase,
        innings: c.innings,
        activeIndex: c.activeInningsIndex,
        fieldSlots: c.fieldSlots,
        events: s.events,
        names,
        hands,
      });
      cachedAssistantSession = s;
      cachedAssistantRevision = s.revision;
      cachedDisplayWorld = displayWorld;
    }
    const commentary = cachedCommentary;
    const resultText =
      c.phase === "COMPLETE" && r
        ? r.kind === "TIE"
          ? "Match tied"
          : `${tn(r.winnerTeamId)} won by ${r.marginRuns ?? r.marginWickets} ${r.marginType?.toLowerCase()}`
        : null;
    return {
      format: "ODI",
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
      hands,
      ground: displayWorld.grounds.find(ground => ground.groundId === s.setup.ground.groundId)?.name ?? s.setup.ground.name,
      innings: structuredClone(c.innings),
      activeIndex: c.activeInningsIndex,
      candidates,
      bowlingPlan: structuredClone(c.bowlingPlan),
      battingPlans: structuredClone(c.battingPlans),
      fieldSlots: structuredClone(c.fieldSlots),
      positions: ODI_FIELD_REGISTRY.positions.map((p) => p.slotId),
      matchId: s.setup.matchId,
      advanceReason,
      commentary,
      audioCues: cachedAudioCues,
      scorecard,
      analytics: scorecard ? analyticsCache.snapshot(scorecard) : null,
      tacticalAssistant: cachedAssistant,
      fieldPresentation: cachedFieldPresentation,
      matchAward:
        c.phase === "COMPLETE" && scorecard
          ? (cachedMatchAward ??=
              computeMatchAward({
                format: "ODI",
                scorecard,
                events: s.events,
                playerNames: names,
                teamNames: Object.fromEntries(displayWorld.teams.map((t) => [t.teamId, t.name])),
              }))
          : null,
      resultText,
      eventCount: s.events.length,
      lastEventHash: s.lastEventHash,
    };
  }
  function verify(): Verification {
    if (!session || session.core.phase !== "COMPLETE")
      throw new Error(
        "Complete the match before verifying its final scorecard.",
      );
    const replay = rosterPack ? replayRosterODISession(session as unknown as RosterODISession, rosterPack)
      : replayODIEvents(session.setup, session.events, odiEventChainManifest(session));
    const score = projectODIScorecard(session);
    if (hash(projectODIScorecard(replay)) !== hash(score))
      throw new Error("Replay scorecard mismatch.");
    if (!rosterPack) resimulateODICommands(session);
    return {
      revision: session.revision,
      eventsSha256: hash(session.events),
      scorecardSha256: hash(score),
      eventCount: session.events.length,
      replay: true,
      resimulation: true,
      humanRequests: audit.filter((a) => a.origin === "HUMAN").length,
      systemAutopilotRequests: audit.filter((a) => a.origin === "AI").length,
    };
  }
  function execute(request: Extract<Request, { type: "COMMAND" }>) {
    if (!session) throw new Error("Start a match first.");
    const cmd = request.command as ODICommand;
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
    const expectedActor =
      request.origin === "AI"
        ? cmd.kind === "ADVANCE"
          ? "SYSTEM"
          : `AI:${teamId}`
        : cmd.kind === "ADVANCE"
          ? "SYSTEM"
          : `USER:${teamId}`;
    if (cmd.actorId !== expectedActor)
      throw new Error(
        "Only valid human or tactical-captain commands are accepted by this match interface.",
      );
    session = rosterPack ? executeRosterODICommand(session as unknown as RosterODISession, cmd).session as unknown as ODISession : executeODICommand(session, cmd).session;
    audit.push({
      requestId: request.requestId,
      origin: request.origin,
      commandKind: cmd.kind,
      engineActorId: cmd.actorId,
    });
  }
  function restore(raw: unknown, rawRosterPack: StagedRosterPack | null = null): void {
    rosterPack = rawRosterPack;
    session = rosterPack ? rehydrateRosterODISession(raw, rosterPack) as unknown as ODISession : rehydrateODISession(raw, worldBytes, manifest);
    setWorldCopy(null);
    seen.clear();
    audit.splice(
      0,
      audit.length,
      ...session.commands.map((cmd) => ({
        requestId: cmd.commandId,
        origin: (cmd.actorId.startsWith("AI:") ? "AI" : "HUMAN") as "HUMAN" | "AI",
        commandKind: cmd.kind,
        engineActorId: cmd.actorId,
      })),
    );
  }
  function snapshot(): ODISession | null {
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
          if (request.format !== "ODI")
            throw new Error("ODI controller received a non-ODI start.");
          if (session) throw new Error("A match is already in progress.");
          if (request.careerFixture) throw new Error("Career fixtures require T20.");
          if (request.rosterPack && request.worldCopy) throw new Error("Choose either a roster or an edited world.");
          rosterPack = request.rosterPack ?? null;
          setWorldCopy(request.worldCopy ?? null);
          if (rosterPack) {
            const draft = createRosterODISession(rosterPack, { ...privateIdentity(), seed: privateSeed(), format: "ODI", selection: { groundId: request.groundId, teams: request.selections } });
            const cmd: ODICommand = { kind: "CONFIRM_TEAMS", payload: {}, actorId: "SYSTEM", commandId: id, expectedRevision: 0 };
            session = executeRosterODICommand(draft, cmd).session as unknown as ODISession;
            displayWorld = rosterPack.world;
            audit.push({ requestId: id, origin: "HUMAN", commandKind: "CONFIRM_TEAMS", engineActorId: "SYSTEM" });
          } else {
          const setup = validateODIMatchSetup(
            {
              setupVersion: "LC_ODI_SETUP_V1",
              setup: {
                schemaVersion: "1.0.0",
                ...privateIdentity(),
                format: "ODI",
                worldPackId: FROZEN_WORLD_PINS.worldPackId,
                rulesId: "LC_ODI_01",
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
              worldCanonicalSha256: ODI_PINS.worldHash,
              rulesHash: ODI_PINS.rulesHash,
              modelHash: MODEL_PACK_SHA256,
              stagePackHash: DELIVERY_STAGE_PACK_SHA256,
              selectedTeams: request.selections,
            },
            worldBytes,
            manifest,
          );
          const draft = createODISession(setup);
          for (const [key, value] of Object.entries(ODI_PINS))
            if (
              draft.executionManifest[
                key as keyof typeof draft.executionManifest
              ] !== value
            )
              throw new Error("Worker build identity mismatch.");
          const cmd: ODICommand = {
            kind: "CONFIRM_TEAMS",
            payload: {},
            actorId: "SYSTEM",
            commandId: id,
            expectedRevision: 0,
          };
          session = executeODICommand(draft, cmd).session;
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
