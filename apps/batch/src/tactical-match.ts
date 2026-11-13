import type { ODICommand, Red5Command, RedBallTacticalProfile, T20Command } from "@lcxxvi/contracts";
import {
  createODISession,
  createRed5Session,
  createT20Session,
  executeODICommand,
  executeRed5Command,
  executeT20Command,
  fixtureAutopilotStep,
  odiFixtureAutopilotStep,
  red5FixtureAutopilotStep,
  type FrozenODISetup,
  type FrozenRed5Setup,
  type FrozenT20Setup,
  type ODISession,
  type Red5Session,
  type T20Session,
} from "@lcxxvi/simulation";
import {
  adviseODICaptain,
  adviseRed5Captain,
  adviseT20Captain,
  type ODITacticalPublicView,
  type Red5BowlerCandidate,
  type Red5TacticalPublicView,
  type TacticalBowlerCandidate,
  type T20TacticalPublicView,
} from "@lcxxvi/ai";

function slotsSignature(slots: readonly { slotId: string; playerId: string }[]): string {
  return [...slots]
    .sort((a, b) => a.playerId.localeCompare(b.playerId))
    .map(s => `${s.playerId}:${s.slotId}`)
    .join("|");
}

/** Extract the smallest public T20 match view required by the policy. Never pass the session or seed to the policy. */
export function publicT20CaptainView(session: Readonly<T20Session>): T20TacticalPublicView | null {
  const ledger = session.core.innings[session.core.activeInningsIndex];
  if (!ledger) return null;
  const i = ledger.innings;
  const bowling = session.setup.teams.find(team => team.teamId === i.bowlingTeamId);
  if (!bowling) throw new Error("LC_AI_BOWLING_TEAM_MISSING");
  const candidates: TacticalBowlerCandidate[] = bowling.xi
    .filter(p => p.bowlingStyle !== null && p.playerId !== bowling.keeperId && p.playerId !== i.previousOverBowlerId)
    .filter(p => ledger.bowling[p.playerId]!.legalBalls < 24)
    .map(p => ({
      playerId: p.playerId,
      control: p.skills.T20.control,
      movement: p.skills.T20.movement,
      variation: p.skills.T20.variation,
      stamina: p.skills.T20.stamina,
      fatigueBp: session.core.fatigueBp[p.playerId] ?? 0,
      legalBallsBowled: ledger.bowling[p.playerId]!.legalBalls,
      quotaRemaining: 24 - ledger.bowling[p.playerId]!.legalBalls,
    }));
  return {
    inningsLegalBalls: i.legalBalls,
    inningsRuns: i.runs,
    wicketsLost: i.wickets,
    targetToWin: i.targetToWin,
    availableBatters: Math.max(0, 10 - i.wickets),
    bowlingCandidates: candidates,
  };
}

/** Additive V1 captain chooses only legal engine commands; accepted LC_T20_MATCH_V1 owns delivery sampling. */
export function tacticalT20Step(session: Readonly<T20Session>): T20Command {
  const fallback = fixtureAutopilotStep(session as T20Session);
  const view = publicT20CaptainView(session);
  if (!view) return fallback;
  const advice = adviseT20Captain(view);
  const base = { expectedRevision: session.revision, commandId: `tactical-${String(session.revision + 1).padStart(6, "0")}` };
  const ledger = session.core.innings[session.core.activeInningsIndex]!;
  const i = ledger.innings;
  if (session.core.phase === "AWAITING_BOWLER" && advice.preferredBowlerId) {
    return { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "SET_BOWLER", payload: { teamId: i.bowlingTeamId, bowlerId: advice.preferredBowlerId } };
  }
  if (session.core.phase !== "READY") return fallback;
  const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  if (striker && (session.core.battingPlans[striker]?.aggression ?? 2) !== advice.aggression) {
    return { ...base, actorId: `AI:${i.battingTeamId}`, kind: "SET_BATTING_PLAN", payload: { playerId: striker, aggression: advice.aggression, intent: "NORMAL" } };
  }
  const current = session.core.bowlingPlan;
  if (current && (current.length !== advice.bowlingLength || current.effort !== advice.bowlingEffort)) {
    return { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "SET_BOWLING_PLAN", payload: { ...current, length: advice.bowlingLength, effort: advice.bowlingEffort } };
  }
  return fallback;
}

/** Fully autonomous tactical run, separate from frozen Pass12D fixture policy and its accepted regression corpus. */
export function runTacticalT20(setup: FrozenT20Setup, maxCommands = 900): T20Session {
  let session = createT20Session(setup);
  while (session.core.phase !== "COMPLETE") {
    if (session.revision >= maxCommands) throw new Error("LC_T20_AI_COMMAND_LIMIT");
    session = executeT20Command(session, tacticalT20Step(session)).session;
  }
  return session;
}

export function publicODICaptainView(session: Readonly<ODISession>): ODITacticalPublicView | null {
  const ledger = session.core.innings[session.core.activeInningsIndex];
  if (!ledger) return null;
  const i = ledger.innings;
  const bowling = session.setup.teams.find(team => team.teamId === i.bowlingTeamId);
  const batting = session.setup.teams.find(team => team.teamId === i.battingTeamId);
  if (!bowling || !batting) throw new Error("LC_ODI_AI_TEAM_MISSING");
  const strikerId = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const strikerHand = batting.xi.find(p => p.playerId === strikerId)?.batHand ?? "R";
  const refBowler = i.bowlerId ?? bowling.xi.find(p => p.bowlingStyle !== null && p.playerId !== bowling.keeperId)?.playerId ?? "";
  const outfieldIds =
    ledger.outfieldIds.length === 9
      ? ledger.outfieldIds
      : bowling.playerIds.filter(id => id !== bowling.keeperId && id !== refBowler).slice(0, 9);
  const candidates: TacticalBowlerCandidate[] = bowling.xi
    .filter(p => p.bowlingStyle !== null && p.playerId !== bowling.keeperId && p.playerId !== i.previousOverBowlerId)
    .filter(p => ledger.bowling[p.playerId]!.legalBalls < 60)
    .map(p => ({
      playerId: p.playerId,
      control: p.skills.ODI.control,
      movement: p.skills.ODI.movement,
      variation: p.skills.ODI.variation,
      stamina: p.skills.ODI.stamina,
      fatigueBp: session.core.fatigueBp[p.playerId] ?? 0,
      legalBallsBowled: ledger.bowling[p.playerId]!.legalBalls,
      quotaRemaining: 60 - ledger.bowling[p.playerId]!.legalBalls,
    }));
  return {
    inningsLegalBalls: i.legalBalls,
    inningsRuns: i.runs,
    wicketsLost: i.wickets,
    targetToWin: i.targetToWin,
    availableBatters: Math.max(0, 10 - i.wickets),
    strikerHand,
    outfieldIds,
    bowlingCandidates: candidates,
  };
}

export function tacticalODIStep(session: Readonly<ODISession>): ODICommand {
  const fallback = odiFixtureAutopilotStep(session as ODISession);
  const view = publicODICaptainView(session);
  if (!view) return fallback;
  const advice = adviseODICaptain(view);
  const base = { expectedRevision: session.revision, commandId: `tactical-odi-${String(session.revision + 1).padStart(6, "0")}` };
  const ledger = session.core.innings[session.core.activeInningsIndex]!;
  const i = ledger.innings;
  if (session.core.phase === "AWAITING_BOWLER" && advice.preferredBowlerId) {
    return { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "SET_BOWLER", payload: { teamId: i.bowlingTeamId, bowlerId: advice.preferredBowlerId } };
  }
  if (session.core.phase !== "READY") return fallback;
  const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const currentBat = striker ? session.core.battingPlans[striker] : undefined;
  if (striker && (currentBat?.aggression !== advice.aggression || currentBat?.intent !== advice.battingIntent)) {
    return {
      ...base,
      actorId: `AI:${i.battingTeamId}`,
      kind: "SET_BATTING_PLAN",
      payload: { playerId: striker, aggression: advice.aggression, intent: advice.battingIntent },
    };
  }
  const currentBowl = session.core.bowlingPlan;
  if (currentBowl && (currentBowl.length !== advice.bowlingLength || currentBowl.effort !== advice.bowlingEffort)) {
    return {
      ...base,
      actorId: `AI:${i.bowlingTeamId}`,
      kind: "SET_BOWLING_PLAN",
      payload: { ...currentBowl, length: advice.bowlingLength, effort: advice.bowlingEffort },
    };
  }
  if (i.legalBalls % 6 === 0 && slotsSignature(session.core.fieldSlots) !== slotsSignature(advice.fieldSlots)) {
    return {
      ...base,
      actorId: `AI:${i.bowlingTeamId}`,
      kind: "SET_FIELD",
      payload: { teamId: i.bowlingTeamId, fieldSlots: [...advice.fieldSlots] },
    };
  }
  return fallback;
}

export function runTacticalODI(setup: FrozenODISetup, maxCommands = 900): ODISession {
  let session = createODISession(setup);
  while (session.core.phase !== "COMPLETE") {
    if (session.revision >= maxCommands) throw new Error("LC_ODI_AI_COMMAND_LIMIT");
    session = executeODICommand(session, tacticalODIStep(session)).session;
  }
  return session;
}

export function publicRed5CaptainView(
  session: Readonly<Red5Session>,
  profile: RedBallTacticalProfile = "BALANCED",
): Red5TacticalPublicView | null {
  const c = session.core;
  if (c.phase === "AWAITING_FOLLOW_ON") {
    const first = c.innings[0]!;
    const second = c.innings[1]!;
    const enforcingTeamId = first.innings.battingTeamId;
    const bowling = session.setup.teams.find(t => t.teamId === enforcingTeamId);
    if (!bowling) throw new Error("LC_RED5_AI_TEAM_MISSING");
    const outfieldIds = bowling.playerIds.filter(id => id !== bowling.keeperId).slice(0, 9);
    const candidates: Red5BowlerCandidate[] = bowling.xi
      .filter(p => p.bowlingStyle !== null && p.playerId !== bowling.keeperId)
      .map(p => ({
        playerId: p.playerId,
        isSpin: p.bowlingStyle?.includes("SPIN") ?? false,
        control: p.skills.RED_BALL.control,
        movement: p.skills.RED_BALL.movement,
        variation: p.skills.RED_BALL.variation,
        stamina: p.skills.RED_BALL.stamina,
        fatigueBp: c.fatigueBp[p.playerId] ?? 0,
        legalBallsBowled: second.bowling[p.playerId]?.legalBalls ?? 0,
      }));
    return {
      profile,
      inningsIndex: 1,
      inningsLegalBalls: second.innings.legalBalls,
      inningsRuns: second.innings.runs,
      wicketsLost: second.innings.wickets,
      leadRuns: first.innings.runs - second.innings.runs,
      targetToWin: null,
      availableBatters: 10,
      day: c.clock.day,
      localSeconds: c.clock.localSeconds,
      dayLegalBalls: c.clock.dayLegalBalls,
      finalHourActive: c.clock.finalHourActive,
      finalHourBallsRemaining: c.clock.finalHourBallsRemaining,
      ballAgeLegalBalls: second.innings.ballAgeLegalBalls,
      newBallAvailable: false,
      followOnAvailable: true,
      pitchSeamBp: c.pitch.seamBp,
      pitchTurnBp: c.pitch.turnBp,
      pitchWearPoints: c.pitch.wearPoints,
      strikerHand: "R",
      outfieldIds,
      bowlingCandidates: candidates,
    };
  }
  const ledger = c.innings[c.activeInningsIndex];
  if (!ledger) return null;
  const i = ledger.innings;
  const bowling = session.setup.teams.find(team => team.teamId === i.bowlingTeamId);
  const batting = session.setup.teams.find(team => team.teamId === i.battingTeamId);
  if (!bowling || !batting) throw new Error("LC_RED5_AI_TEAM_MISSING");
  const battingAggregate = c.innings
    .filter(inn => inn.innings.battingTeamId === i.battingTeamId)
    .reduce((sum, inn) => sum + inn.innings.runs, 0);
  const bowlingAggregate = c.innings
    .filter(inn => inn.innings.battingTeamId === i.bowlingTeamId)
    .reduce((sum, inn) => sum + inn.innings.runs, 0);
  const strikerId = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const strikerHand = batting.xi.find(p => p.playerId === strikerId)?.batHand ?? "R";
  const referenceBowlerId = i.bowlerId ?? bowling.xi.find(p => p.bowlingStyle !== null && p.playerId !== bowling.keeperId)?.playerId ?? "";
  const outfieldIds =
    ledger.outfieldIds.length === 9
      ? ledger.outfieldIds
      : bowling.playerIds.filter(id => id !== bowling.keeperId && id !== referenceBowlerId).slice(0, 9);
  const candidates: Red5BowlerCandidate[] = bowling.xi
    .filter(p => p.bowlingStyle !== null && p.playerId !== bowling.keeperId && p.playerId !== i.previousOverBowlerId)
    .map(p => ({
      playerId: p.playerId,
      isSpin: p.bowlingStyle?.includes("SPIN") ?? false,
      control: p.skills.RED_BALL.control,
      movement: p.skills.RED_BALL.movement,
      variation: p.skills.RED_BALL.variation,
      stamina: p.skills.RED_BALL.stamina,
      fatigueBp: c.fatigueBp[p.playerId] ?? 0,
      legalBallsBowled: ledger.bowling[p.playerId]!.legalBalls,
    }));
  const newBallAvailable =
    c.phase === "READY" &&
    i.ballAgeLegalBalls >= 480 &&
    i.legalBalls % 6 === 0;
  return {
    profile,
    inningsIndex: c.activeInningsIndex,
    inningsLegalBalls: i.legalBalls,
    inningsRuns: i.runs,
    wicketsLost: i.wickets,
    leadRuns: battingAggregate - bowlingAggregate,
    targetToWin: i.targetToWin,
    availableBatters: Math.max(0, 10 - i.wickets),
    day: c.clock.day,
    localSeconds: c.clock.localSeconds,
    dayLegalBalls: c.clock.dayLegalBalls,
    finalHourActive: c.clock.finalHourActive,
    finalHourBallsRemaining: c.clock.finalHourBallsRemaining,
    ballAgeLegalBalls: i.ballAgeLegalBalls,
    newBallAvailable,
    followOnAvailable: false,
    pitchSeamBp: c.pitch.seamBp,
    pitchTurnBp: c.pitch.turnBp,
    pitchWearPoints: c.pitch.wearPoints,
    strikerHand,
    outfieldIds,
    bowlingCandidates: candidates,
  };
}

export function tacticalRed5Step(
  session: Readonly<Red5Session>,
  profile: RedBallTacticalProfile = "BALANCED",
): Red5Command {
  const fallback = red5FixtureAutopilotStep(session as Red5Session);
  const view = publicRed5CaptainView(session, profile);
  if (!view) return fallback;
  const advice = adviseRed5Captain(view);
  const base = { expectedRevision: session.revision, commandId: `tactical-red5-${String(session.revision + 1).padStart(6, "0")}` };
  const c = session.core;
  if (c.phase === "AWAITING_FOLLOW_ON") {
    const enforcingTeamId = c.innings[0]!.innings.battingTeamId;
    return {
      ...base,
      actorId: `AI:${enforcingTeamId}`,
      kind: "CHOOSE_FOLLOW_ON",
      payload: { teamId: enforcingTeamId, enforce: advice.enforceFollowOn },
    };
  }
  const ledger = c.innings[c.activeInningsIndex]!;
  const i = ledger.innings;
  if (view.newBallAvailable && advice.takeNewBall) {
    return { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "TAKE_NEW_BALL", payload: { teamId: i.bowlingTeamId } };
  }
  if (c.phase === "AWAITING_BOWLER" && advice.preferredBowlerId) {
    return { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "SET_BOWLER", payload: { teamId: i.bowlingTeamId, bowlerId: advice.preferredBowlerId } };
  }
  if (c.phase !== "READY") return fallback;
  if (advice.shouldDeclare) {
    return { ...base, actorId: `AI:${i.battingTeamId}`, kind: "DECLARE", payload: { teamId: i.battingTeamId } };
  }
  const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const currentBat = striker ? c.battingPlans[striker] : undefined;
  if (striker && (currentBat?.aggression !== advice.aggression || currentBat?.intent !== advice.battingIntent)) {
    return {
      ...base,
      actorId: `AI:${i.battingTeamId}`,
      kind: "SET_BATTING_PLAN",
      payload: { playerId: striker, aggression: advice.aggression, intent: advice.battingIntent },
    };
  }
  const currentBowl = c.bowlingPlan;
  if (currentBowl && (currentBowl.length !== advice.bowlingLength || currentBowl.effort !== advice.bowlingEffort)) {
    return {
      ...base,
      actorId: `AI:${i.bowlingTeamId}`,
      kind: "SET_BOWLING_PLAN",
      payload: { ...currentBowl, length: advice.bowlingLength, effort: advice.bowlingEffort },
    };
  }
  if (i.bowlerId && i.legalBalls % 6 === 0 && slotsSignature(c.fieldSlots) !== slotsSignature(advice.fieldSlots)) {
    return {
      ...base,
      actorId: `AI:${i.bowlingTeamId}`,
      kind: "SET_FIELD",
      payload: { teamId: i.bowlingTeamId, fieldSlots: [...advice.fieldSlots] },
    };
  }
  return fallback;
}

export function runTacticalRed5(
  setup: FrozenRed5Setup,
  profile: RedBallTacticalProfile = "BALANCED",
  maxCommands = 2600,
): Red5Session {
  let session = createRed5Session(setup);
  while (session.core.phase !== "COMPLETE") {
    if (session.revision >= maxCommands) throw new Error("LC_RED5_AI_COMMAND_LIMIT");
    session = executeRed5Command(session, tacticalRed5Step(session, profile)).session;
  }
  return session;
}
