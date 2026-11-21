import type { AudioPreferences } from "@lcxxvi/contracts";
import { loadStoredAudioPreferences, saveStoredAudioPreferences } from "./match/audio-manager.js";

/**
 * Menu sound and match ambience (owner order of 20 November 2026, step 4: free sound). Everything is synthesised in
 * the browser with Web Audio, like the match cues: no recorded or downloaded audio. It follows the same stored
 * preferences as the match audio, so one switch (the title screen's Sound button or the match's audio panel) turns all
 * of it on or off. Sound starts muted, as before.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

export function soundOn(prefs: AudioPreferences = loadStoredAudioPreferences()): boolean {
  return !prefs.muted;
}

/** Turns all game sound on or off and returns the new preferences. */
export function setSoundOn(on: boolean): AudioPreferences {
  const next = { ...loadStoredAudioPreferences(), muted: !on };
  saveStoredAudioPreferences(next);
  if (on) playUiClick(next);
  return next;
}

/** A short soft click for menu buttons, at the interface volume. */
export function playUiClick(prefs: AudioPreferences = loadStoredAudioPreferences()): void {
  if (prefs.muted || prefs.interfaceVolume <= 0) return;
  const c = context();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(520, now + 0.05);
  env.gain.setValueAtTime(0.12 * (prefs.interfaceVolume / 100), now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  osc.connect(env).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.07);
}

/**
 * Two seconds of soft crowd murmur, made once: deterministic low-passed noise in slow swells. The last fifth of a second
 * is crossfaded into the start, so the loop has no click at the join. Exported for tests.
 */
export function crowdBed(sampleRate: number, seconds = 2): Float32Array {
  const n = Math.max(2, Math.floor(sampleRate * seconds));
  const fade = Math.max(1, Math.floor(sampleRate * 0.2));
  const raw = new Float32Array(n + fade);
  let seed = 0x2545f491;
  let brown = 0;
  for (let i = 0; i < raw.length; i += 1) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02; // Low-passed "brown" noise reads as distant voices.
    raw[i] = brown * 3.2;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const swell = 0.75 + 0.25 * Math.sin((2 * Math.PI * i) / n); // One gentle swell per loop.
    const sample = i < fade ? raw[i]! * (i / fade) + raw[n + i]! * (1 - i / fade) : raw[i]!;
    out[i] = Math.max(-1, Math.min(1, sample * swell));
  }
  return out;
}

/** A looping crowd murmur under a match, at the crowd volume. One instance per match screen. */
export class CrowdAmbience {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;

  start(prefs: AudioPreferences): void {
    if (prefs.muted || prefs.crowdVolume <= 0) {
      this.stop();
      return;
    }
    const c = context();
    if (!c) return;
    const level = 0.07 * (prefs.crowdVolume / 100);
    if (this.source && this.gain) {
      this.gain.gain.setTargetAtTime(level, c.currentTime, 0.4);
      return;
    }
    const buffer = c.createBuffer(1, Math.floor(c.sampleRate * 2), c.sampleRate);
    buffer.copyToChannel(crowdBed(c.sampleRate) as Float32Array<ArrayBuffer>, 0);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.setTargetAtTime(level, c.currentTime, 0.8);
    source.connect(filter).connect(gain).connect(c.destination);
    source.start();
    this.source = source;
    this.gain = gain;
  }

  stop(): void {
    if (!this.source || !this.gain || !ctx) return;
    const { source, gain } = this;
    gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    window.setTimeout(() => {
      try {
        source.stop();
      } catch {
        /* Already stopped. */
      }
    }, 1200);
    this.source = null;
    this.gain = null;
  }
}
