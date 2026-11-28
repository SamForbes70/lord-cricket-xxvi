import { useState } from "react";
import type { AudioPreferences, AudioProvenanceManifest } from "@lcxxvi/contracts";
import { ORIGINAL_AUDIO_PROVENANCE_MANIFEST } from "@lcxxvi/projections";
import type { AudioManagerSnapshot } from "./audio-manager.js";

export type AudioControlsPanelProps = {
  readonly preferences: AudioPreferences;
  readonly snapshot: AudioManagerSnapshot;
  readonly onChangePreferences: (next: AudioPreferences) => void;
  readonly onUnlockAudio: () => void;
  readonly onUiInteract?: (caption: string) => void;
  readonly manifest?: AudioProvenanceManifest;
};

function statusLabel(
  preferences: AudioPreferences,
  snapshot: AudioManagerSnapshot,
): string {
  if (preferences.muted) return "Muted (silent captions)";
  if (snapshot.degradedReason) return "Silent caption fallback";
  if (!snapshot.playbackArmed) return "Awaiting click/key gesture";
  if (snapshot.lastStatus === "EXPIRED_FAST_FORWARD") return "Fast-forward (stale cues skipped)";
  if (snapshot.lastStatus === "BACKGROUND_TAB_SUPPRESSED") return "Paused in background tab";
  return "Audio active";
}

export function AudioControlsPanel({
  preferences,
  snapshot,
  onChangePreferences,
  onUnlockAudio,
  onUiInteract,
  manifest = ORIGINAL_AUDIO_PROVENANCE_MANIFEST,
}: AudioControlsPanelProps) {
  const [controlsOpen, setControlsOpen] = useState(false);

  function update(patch: Partial<AudioPreferences>, feedbackCaption: string) {
    onUnlockAudio();
    onChangePreferences({
      ...preferences,
      ...patch,
    });
    onUiInteract?.(feedbackCaption);
  }

  return (
    <section
      className="audio-presentation-bar"
      aria-label="Audio and captions"
      data-testid="match-audio-panel"
      data-moment-sting={
        snapshot.lastMomentSting
          ? `${snapshot.lastMomentSting.kind}:${snapshot.lastMomentSting.mode}:${snapshot.lastMomentSting.status}`
          : undefined
      }
    >
      <div className="audio-bar-top">
        <div className="audio-bar-actions">
          <button
            type="button"
            className={preferences.muted ? "secondary" : "primary"}
            aria-pressed={preferences.muted}
            onClick={() =>
              update(
                { muted: !preferences.muted },
                preferences.muted ? "Audio unmuted" : "Audio muted",
              )
            }
          >
            {preferences.muted ? "Sound: Muted" : "Sound: On"}
          </button>
          <button
            type="button"
            className="secondary"
            aria-expanded={controlsOpen}
            onClick={() => {
              onUnlockAudio();
              setControlsOpen((open) => !open);
            }}
          >
            {controlsOpen ? "Hide audio mixer" : "Audio mixer & provenance"}
          </button>
          <span className="audio-status-pill" data-testid="audio-status-pill">
            {statusLabel(preferences, snapshot)}
          </span>
        </div>
      </div>

      {preferences.captionsEnabled && (
        <p
          className="audio-caption-banner"
          role="status"
          aria-live="polite"
          data-testid="audio-caption-banner"
        >
          <strong>Audio caption:</strong>{" "}
          {snapshot.lastCaption
            ? snapshot.lastCaption
            : "Ready: match audio captions appear here even in silent mode."}
        </p>
      )}

      {snapshot.degradedReason && (
        <p className="audio-fallback-note" role="status" data-testid="audio-fallback-note">
          {snapshot.degradedReason}
        </p>
      )}

      {controlsOpen && (
        <div className="audio-mixer-drawer" data-testid="audio-mixer-drawer">
          <div className="audio-sliders-grid">
            <label>
              Crowd volume ({preferences.crowdVolume}%)
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Crowd volume"
                value={preferences.crowdVolume}
                onChange={(e) =>
                  update({ crowdVolume: Number(e.target.value) }, "Crowd volume updated")
                }
              />
            </label>
            <label>
              Effects volume ({preferences.effectsVolume}%)
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Effects volume"
                value={preferences.effectsVolume}
                onChange={(e) =>
                  update({ effectsVolume: Number(e.target.value) }, "Effects volume updated")
                }
              />
            </label>
            <label>
              Commentary narration volume ({preferences.commentaryVolume}%)
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Commentary narration volume"
                value={preferences.commentaryVolume}
                onChange={(e) =>
                  update(
                    { commentaryVolume: Number(e.target.value) },
                    "Commentary narration volume updated",
                  )
                }
              />
            </label>
            <label>
              Interface volume ({preferences.interfaceVolume}%)
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Interface volume"
                value={preferences.interfaceVolume}
                onChange={(e) =>
                  update({ interfaceVolume: Number(e.target.value) }, "Interface volume updated")
                }
              />
            </label>
          </div>
          <div className="audio-toggles-row">
            <label className="check-label">
              <input
                type="checkbox"
                aria-label="Mute all audio"
                checked={preferences.muted}
                onChange={(e) =>
                  update(
                    { muted: e.target.checked },
                    e.target.checked ? "All audio muted" : "All audio unmuted",
                  )
                }
              />{" "}
              Mute all audio (silent mode)
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                aria-label="Speech narration"
                checked={preferences.narrationEnabled}
                onChange={(e) =>
                  update(
                    { narrationEnabled: e.target.checked },
                    e.target.checked ? "Speech narration enabled" : "Speech narration disabled",
                  )
                }
              />{" "}
              Spoken commentary narration (browser speech)
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                aria-label="Show audio captions"
                checked={preferences.captionsEnabled}
                onChange={(e) =>
                  update(
                    { captionsEnabled: e.target.checked },
                    e.target.checked ? "Audio captions shown" : "Audio captions hidden",
                  )
                }
              />{" "}
              Show audio captions
            </label>
          </div>
          <details className="audio-provenance-details" data-testid="audio-provenance-details">
            <summary>
              Audio provenance manifest ({manifest.manifestVersion} · {manifest.assets.length} original cues)
            </summary>
            <p className="meta">{manifest.attributionNotice}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Channel</th>
                    <th>Origin</th>
                    <th>License</th>
                    <th>SHA-256</th>
                  </tr>
                </thead>
                <tbody>
                  {manifest.assets.map((asset) => (
                    <tr key={asset.assetId}>
                      <td>{asset.title}</td>
                      <td>{asset.channel}</td>
                      <td>{asset.origin}</td>
                      <td>{asset.license}</td>
                      <td>
                        <code>{asset.sha256.slice(0, 12)}…</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
