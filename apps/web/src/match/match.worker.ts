import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import manifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import { canonicalJson, delegationForTeam, type DelegationJournal, type NewGameWorldCopy, type StagedRosterPack } from "@lcxxvi/contracts";
import { createMatchAnalyticsAccumulator } from "@lcxxvi/projections";
import type { T20Session, ODISession, Red5Session, RosterT20Session, RosterODISession, RosterRed5Session } from "@lcxxvi/simulation";
import {
  IndexedDbSaveRepository,
  createManagedMatchBindings,
  createPortableArchive,
  readPortableArchive,
  type ManagedBinding,
} from "@lcxxvi/persistence";
import { createMatchController } from "./controller.js";
import { createDiagnostic, type DiagnosticFailure, type DiagnosticPreview } from "./diagnostic-export.js";
import { proposeOpponentT20Command } from "./ai-opponent.js";
import { createODIMatchController } from "./controller-odi.js";
import { createRed5MatchController } from "./controller-red5.js";
import {
  ARCHIVE_PINS,
  ODI_ARCHIVE_PINS,
  RED5_ARCHIVE_PINS,
  CareerFixtureLaunchSchema,
  RequestSchema,
  UI_VERSION,
  PINS,
  type CareerFixtureLaunch,
  type ManagedStatus,
  type Request,
  type Response,
} from "./protocol.js";

const worldBytes = new TextEncoder().encode(worldText);
const repository = new IndexedDbSaveRepository();
const bindings = createManagedMatchBindings(() => new Date().toISOString());
let recoverSerial = 900_000_000;
const ownerId = self.name || `tab-${randomHex(16)}`;
let activeSaveId: string | null = null;
let activeWorldCopy: NewGameWorldCopy | null = null;
let activeRosterPack: StagedRosterPack | null = null;
let readOnly = false;
let recovered = false;
let recoveredFromGeneration: number | null = null;
const emptyDelegation = (): DelegationJournal => ({ version: "LC_DELEGATION_JOURNAL_V1", changes: [] });
let delegation = emptyDelegation();
type AnySession = T20Session | ODISession | Red5Session;
type MatchController =
  | ReturnType<typeof createMatchController>
  | ReturnType<typeof createODIMatchController>
  | ReturnType<typeof createRed5MatchController>;
let controller: MatchController = makeController();
let initialised = false;
/** Why the last attempt to re-associate a restored match with its career failed, if it did. */
let bindNote: string | null = null;
let activeAnalyticsRebuild: { requestId: string; revision: number; cancelled: boolean } | null = null;
let lastFailure: DiagnosticFailure | null = null;
let diagnostic: { preview: DiagnosticPreview; bytes: Uint8Array; gameId: string | null; eventHash: string | null } | null = null;

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
function boundFixture(): CareerFixtureLaunch | null {
  const bound = (controller as { boundFixture?: () => CareerFixtureLaunch | null }).boundFixture;
  return bound ? bound() : null;
}
async function managedStatusFor(gameId: string): Promise<ManagedStatus | null> {
  try {
    return (await bindings.get(gameId))?.status ?? null;
  } catch {
    return null;
  }
}
async function decorate(
  base: Response,
  archive: Uint8Array | null = null,
): Promise<Response> {
  const fixture = boundFixture();
  return {
    ...base,
    persistence: await persistenceState(),
    archive,
    delegation,
    ...(fixture ? { managedStatus: await managedStatusFor(fixture.matchGameId) } : {}),
  };
}
/** The binding applies only to the managed match lineage, never to manual copies or imports. */
function bindableSave(gameId: string): boolean {
  return activeSaveId === `auto:${gameId}` || (activeSaveId?.startsWith("recovered-") ?? false);
}
/** A pending binding for the restored match, or null. A damaged record is reported, not used. */
async function pendingBindingFor(gameId: string): Promise<{ binding: ManagedBinding | null; problem: string | null }> {
  try {
    const binding = await bindings.get(gameId);
    return { binding: binding && binding.status === "PENDING" ? binding : null, problem: null };
  } catch (error) {
    return { binding: null, problem: error instanceof Error ? error.message : "The career binding could not be read." };
  }
}
/**
 * Re-associates the restored match with its career fixture using the durable binding.
 * It validates identity, then reuses the controller's own BOOT binding check; it never resets state.
 */
async function rebindManaged(): Promise<string | null> {
  const session = controller.snapshot();
  if (!session || boundFixture() || !("boundFixture" in controller)) return null;
  const gameId = String(session.setup.gameId);
  if (!bindableSave(gameId)) return null;
  const { binding, problem } = await pendingBindingFor(gameId);
  if (problem) return problem;
  if (!binding) return null;
  const parsed = CareerFixtureLaunchSchema.safeParse(binding.launch);
  if (!parsed.success) return "The saved career binding is not a valid launch and was preserved.";
  const launch = parsed.data;
  if (
    launch.matchGameId !== binding.matchGameId || launch.matchId !== binding.matchId || launch.fixtureId !== binding.fixtureId ||
    launch.saveId !== binding.careerSaveId || launch.seasonId !== binding.seasonId ||
    launch.scheduleSha256 !== binding.scheduleSha256 || launch.careerStateSha256 !== binding.careerStateSha256
  ) return "The saved career binding does not match its launch and was preserved.";
  if (launch.matchGameId !== gameId || launch.matchId !== String(session.setup.matchId)) return "The saved match does not belong to the career fixture.";
  const requestedCopy = launch.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V2" ? launch.worldCopy : null;
  const requestedRoster = launch.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER" ? launch.rosterPack : null;
  if (canonicalJson(requestedCopy) !== canonicalJson(activeWorldCopy)) return "The saved match belongs to a different world copy.";
  if (canonicalJson(requestedRoster) !== canonicalJson(activeRosterPack)) return "The saved match belongs to a different roster.";
  const result = (controller as ReturnType<typeof createMatchController>).handle({
    version: UI_VERSION,
    type: "BOOT",
    requestId: `ui-${++recoverSerial}`,
    expectedRevision: 0,
    careerFixture: launch,
  });
  return result.error;
}
/** The highest ui-N id already committed, so a reloaded page never reuses one whatever it consumed before. */
function commandIdFloor(): number {
  const session = controller.snapshot();
  if (!session) return 0;
  let floor = 0;
  for (const command of session.commands) {
    const n = Number(/^ui-(\d+)$/.exec(command.commandId)?.[1] ?? 0);
    if (n < 800_000_000 && n > floor) floor = n;
  }
  return floor;
}
function withLaunch(response: Response): Response {
  const fixture = boundFixture();
  const withFloor = { ...response, commandIdFloor: commandIdFloor() };
  if (fixture) return { ...withFloor, careerFixture: fixture };
  return { ...withFloor, careerFixture: null, error: response.error ?? bindNote };
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
  delegation = loaded.delegationJournal ?? emptyDelegation();
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
      ...(loaded.delegationJournal ? { delegationJournal: loaded.delegationJournal } : {}),
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
  bindNote = await rebindManaged();
}
async function initialise(): Promise<void> {
  if (initialised) return;
  initialised = true;
  const saveId = await repository.activeSaveId();
  if (!saveId) return;
  try {
    await restoreSave(saveId);
  } catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message) ? error.message : null;
    lastFailure = { requestType: "RECOVERY", sequence: null, invariantCode: code, command: null };
    diagnostic = null;
    // Keep the catalogue usable when the active pointer is stale/corrupt beyond recovery.
    activeSaveId = null;
    activeWorldCopy = null;
    activeRosterPack = null;
    delegation = emptyDelegation();
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
        delegation = loaded.delegationJournal ?? emptyDelegation();
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
    const candidateId = `auto:${session.setup.gameId}`;
    // Never replace an existing save by starting a new match over it. The controller already holds
    // the rejected session, so it is discarded; the previous active save and its pointer are untouched.
    if ((await repository.list()).some((save) => save.saveId === candidateId)) {
      controller = makeController(request.format);
      if (activeSaveId) {
        try {
          const kept = await repository.load(activeSaveId);
          if (kept) {
            controller = makeController(sessionFormat(kept.session));
            restoreController(controller, kept.session, kept.rosterPack ?? null);
            applyWorldCopy(controller, kept.worldCopy ?? null);
            bindNote = await rebindManaged();
          }
        } catch { /* keep the empty controller */ }
      }
      return decorate(controller.currentResponse(request.requestId, "SAVE_ALREADY_EXISTS: a saved match already exists for this game. Resume it instead of starting it again."));
    }
    activeWorldCopy = request.careerFixture?.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V2" ? request.careerFixture.worldCopy : request.worldCopy ?? null;
    activeRosterPack = request.rosterPack ?? null;
    activeSaveId = candidateId;
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
    if (request.type === "START") delegation = emptyDelegation();
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
      delegation,
      ...(session.receipts[request.requestId] ? { acknowledgement: session.receipts[request.requestId] } : {}),
    };
  } catch (error) {
    const alreadyExisted = error instanceof Error && error.message.startsWith("SAVE_ALREADY_EXISTS");
    if (request.type === "START" && !alreadyExisted) {
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
      delegation = emptyDelegation();
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
        delegation = emptyDelegation();
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
      const delegation = loaded.delegationJournal;
      const archivePins = loaded.rosterPack ? rosterPins(loaded.session as RosterT20Session | RosterODISession | RosterRed5Session) : fmt === "ODI" ? ODI_ARCHIVE_PINS : fmt === "RED_BALL" ? RED5_ARCHIVE_PINS : ARCHIVE_PINS;
      const archive = await createPortableArchive(
        loaded.session,
        loaded.summary,
        archivePins,
        nowIso(),
        loaded.worldCopy ?? null,
        loaded.rosterPack ?? null,
        delegation?.changes.length ? delegation : null,
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
        ...(imported.delegationJournal ? { delegationJournal: imported.delegationJournal } : {}),
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
      delegation = imported.delegationJournal ?? emptyDelegation();
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

async function handleInner(raw: unknown): Promise<Response> {
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    await initialise();
    return decorate(controller.handle(raw));
  }
  const request = parsed.data;
  await initialise();
  if (request.type === "RECOVER_MANAGED") {
    if (!controller.snapshot()) {
      // No active match. Resume a pending career match only when there is exactly one to resume.
      const { bindings: pending } = await bindings.list();
      const saves = await repository.list();
      const resumable = pending.filter((b) => b.status === "PENDING" && saves.some((save) => save.saveId === `auto:${b.matchGameId}`));
      if (resumable.length === 1) {
        try { await restoreSave(`auto:${resumable[0]!.matchGameId}`); }
        catch (error) { return decorate(controller.currentResponse(request.requestId, `The saved career match could not be resumed. ${error instanceof Error ? error.message : ""}`.trim())); }
      } else if (resumable.length > 1) {
        return decorate(controller.currentResponse(request.requestId, "More than one career match is in progress. Resume the one you want from the career screen."));
      }
    } else {
      bindNote = (await rebindManaged()) ?? bindNote;
    }
    return decorate(controller.currentResponse(request.requestId, boundFixture() ? null : bindNote));
  }
  if (request.type === "ABANDON_MANAGED") {
    const session = controller.snapshot();
    if (!session) return decorate(controller.currentResponse(request.requestId, "There is no active match."));
    try {
      const gameId = String(session.setup.gameId);
      const binding = await bindings.get(gameId);
      if (binding && binding.status === "PENDING") await bindings.resolve(gameId, "ABANDONED", "ABANDONED_BY_PLAYER");
    } catch (error) {
      return decorate(controller.currentResponse(request.requestId, error instanceof Error ? error.message : "The career match could not be abandoned."));
    }
    return decorate(controller.currentResponse(request.requestId));
  }
  if (request.type === "RETRY_WRITER") {
    if (!activeSaveId || !readOnly) return decorate(controller.currentResponse(request.requestId));
    try {
      // restoreSave takes the lease only when it is free or already ours, so a live lease held by
      // another tab is never taken over; it then reloads the latest durable checkpoint.
      await restoreSave(activeSaveId);
    } catch (error) {
      return decorate(controller.currentResponse(request.requestId, error instanceof Error ? error.message : "The writer lease could not be retaken."));
    }
    return decorate(controller.currentResponse(request.requestId, readOnly ? "Another tab still holds this match. Close it, then try again." : null));
  }
  if (request.type === "RELEASE_WRITER") {
    if (activeSaveId && !readOnly) {
      try { await repository.releaseLease(activeSaveId, ownerId); } catch { /* best effort */ }
      readOnly = true;
    }
    return decorate(controller.currentResponse(request.requestId));
  }
  if (request.type === "CANCEL_ANALYTICS") return decorate(controller.currentResponse(request.requestId));
  if (request.type === "REBUILD_ANALYTICS") {
    const session = controller.snapshot();
    if (!session || session.core.phase !== "COMPLETE") return decorate(controller.currentResponse(request.requestId, "Complete the match before rebuilding analytics."));
    if (request.expectedRevision !== session.revision) return decorate(controller.currentResponse(request.requestId, "Stale match revision."));
    const task = { requestId: request.requestId, revision: session.revision, cancelled: false };
    activeAnalyticsRebuild = task;
    const accumulator = createMatchAnalyticsAccumulator(session.setup.format === "RED_BALL" ? 4 : 2);
    try {
      // Yield to the event loop by time budget rather than a fixed delay per batch, so a long red-ball match
      // rebuilds as fast as the machine allows while a cancel message is still seen within one slice.
      let sliceStart = performance.now();
      for (let offset = 0; offset < session.events.length; offset += 32) {
        for (const event of session.events.slice(offset, offset + 32)) accumulator.append(event);
        if (performance.now() - sliceStart < 12 && offset + 32 < session.events.length) continue;
        self.postMessage({ type: "ANALYTICS_PROGRESS", version: UI_VERSION, pins: PINS, requestId: request.requestId, applied: accumulator.appliedSequence, total: session.events.length });
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        sliceStart = performance.now();
        if (task.cancelled) return { ...await decorate(controller.currentResponse(request.requestId)), analyticsRebuild: { state: "CANCELLED", applied: accumulator.appliedSequence, total: session.events.length } };
      }
      const response = await decorate(controller.currentResponse(request.requestId));
      if (!response.view?.scorecard || !response.view.analytics || canonicalJson(accumulator.snapshot(response.view.scorecard)) !== canonicalJson(response.view.analytics)) throw new Error("Analytics rebuild does not match the incremental result.");
      return { ...response, analyticsRebuild: { state: "COMPLETE", applied: accumulator.appliedSequence, total: session.events.length } };
    } finally { if (activeAnalyticsRebuild === task) activeAnalyticsRebuild = null; }
  }
  if (request.type === "PREVIEW_DIAGNOSTIC") {
    const session = controller.snapshot();
    const result = await createDiagnostic(session, lastFailure, request.includeSeed ?? false);
    diagnostic = { ...result, gameId: session?.setup.gameId ?? null, eventHash: session?.lastEventHash ?? null };
    return { ...await decorate(controller.currentResponse(request.requestId)), diagnosticPreview: result.preview };
  }
  if (request.type === "EXPORT_DIAGNOSTIC") {
    const session = controller.snapshot();
    if (!diagnostic || request.sha256 !== diagnostic.preview.sha256 || diagnostic.gameId !== (session?.setup.gameId ?? null) || diagnostic.eventHash !== (session?.lastEventHash ?? null) || diagnostic.preview.revision !== (session?.revision ?? null)) return decorate(controller.currentResponse(request.requestId, "Preview the diagnostic again before downloading."));
    return { ...await decorate(controller.currentResponse(request.requestId)), diagnosticBytes: diagnostic.bytes };
  }
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
      const existingId = `auto:${request.careerFixture.matchGameId}`;
      const existing = (await repository.list()).some((save) => save.saveId === existingId);
      const activePending = current ? (await pendingBindingFor(String(current.setup.gameId))).binding : null;
      if (activePending && !existing) {
        return decorate(controller.currentResponse(request.requestId, "Another career match is still in progress. Return to it or abandon it first."));
      }
      if (activeSaveId && !readOnly) {
        try { await repository.releaseLease(activeSaveId, ownerId); } catch { /* best effort */ }
      }
      if (existing) {
        // The fixture already has a durable match. Resume it; never start it again over the top.
        try {
          await restoreSave(existingId);
        } catch (error) {
          activeSaveId = null;
          activeWorldCopy = null;
          activeRosterPack = null;
          controller = makeController("T20");
          return decorate(controller.currentResponse(request.requestId, `The saved match for this fixture could not be resumed. ${error instanceof Error ? error.message : ""}`.trim()));
        }
      } else {
        activeSaveId = null;
        activeWorldCopy = null;
        activeRosterPack = null;
        delegation = emptyDelegation();
        readOnly = false;
        recovered = false;
        recoveredFromGeneration = null;
        controller = makeController("T20");
        await repository.setActiveSaveId(null);
      }
    }
  } else if (request.type === "BOOT" && request.fresh) {
    const active = controller.snapshot();
    if (active) {
      const { binding } = await pendingBindingFor(String(active.setup.gameId));
      if (binding) {
        return decorate(controller.currentResponse(request.requestId, "This match is linked to a career fixture. Finish it, or abandon the career match first."));
      }
    }
    if (activeSaveId && !readOnly) {
      try { await repository.releaseLease(activeSaveId, ownerId); } catch { /* best effort */ }
    }
    activeSaveId = null;
    activeWorldCopy = null;
    activeRosterPack = null;
    delegation = emptyDelegation();
    readOnly = false;
    recovered = false;
    recoveredFromGeneration = null;
    controller = makeController();
    await repository.setActiveSaveId(null);
  }
  const persistenceResponse = await handlePersistence(request);
  if (persistenceResponse) return persistenceResponse;
  if (request.type === "SET_DELEGATION") {
    const session = controller.snapshot();
    if (!session || session.setup.format !== "T20") return decorate(controller.currentResponse(request.requestId, "Delegation requires an active T20 match."));
    if (!session.setup.teams.some(team => team.teamId === request.teamId)) return decorate(controller.currentResponse(request.requestId, "Unknown delegation team."));
    if (request.expectedRevision !== session.revision) return decorate(controller.currentResponse(request.requestId, "Stale match revision."));
    if (readOnly || !activeSaveId || !(await repository.renewLease(activeSaveId, ownerId, nowMs()))) return decorate(controller.currentResponse(request.requestId, "Delegation requires a writable durable save."));
    delegation = await repository.appendDelegation(activeSaveId, ownerId, nowMs(), { commandId: request.requestId, expectedRevision: request.expectedDelegationRevision, matchRevision: session.revision, teamId: request.teamId, categories: request.categories });
    return decorate(controller.currentResponse(request.requestId));
  }
  if (request.type === "AI_STEP") {
    const session = controller.snapshot();
    if (!session || session.setup.format !== "T20")
      return decorate(controller.currentResponse(request.requestId, "AI decisions require an active T20 match."));
    if (request.expectedRevision !== session.revision)
      return decorate(controller.currentResponse(request.requestId, "Stale AI decision revision."));
    if (readOnly || !activeSaveId)
      return decorate(controller.currentResponse(request.requestId, "AI decision requires a writable durable save."));
    const command = proposeOpponentT20Command(session as T20Session, request.teamId, request.delegated ? delegationForTeam(delegation, request.teamId) : undefined);
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
      const response = await decorate(controller.currentResponse(request.requestId));
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

const LAUNCH_REPLY_TYPES = new Set(["BOOT", "RECOVER_MANAGED", "LOAD_SAVE", "RETRY_WRITER"]);
async function handle(raw: unknown): Promise<Response> {
  const response = await handleInner(raw);
  const type = raw && typeof raw === "object" ? (raw as { type?: unknown }).type : undefined;
  return typeof type === "string" && LAUNCH_REPLY_TYPES.has(type) ? withLaunch(response) : response;
}

let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<unknown>) => {
  const raw = event.data;
  const parsed = RequestSchema.safeParse(raw);
  if (parsed.success && parsed.data.type === "CANCEL_ANALYTICS") {
    if (activeAnalyticsRebuild?.requestId === parsed.data.targetRequestId && activeAnalyticsRebuild.revision === parsed.data.expectedRevision) activeAnalyticsRebuild.cancelled = true;
    return;
  }
  queue = queue.then(async () => {
    try {
      const response = await handle(raw);
      const parsed = RequestSchema.safeParse(raw);
      if (response.error && parsed.success && !["PREVIEW_DIAGNOSTIC", "EXPORT_DIAGNOSTIC"].includes(parsed.data.type)) {
        const session = controller.snapshot();
        lastFailure = { requestType: parsed.data.type, sequence: session ? session.events.length + 1 : null,
          invariantCode: /^[A-Z][A-Z0-9_]{2,80}$/.test(response.error) ? response.error : null,
          command: parsed.data.type === "COMMAND" ? parsed.data.command : null };
        diagnostic = null;
      } else if (parsed.success && ["BOOT", "START", "LOAD_SAVE", "IMPORT_SAVE"].includes(parsed.data.type) && !response.error && !(parsed.data.type === "BOOT" && lastFailure?.requestType === "RECOVERY")) { lastFailure = null; diagnostic = null; }
      self.postMessage(response);
    } catch (e) {
      const failed = RequestSchema.safeParse(raw);
      if (failed.success && !["PREVIEW_DIAGNOSTIC", "EXPORT_DIAGNOSTIC"].includes(failed.data.type)) {
        const session = controller.snapshot();
        const code = e instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(e.message) ? e.message : null;
        lastFailure = { requestType: failed.data.type, sequence: session ? session.events.length + 1 : null,
          invariantCode: code, command: failed.data.type === "COMMAND" ? failed.data.command : null };
        diagnostic = null;
      }
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
