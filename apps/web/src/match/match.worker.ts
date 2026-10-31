import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import manifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import { canonicalJson, type NewGameWorldCopy, type StagedRosterPack } from "@lcxxvi/contracts";
import type { T20Session, ODISession, Red5Session, RosterT20Session, RosterODISession, RosterRed5Session } from "@lcxxvi/simulation";
import {
  IndexedDbSaveRepository,
  createPortableArchive,
  readPortableArchive,
} from "@lcxxvi/persistence";
import { createMatchController } from "./controller.js";
import { proposeOpponentT20Command } from "./ai-opponent.js";
import { createODIMatchController } from "./controller-odi.js";
import { createRed5MatchController } from "./controller-red5.js";
import {
  ARCHIVE_PINS,
  ODI_ARCHIVE_PINS,
  RED5_ARCHIVE_PINS,
  RequestSchema,
  UI_VERSION,
  type Request,
  type Response,
} from "./protocol.js";

const worldBytes = new TextEncoder().encode(worldText);
const repository = new IndexedDbSaveRepository();
const ownerId = self.name || `tab-${randomHex(16)}`;
let activeSaveId: string | null = null;
let activeWorldCopy: NewGameWorldCopy | null = null;
let activeRosterPack: StagedRosterPack | null = null;
let readOnly = false;
let recovered = false;
let recoveredFromGeneration: number | null = null;
type AnySession = T20Session | ODISession | Red5Session;
type MatchController =
  | ReturnType<typeof createMatchController>
  | ReturnType<typeof createODIMatchController>
  | ReturnType<typeof createRed5MatchController>;
let controller: MatchController = makeController();
let initialised = false;

function randomHex(bytesCount: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesCount));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function nowMs(): number {
  return Date.now();
}
function nowIso(): string {
  return new Date().toISOString();
}
function privateSeed(): string {
  return randomHex(32);
}
function privateIdentity() {
  const token = randomHex(12);
  return { gameId: `game-${token}`, matchId: `match-${token}` };
}
function makeController(format: "T20" | "ODI" | "RED_BALL" = "T20"): MatchController {
  if (format === "ODI") return createODIMatchController(worldBytes, manifest, privateSeed, privateIdentity);
  if (format === "RED_BALL") return createRed5MatchController(worldBytes, manifest, privateSeed, privateIdentity);
  return createMatchController(worldBytes, manifest, privateSeed, privateIdentity);
}
function sessionFormat(raw: unknown): "T20" | "ODI" | "RED_BALL" {
  const value = raw as { setup?: { format?: unknown } };
  return value?.setup?.format === "ODI" ? "ODI" : value?.setup?.format === "RED_BALL" ? "RED_BALL" : "T20";
}
function metadata(session: AnySession, copy: NewGameWorldCopy | null = null) {
  const display = copy?.world;
  return {
    matchGameId: String(session.setup.gameId),
    matchId: String(session.setup.matchId),
    teams: [
      display?.teams.find(team => team.teamId === session.setup.teams[0].teamId)?.name ?? String(session.setup.teams[0].name),
      display?.teams.find(team => team.teamId === session.setup.teams[1].teamId)?.name ?? String(session.setup.teams[1].name),
    ] as [string, string],
    ground: display?.grounds.find(ground => ground.groundId === session.setup.ground.groundId)?.name ?? String(session.setup.ground.name),
    phase: String(session.core.phase),
    completed: session.core.phase === "COMPLETE",
  };
}
function defaultTitle(session: AnySession, copy: NewGameWorldCopy | null): string {
  const names = metadata(session, copy).teams;
  return `${names[0]} v ${names[1]}`;
}
function applyWorldCopy(target: MatchController, copy: NewGameWorldCopy | null) {
  target.setWorldCopy(copy);
}

function restoreController(target: MatchController, raw: unknown, roster: StagedRosterPack | null) {
  if (roster && sessionFormat(raw) === "ODI") (target as ReturnType<typeof createODIMatchController>).restore(raw, roster);
  else if (roster && sessionFormat(raw) === "T20") (target as ReturnType<typeof createMatchController>).restore(raw, roster);
  else if (roster && sessionFormat(raw) === "RED_BALL") (target as ReturnType<typeof createRed5MatchController>).restore(raw, roster);
  else if (roster) throw new Error("Imported roster match format is unsupported.");
  else target.restore(raw);
}
function rosterPins(session: RosterT20Session | RosterODISession | RosterRed5Session) {
  return { engine: session.executionManifest.engine, eventChain: session.executionManifest.eventChain,
    random: session.setup.versions.random, model: session.setup.versions.model, modelHash: session.setup.versions.modelHash,
    rules: session.setup.versions.rules, rulesHash: session.setup.versions.rulesHash, worldHash: session.setup.versions.worldHash };
}
const ROSTER_ARCHIVE_POLICY = { engine: "LC_T20_MATCH_ROSTER_V2", eventChain: ARCHIVE_PINS.eventChain, random: ARCHIVE_PINS.random, model: ARCHIVE_PINS.model, modelHash: ARCHIVE_PINS.modelHash, rules: ARCHIVE_PINS.rules, rulesHash: ARCHIVE_PINS.rulesHash };
const ROSTER_RED5_ARCHIVE_POLICY = { engine: "LC_RED5_MATCH_ROSTER_V2", eventChain: RED5_ARCHIVE_PINS.eventChain, random: RED5_ARCHIVE_PINS.random, model: RED5_ARCHIVE_PINS.model, modelHash: RED5_ARCHIVE_PINS.modelHash, rules: RED5_ARCHIVE_PINS.rules, rulesHash: RED5_ARCHIVE_PINS.rulesHash };
const ROSTER_ODI_ARCHIVE_POLICY = { engine: "LC_ODI_MATCH_ROSTER_V2", eventChain: ODI_ARCHIVE_PINS.eventChain, random: ODI_ARCHIVE_PINS.random, model: ODI_ARCHIVE_PINS.model, modelHash: ODI_ARCHIVE_PINS.modelHash, rules: ODI_ARCHIVE_PINS.rules, rulesHash: ODI_ARCHIVE_PINS.rulesHash };

function durableHistoryFromSession(session: AnySession) {
  return session.commands.map((command) => {
    const request =
      command.kind === "CONFIRM_TEAMS"
        ? {
            version: UI_VERSION,
            requestId: command.commandId,
            expectedRevision: command.expectedRevision,
            type: "START" as const,
            format: session.setup.format,
            selections: session.setup.teams.map((team) => ({
              teamId: team.teamId,
              playerIds: [...team.playerIds],
              captainId: team.captainId,
              keeperId: team.keeperId,
            })),
            groundId: session.setup.ground.groundId,
          }
        : {
            version: UI_VERSION,
            requestId: command.commandId,
            expectedRevision: command.expectedRevision,
            type: "COMMAND" as const,
            origin: command.actorId.startsWith("AI:") ? "AI" as const : "HUMAN" as const,
            command,
          };
    return {
      commandId: command.commandId,
      requestCanonical: canonicalJson(request),
      responseJson: "",
      committedRevision:
        session.receipts[command.commandId]?.committedRevision ??
        command.expectedRevision + 1,
    };
  });
}
async function persistenceState() {
  const saves = await repository.list();
  const current = activeSaveId
    ? (saves.find((s) => s.saveId === activeSaveId) ?? null)
    : null;
  return {
    saveId: activeSaveId,
    durableRevision: current?.revision ?? null,
    savedAt: current?.updatedAt ?? null,
    readOnly,
    recovered,
    recoveredFromGeneration,
    saves,
  };
}
async function decorate(
  base: Response,
  archive: Uint8Array | null = null,
): Promise<Response> {
  return { ...base, persistence: await persistenceState(), archive };
}
async function restoreSave(saveId: string): Promise<void> {
  const loaded = await repository.load(saveId);
  if (!loaded) throw new Error("Save not found.");
  controller = makeController(sessionFormat(loaded.session));
  restoreController(controller, loaded.session, loaded.rosterPack ?? null);
  applyWorldCopy(controller, loaded.worldCopy ?? null);
  activeWorldCopy = loaded.worldCopy ?? null;
  activeRosterPack = loaded.rosterPack ?? null;
  recovered = loaded.recovered;
  recoveredFromGeneration = loaded.recoveredFromGeneration;
  let targetId = saveId;
  if (loaded.recovered) {
    // Preserve the damaged source untouched. Continuing occurs in a fresh recovered slot.
    const session = controller.snapshot()!;
    targetId = `recovered-${randomHex(10)}`;
    if (!(await repository.acquireLease(targetId, ownerId, nowMs())))
      throw new Error("Recovered save could not acquire a writer lease.");
    await repository.commit({
      saveId: targetId,
      kind: "MANUAL",
      title: `${loaded.summary.title} (Recovered)`,
      expectedRevision: null,
      session,
      revision: session.revision,
      events: session.events,
      command: null,
      historyCommands: await repository.historyCommands(
        saveId,
        session.revision,
      ),
      metadata: metadata(session, activeWorldCopy),
      worldCopy: activeWorldCopy,
      rosterPack: activeRosterPack,
      ownerId,
      now: nowMs(),
      updatedAt: nowIso(),
    });
  }
  if (targetId === saveId)
    readOnly = !(await repository.acquireLease(targetId, ownerId, nowMs()));
  else readOnly = false;
  activeSaveId = targetId;
  await repository.setActiveSaveId(targetId);
}
async function initialise(): Promise<void> {
  if (initialised) return;
  initialised = true;
  const saveId = await repository.activeSaveId();
  if (!saveId) return;
  try {
    await restoreSave(saveId);
  } catch {
    // Keep the catalogue usable when the active pointer is stale/corrupt beyond recovery.
    activeSaveId = null;
    activeWorldCopy = null;
    activeRosterPack = null;
    readOnly = false;
    controller = makeController();
    await repository.setActiveSaveId(null);
  }
}
async function rollback(error: unknown, requestId: string): Promise<Response> {
  const message =
    error instanceof Error ? error.message : "Durable save failed.";
  if (activeSaveId) {
    try {
      const loaded = await repository.load(activeSaveId);
      if (loaded) {
        controller = makeController(sessionFormat(loaded.session));
        restoreController(controller, loaded.session, loaded.rosterPack ?? null);
        applyWorldCopy(controller, loaded.worldCopy ?? null);
        activeWorldCopy = loaded.worldCopy ?? null;
        activeRosterPack = loaded.rosterPack ?? null;
      }
    } catch {
      /* leave current controller only if durable recovery itself is unavailable */
    }
  }
  return decorate(
    controller.currentResponse(requestId, `Save failed. ${message}`),
  );
}
async function commitCandidate(
  request: Extract<Request, { type: "START" | "COMMAND" }>,
  response: Response,
): Promise<Response> {
  const session = controller.snapshot();
  if (!session || response.error) return decorate(response);
  if (request.type === "START") {
    activeWorldCopy = request.careerFixture?.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V2" ? request.careerFixture.worldCopy : request.worldCopy ?? null;
    activeRosterPack = request.rosterPack ?? null;
    activeSaveId = `auto:${session.setup.gameId}`;
    readOnly = !(await repository.acquireLease(activeSaveId, ownerId, nowMs()));
    if (readOnly)
      return rollback(
        new Error("A writer lease could not be acquired for the new game."),
        request.requestId,
      );
  } else {
    if (!activeSaveId)
      return rollback(
        new Error("No active durable save exists."),
        request.requestId,
      );
    if (
      readOnly ||
      !(await repository.renewLease(activeSaveId, ownerId, nowMs()))
    ) {
      readOnly = true;
      return rollback(
        new Error("This save is open read-only in this tab."),
        request.requestId,
      );
    }
  }
  const saveId = activeSaveId!;
  try {
    const summary = await repository.commit({
      saveId,
      kind: "AUTO",
      title: defaultTitle(session, activeWorldCopy),
      expectedRevision:
        request.type === "START" ? null : request.expectedRevision,
      session,
      revision: session.revision,
      events: session.events,
      command: {
        commandId:
          request.type === "COMMAND"
            ? request.command.commandId
            : request.requestId,
        requestCanonical: canonicalJson(request),
        responseJson: canonicalJson(response),
        committedRevision: session.revision,
      },
      metadata: metadata(session, activeWorldCopy),
      worldCopy: activeWorldCopy,
      rosterPack: activeRosterPack,
      ownerId,
      now: nowMs(),
      updatedAt: nowIso(),
    });
    await repository.setActiveSaveId(saveId);
    recovered = false;
    recoveredFromGeneration = null;
    return {
      ...response,
      persistence: {
        saveId,
        durableRevision: summary.revision,
        savedAt: summary.updatedAt,
        readOnly,
        recovered,
        recoveredFromGeneration,
        saves: await repository.list(),
      },
      archive: null,
      ...(session.receipts[request.requestId] ? { acknowledgement: session.receipts[request.requestId] } : {}),
    };
  } catch (error) {
    if (request.type === "START") {
      const failedSaveId = activeSaveId;
      if (failedSaveId) {
        try {
          await repository.releaseLease(failedSaveId, ownerId);
        } catch {
          /* best effort */
        }
        try {
          await repository.delete(failedSaveId);
        } catch {
          /* no durable row may exist */
        }
      }
      activeSaveId = null;
      activeWorldCopy = null;
      activeRosterPack = null;
      readOnly = false;
      controller = makeController();
      await repository.setActiveSaveId(null);
      const message =
        error instanceof Error ? error.message : "Durable save failed.";
      return decorate(
        controller.currentResponse(
          request.requestId,
          `Save failed. ${message}`,
        ),
      );
    }
    return rollback(error, request.requestId);
  }
}
async function handlePersistence(request: Request): Promise<Response | null> {
  if (request.type === "LIST_SAVES")
    return decorate(controller.currentResponse(request.requestId));
  if (request.type === "MANUAL_SAVE") {
    if (!activeSaveId || !controller.snapshot())
      return decorate(
        controller.currentResponse(
          request.requestId,
          "Start or load a match before creating a manual save.",
        ),
      );
    const target = `manual-${randomHex(10)}`;
    try {
      await repository.cloneSave(
        activeSaveId,
        target,
        "MANUAL",
        request.title.trim(),
        ownerId,
        nowMs(),
        nowIso(),
      );
      await repository.releaseLease(target, ownerId);
      await repository.setActiveSaveId(activeSaveId);
      return decorate(controller.currentResponse(request.requestId));
    } catch (e) {
      return decorate(
        controller.currentResponse(
          request.requestId,
          e instanceof Error ? e.message : "Manual save failed.",
        ),
      );
    }
  }
  if (request.type === "LOAD_SAVE") {
    if (activeSaveId && !readOnly)
      await repository.releaseLease(activeSaveId, ownerId);
    try {
      await restoreSave(request.saveId);
      return decorate(controller.currentResponse(request.requestId));
    } catch (e) {
      return decorate(
        controller.currentResponse(
          request.requestId,
          e instanceof Error ? e.message : "Load failed.",
        ),
      );
    }
  }
  if (request.type === "DELETE_SAVE") {
    try {
      if (request.saveId === activeSaveId) {
        if (!readOnly) await repository.releaseLease(request.saveId, ownerId);
        await repository.delete(request.saveId);
        activeSaveId = null;
        activeWorldCopy = null;
      activeRosterPack = null;
        readOnly = false;
        recovered = false;
        recoveredFromGeneration = null;
        controller = makeController();
      } else await repository.delete(request.saveId);
      return decorate(controller.currentResponse(request.requestId));
    } catch (e) {
      return decorate(
        controller.currentResponse(
          request.requestId,
          e instanceof Error ? e.message : "Delete failed.",
        ),
      );
    }
  }
  if (request.type === "EXPORT_SAVE") {
    const saveId = request.saveId ?? activeSaveId;
    if (!saveId)
      return decorate(
        controller.currentResponse(
          request.requestId,
          "Choose a save to export.",
        ),
      );
    try {
      const loaded = await repository.load(saveId);
      if (!loaded) throw new Error("Save not found.");
      const fmt = sessionFormat(loaded.session);
      const archivePins = loaded.rosterPack ? rosterPins(loaded.session as RosterT20Session | RosterODISession | RosterRed5Session) : fmt === "ODI" ? ODI_ARCHIVE_PINS : fmt === "RED_BALL" ? RED5_ARCHIVE_PINS : ARCHIVE_PINS;
      const archive = await createPortableArchive(
        loaded.session,
        loaded.summary,
        archivePins,
        nowIso(),
        loaded.worldCopy ?? null,
        loaded.rosterPack ?? null,
      );
      return decorate(controller.currentResponse(request.requestId), archive);
    } catch (e) {
      return decorate(
        controller.currentResponse(
          request.requestId,
          e instanceof Error ? e.message : "Export failed.",
        ),
      );
    }
  }
  if (request.type === "IMPORT_SAVE") {
    try {
      const imported = await readPortableArchive(request.archive, [
        ARCHIVE_PINS,
        ROSTER_ARCHIVE_POLICY,
        ROSTER_ODI_ARCHIVE_POLICY,
        ROSTER_RED5_ARCHIVE_POLICY,
        ODI_ARCHIVE_PINS,
  RED5_ARCHIVE_PINS,
      ]);
      const validationController = makeController(
        sessionFormat(imported.session),
      );
      restoreController(validationController, imported.session, imported.rosterPack);
      applyWorldCopy(validationController, imported.worldCopy);
      const session = validationController.snapshot()!;
      const target = `import-${randomHex(10)}`;
      if (!(await repository.acquireLease(target, ownerId, nowMs())))
        throw new Error("Imported save slot is locked.");
      await repository.commit({
        saveId: target,
        kind: "IMPORTED",
        title: `${imported.summary.title} (Imported)`,
        expectedRevision: null,
        session,
        revision: session.revision,
        events: session.events,
        command: null,
        historyCommands: durableHistoryFromSession(session),
        metadata: metadata(session, imported.worldCopy),
        worldCopy: imported.worldCopy,
        rosterPack: imported.rosterPack,
        ownerId,
        now: nowMs(),
        updatedAt: nowIso(),
      });
      if (activeSaveId && !readOnly)
        await repository.releaseLease(activeSaveId, ownerId);
      activeSaveId = target;
      activeWorldCopy = imported.worldCopy;
      activeRosterPack = imported.rosterPack;
      readOnly = false;
      recovered = false;
      recoveredFromGeneration = null;
      controller = validationController;
      await repository.setActiveSaveId(target);
      return decorate(controller.currentResponse(request.requestId));
    } catch (e) {
      return decorate(
        controller.currentResponse(
          request.requestId,
          e instanceof Error ? e.message : "Import rejected.",
        ),
      );
    }
  }
  return null;
}

async function handle(raw: unknown): Promise<Response> {
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    await initialise();
    return decorate(controller.handle(raw));
  }
  const request = parsed.data;
  await initialise();
  if (request.type === "BOOT" && request.careerFixture) {
    const current = controller.snapshot();
    const matchesCareerFixture =
      current?.setup.gameId === request.careerFixture.matchGameId &&
      current?.setup.matchId === request.careerFixture.matchId;
    const requestedCopy = request.careerFixture.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V2" ? request.careerFixture.worldCopy : null;
    const requestedRoster = request.careerFixture.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER" ? request.careerFixture.rosterPack : null;
    if (matchesCareerFixture && canonicalJson(requestedCopy) !== canonicalJson(activeWorldCopy)) {
      return decorate(controller.currentResponse(request.requestId, "The saved match belongs to a different world copy."));
    }
    if (matchesCareerFixture && canonicalJson(requestedRoster) !== canonicalJson(activeRosterPack)) {
      return decorate(controller.currentResponse(request.requestId, "The saved match belongs to a different roster."));
    }
    if (!matchesCareerFixture) {
      if (activeSaveId && !readOnly) {
        try { await repository.releaseLease(activeSaveId, ownerId); } catch { /* best effort */ }
      }
      activeSaveId = null;
      activeWorldCopy = null;
      activeRosterPack = null;
      readOnly = false;
      recovered = false;
      recoveredFromGeneration = null;
      controller = makeController("T20");
      await repository.setActiveSaveId(null);
    }
  } else if (request.type === "BOOT" && request.fresh) {
    if (activeSaveId && !readOnly) {
      try { await repository.releaseLease(activeSaveId, ownerId); } catch { /* best effort */ }
    }
    activeSaveId = null;
    activeWorldCopy = null;
    activeRosterPack = null;
    readOnly = false;
    recovered = false;
    recoveredFromGeneration = null;
    controller = makeController();
    await repository.setActiveSaveId(null);
  }
  const persistenceResponse = await handlePersistence(request);
  if (persistenceResponse) return persistenceResponse;
  if (request.type === "AI_STEP") {
    const session = controller.snapshot();
    if (!session || session.setup.format !== "T20")
      return decorate(controller.currentResponse(request.requestId, "AI decisions require an active T20 match."));
    if (request.expectedRevision !== session.revision)
      return decorate(controller.currentResponse(request.requestId, "Stale AI decision revision."));
    if (readOnly || !activeSaveId)
      return decorate(controller.currentResponse(request.requestId, "AI decision requires a writable durable save."));
    const command = proposeOpponentT20Command(session as T20Session, request.teamId);
    if (!command) return decorate(controller.currentResponse(request.requestId));
    // AI chooses a legal *engine* command through a public view. It receives no seed/future draws.
    // Every AI command is individually committed through the same atomic path as a human command.
    const aiRequest: Extract<Request, { type: "COMMAND" }> = {
      version: UI_VERSION, type: "COMMAND", origin: "AI", requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      command: { ...command, commandId: request.requestId, expectedRevision: request.expectedRevision },
    };
    const prior = await repository.command(activeSaveId, request.requestId);
    if (prior) return decorate(controller.currentResponse(request.requestId));
    const response = controller.handle(aiRequest);
    return commitCandidate(aiRequest, response);
  }
  // UI-originated COMMANDs cannot masquerade as the AI decision authority.
  if (request.type === "COMMAND" && request.origin !== "HUMAN")
    return decorate(controller.currentResponse(request.requestId, "AI commands must be generated inside the worker."));
  if (request.type === "BOOT") return decorate(controller.handle(request));
  if (request.type === "START" && !controller.snapshot())
    controller = makeController(request.format);
  if (request.type === "COMMAND" && activeSaveId) {
    const prior = await repository.command(
      activeSaveId,
      request.command.commandId,
    );
    if (prior) {
      if (prior.requestCanonical !== canonicalJson(request))
        return decorate(
          controller.currentResponse(
            request.requestId,
            "Request ID already used with different content.",
          ),
        );
      const response = decorate(controller.currentResponse(request.requestId));
      const acknowledgement = controller.snapshot()?.receipts[request.command.commandId];
      if (!acknowledgement) return decorate(controller.currentResponse(request.requestId, "The saved command receipt is unavailable."));
      return { ...response, acknowledgement };
    }
  }
  if ((request.type === "START" || request.type === "COMMAND") && readOnly)
    return decorate(
      controller.currentResponse(
        request.requestId,
        "This save is read-only because another tab owns the writer lease.",
      ),
    );
  const response = controller.handle(request);
  if (request.type === "START" || request.type === "COMMAND")
    return commitCandidate(request, response);
  return decorate(response);
}

let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<unknown>) => {
  const raw = event.data;
  queue = queue.then(async () => {
    try {
      self.postMessage(await handle(raw));
    } catch (e) {
      const requestId =
        raw && typeof raw === "object" && "requestId" in raw
          ? String((raw as Record<string, unknown>).requestId)
          : "invalid";
      self.postMessage(
        await decorate(
          controller.currentResponse(
            requestId,
            e instanceof Error ? e.message : "Unexpected persistence failure.",
          ),
        ),
      );
    }
  });
};
setInterval(() => {
  if (activeSaveId && !readOnly)
    void repository
      .renewLease(activeSaveId, ownerId, nowMs())
      .then((ok) => {
        if (!ok) readOnly = true;
      })
      .catch(() => {
        readOnly = true;
      });
}, 4_000);
