import {
  AUDIO_PRESENTATION_VERSION,
  AudioPreferencesSchema,
  type AudioAssetProvenance,
  type AudioChannel,
  type AudioCue,
  type AudioCueKind,
  type AudioPlaybackDecisionStatus,
  type AudioPreferences,
  type AudioProvenanceManifest,
} from "@lcxxvi/contracts";
import {
  DEFAULT_AUDIO_PREFERENCES,
  DEFAULT_FAST_FORWARD_BATCH_THRESHOLD,
  ORIGINAL_AUDIO_PROVENANCE_MANIFEST,
  findAudioAssetByCueKind,
  findAudioAssetById,
  selectDispatchableAudioCues,
} from "@lcxxvi/projections";
import type { MomentKind } from "./match-moments.js";
import { MOMENT_STING_LEAD_SEC, momentStingTones, type MomentStingMode } from "./moment-sound.js";

export const AUDIO_PREFERENCES_STORAGE_KEY = "lcxxvi-audio-preferences";

export type AudioDecisionRecord = {
  readonly cueId: string;
  readonly sequence: number;
  readonly assetId: string;
  readonly channel: AudioChannel;
  readonly cueKind: AudioCueKind;
  readonly status: AudioPlaybackDecisionStatus;
  readonly caption: string;
};

/** CP09: what happened to the last match moment's sting. Not a cue: it adds no caption and is never queued. */
export type MomentStingStatus = "PLAYED" | "MUTED_OR_ZERO_VOLUME" | "AWAITING_GESTURE" | "BACKGROUND_TAB_SUPPRESSED" | "UNAVAILABLE";

export type MomentStingRecord = {
  readonly kind: MomentKind;
  readonly mode: MomentStingMode;
  readonly status: MomentStingStatus;
};

export type AudioManagerSnapshot = {
  readonly playbackArmed: boolean;
  readonly degradedReason: string | null;
  readonly failedAssetIds: readonly string[];
  readonly playedCount: number;
  readonly expiredCount: number;
  readonly dedupSkippedCount: number;
  readonly lastCaption: string | null;
  readonly lastStatus: AudioPlaybackDecisionStatus | null;
  readonly recentDecisions: readonly AudioDecisionRecord[];
  readonly lastMomentSting: MomentStingRecord | null;
};

export interface AudioParamPort {
  setValueAtTime(value: number, startTime: number): void;
  exponentialRampToValueAtTime?(value: number, endTime: number): void;
}

export interface AudioGainPort {
  gain: AudioParamPort;
  connect(destination: unknown): void;
}

export interface AudioFilterPort {
  type: BiquadFilterType;
  frequency: AudioParamPort;
  connect(destination: unknown): void;
}

export interface AudioOscillatorPort {
  type: OscillatorType;
  frequency: AudioParamPort;
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioBufferSourcePort {
  buffer: unknown;
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextPort {
  readonly currentTime: number;
  readonly state: AudioContextState | string;
  readonly destination: unknown;
  readonly sampleRate: number;
  resume?: () => Promise<void> | void;
  suspend?: () => Promise<void> | void;
  close?: () => Promise<void> | void;
  createOscillator: () => AudioOscillatorPort;
  createGain: () => AudioGainPort;
  createBiquadFilter?: () => AudioFilterPort;
  createBuffer?: (
    channels: number,
    length: number,
    sampleRate: number,
  ) => { getChannelData(channel: number): Float32Array };
  createBufferSource?: () => AudioBufferSourcePort;
  decodeAudioData?: (data: ArrayBuffer) => Promise<unknown>;
}

export interface SpeechSynthesisPort {
  speak(text: string, volume: number): void;
  cancel(): void;
}

export type AudioManagerDependencies = {
  readonly manifest?: AudioProvenanceManifest;
  readonly createAudioContext?: () => AudioContextPort | null;
  readonly speechSynthesis?: SpeechSynthesisPort | null;
  readonly getVisibilityState?: () => "visible" | "hidden";
  readonly now?: () => number;
  readonly missingAssetIds?: ReadonlySet<string>;
  readonly failDecodeAssetIds?: ReadonlySet<string>;
  readonly decodeAssetPayload?: (
    asset: AudioAssetProvenance,
    ctx: AudioContextPort,
  ) => Promise<boolean> | boolean;
};

export function loadStoredAudioPreferences(): AudioPreferences {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return DEFAULT_AUDIO_PREFERENCES;
  }
  try {
    const raw = window.localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_PREFERENCES;
    const parsed = AudioPreferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_AUDIO_PREFERENCES;
  } catch {
    return DEFAULT_AUDIO_PREFERENCES;
  }
}

export function saveStoredAudioPreferences(preferences: AudioPreferences): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  try {
    const validated = AudioPreferencesSchema.parse({
      ...preferences,
      version: AUDIO_PRESENTATION_VERSION,
    });
    window.localStorage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify(validated));
  } catch {
    // Ignore quota or storage restriction errors.
  }
}

function defaultCreateAudioContext(): AudioContextPort | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  try {
    return new Ctor() as unknown as AudioContextPort;
  } catch {
    return null;
  }
}

function defaultSpeechSynthesis(): SpeechSynthesisPort | null {
  if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") {
    return null;
  }
  const synth = window.speechSynthesis;
  if (typeof SpeechSynthesisUtterance === "undefined") return null;
  return {
    speak(text: string, volume: number) {
      try {
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = Math.max(0, Math.min(1, volume));
        utterance.rate = 1.04;
        synth.speak(utterance);
      } catch {
        // Ignore speech synthesis errors on restricted hosts.
      }
    },
    cancel() {
      try {
        synth.cancel();
      } catch {
        // Ignore cancel errors.
      }
    },
  };
}

function channelVolumeFor(preferences: AudioPreferences, channel: AudioChannel): number {
  switch (channel) {
    case "CROWD":
      return preferences.crowdVolume;
    case "EFFECTS":
      return preferences.effectsVolume;
    case "COMMENTARY":
      return preferences.commentaryVolume;
    case "INTERFACE":
      return preferences.interfaceVolume;
  }
}

function renderProceduralSynthCue(
  ctx: AudioContextPort,
  cueKind: AudioCueKind,
  gainScalar: number,
): void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(Math.max(0.001, Math.min(0.65, gainScalar * 0.4)), now);
  master.connect(ctx.destination);

  const playTone = (
    type: OscillatorType,
    startHz: number,
    endHz: number,
    delaySec: number,
    durationSec: number,
    level: number,
  ) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startHz, now + delaySec);
    osc.frequency.exponentialRampToValueAtTime?.(Math.max(40, endHz), now + delaySec + durationSec);
    env.gain.setValueAtTime(Math.max(0.001, level), now + delaySec);
    env.gain.exponentialRampToValueAtTime?.(0.0001, now + delaySec + durationSec);
    osc.connect(env);
    env.connect(master);
    osc.start(now + delaySec);
    osc.stop(now + delaySec + durationSec + 0.01);
  };

  const playCrowdNoise = (
    delaySec: number,
    durationSec: number,
    cutoffHz: number,
    level: number,
  ) => {
    if (!ctx.createBuffer || !ctx.createBufferSource) return;
    const sampleCount = Math.max(256, Math.floor((ctx.sampleRate || 22050) * durationSec));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate || 22050);
    const data = buffer.getChannelData(0);
    // Deterministic pseudo-noise (LCG) so synthesis never calls Math.random.
    let seed = 0x9e3779b9;
    for (let i = 0; i < sampleCount; i += 1) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      const white = (seed / 0xffffffff) * 2 - 1;
      const progress = i / sampleCount;
      const envelope = Math.sin(Math.PI * progress);
      data[i] = white * envelope;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const env = ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.001, level), now + delaySec);
    env.gain.exponentialRampToValueAtTime?.(0.0001, now + delaySec + durationSec);
    if (ctx.createBiquadFilter) {
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(cutoffHz, now + delaySec);
      src.connect(filter);
      filter.connect(env);
    } else {
      src.connect(env);
    }
    env.connect(master);
    src.start(now + delaySec);
    src.stop(now + delaySec + durationSec + 0.01);
  };

  switch (cueKind) {
    case "BAT_BALL_DOT":
      playTone("triangle", 210, 120, 0, 0.065, 0.55);
      break;
    case "BAT_BALL_SINGLE":
      playTone("triangle", 340, 165, 0, 0.095, 0.7);
      break;
    case "BOUNDARY_FOUR":
      playTone("triangle", 440, 190, 0, 0.11, 0.8);
      playCrowdNoise(0.05, 0.65, 1100, 0.55);
      break;
    case "BOUNDARY_SIX":
      playTone("sawtooth", 520, 210, 0, 0.14, 0.8);
      playCrowdNoise(0.04, 0.9, 1300, 0.75);
      break;
    case "WICKET_FALL":
      playTone("square", 610, 240, 0, 0.12, 0.75);
      playTone("triangle", 390, 160, 0.05, 0.14, 0.65);
      playCrowdNoise(0.08, 0.7, 900, 0.5);
      break;
    case "MILESTONE_CHIME":
      playTone("sine", 523, 523, 0, 0.18, 0.5);
      playTone("sine", 659, 659, 0.1, 0.2, 0.5);
      playTone("sine", 784, 784, 0.2, 0.28, 0.55);
      playCrowdNoise(0.06, 0.55, 1150, 0.4);
      break;
    case "OVER_BELL":
      playTone("sine", 660, 660, 0, 0.14, 0.45);
      playTone("sine", 880, 880, 0.08, 0.16, 0.4);
      break;
    case "INNINGS_CHANGE":
      playTone("sine", 392, 392, 0, 0.2, 0.5);
      playTone("sine", 494, 494, 0.12, 0.22, 0.5);
      playTone("sine", 587, 587, 0.24, 0.28, 0.55);
      break;
    case "MATCH_COMPLETE":
      playTone("sine", 523, 523, 0, 0.16, 0.55);
      playTone("sine", 659, 659, 0.1, 0.16, 0.55);
      playTone("sine", 784, 784, 0.2, 0.2, 0.6);
      playTone("sine", 1046, 1046, 0.32, 0.38, 0.65);
      playCrowdNoise(0.15, 0.9, 1250, 0.65);
      break;
    case "UI_CLICK":
      playTone("sine", 740, 420, 0, 0.035, 0.35);
      break;
  }
}

export class CricketAudioManager {
  private readonly manifest: AudioProvenanceManifest;
  private readonly createAudioContext: () => AudioContextPort | null;
  private readonly speechSynthesis: SpeechSynthesisPort | null;
  private readonly getVisibilityState: () => "visible" | "hidden";
  private readonly now: () => number;
  private readonly missingAssetIds: ReadonlySet<string>;
  private readonly failDecodeAssetIds: ReadonlySet<string>;
  private readonly decodeAssetPayload?: (
    (
      asset: AudioAssetProvenance,
      ctx: AudioContextPort,
    ) => Promise<boolean> | boolean
  ) | undefined;

  private preferences: AudioPreferences;
  private audioContext: AudioContextPort | null = null;
  private playbackArmed = false;
  private degradedReason: string | null = null;
  private readonly failedAssetIds = new Set<string>();
  private activeMatchId: string | null = null;
  private lastPlayedSequence = 0;
  private readonly playedCueIds = new Set<string>();
  private playedCount = 0;
  private expiredCount = 0;
  private dedupSkippedCount = 0;
  private lastCaption: string | null = null;
  private lastStatus: AudioPlaybackDecisionStatus | null = null;
  private readonly recentDecisions: AudioDecisionRecord[] = [];
  private lastMomentSting: MomentStingRecord | null = null;
  private uiClickSeq = 0;
  private queuedAwaitingGesture: AudioCue | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    initialPreferences: AudioPreferences = DEFAULT_AUDIO_PREFERENCES,
    deps: AudioManagerDependencies = {},
  ) {
    this.preferences = AudioPreferencesSchema.parse(initialPreferences);
    this.manifest = deps.manifest ?? ORIGINAL_AUDIO_PROVENANCE_MANIFEST;
    this.createAudioContext = deps.createAudioContext ?? defaultCreateAudioContext;
    this.speechSynthesis =
      deps.speechSynthesis === undefined ? defaultSpeechSynthesis() : deps.speechSynthesis;
    this.getVisibilityState =
      deps.getVisibilityState ??
      (() =>
        typeof document !== "undefined" && document.visibilityState === "hidden"
          ? "hidden"
          : "visible");
    this.now = deps.now ?? (() => Date.now());
    this.missingAssetIds = deps.missingAssetIds ?? new Set<string>();
    this.failDecodeAssetIds = deps.failDecodeAssetIds ?? new Set<string>();
    this.decodeAssetPayload = deps.decodeAssetPayload;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore subscriber errors.
      }
    }
  }

  private recordDecision(record: AudioDecisionRecord): void {
    this.lastStatus = record.status;
    this.lastCaption = record.caption;
    this.recentDecisions.unshift(record);
    if (this.recentDecisions.length > 24) {
      this.recentDecisions.length = 24;
    }
  }

  getSnapshot(): AudioManagerSnapshot {
    return {
      playbackArmed: this.playbackArmed,
      degradedReason: this.degradedReason,
      failedAssetIds: [...this.failedAssetIds],
      playedCount: this.playedCount,
      expiredCount: this.expiredCount,
      dedupSkippedCount: this.dedupSkippedCount,
      lastCaption: this.lastCaption,
      lastStatus: this.lastStatus,
      recentDecisions: [...this.recentDecisions],
      lastMomentSting: this.lastMomentSting,
    };
  }

  getPreferences(): AudioPreferences {
    return this.preferences;
  }

  setPreferences(next: AudioPreferences): void {
    this.preferences = AudioPreferencesSchema.parse(next);
    if (this.preferences.muted) {
      this.speechSynthesis?.cancel();
    }
    this.notify();
  }

  handleVisibilityChange(): void {
    if (this.getVisibilityState() === "hidden") {
      this.speechSynthesis?.cancel();
      this.queuedAwaitingGesture = null;
      if (this.audioContext && typeof this.audioContext.suspend === "function") {
        try {
          const result = this.audioContext.suspend();
          if (result && typeof (result as Promise<void>).catch === "function") {
            void (result as Promise<void>).catch(() => undefined);
          }
        } catch {
          // Ignore background suspend failures.
        }
      }
    } else if (
      this.playbackArmed &&
      this.audioContext &&
      this.audioContext.state === "suspended" &&
      typeof this.audioContext.resume === "function"
    ) {
      try {
        const result = this.audioContext.resume();
        if (result && typeof (result as Promise<void>).catch === "function") {
          void (result as Promise<void>).catch(() => undefined);
        }
      } catch {
        // Ignore foreground resume failures.
      }
    }
  }

  unlockFromUserGesture(): boolean {
    this.playbackArmed = true;
    if (!this.audioContext) {
      try {
        this.audioContext = this.createAudioContext();
      } catch {
        this.degradedReason = "AudioContext unavailable; running in caption-only silent mode.";
        this.audioContext = null;
      }
    }
    if (
      this.audioContext &&
      this.audioContext.state === "suspended" &&
      typeof this.audioContext.resume === "function"
    ) {
      try {
        const result = this.audioContext.resume();
        if (result && typeof (result as Promise<void>).catch === "function") {
          void (result as Promise<void>).catch(() => {
            this.degradedReason = "AudioContext resume rejected; running in caption-only silent mode.";
            this.notify();
          });
        }
      } catch {
        this.degradedReason = "AudioContext resume failed; running in caption-only silent mode.";
      }
    }
    if (!this.audioContext && !this.degradedReason) {
      this.degradedReason = "Web Audio API unavailable in this browser; captions remain active.";
    }
    const pending = this.queuedAwaitingGesture;
    this.queuedAwaitingGesture = null;
    if (pending) {
      void this.dispatchSingleCue(pending);
    } else {
      this.notify();
    }
    return this.playbackArmed;
  }

  seedCommittedHistory(matchId: string, cues: readonly AudioCue[]): void {
    if (this.activeMatchId !== matchId) {
      this.activeMatchId = matchId;
      this.lastPlayedSequence = 0;
      this.playedCueIds.clear();
      this.queuedAwaitingGesture = null;
      this.recentDecisions.length = 0;
    }
    let maxSeq = this.lastPlayedSequence;
    for (const cue of cues) {
      this.playedCueIds.add(cue.cueId);
      if (cue.sequence > maxSeq) maxSeq = cue.sequence;
    }
    this.lastPlayedSequence = maxSeq;
    const latest = cues[cues.length - 1];
    if (latest) {
      this.lastCaption = latest.caption;
      this.lastStatus = "DEDUP_SKIPPED";
    }
    this.notify();
  }

  async processCueQueue(input: {
    readonly matchId: string;
    readonly cues: readonly AudioCue[];
    readonly cueQueuedAtMsById?: Readonly<Record<string, number>>;
    readonly fastForwardThreshold?: number;
  }): Promise<AudioDecisionRecord | null> {
    if (this.activeMatchId !== input.matchId) {
      this.seedCommittedHistory(input.matchId, input.cues);
      return null;
    }

    const nowMs = this.now();
    const cueAgesMsById: Record<string, number> = {};
    if (input.cueQueuedAtMsById) {
      for (const cue of input.cues) {
        const queuedAt = input.cueQueuedAtMsById[cue.cueId];
        if (typeof queuedAt === "number") {
          cueAgesMsById[cue.cueId] = Math.max(0, nowMs - queuedAt);
        }
      }
    }

    const selection = selectDispatchableAudioCues({
      cues: input.cues,
      playedCueIds: this.playedCueIds,
      lastPlayedSequence: this.lastPlayedSequence,
      fastForwardThreshold: input.fastForwardThreshold ?? DEFAULT_FAST_FORWARD_BATCH_THRESHOLD,
      cueAgesMsById,
    });

    this.dedupSkippedCount += selection.dedupSkippedCueIds.length;
    this.expiredCount += selection.expiredCueIds.length;
    for (const expiredId of selection.expiredCueIds) {
      this.playedCueIds.add(expiredId);
    }
    if (selection.maxSeenSequence > this.lastPlayedSequence) {
      this.lastPlayedSequence = selection.maxSeenSequence;
    }

    if (!selection.playCue) {
      if (selection.expiredCueIds.length > 0) {
        const lastExpiredCue = input.cues.find(
          (cue) => cue.cueId === selection.expiredCueIds[selection.expiredCueIds.length - 1],
        );
        if (lastExpiredCue) {
          const expiredRecord: AudioDecisionRecord = {
            cueId: lastExpiredCue.cueId,
            sequence: lastExpiredCue.sequence,
            assetId: lastExpiredCue.assetId,
            channel: lastExpiredCue.channel,
            cueKind: lastExpiredCue.cueKind,
            status: "EXPIRED_FAST_FORWARD",
            caption: lastExpiredCue.caption,
          };
          this.recordDecision(expiredRecord);
          this.notify();
          return expiredRecord;
        }
      }
      return null;
    }

    this.playedCueIds.add(selection.playCue.cueId);
    if (this.playedCueIds.size > 400) {
      const recent = [...this.playedCueIds].slice(-200);
      this.playedCueIds.clear();
      for (const id of recent) this.playedCueIds.add(id);
    }

    return this.dispatchSingleCue(selection.playCue);
  }

  async playUiFeedback(caption = "Setting updated"): Promise<AudioDecisionRecord | null> {
    if (!this.playbackArmed) return null;
    const asset = findAudioAssetByCueKind("UI_CLICK", this.manifest);
    if (!asset) return null;
    this.uiClickSeq += 1;
    const cue: AudioCue = {
      cueId: `ui:${this.uiClickSeq}:UI_CLICK`,
      sequence: this.uiClickSeq,
      channel: "INTERFACE",
      cueKind: "UI_CLICK",
      assetId: asset.assetId,
      priority: 10,
      caption,
      ttlMs: 1_500,
    };
    return this.dispatchSingleCue(cue);
  }

  /**
   * CP09: the sting for a match moment, at the effects volume. It follows the same rules as the cues: silent while
   * muted or at zero effects volume, never before the player's first click or key press (browser autoplay policy;
   * a moment seen before then is not saved up to play later), and not in a background tab. Pure presentation.
   */
  playMomentSting(kind: MomentKind, mode: MomentStingMode): MomentStingRecord {
    const finish = (status: MomentStingStatus): MomentStingRecord => {
      this.lastMomentSting = { kind, mode, status };
      this.notify();
      return this.lastMomentSting;
    };
    if (this.getVisibilityState() === "hidden") return finish("BACKGROUND_TAB_SUPPRESSED");
    if (this.preferences.muted || this.preferences.effectsVolume <= 0) return finish("MUTED_OR_ZERO_VOLUME");
    if (!this.playbackArmed) return finish("AWAITING_GESTURE");
    if (!this.audioContext) {
      try {
        this.audioContext = this.createAudioContext();
      } catch {
        this.audioContext = null;
      }
    }
    const ctx = this.audioContext;
    if (!ctx) return finish("UNAVAILABLE");
    try {
      const start = ctx.currentTime + MOMENT_STING_LEAD_SEC;
      const master = ctx.createGain();
      master.gain.setValueAtTime(Math.max(0.001, Math.min(0.65, (this.preferences.effectsVolume / 100) * 0.4)), ctx.currentTime);
      master.connect(ctx.destination);
      for (const t of momentStingTones(kind, mode)) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = t.type;
        osc.frequency.setValueAtTime(t.hz, start + t.delaySec);
        // A short attack and an exponential fall, so no note clicks on or off.
        env.gain.setValueAtTime(0.0001, start + t.delaySec);
        env.gain.exponentialRampToValueAtTime?.(t.level, start + t.delaySec + 0.012);
        env.gain.exponentialRampToValueAtTime?.(0.0001, start + t.delaySec + t.durationSec);
        osc.connect(env);
        env.connect(master);
        osc.start(start + t.delaySec);
        osc.stop(start + t.delaySec + t.durationSec + 0.02);
      }
      return finish("PLAYED");
    } catch {
      return finish("UNAVAILABLE");
    }
  }

  private async dispatchSingleCue(cue: AudioCue): Promise<AudioDecisionRecord> {
    const finalize = (status: AudioPlaybackDecisionStatus): AudioDecisionRecord => {
      const record: AudioDecisionRecord = {
        cueId: cue.cueId,
        sequence: cue.sequence,
        assetId: cue.assetId,
        channel: cue.channel,
        cueKind: cue.cueKind,
        status,
        caption: cue.caption,
      };
      this.recordDecision(record);
      this.notify();
      return record;
    };

    if (this.getVisibilityState() === "hidden") {
      return finalize("BACKGROUND_TAB_SUPPRESSED");
    }

    const volumePercent = channelVolumeFor(this.preferences, cue.channel);
    if (this.preferences.muted || volumePercent <= 0) {
      return finalize("MUTED_OR_ZERO_VOLUME");
    }

    if (!this.playbackArmed) {
      this.queuedAwaitingGesture = cue;
      return finalize("QUEUED_AWAITING_GESTURE");
    }

    const asset = findAudioAssetById(cue.assetId, this.manifest);
    if (!asset || this.missingAssetIds.has(cue.assetId)) {
      this.failedAssetIds.add(cue.assetId);
      this.degradedReason = `Audio asset ${cue.assetId} missing; caption fallback active.`;
      return finalize("MISSING_ASSET_FALLBACK");
    }

    if (!this.audioContext) {
      try {
        this.audioContext = this.createAudioContext();
      } catch {
        this.audioContext = null;
      }
    }

    if (!this.audioContext) {
      this.degradedReason = "Web Audio unavailable; silent caption mode active.";
      return finalize("DECODE_FAILED_FALLBACK");
    }

    if (this.failDecodeAssetIds.has(cue.assetId)) {
      this.failedAssetIds.add(cue.assetId);
      this.degradedReason = `Audio decode fallback triggered for ${cue.assetId}; gameplay unaffected.`;
      return finalize("DECODE_FAILED_FALLBACK");
    }

    try {
      if (this.decodeAssetPayload) {
        const decoded = await this.decodeAssetPayload(asset, this.audioContext);
        if (!decoded) {
          this.failedAssetIds.add(cue.assetId);
          this.degradedReason = `Audio decode rejected for ${cue.assetId}; gameplay unaffected.`;
          return finalize("DECODE_FAILED_FALLBACK");
        }
      }
      renderProceduralSynthCue(this.audioContext, cue.cueKind, volumePercent / 100);
      this.playedCount += 1;
      if (
        this.preferences.narrationEnabled &&
        this.preferences.commentaryVolume > 0 &&
        cue.narrationText &&
        this.speechSynthesis
      ) {
        this.speechSynthesis.speak(cue.narrationText, this.preferences.commentaryVolume / 100);
      }
      return finalize("PLAYED");
    } catch {
      this.failedAssetIds.add(cue.assetId);
      this.degradedReason = `Audio synthesis fallback for ${cue.assetId}; silent captions remain active.`;
      return finalize("DECODE_FAILED_FALLBACK");
    }
  }

  dispose(): void {
    this.speechSynthesis?.cancel();
    if (this.audioContext && typeof this.audioContext.close === "function") {
      try {
        const result = this.audioContext.close();
        if (result && typeof (result as Promise<void>).catch === "function") {
          void (result as Promise<void>).catch(() => undefined);
        }
      } catch {
        // Ignore close errors.
      }
    }
    this.audioContext = null;
    this.listeners.clear();
  }
}
