import React from "react";
import type { WorldPack } from "@lcxxvi/contracts";
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
      <dl className="pitch-inspection-values">
        <div><dt>Seam assistance</dt><dd>{(ground.pitchPrior.seamBp / 100).toFixed(2)} / 100</dd></div>
        <div><dt>Spin assistance</dt><dd>{(ground.pitchPrior.turnBp / 100).toFixed(2)} / 100</dd></div>
      </dl>
      <p>These indices affect bowling movement. 50 is neutral; higher values give more assistance.</p>
      <p>Pitch wear can change seam and spin assistance during play.</p>
      <p>Moisture, bounce variability and outfield speed have no effect in the current model.</p>
      <p>{format === "RED_BALL" ? "Red-ball delays are not scheduled automatically; no forecast is available." : "Rain interruptions are disabled for this format; no forecast is available."}</p>
    </> : <p>Pitch details are unavailable for this ground.</p>}
  </section>;
}
