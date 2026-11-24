import type {
  InMatchTacticalAssistantView,
  PreMatchBriefing,
  TacticalPresetOption,
} from "@lcxxvi/contracts";
import type { Action } from "./protocol.js";

const TENDENCY_LABEL: Record<PreMatchBriefing["ground"]["pitchTendency"], string> = {
  SEAM_FRIENDLY: "Seam-leaning",
  SPIN_FRIENDLY: "Spin-leaning",
  LIVE_BOTH: "Seam & spin assistance",
  BALANCED: "Balanced",
  FLAT: "Batting-friendly",
};

const CONDITION_LABEL: Record<string, string> = {
  FRESH: "Fresh",
  READY: "Ready",
  WORKED: "Worked",
  TIRED: "Tired",
};

export function PreMatchBriefingPanel({
  briefing,
  defaultOpen = false,
  focusTeamId = null,
}: {
  briefing: PreMatchBriefing;
  defaultOpen?: boolean;
  focusTeamId?: string | null;
}) {
  const orderedTeams =
    focusTeamId && briefing.teams[1].teamId === focusTeamId
      ? [briefing.teams[1], briefing.teams[0]]
      : [briefing.teams[0], briefing.teams[1]];
  const orderedObservations =
    focusTeamId && briefing.teams[1].teamId === focusTeamId
      ? [briefing.opponentObservations[1], briefing.opponentObservations[0]]
      : [briefing.opponentObservations[0], briefing.opponentObservations[1]];

  return (
    <details
      className="tactical-disclosure"
      data-testid="prematch-briefing-panel"
      open={defaultOpen || undefined}
    >
      <summary>
        Pre-match tactical briefing (optional) — {briefing.ground.groundName} ·{" "}
        {TENDENCY_LABEL[briefing.ground.pitchTendency]}
      </summary>
      <div className="tactical-disclosure-body">
        <div className="tactical-briefing-grid">
          <div className="tactical-card" data-testid="prematch-pitch-card">
            <h3>Pitch &amp; format playing conditions</h3>
            <p>
              <strong>{TENDENCY_LABEL[briefing.ground.pitchTendency]}</strong> · Seam{" "}
              {Math.round(briefing.ground.seamBp / 100)}/100 · Spin{" "}
              {Math.round(briefing.ground.turnBp / 100)}/100
            </p>
            <p>{briefing.ground.pitchSummary}</p>
            <p>{briefing.ground.formatRulesSummary}</p>
            <small>{briefing.ground.modelLimitsDisclosure}</small>
          </div>

          {orderedTeams.map((team, idx) => {
            const opp = orderedObservations[idx]!;
            return (
              <div
                key={team.teamId}
                className="tactical-card"
                data-testid={`prematch-team-card-${team.teamId}`}
              >
                <h3>{team.teamName} — squad readiness &amp; opponent scouting</h3>
                <p>{team.balanceSummary}</p>
                <p>
                  <strong>Opposition ({opp.opponentTeamName}):</strong>
                </p>
                <ul className="tactical-bullet-list">
                  {opp.observations.map((obs, obsIdx) => (
                    <li key={obsIdx}>{obs}</li>
                  ))}
                </ul>
                <details className="tactical-subdisclosure">
                  <summary>
                    Available squad &amp; fatigue ({team.players.length} players)
                  </summary>
                  <div className="table-wrap">
                    <table className="tactical-table">
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>XI</th>
                          <th>Role</th>
                          <th>Bat</th>
                          <th>Bowl</th>
                          <th>Fatigue</th>
                          <th>Condition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.players.map((p) => (
                          <tr key={p.playerId}>
                            <td>{p.name}</td>
                            <td>{p.selectedInXI ? "XI" : "—"}</td>
                            <td>{p.role}</td>
                            <td>{p.batHand}HB</td>
                            <td>{p.bowlingStyle ?? "—"}</td>
                            <td>{Math.round(p.fatigueBp / 100)}%</td>
                            <td>
                              {CONDITION_LABEL[p.conditionBand] ?? p.conditionBand}
                              {p.readinessDelta !== 0
                                ? ` (${p.readinessDelta > 0 ? `+${p.readinessDelta}` : p.readinessDelta})`
                                : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

export function InMatchTacticalAssistantPanel({
  assistant,
  phase,
  busy,
  strikerId,
  activeBowlerId,
  bowlingTeamId,
  onApplyAction,
}: {
  assistant: InMatchTacticalAssistantView;
  phase: string;
  busy: boolean;
  strikerId: string | null;
  activeBowlerId: string | null;
  bowlingTeamId: string | null;
  onApplyAction: (action: Action) => void;
}) {
  const battingPresets = assistant.presets.filter(
    (p) => p.commandKind === "SET_BATTING_PLAN",
  );
  const bowlingPresets = assistant.presets.filter(
    (p) => p.commandKind === "SET_BOWLING_PLAN",
  );
  const fieldPresets = assistant.presets.filter(
    (p) => p.commandKind === "SET_FIELD",
  );

  function triggerPreset(preset: TacticalPresetOption) {
    if (busy || phase !== "READY") return;
    if (preset.commandKind === "SET_BATTING_PLAN" && preset.battingPatch && strikerId) {
      onApplyAction({
        kind: "SET_BATTING_PLAN",
        payload: {
          playerId: strikerId,
          aggression: preset.battingPatch.aggression,
          intent: preset.battingPatch.intent,
        },
      });
      return;
    }
    if (
      preset.commandKind === "SET_BOWLING_PLAN" &&
      preset.bowlingPatch &&
      activeBowlerId
    ) {
      onApplyAction({
        kind: "SET_BOWLING_PLAN",
        payload: {
          bowlerId: activeBowlerId,
          line: preset.bowlingPatch.line,
          length: preset.bowlingPatch.length,
          effort: preset.bowlingPatch.effort,
          variationId: preset.bowlingPatch.variationId,
        },
      });
      return;
    }
    if (preset.commandKind === "SET_FIELD" && preset.fieldSlots && bowlingTeamId) {
      onApplyAction({
        kind: "SET_FIELD",
        payload: {
          teamId: bowlingTeamId,
          fieldSlots: preset.fieldSlots,
        },
      });
      return;
    }
    void preset;
  }

  return (
    <section
      className="panel tactical-assistant"
      aria-labelledby="tactical-assistant-heading"
      data-testid="inmatch-tactical-assistant"
    >
      <h2 id="tactical-assistant-heading">Tactical assistant &amp; spell review</h2>

      <div className="tactical-situation-bar" data-testid="tactical-situation-bar">
        <div>
          <strong>{assistant.situation.phaseLabel}</strong> ·{" "}
          {assistant.situation.fieldRestrictionLabel}
        </div>
        <div>{assistant.situation.scoreContextLabel}</div>
        <div>
          {assistant.situation.pitchSummaryLabel} ·{" "}
          {assistant.situation.activeBowlerWorkloadLabel}
        </div>
      </div>

      {phase === "READY" && assistant.presets.length > 0 && (
        <details className="tactical-disclosure" data-testid="tactical-presets">
          <summary>
            Contextual tactical presets ({assistant.presets.filter((p) => p.contextualMatch).length}{" "}
            situational matches)
          </summary>
          <div className="tactical-disclosure-body">
            <small>
              Presets submit existing legal match commands with no hidden statistical
              bonuses. Individual controls and captain delegation remain available above.
            </small>
            {[
              { title: "Batting presets (striker)", list: battingPresets },
              { title: "Bowling plan presets", list: bowlingPresets },
              { title: "Phase-legal field presets", list: fieldPresets },
            ]
              .filter((group) => group.list.length > 0)
              .map((group) => (
                <div key={group.title} className="tactical-preset-group">
                  <h3>{group.title}</h3>
                  <div className="tactical-preset-grid">
                    {group.list.map((preset) => (
                      <div
                        key={preset.presetId}
                        className={`tactical-preset-card${preset.contextualMatch ? " contextual" : ""}${preset.activeNow ? " active" : ""}`}
                        data-testid={`preset-card-${preset.presetId}`}
                      >
                        <div className="tactical-preset-header">
                          <strong>{preset.label}</strong>
                          <span className="tactical-badges">
                            {preset.contextualMatch && (
                              <span className="tactical-badge fit">Situational fit</span>
                            )}
                            {preset.activeNow && (
                              <span className="tactical-badge active">Active</span>
                            )}
                          </span>
                        </div>
                        {preset.contextualReason && (
                          <small className="tactical-context-reason">
                            {preset.contextualReason}
                          </small>
                        )}
                        <p>
                          <strong>Use:</strong> {preset.whenToUse}
                        </p>
                        <p>
                          <strong>Trade-off:</strong> {preset.tradeOff}
                        </p>
                        <button
                          type="button"
                          disabled={busy || preset.activeNow}
                          data-testid={`apply-preset-${preset.presetId}`}
                          onClick={() => triggerPreset(preset)}
                        >
                          {preset.activeNow ? `Active: ${preset.label}` : `Apply: ${preset.label}`}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </details>
      )}

      <details className="tactical-disclosure" data-testid="tactical-control-guide">
        <summary>Plain-language tactical control trade-offs (7 controls)</summary>
        <div className="tactical-disclosure-body">
          <div className="table-wrap">
            <table className="tactical-table">
              <thead>
                <tr>
                  <th>Control</th>
                  <th>Current</th>
                  <th>Upside</th>
                  <th>Trade-off</th>
                </tr>
              </thead>
              <tbody>
                {assistant.controlGuide.map((item) => (
                  <tr key={item.controlId} data-testid={`control-guide-${item.controlId}`}>
                    <td>
                      <strong>{item.label}</strong>
                    </td>
                    <td>{item.currentSetting}</td>
                    <td>{item.upside}</td>
                    <td>{item.tradeOff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <div className="tactical-spell-section" data-testid="spell-outcome-reviews">
        <h3>Spell plan vs factual outcomes</h3>
        {assistant.spellReviews.length === 0 ? (
          <p className="tactical-empty">
            Bowl at least one delivery to compare the accepted bowling and field plan
            beside recorded outcomes.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="tactical-table">
              <thead>
                <tr>
                  <th>Spell</th>
                  <th>Accepted plan</th>
                  <th>Recorded figures</th>
                  <th>Length landing &amp; contact</th>
                  <th>Factual summary</th>
                </tr>
              </thead>
              <tbody>
                {assistant.spellReviews.slice(0, 8).map((sp) => (
                  <tr key={sp.spellId} data-testid={`spell-review-${sp.spellId}`}>
                    <td>
                      <strong>{sp.bowlerName}</strong>
                      <small>
                        Inn {sp.inningsIndex + 1} · Spell #{sp.spellNumberInInnings} (Ov{" "}
                        {sp.startOver}–{sp.endOver}) ·{" "}
                        {sp.status === "COMPLETED"
                          ? "Completed"
                          : sp.status === "BETWEEN_OVERS"
                            ? "Between overs"
                            : "Active over"}
                      </small>
                    </td>
                    <td>
                      {sp.acceptedPlan.primaryLength} · {sp.acceptedPlan.primaryLine} ·{" "}
                      {sp.acceptedPlan.primaryEffort} ({sp.acceptedPlan.primaryVariationId})
                      <small>
                        Field: {sp.acceptedPlan.latestRingFielders} ring /{" "}
                        {sp.acceptedPlan.latestBoundaryFielders} deep ·{" "}
                        {sp.acceptedPlan.latestCloseCatchers} slip
                        {sp.acceptedPlan.latestCloseCatchers === 1 ? "" : "s"}
                      </small>
                    </td>
                    <td>
                      <strong>
                        {sp.outcomes.oversDisplay} ov · {sp.outcomes.wickets}/
                        {sp.outcomes.runsConceded}
                      </strong>
                      <small>
                        Econ{" "}
                        {sp.outcomes.economyX100 === null
                          ? "—"
                          : (sp.outcomes.economyX100 / 100).toFixed(2)}{" "}
                        · {sp.outcomes.dots} dots · {sp.outcomes.singles} 1s ·{" "}
                        {sp.outcomes.boundaries} bdry ({sp.outcomes.fours}x4,{" "}
                        {sp.outcomes.sixes}x6)
                      </small>
                    </td>
                    <td>
                      {sp.outcomes.intendedLengthMatches}/
                      {sp.outcomes.intendedLengthEvaluatedBalls} on intended length
                      <small>
                        Contact: G {sp.outcomes.trajectories.GROUND} · A{" "}
                        {sp.outcomes.trajectories.AERIAL} · E{" "}
                        {sp.outcomes.trajectories.EDGE} · Miss{" "}
                        {sp.outcomes.trajectories.NO_CONTACT} | Field: Stops{" "}
                        {sp.outcomes.fieldOutcomes.STOP} · C{" "}
                        {sp.outcomes.fieldOutcomes.CATCH} · Drops{" "}
                        {sp.outcomes.fieldOutcomes.DROP}
                      </small>
                    </td>
                    <td>{sp.factualSummary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {assistant.battingStintReviews.length > 0 && (
          <details className="tactical-subdisclosure" data-testid="batting-stint-reviews">
            <summary>
              Batting plan stints vs outcomes ({assistant.battingStintReviews.length})
            </summary>
            <div className="table-wrap">
              <table className="tactical-table">
                <thead>
                  <tr>
                    <th>Batter</th>
                    <th>Accepted plan</th>
                    <th>Recorded innings</th>
                    <th>Factual summary</th>
                  </tr>
                </thead>
                <tbody>
                  {assistant.battingStintReviews.slice(0, 12).map((st) => (
                    <tr key={st.stintId} data-testid={`batting-stint-${st.stintId}`}>
                      <td>
                        <strong>
                          {st.playerName}
                          {st.dismissed ? "" : "*"}
                        </strong>
                        <small>Innings {st.inningsIndex + 1}</small>
                      </td>
                      <td>
                        Aggression {st.acceptedPlan.primaryAggression}/4 ·{" "}
                        {st.acceptedPlan.primaryIntent}
                      </td>
                      <td>
                        {st.outcomes.runs} ({st.outcomes.ballsFaced}b) · SR{" "}
                        {st.outcomes.strikeRateX100 === null
                          ? "—"
                          : (st.outcomes.strikeRateX100 / 100).toFixed(2)}
                        <small>
                          {st.outcomes.dots} dots · {st.outcomes.singles} 1s ·{" "}
                          {st.outcomes.boundaries} bdry
                        </small>
                      </td>
                      <td>{st.factualSummary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
