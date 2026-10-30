import React, { useEffect, useRef, useState } from "react";
import type { WorldPack } from "@lcxxvi/contracts";
import { createNewGameWorldCopy, validateNewGameWorldCopy, type NewGameWorldCopy } from "./new-game-world.js";

const MAX_COPY_BYTES = 2_000_000;

export function WorldEditor({ base, initial, purpose = "career", onClose, onStage }: {
  base: WorldPack;
  initial: NewGameWorldCopy | null;
  purpose?: "career" | "exhibition";
  onClose: () => void;
  onStage: (copy: NewGameWorldCopy) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(initial?.world ?? base));
  const [teamId, setTeamId] = useState(base.teams[0]!.teamId);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const team = draft.teams.find(item => item.teamId === teamId)!;
  const ground = draft.grounds.find(item => item.groundId === teamId.replace("team-", "ground-"))!;
  const players = team.squadIds.map(id => draft.players.find(player => player.playerId === id)!);

  function change(edit: (world: WorldPack) => void) {
    setDraft(previous => {
      const next = structuredClone(previous);
      edit(next);
      return next;
    });
    setError("");
  }

  function stage() {
    try {
      onStage(createNewGameWorldCopy(draft, base));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The world copy is invalid.");
    }
  }

  async function loadCopy(file: File | null) {
    if (!file) return;
    try {
      if (file.size > MAX_COPY_BYTES) throw new Error("The world copy exceeds the 2 MB limit.");
      const copy = validateNewGameWorldCopy(JSON.parse(await file.text()), base);
      setDraft(copy.world);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The world copy could not be read.");
    }
  }

  function download() {
    try {
      const copy = createNewGameWorldCopy(draft, base);
      const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2) + "\n"], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${copy.world.packId}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The world copy is invalid.");
    }
  }

  return <section className="career-panel world-editor" aria-labelledby="world-editor-heading">
    <h2 id="world-editor-heading" ref={heading} tabIndex={-1}>Edit a new-game world</h2>
    <p>Change names and team colours for a new {purpose}. Existing games keep their original data.</p>
    {error && <p role="alert" className="career-error">{error}</p>}
    <label>Team to edit <select aria-label="Team to edit" value={teamId} onChange={event => setTeamId(event.currentTarget.value)}>
      {draft.teams.map(item => <option key={item.teamId} value={item.teamId}>{item.name}</option>)}
    </select></label>
    <div className="world-editor-fields">
      <label>Team name <input maxLength={80} value={team.name} onChange={event => { const value = event.currentTarget.value; change(world => { world.teams.find(item => item.teamId === teamId)!.name = value; }); }} /></label>
      <label>Ground name <input maxLength={80} value={ground.name} onChange={event => { const value = event.currentTarget.value; change(world => { world.grounds.find(item => item.groundId === ground.groundId)!.name = value; }); }} /></label>
      {team.colours.map((colour, index) => <label key={index}>{index === 0 ? "Primary colour" : "Secondary colour"} <input type="color" value={colour} onChange={event => { const value = event.currentTarget.value; change(world => { world.teams.find(item => item.teamId === teamId)!.colours[index] = value; }); }} /></label>)}
    </div>
    <h3>Player names</h3>
    <div className="world-editor-players">{players.map(player => <label key={player.playerId}>{player.playerId} <input aria-label={`Name for ${player.playerId}`} maxLength={80} value={player.name} onChange={event => { const value = event.currentTarget.value; change(world => { world.players.find(item => item.playerId === player.playerId)!.name = value; }); }} /></label>)}</div>
    <div className="action-row">
      <button type="button" className="primary" onClick={stage}>Use for new {purpose}</button>
      <button type="button" onClick={download}>Download world copy</button>
      <button type="button" onClick={onClose}>Cancel</button>
    </div>
    <label>Open a saved world copy <input type="file" accept=".json,application/json" onChange={event => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void loadCopy(file); }} /></label>
  </section>;
}
