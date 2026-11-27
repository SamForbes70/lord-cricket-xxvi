import { useEffect, useMemo, useRef, useState } from "react";
import {
  type DeliveryHighlightCue,
  type FieldSlot,
  type HighlightMotionMode,
  type HighlightPacingMode,
  type LiveFieldPresentation,
} from "@lcxxvi/contracts";
import {
  evaluateFieldPlacementLegality,
  selectHighlightReelForMode,
} from "@lcxxvi/projections";
import type { Action } from "./protocol.js";
import { OPPOSITION_CAPTAIN_NOTE } from "./side-control.js";
import { ballCall } from "./ball-call.js";
import { layoutField, type LayoutMarker } from "./field-label-layout.js";
import { plainBallText } from "./broadcast-labels.js";

export type CommittedSequenceWindow = {
  readonly token: number;
  readonly fromSequence: number;
  readonly toSequence: number;
};

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 8);
  const last = parts[parts.length - 1]!;
  return last.length <= 9 ? last : `${last.slice(0, 8)}…`;
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "FD";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (event: MediaQueryListEvent) => setPrefers(event.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);
  return prefers;
}

export function LiveFieldPanel({
  presentation,
  committedFieldSlots,
  outfieldIds,
  bowlingTeamId,
  fieldSetByOpposition = false,
  legalBalls,
  names,
  busy,
  pacingMode,
  onChangePacingMode,
  motionMode,
  onChangeMotionMode,
  committedWindow,
  cancelSignal,
  onApplyField,
}: {
  presentation: LiveFieldPresentation;
  committedFieldSlots: readonly FieldSlot[];
  outfieldIds: readonly string[];
  bowlingTeamId: string | null;
  /** True when the computer captain runs the fielding side: the person cannot edit that side's field. */
  fieldSetByOpposition?: boolean;
  legalBalls: number;
  names: Readonly<Record<string, string>>;
  busy: boolean;
  pacingMode: HighlightPacingMode;
  onChangePacingMode: (mode: HighlightPacingMode) => void;
  motionMode: HighlightMotionMode;
  onChangeMotionMode: (mode: HighlightMotionMode) => void;
  committedWindow: CommittedSequenceWindow | null;
  cancelSignal: number;
  onApplyField: (action: Action) => void;
}) {
  const systemReducedMotion = usePrefersReducedMotion();
  const effectiveReducedMotion =
    motionMode === "REDUCED" || systemReducedMotion;

  const [draftSlots, setDraftSlots] = useState<FieldSlot[]>(() =>
    committedFieldSlots.map((slot) => ({ ...slot })),
  );
  const [selectedFielderId, setSelectedFielderId] = useState<string>(
    () => committedFieldSlots[0]?.playerId ?? "",
  );
  const [targetSlotId, setTargetSlotId] = useState<string>(
    () => presentation.positions[0]?.slotId ?? "slip-1",
  );
  const [dragPlayerId, setDragPlayerId] = useState<string | null>(null);

  const [reelQueue, setReelQueue] = useState<DeliveryHighlightCue[]>([]);
  const [pinnedSequence, setPinnedSequence] = useState<number | null>(null);
  const diagramRef = useRef<SVGSVGElement | null>(null);
  const [diagramWidth, setDiagramWidth] = useState(400);
  useEffect(() => {
    const el = diagramRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => { const w = el.getBoundingClientRect().width; if (w > 0) setDiagramWidth(Math.round(w)); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const lastWindowToken = useRef<number>(0);

  const committedSignature = useMemo(
    () => committedFieldSlots.map((s) => `${s.playerId}:${s.slotId}`).join("|"),
    [committedFieldSlots],
  );

  useEffect(() => {
    setDraftSlots(committedFieldSlots.map((slot) => ({ ...slot })));
    if (
      committedFieldSlots.length > 0 &&
      !committedFieldSlots.some((s) => s.playerId === selectedFielderId)
    ) {
      setSelectedFielderId(committedFieldSlots[0]!.playerId);
    }
  }, [committedSignature]);

  useEffect(() => {
    if (!presentation.positions.some((p) => p.slotId === targetSlotId)) {
      setTargetSlotId(presentation.positions[0]?.slotId ?? "slip-1");
    }
  }, [presentation.positions, targetSlotId]);

  useEffect(() => {
    if (cancelSignal > 0) {
      setReelQueue([]);
    }
  }, [cancelSignal]);

  useEffect(() => {
    if (!committedWindow || committedWindow.token === lastWindowToken.current) {
      return;
    }
    lastWindowToken.current = committedWindow.token;
    setPinnedSequence(null);

    if (effectiveReducedMotion || pacingMode === "FAST") {
      setReelQueue([]);
      return;
    }

    const selected = selectHighlightReelForMode({
      cues: presentation.recentHighlights,
      fromSequence: committedWindow.fromSequence,
      toSequence: committedWindow.toSequence,
      mode: pacingMode,
    });
    if (selected.length === 0) {
      setReelQueue([]);
      return;
    }
    setReelQueue((prev) => [...prev, ...selected].slice(-12));
  }, [
    committedWindow,
    effectiveReducedMotion,
    pacingMode,
    presentation.recentHighlights,
  ]);

  useEffect(() => {
    if (effectiveReducedMotion || pacingMode === "FAST") {
      if (reelQueue.length > 0) setReelQueue([]);
      return undefined;
    }
    if (reelQueue.length === 0) return undefined;
    const stepMs = reelQueue.length > 2 ? 120 : 220;
    const timer = window.setTimeout(() => {
      setReelQueue((prev) => prev.slice(1));
    }, stepMs);
    return () => window.clearTimeout(timer);
  }, [reelQueue, effectiveReducedMotion, pacingMode]);

  const canEditField =
    presentation.phase === "READY" &&
    Boolean(bowlingTeamId) &&
    !fieldSetByOpposition &&
    draftSlots.length === 9;

  const isDirty = useMemo(() => {
    const draftSig = draftSlots.map((s) => `${s.playerId}:${s.slotId}`).join("|");
    return draftSig !== committedSignature;
  }, [draftSlots, committedSignature]);

  const draftLegality = useMemo(
    () =>
      evaluateFieldPlacementLegality({
        format: presentation.format,
        strikerHand: presentation.strikerHand,
        legalBalls,
        fieldSlots: draftSlots,
        outfieldIds:
          outfieldIds.length === 9
            ? outfieldIds
            : committedFieldSlots.map((s) => s.playerId),
      }),
    [
      presentation.format,
      presentation.strikerHand,
      legalBalls,
      draftSlots,
      outfieldIds,
      committedFieldSlots,
    ],
  );

  const displayPositions = useMemo(() => {
    const occupantBySlot = new Map<string, string[]>();
    for (const slot of draftSlots) {
      const list = occupantBySlot.get(slot.slotId) ?? [];
      list.push(slot.playerId);
      occupantBySlot.set(slot.slotId, list);
    }
    return presentation.positions.map((pos) => {
      const occupants = occupantBySlot.get(pos.slotId) ?? [];
      const primaryId = occupants[0] ?? null;
      return {
        ...pos,
        occupiedByPlayerId: primaryId,
        occupiedByName: primaryId ? (names[primaryId] ?? primaryId) : null,
        occupantCount: occupants.length,
      };
    });
  }, [presentation.positions, draftSlots, names]);

  function moveOrSwapFielder(playerId: string, destinationSlotId: string) {
    if (!canEditField || busy) return;
    setDraftSlots((prev) => {
      const current = prev.find((s) => s.playerId === playerId);
      if (!current || current.slotId === destinationSlotId) return prev;
      const existingOccupant = prev.find(
        (s) => s.slotId === destinationSlotId && s.playerId !== playerId,
      );
      return prev.map((s) => {
        if (s.playerId === playerId) {
          return { ...s, slotId: destinationSlotId };
        }
        if (existingOccupant && s.playerId === existingOccupant.playerId) {
          return { ...s, slotId: current.slotId };
        }
        return s;
      });
    });
  }

  function assignDirectSlot(playerId: string, destinationSlotId: string) {
    if (!canEditField || busy) return;
    setDraftSlots((prev) =>
      prev.map((s) =>
        s.playerId === playerId ? { ...s, slotId: destinationSlotId } : s,
      ),
    );
  }

  function cycleOpenPosition(direction: -1 | 1) {
    if (!canEditField || busy || !selectedFielderId) return;
    const occupiedSet = new Set(
      draftSlots
        .filter((s) => s.playerId !== selectedFielderId)
        .map((s) => s.slotId),
    );
    const openSlots = presentation.positions
      .map((p) => p.slotId)
      .filter((slotId) => !occupiedSet.has(slotId));
    if (openSlots.length === 0) return;
    const currentSlot =
      draftSlots.find((s) => s.playerId === selectedFielderId)?.slotId ??
      openSlots[0]!;
    const currentIndex = openSlots.indexOf(currentSlot);
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + direction + openSlots.length) % openSlots.length;
    const nextSlot = openSlots[nextIndex]!;
    setTargetSlotId(nextSlot);
    moveOrSwapFielder(selectedFielderId, nextSlot);
  }

  function skipHighlight() {
    setReelQueue([]);
  }

  const isPlayingHighlight =
    reelQueue.length > 0 && !effectiveReducedMotion && pacingMode !== "FAST";

  const pinnedCue = useMemo(
    () =>
      pinnedSequence === null
        ? null
        : (presentation.recentHighlights.find(
            (c) => c.sequence === pinnedSequence,
          ) ?? null),
    [pinnedSequence, presentation.recentHighlights],
  );

  // CP03: the diagram always shows the latest ball unless the player chose a recent ball or a replay is running, and
  // the caption above it says which ball it is (CP01 found it still showing a key moment from overs earlier).
  const activeCue: DeliveryHighlightCue | null =
    reelQueue[0] ?? pinnedCue ?? presentation.latestHighlight;
  const showingLatest =
    activeCue !== null && activeCue.sequence === presentation.latestHighlight?.sequence && reelQueue.length === 0;

  const leftSideLabel = presentation.strikerHand === "L" ? "OFF SIDE" : "LEG SIDE";
  const rightSideLabel = presentation.strikerHand === "L" ? "LEG SIDE" : "OFF SIDE";

  const highlightKind =
    activeCue?.momentKind === "WICKET"
      ? "wicket"
      : activeCue?.momentKind === "SIX"
        ? "six"
        : activeCue?.momentKind === "FOUR"
          ? "four"
          : activeCue?.momentKind === "FREE_HIT"
            ? "free-hit"
            : "runs";

  // Markers and labels are sized from the diagram's drawn width, so text stays at least 12 CSS pixels and nothing
  // overlaps (field-label-layout.ts). Drawing positions only: every slot and its legality are unchanged.
  const fieldLayout = useMemo(() => {
    const markers: LayoutMarker[] = [
      { id: "striker", x: presentation.strikerPoint.x10 / 10, y: presentation.strikerPoint.y10 / 10, code: presentation.strikerHand, weight: "player", fixed: true },
      { id: "keeper", x: presentation.keeperPoint.x10 / 10, y: presentation.keeperPoint.y10 / 10, code: "WK", weight: "player", fixed: true },
      { id: "bowler", x: presentation.bowlerReleasePoint.x10 / 10, y: presentation.bowlerReleasePoint.y10 / 10 - 5, code: "B", weight: "player" },
      { id: "non-striker", x: presentation.nonStrikerPoint.x10 / 10, y: presentation.nonStrikerPoint.y10 / 10, code: "NS", weight: "player" },
      ...displayPositions.map((pos): LayoutMarker => ({
        id: pos.slotId,
        x: pos.point.x10 / 10,
        y: pos.point.y10 / 10,
        code: pos.occupiedByName ? (pos.occupantCount > 1 ? `${pos.occupantCount}x` : initials(pos.occupiedByName)) : "",
        label: pos.label,
        weight: pos.occupiedByPlayerId ? "player" : "open",
      })),
    ];
    return layoutField(markers, diagramWidth);
  }, [presentation, displayPositions, diagramWidth]);
  const placed = new Map(fieldLayout.markers.map((m) => [m.id, m]));

  const call = activeCue ? ballCall(activeCue) : null;
  const fielderMarker = (slotId: string) => placed.get(slotId);

  return (
    <section
      className="panel live-field-panel"
      aria-labelledby="live-field-heading"
      data-testid="live-field-panel"
      data-striker-hand={presentation.strikerHand}
      data-highlight-mode={pacingMode}
      data-reduced-motion={effectiveReducedMotion ? "true" : "false"}
      data-highlight-playing={isPlayingHighlight ? "true" : "false"}
    >
      <div className="live-field-header">
        <h2 id="live-field-heading">Field and latest ball</h2>
        <p className="live-field-subtitle" data-testid="field-orientation-note">
          {presentation.orientationNote}
        </p>
      </div>

      <div className="live-field-layout">
        <div className="live-field-diagram-wrap">
          {activeCue && call && (
            <p className="field-ball-caption" data-testid="field-ball-caption" data-latest={showingLatest ? "true" : "false"} data-kind={call.kind}>
              <span className="field-ball-tag">{showingLatest ? "Latest ball" : isPlayingHighlight ? "Replay" : "Chosen ball"}</span>
              <strong>{activeCue.overBallLabel}</strong>
              <span className="field-ball-word">{call.word}</span>
            </p>
          )}
          <svg
            ref={diagramRef}
            viewBox="0 0 200 200"
            role="img"
            aria-label={`Live cricket field diagram for ${presentation.strikerName ?? "current batter"} (${presentation.strikerHand}HB). ${draftLegality.summaryText}`}
            className="live-field-svg"
            data-testid="live-field-svg"
          >
            <circle className="fd-outer" cx="100" cy="100" r="92" />
            <circle className="fd-ground" cx="100" cy="100" r={presentation.boundaryRadiusX10 / 10} />
            <circle className="fd-ring" cx="100" cy="100" r={presentation.circleRadiusX10 / 10} />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((sector) => {
              const angle = (sector - 3.5) * (Math.PI / 4);
              const x2 = 100 + Math.sin(angle) * 84;
              const y2 = 100 - Math.cos(angle) * 84;
              return <line key={sector} className="fd-sector" x1="100" y1="100" x2={x2.toFixed(1)} y2={y2.toFixed(1)} />;
            })}
            <text className="fd-side" x="4" y={fieldLayout.sideLabelSize + 2} fontSize={fieldLayout.sideLabelSize} textAnchor="start" data-testid="field-left-side-label">
              {leftSideLabel}
            </text>
            <text className="fd-side" x="196" y={fieldLayout.sideLabelSize + 2} fontSize={fieldLayout.sideLabelSize} textAnchor="end" data-testid="field-right-side-label">
              {rightSideLabel}
            </text>

            {/* Pitch strip and creases */}
            <rect className="fd-pitch" x="95.5" y="72" width="9" height="48" rx="1" />
            <line className="fd-crease" x1="93.5" y1="76" x2="106.5" y2="76" />
            <line className="fd-crease" x1="93.5" y1="116" x2="106.5" y2="116" />
            <line className="fd-stumps" x1="98.5" y1="74" x2="101.5" y2="74" />
            <line className="fd-stumps" x1="98.5" y1="118" x2="101.5" y2="118" />

            {/* Illustrative highlight cue path */}
            {activeCue && (
              <g
                key={`${activeCue.sequence}-${isPlayingHighlight ? "anim" : "static"}`}
                className={`fd-cue fd-cue-${highlightKind}`}
                data-testid="field-highlight-layer"
                data-cue-sequence={activeCue.sequence}
                data-sector-status={activeCue.sectorStatus}
              >
                <line
                  className="fd-cue-delivery"
                  x1={activeCue.releasePoint.x10 / 10}
                  y1={activeCue.releasePoint.y10 / 10}
                  x2={activeCue.pitchBouncePoint.x10 / 10}
                  y2={activeCue.pitchBouncePoint.y10 / 10}
                />
                <circle className="fd-cue-dot" cx={activeCue.pitchBouncePoint.x10 / 10} cy={activeCue.pitchBouncePoint.y10 / 10} r="2.1" />
                <line
                  className="fd-cue-line"
                  x1={activeCue.pitchBouncePoint.x10 / 10}
                  y1={activeCue.pitchBouncePoint.y10 / 10}
                  x2={activeCue.strikerCreasePoint.x10 / 10}
                  y2={activeCue.strikerCreasePoint.y10 / 10}
                  strokeWidth="1.2"
                />
                {activeCue.sectorStatus === "RECORDED_SECTOR" ? (
                  <>
                    <line
                      x1={activeCue.strikerCreasePoint.x10 / 10}
                      y1={activeCue.strikerCreasePoint.y10 / 10}
                      x2={activeCue.targetPoint.x10 / 10}
                      y2={activeCue.targetPoint.y10 / 10}
                      strokeWidth={activeCue.isKeyMoment ? "2.4" : "1.8"}
                      strokeDasharray={
                        activeCue.trajectory === "AERIAL"
                          ? "4 2"
                          : activeCue.trajectory === "EDGE"
                            ? "1.5 1.5"
                            : undefined
                      }
                      className={`fd-cue-line${isPlayingHighlight ? " field-shot-line-animated" : ""}`}
                    />
                    <circle className="fd-cue-dot" cx={activeCue.targetPoint.x10 / 10} cy={activeCue.targetPoint.y10 / 10} r={activeCue.isKeyMoment ? "3.8" : "3"} />
                  </>
                ) : (
                  <circle className="fd-cue-dot" cx={activeCue.targetPoint.x10 / 10} cy={activeCue.targetPoint.y10 / 10} r="2.8" />
                )}
              </g>
            )}

            {/* Bowler, keeper, striker and non-striker: fielding side in light discs, batters in gold. */}
            <g aria-hidden="true">
              {(["bowler", "keeper", "striker", "non-striker"] as const).map((id) => {
                const m = placed.get(id);
                if (!m) return null;
                const batting = id === "striker" || id === "non-striker";
                return (
                  <g key={id} className={batting ? "fd-batter" : "fd-fielder"} data-marker={id}>
                    <circle cx={m.x} cy={m.y} r={m.r} />
                    <text x={m.x} y={m.y + m.codeSize * 0.36} fontSize={m.codeSize} textAnchor="middle">
                      {id === "striker" ? presentation.strikerHand : id === "keeper" ? "WK" : id === "bowler" ? "B" : "NS"}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Named outfield positions */}
            {displayPositions.map((pos) => {
              const m = fielderMarker(pos.slotId);
              const cx = m?.x ?? pos.point.x10 / 10;
              const cy = m?.y ?? pos.point.y10 / 10;
              const occupied = pos.occupiedByPlayerId !== null;
              const isSelected =
                pos.occupiedByPlayerId !== null &&
                pos.occupiedByPlayerId === selectedFielderId;
              const hasViolation = draftLegality.violations.some((v) =>
                v.affectedSlotIds.includes(pos.slotId),
              );
              const state = hasViolation ? "violation" : isSelected ? "selected" : occupied ? "occupied" : "open";
              return (
                <g
                  key={pos.slotId}
                  className={`fd-slot fd-slot-${state}`}
                  data-slot-id={pos.slotId}
                  data-occupied={occupied ? "true" : "false"}
                  data-leg-side={pos.legSideForStriker ? "true" : "false"}
                  data-inside-circle={pos.insideCircle ? "true" : "false"}
                  data-cx={(pos.point.x10 / 10).toFixed(1)}
                  data-cy={(pos.point.y10 / 10).toFixed(1)}
                  style={{ cursor: canEditField && !busy ? "pointer" : "default" }}
                  onPointerDown={() => {
                    if (canEditField && !busy && pos.occupiedByPlayerId) {
                      setDragPlayerId(pos.occupiedByPlayerId);
                      setSelectedFielderId(pos.occupiedByPlayerId);
                    }
                  }}
                  onPointerUp={() => {
                    if (canEditField && !busy && dragPlayerId) {
                      setTargetSlotId(pos.slotId);
                      moveOrSwapFielder(dragPlayerId, pos.slotId);
                      setDragPlayerId(null);
                    }
                  }}
                  onClick={() => {
                    if (!canEditField || busy) return;
                    if (pos.occupiedByPlayerId && pos.occupiedByPlayerId === selectedFielderId) {
                      setTargetSlotId(pos.slotId);
                      return;
                    }
                    if (selectedFielderId) {
                      setTargetSlotId(pos.slotId);
                      moveOrSwapFielder(selectedFielderId, pos.slotId);
                    }
                  }}
                >
                  <circle cx={cx} cy={cy} r={m?.r ?? 5} />
                  {occupied && pos.occupiedByName && m && (
                    <text className="fd-code" x={cx} y={cy + m.codeSize * 0.36} fontSize={m.codeSize} textAnchor="middle">
                      {pos.occupantCount > 1 ? `${pos.occupantCount}x` : initials(pos.occupiedByName)}
                    </text>
                  )}
                  {m?.label && (
                    <text className="fd-label" x={m.label.x} y={m.label.y} fontSize={m.label.size} textAnchor={m.label.anchor}>
                      {m.label.text}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <p className="live-field-legend">
            <strong>Striker:</strong> {presentation.strikerName ?? "none"} ({""}
            {presentation.strikerHand}HB) · <strong>Non-striker:</strong>{" "}
            {presentation.nonStrikerName ?? "none"} ·{" "}
            <strong>
              {/* CP04: between overs this is the bowler of the next ball, not of the ball just shown. */}
              {presentation.bowlerId && presentation.latestHighlight && presentation.latestHighlight.bowlerId !== presentation.bowlerId
                ? "Bowling next:"
                : "Bowler:"}
            </strong>{" "}
            {presentation.bowlerName ?? "none"} · <strong>Keeper:</strong>{" "}
            {presentation.keeperName ?? "none"}
          </p>
        </div>

        <div className="live-field-sidebar">
          {/* Active highlight card */}
          <div
            className="live-field-card"
            data-testid="live-field-highlight-card"
          >
            <h3>
              {isPlayingHighlight
                ? `Playing highlight (${pacingMode === "EVERY_BALL" ? "Every ball" : "Key moment"})`
                : "This ball"}
            </h3>
            {activeCue ? (
              <>
                <p className="highlight-headline" data-testid="highlight-headline">
                  <strong>{activeCue.headline}</strong>
                </p>
                {/* CP04: plain cricket words first; the tracking record (sectors) sits behind a disclosure. */}
                <p className="highlight-plain" data-testid="highlight-plain">{plainBallText(activeCue)}</p>
                <details className="highlight-tracking">
                  <summary>Tracking detail</summary>
                  <p data-testid="highlight-detail">{activeCue.detailText}</p>
                </details>
                {activeCue.sectorStatus === "PITCH_CHANNEL_ONLY" && (
                  <p
                    className="highlight-fallback-note"
                    data-testid="highlight-missing-sector-note"
                  >
                    Missing shot sector: showing pitch/keeper channel only without
                    inventing an outfield angle.
                  </p>
                )}
                <p className="highlight-disclaimer">
                  {activeCue.trackingDisclaimer.replace(/\s[\u2013\u2014]\s/g, ": ")}
                </p>
              </>
            ) : (
              <p>No deliveries committed yet. Advance play to view highlights.</p>
            )}

            {presentation.recentHighlights.length > 0 && (
              <div
                className="recent-highlights-strip"
                data-testid="recent-highlights-strip"
              >
                <span className="strip-label">Recent balls:</span>
                {presentation.recentHighlights.slice(-8).map((cue) => (
                  <button
                    key={cue.sequence}
                    type="button"
                    className={`highlight-chip ${
                      activeCue?.sequence === cue.sequence ? "active" : ""
                    } ${cue.isKeyMoment ? "key-moment" : ""}`}
                    aria-pressed={activeCue?.sequence === cue.sequence}
                    onClick={() => {
                      setReelQueue([]);
                      setPinnedSequence((prev) =>
                        prev === cue.sequence ? null : cue.sequence,
                      );
                    }}
                  >
                    {cue.overBallLabel}{" · "}
                    {cue.momentKind === "WICKET"
                      ? "W"
                      : cue.momentKind === "SIX"
                        ? "6"
                        : cue.momentKind === "FOUR"
                          ? "4"
                          : cue.runsScored}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Live legal-placement feedback */}
          <div
            className={`live-field-card legality-box ${
              draftLegality.isLegal ? "legal" : "illegal"
            }`}
            role="status"
            data-testid="field-legality-feedback"
            data-legal={draftLegality.isLegal ? "true" : "false"}
          >
            <h3>Field legality ({presentation.strikerHand}HB)</h3>
            <p className="legality-phase">{draftLegality.phaseLabel}</p>
            <p className="legality-counts" data-testid="field-legality-counts">
              Outside circle: {draftLegality.outsideCircleCount}/
              {draftLegality.maxOutsideCircle} · Leg side:{" "}
              {draftLegality.legSideCount}/{draftLegality.maxLegSide} · Behind
              square leg: {draftLegality.behindSquareLegCount}/
              {draftLegality.maxBehindSquareLeg}
            </p>
            {!draftLegality.isLegal ? (
              <ul className="legality-violations">
                {draftLegality.violations.map((v) => (
                  <li key={`${v.code}-${v.message}`}>{v.message}</li>
                ))}
              </ul>
            ) : (
              <p className="legality-ok">Placement satisfies all phase and handedness restrictions.</p>
            )}
          </div>

          {presentation.phase === "READY" && fieldSetByOpposition && (
            <p className="control-owner-note" role="note" data-testid="field-owner-note">
              {OPPOSITION_CAPTAIN_NOTE}: the fielding side's captain places this field.
            </p>
          )}
          {/* Keyboard alternatives to pointer dragging */}
          {canEditField && (
            <div
              className="live-field-card"
              data-testid="keyboard-field-controls"
            >
              <h3>Keyboard &amp; diagram field placement</h3>
              <p className="keyboard-help">
                Select a fielder and target position with keyboard controls (or
                click/drag markers on the diagram), then apply when legal.
              </p>
              <div className="keyboard-field-grid">
                <label>
                  Fielder
                  <select
                    aria-label="Select fielder to reposition"
                    disabled={busy}
                    value={selectedFielderId}
                    onChange={(event) => {
                      const nextId = event.currentTarget.value;
                      setSelectedFielderId(nextId);
                      const currentSlot =
                        draftSlots.find((s) => s.playerId === nextId)?.slotId ??
                        targetSlotId;
                      setTargetSlotId(currentSlot);
                    }}
                  >
                    {draftSlots.map((slot) => {
                      const posMeta = presentation.positions.find(
                        (p) => p.slotId === slot.slotId,
                      );
                      return (
                        <option key={slot.playerId} value={slot.playerId}>
                          {shortName(names[slot.playerId] ?? slot.playerId)}:{" "}
                          {posMeta?.label ?? slot.slotId}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label>
                  Target position
                  <select
                    aria-label="Select target field position"
                    disabled={busy}
                    value={targetSlotId}
                    onChange={(event) =>
                      setTargetSlotId(event.currentTarget.value)
                    }
                  >
                    {displayPositions.map((pos) => (
                      <option key={pos.slotId} value={pos.slotId}>
                        {pos.label} ({
                          pos.insideCircle ? "in circle" : "deep"
                        }, {pos.legSideForStriker ? "leg" : "off"}{
                          pos.behindSquare ? ", behind sq" : ""
                        }):{" "}
                        {pos.occupiedByName
                          ? `occupied (${shortName(pos.occupiedByName)})`
                          : "open"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="actions">
                <button
                  type="button"
                  disabled={busy || !selectedFielderId}
                  onClick={() =>
                    moveOrSwapFielder(selectedFielderId, targetSlotId)
                  }
                >
                  Move or swap fielder
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedFielderId}
                  onClick={() => cycleOpenPosition(-1)}
                >
                  Previous open slot
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedFielderId}
                  onClick={() => cycleOpenPosition(1)}
                >
                  Next open slot
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedFielderId}
                  onClick={() =>
                    assignDirectSlot(selectedFielderId, targetSlotId)
                  }
                >
                  Assign slot directly
                </button>
              </div>
              <div className="actions" style={{ marginTop: "0.5rem" }}>
                <button
                  type="button"
                  data-testid="apply-diagram-field"
                  disabled={
                    busy ||
                    !isDirty ||
                    !draftLegality.isLegal ||
                    !bowlingTeamId
                  }
                  onClick={() => {
                    if (!bowlingTeamId || !draftLegality.isLegal) return;
                    onApplyField({
                      kind: "SET_FIELD",
                      payload: {
                        teamId: bowlingTeamId,
                        fieldSlots: draftSlots,
                      },
                    });
                  }}
                >
                  Apply field on diagram
                </button>
                <button
                  type="button"
                  disabled={busy || !isDirty}
                  onClick={() =>
                    setDraftSlots(
                      committedFieldSlots.map((slot) => ({ ...slot })),
                    )
                  }
                >
                  Reset field edits
                </button>
              </div>
            </div>
          )}
          <div className="live-field-prefs">
            <label>
              Highlight pacing{" "}
              <select
                aria-label="Highlight pacing"
                value={pacingMode}
                onChange={(event) =>
                  onChangePacingMode(
                    event.currentTarget.value as HighlightPacingMode,
                  )
                }
              >
                <option value="EVERY_BALL">Every ball</option>
                <option value="KEY_MOMENT">Key moments</option>
                <option value="FAST">Fast</option>
              </select>
            </label>
            <label>
              Highlight motion{" "}
              <select
                aria-label="Highlight motion"
                value={motionMode}
                onChange={(event) =>
                  onChangeMotionMode(
                    event.currentTarget.value as HighlightMotionMode,
                  )
                }
              >
                <option value="AUTO">System default</option>
                <option value="REDUCED">Reduced motion</option>
              </select>
            </label>
            {isPlayingHighlight && (
              <button
                type="button"
                data-testid="skip-highlight-button"
                onClick={skipHighlight}
              >
                Skip highlight ({reelQueue.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

