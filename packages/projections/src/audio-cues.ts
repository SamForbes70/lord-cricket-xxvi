import {
  AUDIO_PRESENTATION_VERSION,
  AUDIO_PROVENANCE_VERSION,
  type AudioAssetProvenance,
  type AudioChannel,
  type AudioCue,
  type AudioCueKind,
  type AudioCueQueue,
  type AudioPreferences,
  type AudioProvenanceManifest,
  type CommentaryEntry,
  type Format,
} from "@lcxxvi/contracts";

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = Object.freeze({
  version: AUDIO_PRESENTATION_VERSION,
  muted: true,
  crowdVolume: 55,
  effectsVolume: 75,
  commentaryVolume: 65,
  interfaceVolume: 50,
  narrationEnabled: false,
  captionsEnabled: true,
});

export const DEFAULT_CUE_TTL_MS = 4_500;
export const DEFAULT_FAST_FORWARD_BATCH_THRESHOLD = 2;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

export function pureSha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!;
    let b = h[1]!;
    let c = h[2]!;
    let d = h[3]!;
    let e = h[4]!;
    let f = h[5]!;
    let g = h[6]!;
    let hh = h[7]!;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  return Array.from(h)
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

type AssetBlueprint = Omit<AudioAssetProvenance, "sha256">;

const ASSET_BLUEPRINTS: readonly AssetBlueprint[] = [
  {
    assetId: "lc-sfx-bat-dot-v1",
    cueKind: "BAT_BALL_DOT",
    channel: "EFFECTS",
    title: "Willow tap — defensive dot",
    author: "Lord Cricket XXVI Original Synth",
    license: "MIT_ORIGINAL_LORD_CRICKET_XXVI",
    origin: "ORIGINAL_PROCEDURAL_SYNTH",
    synthesisProfile: "triangle-210Hz->120Hz-bandpass-65ms",
    durationMs: 75,
  },
  {
    assetId: "lc-sfx-bat-single-v1",
    cueKind: "BAT_BALL_SINGLE",
    channel: "EFFECTS",
    title: "Crisp bat knock — rotated single/runs",
    author: "Lord Cricket XXVI Original Synth",
    license: "MIT_ORIGINAL_LORD_CRICKET_XXVI",
    origin: "ORIGINAL_PROCEDURAL_SYNTH",
    synthesisProfile: "triangle-340Hz->165Hz-click-95ms",
    durationMs: 105,
  },
  {
    assetId: "lc-crowd-boundary-four-v1",
    cueKind: "BOUNDARY_FOUR",
    channel: "CROWD",
    title: "Sweet-spot drive + boundary applause swell",
    author: "Lord Cricket XXVI Original Synth",
    license: "MIT_ORIGINAL_LORD_CRICKET_XXVI",
    origin: "ORIGINAL_PROCEDURAL_SYNTH",
    synthesisProfile: "harmonic-knock-440Hz+bandpass-applause-680ms",
    durationMs: 720,
  },
  {
    assetId: "lc-crowd-boundary-six-v1",
    cueKind: "BOUNDARY_SIX",
    channel: "CROWD",
    title: "Lofted strike + full stadium roar",
    author: "Lord Cricket XXVI Original Synth",
    license: "MIT_ORIGINAL_LORD_CRICKET_XXVI",
    origin: "ORIGINAL_PROCEDURAL_SYNTH",
    synthesisProfile: "harmonic-strike-520Hz+warm-crowd-swell-960ms",
    durationMs: 980,
  },
  {
    assetId: "lc-sfx-wicket-fall-v1",
    cueKind: "WICKET_FALL",
    channel: "EFFECTS",
    title: "Timber rattle + crowd gasp",
    author: "Lord Cricket XXVI Original Synth",
    license: "MIT_ORIGINAL_LORD_CRICKET_XXVI",
    origin: "ORIGINAL_PROCEDURAL_SYNTH",
    synthesisProfile: "dual-stump-resonance-610Hz-390Hz+crowd-hush-820ms",
    durationMs: 840,
  },
  {
    assetId: "lc-sfx-milestone-chime-v1",
    cueKind: "MILESTONE_CHIME",
    channel: "CROWD",
    title: "Milestone applause & fifth-chord chime",
    author: "Lord Cricket XXVI Original Synth",
    license: "MIT_ORIGINAL_LORD_CRICKET_XXVI",
    origin: "ORIGINAL_PROCEDURAL_SYNTH",
    synthesisProfile: "sine-triad-523Hz-659Hz-784Hz+soft-applause-640ms",
    durationMs: 680,
  },
  {
    assetId: "lc-sfx-over-bell-v1",
    cueKind: "OVER_BELL",
    channel: "EFFECTS",
    title: "End-of-over brass chime",
    author: "Lord Cricket XXVI Original Synth",
    license: "MIT_ORIGINAL_LORD_CRICKET_XXVI",
    origin: "ORIGINAL_PROCEDURAL_SYNTH",
    synthesisProfile: "sine-bell-660Hz-880Hz-240ms",
    durationMs: 260,
  },
  {
    assetId: "lc-sfx-innings-change-v1",
    cueKind: "INNINGS_CHANGE",
    channel: "CROWD",
    title: "Innings interval pavilion chime",
    author: "Lord Cricket XXVI Original Synth",
    license: "MIT_ORIGINAL_LORD_CRICKET_XXVI",
    origin: "ORIGINAL_PROCEDURAL_SYNTH",
    synthesisProfile: "warm-chord-392Hz-494Hz-587Hz-540ms",
    durationMs: 560,
  },
  {
    assetId: "lc-crowd-match-complete-v1",
    cueKind: "MATCH_COMPLETE",
    channel: "CROWD",
    title: "Full-time pavilion fanfare & crowd ovation",
    author: "Lord Cricket XXVI Original Synth",
    license: "MIT_ORIGINAL_LORD_CRICKET_XXVI",
    origin: "ORIGINAL_PROCEDURAL_SYNTH",
    synthesisProfile: "major-fanfare-523Hz-659Hz-784Hz-1046Hz+ovation-1100ms",
    durationMs: 1150,
  },
  {
    assetId: "lc-ui-click-v1",
    cueKind: "UI_CLICK",
    channel: "INTERFACE",
    title: "Subtle tactile slate click",
    author: "Lord Cricket XXVI Original Synth",
    license: "MIT_ORIGINAL_LORD_CRICKET_XXVI",
    origin: "ORIGINAL_PROCEDURAL_SYNTH",
    synthesisProfile: "sine-tick-740Hz->420Hz-35ms",
    durationMs: 40,
  },
];

const PROVENANCE_ASSETS: readonly AudioAssetProvenance[] = ASSET_BLUEPRINTS.map(
  (blueprint) => ({
    ...blueprint,
    sha256: pureSha256Hex(
      JSON.stringify({
        assetId: blueprint.assetId,
        cueKind: blueprint.cueKind,
        channel: blueprint.channel,
        license: blueprint.license,
        origin: blueprint.origin,
        synthesisProfile: blueprint.synthesisProfile,
        durationMs: blueprint.durationMs,
      }),
    ),
  }),
);

export const ORIGINAL_AUDIO_PROVENANCE_MANIFEST: AudioProvenanceManifest = {
  manifestVersion: AUDIO_PROVENANCE_VERSION,
  attributionNotice:
    "All audio cues are synthesized offline in-repo from original mathematical waveforms and noise envelopes owned by Lord Cricket XXVI (MIT). No third-party commercial sound recordings, voices, or network audio streams are used.",
  networkCallsAllowed: false,
  assets: [...PROVENANCE_ASSETS],
};

export function findAudioAssetById(
  assetId: string,
  manifest: AudioProvenanceManifest = ORIGINAL_AUDIO_PROVENANCE_MANIFEST,
): AudioAssetProvenance | null {
  return manifest.assets.find((asset) => asset.assetId === assetId) ?? null;
}

export function findAudioAssetByCueKind(
  cueKind: AudioCueKind,
  manifest: AudioProvenanceManifest = ORIGINAL_AUDIO_PROVENANCE_MANIFEST,
): AudioAssetProvenance | null {
  return manifest.assets.find((asset) => asset.cueKind === cueKind) ?? null;
}

function factValue(entry: CommentaryEntry, slotName: string): string | undefined {
  return entry.factSlots.find((slot) => slot.slot === slotName)?.value;
}

function classifyCueForCommentaryEntry(
  entry: CommentaryEntry,
): {
  cueKind: AudioCueKind;
  channel: AudioChannel;
  priority: number;
  caption: string;
  narrationText?: string;
} | null {
  if (entry.category === "RESULT") {
    return {
      cueKind: "MATCH_COMPLETE",
      channel: "CROWD",
      priority: 95,
      caption: `Match complete: ${entry.short}`,
      narrationText: entry.text,
    };
  }
  if (entry.category === "INNINGS") {
    return {
      cueKind: "INNINGS_CHANGE",
      channel: "CROWD",
      priority: 75,
      caption: `Innings update: ${entry.short}`,
      narrationText: entry.text,
    };
  }
  if (entry.category === "DISMISSAL") {
    return {
      cueKind: "WICKET_FALL",
      channel: "EFFECTS",
      priority: 92,
      caption: `Wicket! ${entry.short}`,
      narrationText: entry.text,
    };
  }
  if (
    entry.milestoneTags.some((tag) =>
      [
        "BATTER_FIFTY",
        "BATTER_CENTURY",
        "BATTER_150",
        "BATTER_DOUBLE_CENTURY",
        "PARTNERSHIP_FIFTY",
        "PARTNERSHIP_CENTURY",
        "PARTNERSHIP_150",
        "BOWLER_THREE_FOR",
        "BOWLER_FIVE_FOR",
      ].includes(tag),
    )
  ) {
    const boundary = factValue(entry, "boundary");
    const tagLabel = entry.milestoneTags.join(", ").replace(/_/g, " ").toLowerCase();
    return {
      cueKind: "MILESTONE_CHIME",
      channel: "CROWD",
      priority: boundary === "6" ? 88 : 82,
      caption: `Milestone (${tagLabel}): ${entry.short}`,
      narrationText: entry.text,
    };
  }
  if (entry.category === "OVER") {
    return {
      cueKind: "OVER_BELL",
      channel: "EFFECTS",
      priority: 55,
      caption: `Over complete: ${entry.short}`,
      narrationText: entry.short,
    };
  }
  if (entry.category === "DELIVERY") {
    const boundary = factValue(entry, "boundary");
    const runs = Number(factValue(entry, "runs") ?? "0");
    if (boundary === "6") {
      return {
        cueKind: "BOUNDARY_SIX",
        channel: "CROWD",
        priority: 86,
        caption: `SIX! ${entry.short}`,
        narrationText: entry.text,
      };
    }
    if (boundary === "4") {
      return {
        cueKind: "BOUNDARY_FOUR",
        channel: "CROWD",
        priority: 80,
        caption: `FOUR! ${entry.short}`,
        narrationText: entry.text,
      };
    }
    if (runs > 0) {
      return {
        cueKind: "BAT_BALL_SINGLE",
        channel: "EFFECTS",
        priority: 35,
        caption: entry.short,
      };
    }
    return {
      cueKind: "BAT_BALL_DOT",
      channel: "EFFECTS",
      priority: 20,
      caption: entry.short,
    };
  }
  return null;
}

export function projectMatchAudioCues(input: {
  readonly format: Format;
  readonly matchId: string;
  readonly commentaryEntries: readonly CommentaryEntry[];
  readonly maxCues?: number;
}): AudioCueQueue {
  const maxCues = input.maxCues ?? 48;
  const ordered = [...input.commentaryEntries].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const sliced = maxCues > 0 ? ordered.slice(-maxCues) : ordered;
  const cues: AudioCue[] = [];
  for (const entry of sliced) {
    const classified = classifyCueForCommentaryEntry(entry);
    if (!classified) continue;
    const asset = findAudioAssetByCueKind(classified.cueKind);
    if (!asset) continue;
    cues.push({
      cueId: `${input.matchId}:${entry.sequence}:${classified.cueKind}`,
      sequence: entry.sequence,
      channel: classified.channel,
      cueKind: classified.cueKind,
      assetId: asset.assetId,
      priority: classified.priority,
      caption: classified.caption.slice(0, 280),
      ...(classified.narrationText
        ? { narrationText: classified.narrationText.slice(0, 360) }
        : {}),
      ttlMs: DEFAULT_CUE_TTL_MS,
    });
  }
  return {
    adapterVersion: AUDIO_PRESENTATION_VERSION,
    matchId: input.matchId,
    format: input.format,
    cues,
  };
}

export type CueBatchSelection = {
  readonly playCue: AudioCue | null;
  readonly expiredCueIds: readonly string[];
  readonly dedupSkippedCueIds: readonly string[];
  readonly maxSeenSequence: number;
};

export function selectDispatchableAudioCues(input: {
  readonly cues: readonly AudioCue[];
  readonly playedCueIds: ReadonlySet<string>;
  readonly lastPlayedSequence: number;
  readonly fastForwardThreshold?: number;
  readonly cueAgesMsById?: Readonly<Record<string, number>>;
}): CueBatchSelection {
  const threshold = input.fastForwardThreshold ?? DEFAULT_FAST_FORWARD_BATCH_THRESHOLD;
  const dedupSkippedCueIds: string[] = [];
  const unseen: AudioCue[] = [];
  let maxSeenSequence = input.lastPlayedSequence;

  for (const cue of input.cues) {
    if (cue.sequence > maxSeenSequence) maxSeenSequence = cue.sequence;
    if (cue.sequence <= input.lastPlayedSequence || input.playedCueIds.has(cue.cueId)) {
      dedupSkippedCueIds.push(cue.cueId);
      continue;
    }
    unseen.push(cue);
  }

  if (unseen.length === 0) {
    return {
      playCue: null,
      expiredCueIds: [],
      dedupSkippedCueIds,
      maxSeenSequence,
    };
  }

  const expiredCueIds: string[] = [];
  const fresh: AudioCue[] = [];
  for (const cue of unseen) {
    const ageMs = input.cueAgesMsById?.[cue.cueId] ?? 0;
    if (ageMs > cue.ttlMs) {
      expiredCueIds.push(cue.cueId);
    } else {
      fresh.push(cue);
    }
  }

  if (fresh.length === 0) {
    return {
      playCue: null,
      expiredCueIds,
      dedupSkippedCueIds,
      maxSeenSequence,
    };
  }

  if (fresh.length > threshold) {
    // Fast-forward batch: keep only the highest-priority latest cue (ties broken by highest sequence).
    let chosen = fresh[fresh.length - 1]!;
    for (const candidate of fresh) {
      if (
        candidate.priority > chosen.priority ||
        (candidate.priority === chosen.priority && candidate.sequence > chosen.sequence)
      ) {
        chosen = candidate;
      }
    }
    for (const candidate of fresh) {
      if (candidate.cueId !== chosen.cueId) expiredCueIds.push(candidate.cueId);
    }
    return {
      playCue: chosen,
      expiredCueIds,
      dedupSkippedCueIds,
      maxSeenSequence,
    };
  }

  // Small interactive step: play the newest cue, skipping older intermediate cues from the same single command.
  const chosen = fresh[fresh.length - 1]!;
  for (const candidate of fresh) {
    if (candidate.cueId !== chosen.cueId) expiredCueIds.push(candidate.cueId);
  }
  return {
    playCue: chosen,
    expiredCueIds,
    dedupSkippedCueIds,
    maxSeenSequence,
  };
}
