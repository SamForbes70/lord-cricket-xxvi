/** Optional human-v-AI and delegated-decision boundary across T20, ODI and five-day Red-ball.
 * Uses the accepted match command engines; no random draws, no competing ball scorer, no hidden seed in the captain view.
 */
import {
  adviseODICaptain,
  adviseRed5Captain,
  adviseT20Captain,
  evaluateRed5DeclarationRollouts,
  evaluateRed5FollowOnRollouts,
} from "@lcxxvi/ai";
import {
  fixtureAutopilotStep,
  isVerifiedFrozenRed5Setup,
  odiFixtureAutopilotStep,
  red5FixtureAutopilotStep,
  simulateRed5DeclarationContinuation,
  simulateRed5FollowOnContinuation,
  type ODISession,
  type Red5Session,
  type T20Session,
} from "@lcxxvi/simulation";
import type {
  DelegationCategoryValue,
  ODICommand,
  Red5Command,
  RedBallTacticalProfile,
  T20Command,
} from "@lcxxvi/contracts";

export type DelegationCategory = DelegationCategoryValue;

function slotsSignature(slots: readonly { slotId: string; playerId: string }[]): string {
  return [...slots]
    .sort((a, b) => a.playerId.localeCompare(b.playerId))
    .map(s => `${s.playerId}:${s.slotId}`)
    .join("|");
}

export function proposeOpponentT20Command(
  session: Readonly<T20Session>,
  teamId: string,
  categories?: readonly DelegationCategory[],
): T20Command | null {
  const command = proposeT20Command(session, teamId);
  if (!command || !categories) return command;
  const category: Partial<Record<T20Command["kind"], DelegationCategory>> = {
    CALL_TOSS: "TOSS",
    CHOOSE_INNINGS: "INNINGS",
    SET_BATTER: "BATTER",
    SET_BOWLER: "BOWLER",
    SET_BATTING_PLAN: "BATTING_PLAN",
    SET_BOWLING_PLAN: "BOWLING_PLAN",
    SET_FIELD: "FIELD",
  };
  const selected = category[command.kind];
  return selected && categories.includes(selected) ? command : null;
}

function proposeT20Command(session: Readonly<T20Session>, teamId: string): T20Command | null {
  if (!session.setup.teams.some(t => t.teamId === teamId)) throw new Error("LC_T20_AI_UNKNOWN_TEAM");
  const phase = session.core.phase;
  if (phase === "COMPLETE" || phase === "SETUP") return null;
  const i = session.core.innings[session.core.activeInningsIndex]?.innings;
  const base = { commandId: `opponent-${String(session.revision + 1).padStart(6, "0")}`, expectedRevision: session.revision };
  const owned = (cmd: T20Command): T20Command => ({ ...cmd, ...base });
  if (phase === "TOSS" || phase === "AWAITING_INNINGS") {
    const decision = phase === "TOSS" ? session.setup.teams[0]!.teamId : session.core.tossWinnerId;
    if (teamId !== decision) return null;
    return owned(fixtureAutopilotStep(session as T20Session));
  }
  if (!i) return null;
  const batting = i.battingTeamId === teamId;
  const bowling = i.bowlingTeamId === teamId;
  const ledger = session.core.innings[session.core.activeInningsIndex]!;
  const bowlingTeam = session.setup.teams.find(t => t.teamId === i.bowlingTeamId)!;
  const bowlers = bowlingTeam.xi
    .filter(p => p.bowlingStyle && p.playerId !== bowlingTeam.keeperId && p.playerId !== i.previousOverBowlerId)
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
  const view = {
    inningsLegalBalls: i.legalBalls,
    inningsRuns: i.runs,
    wicketsLost: i.wickets,
    targetToWin: i.targetToWin,
    availableBatters: Math.max(0, 10 - i.wickets),
    bowlingCandidates: bowlers,
  };
  const advice = adviseT20Captain(view);
  if (phase === "AWAITING_BATTER" && batting) return owned(fixtureAutopilotStep(session as T20Session));
  if (phase === "AWAITING_BOWLER" && bowling) {
    if (!advice.preferredBowlerId) return owned(fixtureAutopilotStep(session as T20Session));
    return { ...base, actorId: `AI:${teamId}`, kind: "SET_BOWLER", payload: { teamId, bowlerId: advice.preferredBowlerId } };
  }
  if (phase !== "READY") return null;
  if (batting) {
    const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
    if (striker && (session.core.battingPlans[striker]?.aggression ?? 2) !== advice.aggression) {
      return { ...base, actorId: `AI:${teamId}`, kind: "SET_BATTING_PLAN", payload: { playerId: striker, aggression: advice.aggression, intent: "NORMAL" } };
    }
  }
  if (bowling && session.core.bowlingPlan) {
    const current = session.core.bowlingPlan;
    if (current.effort !== advice.bowlingEffort || current.length !== advice.bowlingLength) {
      return { ...base, actorId: `AI:${teamId}`, kind: "SET_BOWLING_PLAN", payload: { ...current, length: advice.bowlingLength, effort: advice.bowlingEffort } };
    }
  }
  // Human owns clock/ADVANCE, even when AI decisions are enabled. No automated ball execution.
  return null;
}

export function proposeOpponentODICommand(
  session: Readonly<ODISession>,
  teamId: string,
  categories?: readonly DelegationCategory[],
): ODICommand | null {
  if (!session.setup.teams.some(t => t.teamId === teamId)) throw new Error("LC_ODI_AI_UNKNOWN_TEAM");
  const allowed = (cat: DelegationCategory) => !categories || categories.includes(cat);
  const phase = session.core.phase;
  if (phase === "COMPLETE" || phase === "SETUP") return null;
  const base = { commandId: `opponent-odi-${String(session.revision + 1).padStart(6, "0")}`, expectedRevision: session.revision };
  const owned = (cmd: ODICommand): ODICommand => ({ ...cmd, ...base });
  if (phase === "TOSS") {
    if (teamId !== session.setup.teams[0]!.teamId || !allowed("TOSS")) return null;
    return owned(odiFixtureAutopilotStep(session as ODISession));
  }
  if (phase === "AWAITING_INNINGS") {
    if (teamId !== session.core.tossWinnerId || !allowed("INNINGS")) return null;
    return owned(odiFixtureAutopilotStep(session as ODISession));
  }
  const ledger = session.core.innings[session.core.activeInningsIndex];
  if (!ledger) return null;
  const i = ledger.innings;
  const batting = i.battingTeamId === teamId;
  const bowling = i.bowlingTeamId === teamId;
  const bowlingTeam = session.setup.teams.find(t => t.teamId === i.bowlingTeamId)!;
  const battingTeam = session.setup.teams.find(t => t.teamId === i.battingTeamId)!;
  const strikerId = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const strikerHand = battingTeam.xi.find(p => p.playerId === strikerId)?.batHand ?? "R";
  const refBowler = i.bowlerId ?? bowlingTeam.xi.find(p => p.bowlingStyle && p.playerId !== bowlingTeam.keeperId)?.playerId ?? "";
  const outfieldIds =
    ledger.outfieldIds.length === 9
      ? ledger.outfieldIds
      : bowlingTeam.playerIds.filter(id => id !== bowlingTeam.keeperId && id !== refBowler).slice(0, 9);
  const bowlers = bowlingTeam.xi
    .filter(p => p.bowlingStyle && p.playerId !== bowlingTeam.keeperId && p.playerId !== i.previousOverBowlerId)
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
  const advice = adviseODICaptain({
    inningsLegalBalls: i.legalBalls,
    inningsRuns: i.runs,
    wicketsLost: i.wickets,
    targetToWin: i.targetToWin,
    availableBatters: Math.max(0, 10 - i.wickets),
    strikerHand,
    outfieldIds,
    bowlingCandidates: bowlers,
  });

  if (phase === "AWAITING_BATTER") {
    return batting && allowed("BATTER") ? owned(odiFixtureAutopilotStep(session as ODISession)) : null;
  }
  if (phase === "AWAITING_BOWLER") {
    if (!bowling || !allowed("BOWLER")) return null;
    if (!advice.preferredBowlerId) return owned(odiFixtureAutopilotStep(session as ODISession));
    return { ...base, actorId: `AI:${teamId}`, kind: "SET_BOWLER", payload: { teamId, bowlerId: advice.preferredBowlerId } };
  }
  if (phase !== "READY") return null;
  if (batting && allowed("BATTING_PLAN") && strikerId) {
    const currentBat = session.core.battingPlans[strikerId];
    if (currentBat?.aggression !== advice.aggression || currentBat?.intent !== advice.battingIntent) {
      return {
        ...base,
        actorId: `AI:${teamId}`,
        kind: "SET_BATTING_PLAN",
        payload: { playerId: strikerId, aggression: advice.aggression, intent: advice.battingIntent },
      };
    }
  }
  if (bowling && allowed("BOWLING_PLAN") && session.core.bowlingPlan) {
    const currentBowl = session.core.bowlingPlan;
    if (currentBowl.effort !== advice.bowlingEffort || currentBowl.length !== advice.bowlingLength) {
      return {
        ...base,
        actorId: `AI:${teamId}`,
        kind: "SET_BOWLING_PLAN",
        payload: { ...currentBowl, length: advice.bowlingLength, effort: advice.bowlingEffort },
      };
    }
  }
  if (bowling && allowed("FIELD") && i.bowlerId && i.legalBalls % 6 === 0) {
    if (slotsSignature(session.core.fieldSlots) !== slotsSignature(advice.fieldSlots)) {
      return {
        ...base,
        actorId: `AI:${teamId}`,
        kind: "SET_FIELD",
        payload: { teamId, fieldSlots: [...advice.fieldSlots] },
      };
    }
  }
  return null;
}

export function proposeOpponentRed5Command(
  session: Readonly<Red5Session>,
  teamId: string,
  profile: RedBallTacticalProfile = "BALANCED",
  categories?: readonly DelegationCategory[],
): Red5Command | null {
  if (!session.setup.teams.some(t => t.teamId === teamId)) throw new Error("LC_RED5_AI_UNKNOWN_TEAM");
  const allowed = (cat: DelegationCategory) => !categories || categories.includes(cat);
  const c = session.core;
  const phase = c.phase;
  if (phase === "COMPLETE" || phase === "SETUP") return null;
  const base = { commandId: `opponent-red5-${String(session.revision + 1).padStart(6, "0")}`, expectedRevision: session.revision };
  const owned = (cmd: Red5Command): Red5Command => ({ ...cmd, ...base });

  if (phase === "TOSS") {
    if (teamId !== session.setup.teams[0]!.teamId || !allowed("TOSS")) return null;
    return owned(red5FixtureAutopilotStep(session as Red5Session));
  }
  if (phase === "AWAITING_INNINGS") {
    if (teamId !== c.tossWinnerId || !allowed("INNINGS")) return null;
    return owned(red5FixtureAutopilotStep(session as Red5Session));
  }
  if (phase === "AWAITING_FOLLOW_ON") {
    const enforcingTeamId = c.innings[0]!.innings.battingTeamId;
    if (teamId !== enforcingTeamId || !allowed("FOLLOW_ON")) return null;
    const first = c.innings[0]!;
    const second = c.innings[1]!;
    const bowlingTeam = session.setup.teams.find(t => t.teamId === enforcingTeamId)!;
    const outfieldIds = bowlingTeam.playerIds.filter(id => id !== bowlingTeam.keeperId).slice(0, 9);
    const candidates = bowlingTeam.xi
      .filter(p => p.bowlingStyle && p.playerId !== bowlingTeam.keeperId)
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
    const advice = adviseRed5Captain({
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
    });
    const enforce = isVerifiedFrozenRed5Setup(session.setup)
      ? evaluateRed5FollowOnRollouts({
          evaluatingTeamId: teamId,
          profile,
          simulateAction: (action, rolloutIndex, budget) =>
            simulateRed5FollowOnContinuation({
              liveSession: session,
              action,
              rolloutIndex,
              maxCommands: budget.maxCommandsPerRollout,
            }),
        }).recommendedEnforce
      : advice.enforceFollowOn;
    return {
      ...base,
      actorId: `AI:${teamId}`,
      kind: "CHOOSE_FOLLOW_ON",
      payload: { teamId, enforce },
    };
  }

  const ledger = c.innings[c.activeInningsIndex];
  if (!ledger) return null;
  const i = ledger.innings;
  const batting = i.battingTeamId === teamId;
  const bowling = i.bowlingTeamId === teamId;
  const bowlingTeam = session.setup.teams.find(t => t.teamId === i.bowlingTeamId)!;
  const battingTeam = session.setup.teams.find(t => t.teamId === i.battingTeamId)!;
  const battingAggregate = c.innings
    .filter(inn => inn.innings.battingTeamId === i.battingTeamId)
    .reduce((sum, inn) => sum + inn.innings.runs, 0);
  const bowlingAggregate = c.innings
    .filter(inn => inn.innings.battingTeamId === i.bowlingTeamId)
    .reduce((sum, inn) => sum + inn.innings.runs, 0);
  const strikerId = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const strikerHand = battingTeam.xi.find(p => p.playerId === strikerId)?.batHand ?? "R";
  const refBowler = i.bowlerId ?? bowlingTeam.xi.find(p => p.bowlingStyle && p.playerId !== bowlingTeam.keeperId)?.playerId ?? "";
  const outfieldIds =
    ledger.outfieldIds.length === 9
      ? ledger.outfieldIds
      : bowlingTeam.playerIds.filter(id => id !== bowlingTeam.keeperId && id !== refBowler).slice(0, 9);
  const bowlers = bowlingTeam.xi
    .filter(p => p.bowlingStyle && p.playerId !== bowlingTeam.keeperId && p.playerId !== i.previousOverBowlerId)
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
    phase === "READY" &&
    i.ballAgeLegalBalls >= 480 &&
    i.legalBalls % 6 === 0;
  const advice = adviseRed5Captain({
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
    bowlingCandidates: bowlers,
  });

  if (phase === "AWAITING_BATTER") {
    return batting && allowed("BATTER") ? owned(red5FixtureAutopilotStep(session as Red5Session)) : null;
  }
  if (bowling && newBallAvailable && allowed("NEW_BALL") && advice.takeNewBall) {
    return { ...base, actorId: `AI:${teamId}`, kind: "TAKE_NEW_BALL", payload: { teamId } };
  }
  if (phase === "AWAITING_BOWLER") {
    if (!bowling || !allowed("BOWLER")) return null;
    if (!advice.preferredBowlerId) return owned(red5FixtureAutopilotStep(session as Red5Session));
    return { ...base, actorId: `AI:${teamId}`, kind: "SET_BOWLER", payload: { teamId, bowlerId: advice.preferredBowlerId } };
  }
  if (phase !== "READY") return null;
  if (batting && allowed("DECLARATION")) {
    const leadRuns = battingAggregate - bowlingAggregate;
    const candidateReview =
      advice.shouldDeclare ||
      (i.legalBalls > 0 &&
        i.legalBalls % 18 === 0 &&
        ((c.activeInningsIndex === 0 && i.runs >= 420 && c.clock.day >= 3) ||
          (c.activeInningsIndex === 2 && leadRuns >= 270 && c.clock.day >= 4)));
    const shouldDeclare =
      candidateReview && isVerifiedFrozenRed5Setup(session.setup)
        ? evaluateRed5DeclarationRollouts({
            evaluatingTeamId: teamId,
            profile,
            simulateAction: (action, rolloutIndex, budget) =>
              simulateRed5DeclarationContinuation({
                liveSession: session,
                action,
                rolloutIndex,
                maxCommands: budget.maxCommandsPerRollout,
                continueOversBeforeReview: budget.continueOversBeforeReview,
              }),
          }).recommendedDeclare
        : advice.shouldDeclare;
    if (shouldDeclare) {
      return { ...base, actorId: `AI:${teamId}`, kind: "DECLARE", payload: { teamId } };
    }
  }
  if (batting && allowed("BATTING_PLAN") && strikerId) {
    const currentBat = c.battingPlans[strikerId];
    if (currentBat?.aggression !== advice.aggression || currentBat?.intent !== advice.battingIntent) {
      return {
        ...base,
        actorId: `AI:${teamId}`,
        kind: "SET_BATTING_PLAN",
        payload: { playerId: strikerId, aggression: advice.aggression, intent: advice.battingIntent },
      };
    }
  }
  if (bowling && allowed("BOWLING_PLAN") && c.bowlingPlan) {
    const currentBowl = c.bowlingPlan;
    if (currentBowl.effort !== advice.bowlingEffort || currentBowl.length !== advice.bowlingLength) {
      return {
        ...base,
        actorId: `AI:${teamId}`,
        kind: "SET_BOWLING_PLAN",
        payload: { ...currentBowl, length: advice.bowlingLength, effort: advice.bowlingEffort },
      };
    }
  }
  if (bowling && allowed("FIELD") && i.bowlerId && i.legalBalls % 6 === 0) {
    if (slotsSignature(c.fieldSlots) !== slotsSignature(advice.fieldSlots)) {
      return {
        ...base,
        actorId: `AI:${teamId}`,
        kind: "SET_FIELD",
        payload: { teamId, fieldSlots: [...advice.fieldSlots] },
      };
    }
  }
  return null;
}
