import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AudioProvenanceManifestSchema,
  AudioCueQueueSchema,
  type AudioCue,
  type AudioPreferences,
  WorldPackSchema,
  type T20Command,
  type T20TeamSelection,
  type ODICommand,
  type Red5Command,
} from "@lcxxvi/contracts";
import {
  DEFAULT_AUDIO_PREFERENCES,
  ORIGINAL_AUDIO_PROVENANCE_MANIFEST,
  projectMatchAudioCues,
  projectMatchCommentary,
  selectDispatchableAudioCues,
} from "@lcxxvi/projections";
import {
  CricketAudioManager,
  type AudioContextPort,
  type SpeechSynthesisPort,
} from "../../apps/web/src/match/audio-manager.js";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { createODIMatchController } from "../../apps/web/src/match/controller-odi.js";
import { createRed5MatchController } from "../../apps/web/src/match/controller-red5.js";
import { UI_VERSION } from "../../apps/web/src/match/protocol.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const worldBytes = new Uint8Array(
  readFileSync(resolve(repoRoot, "packages/data/worlds/fictional-eight-01.json")),
);
const manifest = JSON.parse(
  readFileSync(
    resolve(repoRoot, "packages/data/worlds/fictional-eight-01.manifest.json"),
    "utf8",
  ),
);

function makeFakeAudioContext() {
  const oscCalls: { type: string; freq: number }[] = [];
  const gainCalls: number[] = [];
  let state: AudioContextState | string = "suspended";
  let resumeCount = 0;
  let suspendCount = 0;
  let closeCount = 0;

  const ctx: AudioContextPort = {
    currentTime: 0,
    get state() {
      return state;
    },
    destination: {},
    sampleRate: 22050,
    resume() {
      state = "running";
      resumeCount += 1;
    },
    suspend() {
      state = "suspended";
      suspendCount += 1;
    },
    close() {
      state = "closed";
      closeCount += 1;
    },
    createOscillator() {
      return {
        type: "sine",
        frequency: {
          setValueAtTime(value: number) {
            oscCalls.push({ type: "osc", freq: value });
          },
        },
        connect() {},
        start() {},
        stop() {},
      };
    },
    createGain() {
      return {
        gain: {
          setValueAtTime(value: number) {
            gainCalls.push(value);
          },
        },
        connect() {},
      };
    },
    createBiquadFilter() {
      return {
        type: "bandpass",
        frequency: { setValueAtTime() {} },
        connect() {},
      };
    },
    createBuffer(_channels: number, length: number) {
      const arr = new Float32Array(length);
      return {
        getChannelData() {
          return arr;
        },
      };
    },
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start() {},
        stop() {},
      };
    },
  };

  return {
    ctx,
    oscCalls,
    gainCalls,
    stats: () => ({ state, resumeCount, suspendCount, closeCount }),
  };
}

function makeFakeSpeech() {
  const spoken: { text: string; volume: number }[] = [];
  let cancelled = 0;
  const port: SpeechSynthesisPort = {
    speak(text, volume) {
      spoken.push({ text, volume });
    },
    cancel() {
      cancelled += 1;
    },
  };
  return { port, spoken, cancelCount: () => cancelled };
}

const parsedWorld = WorldPackSchema.parse(JSON.parse(new TextDecoder().decode(worldBytes)));

function pickSelection(teamIndex: number): T20TeamSelection {
  const team = parsedWorld.teams[teamIndex]!;
  const players = team.squadIds.map((id) => parsedWorld.players.find((p) => p.playerId === id)!);
  const keeper = players.find((p) => p.role === "KEEPER")!;
  const bowlers = players
    .filter(
      (p) =>
        p.playerId !== keeper.playerId &&
        (p.role === "BOWLER" || p.role === "ALLROUNDER" || p.bowlingStyle !== null),
    )
    .slice(0, 5);
  const rest = players.filter((p) => p.playerId !== keeper.playerId && !bowlers.includes(p));
  const xi = [keeper, ...bowlers, ...rest].slice(0, 11);
  return {
    teamId: team.teamId,
    playerIds: xi.map((p) => p.playerId),
    captainId: xi[0]!.playerId,
    keeperId: keeper.playerId,
  };
}

function runFormatSample(
  format: "T20" | "ODI" | "RED_BALL",
  audioModeLabel: string,
  maxTurns = format === "T20" ? 250 : 12,
) {
  const seed = format === "T20" ? "stage8-t20-seed" : format === "ODI" ? "stage8-odi-seed" : "stage8-red5-seed";
  const ctl =
    format === "T20"
      ? createMatchController(worldBytes, manifest, () => seed)
      : format === "ODI"
        ? createODIMatchController(worldBytes, manifest, () => seed)
        : createRed5MatchController(worldBytes, manifest, () => seed);
  let seq = 0;
  let expectedRevision = 0;
  const runReq = (body: Record<string, unknown>, explicitRequestId?: string) => {
    const requestId = explicitRequestId ?? `ui-${++seq}`;
    const r = ctl.handle({ version: UI_VERSION, requestId, expectedRevision, ...body } as never);
    expect(r.error).toBeNull();
    expectedRevision = r.revision;
    return r;
  };
  const start = runReq({
    type: "START",
    format,
    selections: [pickSelection(0), pickSelection(1)],
    groundId: parsedWorld.grounds[0]!.groundId,
  });
  let view = start.view!;
  const act = (
    command: Omit<T20Command | ODICommand | Red5Command, "commandId" | "expectedRevision"> & {
      commandId?: string;
      expectedRevision?: number;
    },
  ) => {
    const reqId = `ui-${++seq}`;
    const r = runReq(
      {
        type: "COMMAND",
        origin: "HUMAN",
        command: { ...command, commandId: reqId, expectedRevision: view.revision },
      },
      reqId,
    );
    view = r.view!;
  };
  for (let i = 0; i < maxTurns && view.phase !== "COMPLETE"; i += 1) {
    const team = view.decisionTeamId ?? view.teams[0]!.id;
    if (view.phase === "TOSS") {
      act({ kind: "CALL_TOSS", payload: { teamId: team, call: "HEADS" }, actorId: `USER:${team}` });
    } else if (view.phase === "AWAITING_INNINGS") {
      act({ kind: "CHOOSE_INNINGS", payload: { teamId: team, choice: "BAT" }, actorId: `USER:${team}` });
    } else if (view.phase === "AWAITING_FOLLOW_ON") {
      act({ kind: "DECIDE_FOLLOW_ON", payload: { teamId: team, enforce: true }, actorId: `USER:${team}` } as never);
    } else if (view.phase === "AWAITING_BATTER") {
      act({ kind: "SET_BATTER", payload: { teamId: team, playerId: view.candidates.find((c) => !c.reason)!.id }, actorId: `USER:${team}` });
    } else if (view.phase === "AWAITING_BOWLER") {
      act({ kind: "SET_BOWLER", payload: { teamId: team, bowlerId: view.candidates.find((c) => !c.reason)!.id }, actorId: `USER:${team}` });
    } else if (view.phase === "READY") {
      act({ kind: "ADVANCE", payload: { scope: "OVER" }, actorId: "SYSTEM" });
    }
  }
  const verify = view.phase === "COMPLETE" ? runReq({ type: "VERIFY" }).verification : null;
  return { view, verify };
}

function runT20Sample(audioModeLabel: string) {
  return runFormatSample("T20", audioModeLabel);
}

function runODISample() {
  return runFormatSample("ODI", "odi").view;
}

function runRed5Sample() {
  return runFormatSample("RED_BALL", "red5").view;
}

describe("Stage 8 optional sound and narration", () => {
  it("provides a schema-valid original procedural provenance manifest with zero external network assets", () => {
    const parsed = AudioProvenanceManifestSchema.parse(ORIGINAL_AUDIO_PROVENANCE_MANIFEST);
    expect(parsed.networkCallsAllowed).toBe(false);
    expect(parsed.assets.length).toBe(10);
    for (const asset of parsed.assets) {
      expect(asset.origin).toBe("ORIGINAL_PROCEDURAL_SYNTH");
      expect(asset.license).toBe("MIT_ORIGINAL_LORD_CRICKET_XXVI");
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("projects audio cues from committed T20, ODI, and RED_BALL commentary without calling fetch", () => {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = (() => {
      fetchCount += 1;
      throw new Error("Audio cue projection must not invoke fetch");
    }) as typeof fetch;
    try {
      const t20 = runT20Sample("t20-cues").view;
      const odi = runODISample();
      const red5 = runRed5Sample();

      for (const [format, view] of [
        ["T20", t20],
        ["ODI", odi],
        ["RED_BALL", red5],
      ] as const) {
        const queue = projectMatchAudioCues({
          format,
          matchId: view.matchId!,
          commentaryEntries: view.commentary,
        });
        expect(AudioCueQueueSchema.safeParse(queue).success).toBe(true);
        expect(queue.cues.length).toBeGreaterThan(0);
        expect(view.audioCues).toEqual(queue.cues);
      }
      expect(fetchCount).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("gates Web Audio playback behind a user gesture and plays queued cue once unlocked", async () => {
    const fake = makeFakeAudioContext();
    const speech = makeFakeSpeech();
    let createdCount = 0;
    const manager = new CricketAudioManager(
      { ...DEFAULT_AUDIO_PREFERENCES, narrationEnabled: true },
      {
        createAudioContext: () => {
          createdCount += 1;
          return fake.ctx;
        },
        speechSynthesis: speech.port,
        getVisibilityState: () => "visible",
      },
    );

    const cue1: AudioCue = {
      cueId: "m1:1:BOUNDARY_FOUR",
      sequence: 1,
      channel: "CROWD",
      cueKind: "BOUNDARY_FOUR",
      assetId: "lc-crowd-boundary-four-v1",
      priority: 65,
      caption: "Boundary four!",
      narrationText: "Driven through cover for four.",
      ttlMs: 3_500,
    };

    manager.seedCommittedHistory("m1", []);
    const beforeGesture = await manager.processCueQueue({ matchId: "m1", cues: [cue1] });
    expect(beforeGesture?.status).toBe("QUEUED_AWAITING_GESTURE");
    expect(createdCount).toBe(0);
    expect(speech.spoken).toHaveLength(0);

    manager.unlockFromUserGesture();
    await new Promise((resolveFn) => setTimeout(resolveFn, 0));
    expect(createdCount).toBe(1);
    expect(fake.stats().resumeCount).toBe(1);
    expect(manager.getSnapshot().playedCount).toBe(1);
    expect(speech.spoken).toEqual([{ text: "Driven through cover for four.", volume: 0.65 }]);
  });

  it("deduplicates historical cues across reload and expires stale cues during fast-forward", async () => {
    const fake = makeFakeAudioContext();
    const manager = new CricketAudioManager(DEFAULT_AUDIO_PREFERENCES, {
      createAudioContext: () => fake.ctx,
      speechSynthesis: null,
      getVisibilityState: () => "visible",
      now: () => 50_000,
    });
    manager.unlockFromUserGesture();

    const cues: AudioCue[] = [
      {
        cueId: "m2:1:BAT_BALL_DOT",
        sequence: 1,
        channel: "EFFECTS",
        cueKind: "BAT_BALL_DOT",
        assetId: "lc-sfx-bat-dot-v1",
        priority: 15,
        caption: "Dot ball",
        ttlMs: 3_500,
      },
      {
        cueId: "m2:2:BAT_BALL_SINGLE",
        sequence: 2,
        channel: "EFFECTS",
        cueKind: "BAT_BALL_SINGLE",
        assetId: "lc-sfx-bat-single-v1",
        priority: 25,
        caption: "Single taken",
        ttlMs: 3_500,
      },
      {
        cueId: "m2:3:BOUNDARY_FOUR",
        sequence: 3,
        channel: "EFFECTS",
        cueKind: "BOUNDARY_FOUR",
        assetId: "lc-crowd-boundary-four-v1",
        priority: 65,
        caption: "Cracking four!",
        ttlMs: 3_500,
      },
      {
        cueId: "m2:4:WICKET_FALL",
        sequence: 4,
        channel: "EFFECTS",
        cueKind: "WICKET_FALL",
        assetId: "lc-sfx-wicket-fall-v1",
        priority: 95,
        caption: "Wicket!",
        ttlMs: 3_500,
      },
    ];

    // Reload: seedCommittedHistory marks cues 1..2 as already played without replaying.
    manager.seedCommittedHistory("m2", cues.slice(0, 2));
    expect(await manager.processCueQueue({ matchId: "m2", cues: cues.slice(0, 2) })).toBeNull();
    expect(manager.getSnapshot().playedCount).toBe(0);

    // Fast-forward batch of 4 unseen cues (sequences 3..6) expires older ones.
    const burst: AudioCue[] = [
      cues[2]!,
      cues[3]!,
      { ...cues[0]!, cueId: "m2:5:BAT_BALL_DOT", sequence: 5 },
      { ...cues[1]!, cueId: "m2:6:BAT_BALL_SINGLE", sequence: 6 },
    ];
    const selection = selectDispatchableAudioCues({
      cues: burst,
      playedCueIds: new Set(["m2:1:BAT_BALL_DOT", "m2:2:BAT_BALL_SINGLE"]),
      lastPlayedSequence: 2,
      fastForwardThreshold: 3,
    });
    expect(selection.expiredCueIds).toEqual(["m2:3:BOUNDARY_FOUR", "m2:5:BAT_BALL_DOT", "m2:6:BAT_BALL_SINGLE"]);
    expect(selection.playCue?.cueId).toBe("m2:4:WICKET_FALL");

    const decision = await manager.processCueQueue({ matchId: "m2", cues: [...cues.slice(0, 2), ...burst] });
    expect(decision?.cueId).toBe("m2:4:WICKET_FALL");
    expect(decision?.status).toBe("PLAYED");
    expect(manager.getSnapshot().expiredCount).toBe(3);
    expect(manager.getSnapshot().playedCount).toBe(1);

    // Stale TTL expiry
    const expiredOnly = await manager.processCueQueue({
      matchId: "m2",
      cues: [{ ...cues[0]!, cueId: "m2:7:BAT_BALL_DOT", sequence: 7 }],
      cueQueuedAtMsById: { "m2:7:BAT_BALL_DOT": 40_000 },
    });
    expect(expiredOnly?.status).toBe("EXPIRED_FAST_FORWARD");
  });

  it("suppresses audio in background tabs, honours mute/zero volumes, and degrades safely on missing/corrupt assets", async () => {
    let visible: "visible" | "hidden" = "hidden";
    const fake = makeFakeAudioContext();
    const speech = makeFakeSpeech();
    const manager = new CricketAudioManager(
      { ...DEFAULT_AUDIO_PREFERENCES, narrationEnabled: true },
      {
        createAudioContext: () => fake.ctx,
        speechSynthesis: speech.port,
        getVisibilityState: () => visible,
        missingAssetIds: new Set(["lc-sfx-over-bell-v1"]),
        failDecodeAssetIds: new Set(["lc-crowd-boundary-six-v1"]),
      },
    );
    manager.unlockFromUserGesture();
    manager.seedCommittedHistory("m3", []);

    manager.handleVisibilityChange();
    expect(fake.stats().suspendCount).toBe(1);
    expect(speech.cancelCount()).toBeGreaterThan(0);

    const dotCue: AudioCue = {
      cueId: "m3:1:BAT_BALL_DOT",
      sequence: 1,
      channel: "EFFECTS",
      cueKind: "BAT_BALL_DOT",
      assetId: "lc-sfx-bat-dot-v1",
      priority: 15,
      caption: "Dot ball caption",
      ttlMs: 3_500,
    };
    const bgResult = await manager.processCueQueue({ matchId: "m3", cues: [dotCue] });
    expect(bgResult?.status).toBe("BACKGROUND_TAB_SUPPRESSED");
    expect(manager.getSnapshot().lastCaption).toBe("Dot ball caption");

    visible = "visible";
    manager.handleVisibilityChange();
    expect(fake.stats().resumeCount).toBe(2);

    // Missing asset falls back safely to caption without throwing.
    const missingResult = await manager.processCueQueue({
      matchId: "m3",
      cues: [
        dotCue,
        {
          cueId: "m3:2:OVER_BELL",
          sequence: 2,
          channel: "INTERFACE",
          cueKind: "OVER_BELL",
          assetId: "lc-sfx-over-bell-v1",
          priority: 55,
          caption: "End of over 1",
          ttlMs: 3_500,
        },
      ],
    });
    expect(missingResult?.status).toBe("MISSING_ASSET_FALLBACK");
    expect(manager.getSnapshot().degradedReason).toContain("missing");

    // Corrupt/decode failure falls back safely without interrupting match.
    const decodeResult = await manager.processCueQueue({
      matchId: "m3",
      cues: [
        dotCue,
        {
          cueId: "m3:3:BOUNDARY_SIX",
          sequence: 3,
          channel: "CROWD",
          cueKind: "BOUNDARY_SIX",
          assetId: "lc-crowd-boundary-six-v1",
          priority: 75,
          caption: "Huge six!",
          ttlMs: 3_500,
        },
      ],
    });
    expect(decodeResult?.status).toBe("DECODE_FAILED_FALLBACK");
    expect(manager.getSnapshot().failedAssetIds).toEqual(["lc-sfx-over-bell-v1", "lc-crowd-boundary-six-v1"]);

    // Muting silences cues and cancels speech while preserving captions.
    manager.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, muted: true });
    const mutedResult = await manager.processCueQueue({
      matchId: "m3",
      cues: [
        dotCue,
        {
          cueId: "m3:4:BAT_BALL_SINGLE",
          sequence: 4,
          channel: "EFFECTS",
          cueKind: "BAT_BALL_SINGLE",
          assetId: "lc-sfx-bat-single-v1",
          priority: 25,
          caption: "Quick single",
          ttlMs: 3_500,
        },
      ],
    });
    expect(mutedResult?.status).toBe("MUTED_OR_ZERO_VOLUME");
    expect(manager.getSnapshot().lastCaption).toBe("Quick single");
  });

  it("proves audio settings, narration, and playback failures never alter simulation outcomes or random draws", async () => {
    const configs: { label: string; prefs: AudioPreferences; failAudio?: boolean }[] = [
      { label: "active-full", prefs: { ...DEFAULT_AUDIO_PREFERENCES, narrationEnabled: true } },
      { label: "muted-silent", prefs: { ...DEFAULT_AUDIO_PREFERENCES, muted: true, narrationEnabled: false } },
      { label: "zero-channels", prefs: { ...DEFAULT_AUDIO_PREFERENCES, crowdVolume: 0, effectsVolume: 0, commentaryVolume: 0, interfaceVolume: 0 } },
      { label: "broken-audio-device", prefs: DEFAULT_AUDIO_PREFERENCES, failAudio: true },
    ];

    const hashes: { eventsSha256: string; scorecardSha256: string; lastEventHash: string; revision: number }[] = [];
    for (const cfg of configs) {
      const fake = makeFakeAudioContext();
      const manager = new CricketAudioManager(cfg.prefs, {
        createAudioContext: cfg.failAudio ? () => null : () => fake.ctx,
        speechSynthesis: null,
        getVisibilityState: () => "visible",
      });
      manager.unlockFromUserGesture();
      const { view, verify } = runT20Sample(cfg.label);
      expect(verify).not.toBeNull();
      manager.seedCommittedHistory(view.matchId!, []);
      await manager.processCueQueue({ matchId: view.matchId!, cues: view.audioCues ?? [] });

      const rawCommentary = projectMatchCommentary({
        format: "T20",
        events: [],
        playerNames: {},
        teamNames: {},
        teamIds: [view.teams[0]!.id, view.teams[1]!.id],
        groundName: view.ground,
      });
      expect(rawCommentary.entries.length).toBe(0);

      hashes.push({
        eventsSha256: verify!.eventsSha256,
        scorecardSha256: verify!.scorecardSha256,
        lastEventHash: view.lastEventHash,
        revision: view.revision,
      });
    }

    for (const h of hashes) {
      expect(h.eventsSha256).toBe(hashes[0]!.eventsSha256);
      expect(h.scorecardSha256).toBe(hashes[0]!.scorecardSha256);
      expect(h.lastEventHash).toBe(hashes[0]!.lastEventHash);
      expect(h.revision).toBe(hashes[0]!.revision);
    }
  }, 30_000);
});
