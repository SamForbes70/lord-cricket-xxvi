import React from "react";
import type { WorldPack } from "@lcxxvi/contracts";
import { pitchVerdict } from "@lcxxvi/projections";
import "./pitch-inspection.css";

export type PitchInspectionProps = {
  ground: WorldPack["grounds"][number] | undefined;
  format: "T20" | "ODI" | "RED_BALL";
};

export function PitchInspection({ ground, format }: PitchInspectionProps) {
  return <section className="pitch-inspection" aria-label="Pitch and conditions" aria-live="polite">
    <h3>Pitch and conditions</h3>
    {ground ? <>
      <p><strong>{ground.name}</strong> · fictional ground</p>
      {(() => {
        const verdict = pitchVerdict(ground.pitchPrior.seamBp, ground.pitchPrior.turnBp);
        return <p className="pitch-verdict" data-testid="pitch-verdict" data-tendency={verdict.tendency}><strong>{verdict.headline}.</strong> {verdict.detail}</p>;
      })()}
      <dl className="pitch-inspection-values">
        <div><dt>Seam assistance</dt><dd>{Math.round(ground.pitchPrior.seamBp / 100)} / 100</dd></div>
        <div><dt>Spin assistance</dt><dd>{Math.round(ground.pitchPrior.turnBp / 100)} / 100</dd></div>
      </dl>
      <p>50 is neutral; higher numbers give bowlers more help. Wear can change both during play.</p>
      {/* Pavilion B5: model limits are for the curious, not part of reading the pitch. */}
      <details className="technical-details">
        <summary>About these numbers</summary>
        <p>The seam and spin numbers set how much the ball moves for pace and spin bowlers.</p>
        <p>Moisture, bounce variability and outfield speed have no effect in the current model.</p>
      </details>
      <p>{format === "RED_BALL" ? "Red-ball delays are not scheduled automatically; no forecast is available." : "Rain interruptions are disabled for this format; no forecast is available."}</p>
    </> : <p>Pitch details are unavailable for this ground.</p>}
  </section>;
}
