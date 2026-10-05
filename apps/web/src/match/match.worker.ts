import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import manifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import { canonicalJson } from "@lcxxvi/contracts";
import type { T20Session, ODISession, Red5Session } from "@lcxxvi/simulation";
import {
  IndexedDbSaveRepository,
  createPortableArchive,
  readPortableArchive,
} from "@lcxxvi/persistence";
import { createMatchController } from "./controller.js";
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
function metadata(session: AnySession) {
  return {
    matchGameId: String(session.setup.gameId),
    matchId: String(session.setup.matchId),
    teams: [
      String(session.setup.teams[0].name),
      String(session.setup.teams[1].name),
    ] as [string, string],
    ground: String(session.setup.ground.name),
    phase: String(session.core.phase),
    completed: session.core.phase === "COMPLETE",
  };
}
function defaultTitle(session: AnySession): string {
  return `${session.setup.teams[0].name} v ${session.setup.teams[1].name}`;
}

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
            origin: "HUMAN" as const,
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
  controller.restore(loaded.session);
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
      metadata: metadata(session),
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
        controller.restore(loaded.session);
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
      title: defaultTitle(session),
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
      metadata: metadata(session),
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
      const archivePins = fmt === "ODI" ? ODI_ARCHIVE_PINS : fmt === "RED_BALL" ? RED5_ARCHIVE_PINS : ARCHIVE_PINS;
      const archive = await createPortableArchive(
        loaded.session,
        loaded.summary,
        archivePins,
        nowIso(),
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
        ODI_ARCHIVE_PINS,
  RED5_ARCHIVE_PINS,
      ]);
      const validationController = makeController(
        sessionFormat(imported.session),
      );
      validationController.restore(imported.session);
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
        metadata: metadata(session),
        ownerId,
        now: nowMs(),
        updatedAt: nowIso(),
      });
      if (activeSaveId && !readOnly)
        await repository.releaseLease(activeSaveId, ownerId);
      activeSaveId = target;
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
  await initialise();
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return decorate(controller.handle(raw));
  const request = parsed.data;
  const persistenceResponse = await handlePersistence(request);
  if (persistenceResponse) return persistenceResponse;
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
      return decorate(controller.currentResponse(request.requestId));
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
