import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AudioCueQueueSchema,
  MatchCommentaryFeedSchema,
  WorldPackSchema,
  type DeliveryRecorded,
  type T20Command,
  type T20TeamSelection,
} from "@lcxxvi/contracts";
import { createT20CorpusRequest, runFixtureT20, validateT20MatchSetup } from "@lcxxvi/simulation";
import {
  DEFAULT_AUDIO_PREFERENCES,
  deliveryAudioFactsFromEvent,
  type CommittedCommentarySourceEvent,
  projectMatchAudioCues,
  projectMatchCommentary,
} from "@lcxxvi/projections";
import { CricketAudioManager, type AudioContextPort } from "../../apps/web/src/match/audio-manager.js";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { MOMENT_WEIGHT, type MomentKind } from "../../apps/web/src/match/match-moments.js";
import {
  momentStingDurationMs,
  momentStingMode,
  momentStingTones,
} from "../../apps/web/src/match/moment-sound.js";
import { UI_VERSION } from "../../apps/web/src/match/protocol.js";

/** CP09 (Studio Production Directive 05): match sounds come from the committed delivery record, and moments sting. */

const repoRoot = resolve(import.meta.dirname, "../..");
const worldBytes = new Uint8Array(readFileSync(resolve(repoRoot, "packages/data/worlds/fictional-eight-01.json")));
const manifest = JSON.parse(readFileSync(resolve(repoRoot, "packages/data/worlds/fictional-eight-01.manifest.json"), "utf8"));
const world = WorldPackSchema.parse(JSON.parse(new TextDecoder().decode(worldBytes)));

function selection(teamIndex: number): T20TeamSelection {
  const team = world.teams[teamIndex]!;
  const players = team.squadIds.map((id) => world.players.find((p) => p.playerId === id)!);
  const keeper = players.find((p) => p.role === "KEEPER")!;
  const bowlers = players
    .filter((p) => p.playerId !== keeper.playerId && (p.role === "BOWLER" || p.role === "ALLROUNDER" || p.bowlingStyle !== null))
    .slice(0, 5);
  const rest = players.filter((p) => p.playerId !== keeper.playerId && !bowlers.includes(p));
  const xi = [keeper, ...bowlers, ...rest].slice(0, 11);
  return { teamId: team.teamId, playerIds: xi.map((p) => p.playerId), captainId: xi[0]!.playerId, keeperId: keeper.playerId };
}

type Ctl = ReturnType<typeof createMatchController>;
type View = NonNullable<ReturnType<Ctl["handle"]>["view"]>;

/** Plays one whole T20 through the real controller, over by over. */
function playT20(seed: string): View {
  const ctl = createMatchController(worldBytes, manifest, () => seed);
  let n = 0;
  let expectedRevision = 0;
  const run = (body: Record<string, unknown>, requestId = `ui-${++n}`) => {
    const r = ctl.handle({ version: UI_VERSION, requestId, expectedRevision, ...body } as never);
    expect(r.error).toBeNull();
    expectedRevision = r.revision;
    return r;
  };
  let view = run({ type: "START", format: "T20", selections: [selection(0), selection(1)], groundId: world.grounds[0]!.groundId }).view!;
  const act = (command: Omit<T20Command, "commandId" | "expectedRevision">) => {
    const id = `ui-${++n}`;
    view = run({ type: "COMMAND", origin: "HUMAN", command: { ...command, commandId: id, expectedRevision: view.revision } }, id).view!;
  };
  for (let i = 0; i < 300 && view.phase !== "COMPLETE"; i += 1) {
    const team = view.decisionTeamId ?? view.teams[0]!.id;
    if (view.phase === "TOSS") act({ kind: "CALL_TOSS", payload: { teamId: team, call: "HEADS" }, actorId: `USER:${team}` } as never);
    else if (view.phase === "AWAITING_INNINGS") act({ kind: "CHOOSE_INNINGS", payload: { teamId: team, choice: "BAT" }, actorId: `USER:${team}` } as never);
    else if (view.phase === "AWAITING_BATTER") act({ kind: "SET_BATTER", payload: { teamId: team, playerId: view.candidates.find((c) => !c.reason)!.id }, actorId: `USER:${team}` } as never);
    else if (view.phase === "AWAITING_BOWLER") act({ kind: "SET_BOWLER", payload: { teamId: team, bowlerId: view.candidates.find((c) => !c.reason)!.id }, actorId: `USER:${team}` } as never);
    else if (view.phase === "READY") act({ kind: "ADVANCE", payload: { scope: "OVER" }, actorId: "SYSTEM" } as never);
  }
  expect(view.phase).toBe("COMPLETE");
  return view;
}

const corpusBytes = readFileSync(resolve(repoRoot, "packages/data/worlds/fictional-eight-01.json"));
const corpusWorld = JSON.parse(corpusBytes.toString("utf8"));
const baseSetup = JSON.parse(readFileSync(resolve(repoRoot, "tests/fixtures/world/t20-valid-setup.json"), "utf8"));
const corpus = JSON.parse(readFileSync(resolve(repoRoot, "tests/fixtures/t20/seed_corpus.json"), "utf8"));

/** One match of the fixed 100-match T20 corpus, played by the fixture autopilot. */
function corpusMatch(index: number) {
  const raw = corpus.cases[index];
  const game = runFixtureT20(validateT20MatchSetup(createT20CorpusRequest(raw, baseSetup, corpusWorld), corpusBytes, manifest));
  return { events: game.events as unknown as CommittedCommentarySourceEvent[], teamIds: raw.teamIds as [string, string] };
}

const CHIME_TAGS = new Set(["BATTER_FIFTY", "BATTER_CENTURY", "BATTER_150", "BATTER_DOUBLE_CENTURY", "PARTNERSHIP_FIFTY", "PARTNERSHIP_CENTURY", "PARTNERSHIP_150", "BOWLER_THREE_FOR", "BOWLER_FIVE_FOR"]);

describe("CP09 match audio cues from the committed delivery record", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads dot, runs, four and six from a DELIVERY_RECORDED event and ignores every other event", () => {
    const delivery = (batRuns: number, boundary: DeliveryRecorded["boundary"]) => ({
      sequence: 9,
      type: "DELIVERY_RECORDED",
      payload: { event: { type: "DELIVERY_RECORDED", batRuns, boundary } },
    });
    expect(deliveryAudioFactsFromEvent(delivery(0, "NONE"))).toEqual({ batRuns: 0, boundary: null });
    expect(deliveryAudioFactsFromEvent(delivery(2, "NONE"))).toEqual({ batRuns: 2, boundary: null });
    expect(deliveryAudioFactsFromEvent(delivery(4, "FOUR"))).toEqual({ batRuns: 4, boundary: "4" });
    expect(deliveryAudioFactsFromEvent(delivery(6, "SIX"))).toEqual({ batRuns: 6, boundary: "6" });
    expect(deliveryAudioFactsFromEvent({ sequence: 10, type: "OVER_COMPLETED", payload: {} })).toBeNull();
  });

  it("gives every recorded four and six its boundary sound and every scoring stroke its bat knock, the same with or without events, and never draws a random number", () => {
    let fours = 0;
    let sixes = 0;
    let knocks = 0;
    let milestoneBalls = 0;
    for (const index of [0, 7, 23, 41, 77]) {
      const { events, teamIds } = corpusMatch(index);
      const feed = projectMatchCommentary({ format: "T20", events, playerNames: {}, teamNames: {}, teamIds, presentationKey: "cp09" });
      expect(MatchCommentaryFeedSchema.safeParse(feed).success).toBe(true);

      const random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw new Error("cue projection must not use Math.random");
      });
      const fromEvents = projectMatchAudioCues({ format: "T20", matchId: `cp09-${index}`, commentaryEntries: feed.entries, events, maxCues: 0 });
      const again = projectMatchAudioCues({ format: "T20", matchId: `cp09-${index}`, commentaryEntries: feed.entries, events, maxCues: 0 });
      const fromSlots = projectMatchAudioCues({ format: "T20", matchId: `cp09-${index}`, commentaryEntries: feed.entries, maxCues: 0 });
      expect(random).not.toHaveBeenCalled();
      random.mockRestore();
      expect(AudioCueQueueSchema.safeParse(fromEvents).success).toBe(true);
      expect(again).toEqual(fromEvents);
      expect(fromSlots).toEqual(fromEvents);

      const cueAt = new Map(fromEvents.cues.map((cue) => [cue.sequence, cue.cueKind]));
      const entryAt = new Map(feed.entries.map((entry) => [entry.sequence, entry]));
      for (const event of events) {
        if (event.type !== "DELIVERY_RECORDED") continue;
        const d = (event.payload as { event: DeliveryRecorded }).event;
        const entry = entryAt.get(event.sequence)!;
        if (d.dismissal) {
          expect(cueAt.get(event.sequence)).toBe("WICKET_FALL");
          continue;
        }
        if (entry.milestoneTags.some((tag) => CHIME_TAGS.has(tag))) {
          expect(cueAt.get(event.sequence)).toBe("MILESTONE_CHIME");
          continue;
        }
        // A ball filed under MILESTONE for a maiden, all-out or winning-runs tag still sounds as a ball.
        if (entry.category === "MILESTONE") milestoneBalls += 1;
        const expected = d.boundary === "SIX" ? "BOUNDARY_SIX" : d.boundary === "FOUR" ? "BOUNDARY_FOUR" : d.batRuns > 0 ? "BAT_BALL_SINGLE" : "BAT_BALL_DOT";
        expect(cueAt.get(event.sequence), `match ${index}, sequence ${event.sequence}`).toBe(expected);
        if (expected === "BOUNDARY_FOUR") fours += 1;
        if (expected === "BOUNDARY_SIX") sixes += 1;
        if (expected === "BAT_BALL_SINGLE") knocks += 1;
      }
    }
    // The defect CP10 found: before CP09 none of these fired, because the cue projection read slots the commentary
    // never wrote. Five corpus matches have fours, sixes, scoring strokes and winning-runs balls.
    expect(fours).toBeGreaterThan(0);
    expect(sixes).toBeGreaterThan(0);
    expect(knocks).toBeGreaterThan(0);
    expect(milestoneBalls).toBeGreaterThan(0);
  }, 30_000);

  it("the controller's view carries cues decided by the events, and a replay of the same match gives the same cues", () => {
    const first = playT20("cp09-replay-seed");
    const second = playT20("cp09-replay-seed");
    expect(first.audioCues).toEqual(second.audioCues);
    expect((first.audioCues ?? []).some((cue) => cue.cueKind === "BOUNDARY_FOUR" || cue.cueKind === "BOUNDARY_SIX" || cue.cueKind === "BAT_BALL_SINGLE")).toBe(true);
  }, 30_000);
});

const KINDS = Object.keys(MOMENT_WEIGHT) as MomentKind[];

function fakeContext() {
  const tones: { hz: number; type: string }[] = [];
  const ctx: AudioContextPort = {
    currentTime: 1,
    state: "running",
    destination: {},
    sampleRate: 22050,
    createOscillator() {
      const osc = {
        type: "sine" as OscillatorType,
        frequency: { setValueAtTime(value: number) { tones.push({ hz: value, type: osc.type }); } },
        connect() {},
        start() {},
        stop() {},
      };
      return osc;
    },
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    },
  };
  return { ctx, tones };
}

describe("CP09 match moment stings", () => {
  it("has a short, fixed sting for every moment kind; Brief is one softer note; the table never changes between calls", () => {
    for (const kind of KINDS) {
      const full = momentStingTones(kind, "full");
      const brief = momentStingTones(kind, "brief");
      expect(full.length).toBeGreaterThan(1);
      expect(brief).toHaveLength(1);
      expect(momentStingTones(kind, "full")).toEqual(full);
      expect(Math.max(...brief.map((t) => t.level))).toBeLessThan(Math.max(...full.map((t) => t.level)));
      expect(momentStingDurationMs(kind, "full")).toBeLessThanOrEqual(800);
      expect(momentStingDurationMs(kind, "brief")).toBeLessThanOrEqual(160);
      for (const t of full) {
        expect(t.level).toBeLessThanOrEqual(0.34);
        expect(t.hz).toBeGreaterThan(200);
      }
    }
    // Runs and milestones rise; wickets fall.
    const pitch = (kind: MomentKind) => momentStingTones(kind, "full").map((t) => t.hz);
    expect(pitch("FOUR").at(-1)!).toBeGreaterThan(pitch("FOUR")[0]!);
    expect(pitch("WICKET").at(-1)!).toBeLessThan(pitch("WICKET")[0]!);
    expect(pitch("HAT_TRICK").at(-1)!).toBeLessThan(pitch("HAT_TRICK")[0]!);
  });

  it("follows the Match moments setting and reduced motion", () => {
    expect(momentStingMode("off", false)).toBeNull();
    expect(momentStingMode("off", true)).toBeNull();
    expect(momentStingMode("full", false)).toBe("full");
    expect(momentStingMode("full", true)).toBe("brief");
    expect(momentStingMode("brief", false)).toBe("brief");
  });

  it("is silent while muted, at zero effects volume, in a background tab and before the first click or key press, and plays its notes once allowed", () => {
    const fake = fakeContext();
    let visible: "visible" | "hidden" = "visible";
    let created = 0;
    const manager = new CricketAudioManager(DEFAULT_AUDIO_PREFERENCES, {
      createAudioContext: () => {
        created += 1;
        return fake.ctx;
      },
      speechSynthesis: null,
      getVisibilityState: () => visible,
    });
    // Sound starts muted.
    expect(manager.playMomentSting("FOUR", "full").status).toBe("MUTED_OR_ZERO_VOLUME");
    manager.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, muted: false });
    // No gesture yet: nothing is created, nothing is saved up for later.
    expect(manager.playMomentSting("FOUR", "full").status).toBe("AWAITING_GESTURE");
    expect(created).toBe(0);
    manager.unlockFromUserGesture();
    expect(fake.tones).toHaveLength(0);
    visible = "hidden";
    expect(manager.playMomentSting("SIX", "full").status).toBe("BACKGROUND_TAB_SUPPRESSED");
    visible = "visible";
    manager.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, muted: false, effectsVolume: 0 });
    expect(manager.playMomentSting("SIX", "full").status).toBe("MUTED_OR_ZERO_VOLUME");
    expect(fake.tones).toHaveLength(0);
    manager.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, muted: false });
    const played = manager.playMomentSting("WICKET", "full");
    expect(played).toEqual({ kind: "WICKET", mode: "full", status: "PLAYED" });
    expect(fake.tones.map((t) => t.hz)).toEqual(momentStingTones("WICKET", "full").map((t) => t.hz));
    expect(manager.getSnapshot().lastMomentSting).toEqual(played);
    // A sting is not a cue: no caption, no cue decision.
    expect(manager.getSnapshot().recentDecisions).toHaveLength(0);
    expect(manager.getSnapshot().lastCaption).toBeNull();
    manager.dispose();
  });
});
