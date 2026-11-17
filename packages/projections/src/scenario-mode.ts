import {
  SCENARIO_RECORD_LEDGER_SCHEMA_ID,
  ScenarioRecordLedgerSchema,
  type ScenarioAttempt,
  type ScenarioChallenge,
  type ScenarioOutcome,
  type ScenarioPersonalBest,
  type ScenarioRecordLedger,
} from "@lcxxvi/contracts";

/**
 * Stage 12 scenario scoring and personal bests. Pure: the worker supplies the engine's match result and the challenge's
 * SHA-256; nothing here reads storage, clocks or randomness. Scenario records live in their own ledger and never feed
 * career statistics, awards or stories.
 */

export type ScenarioResultInput = {
  kind: "WIN" | "TIE" | "DRAW" | "NO_RESULT";
  winnerTeamId: string | null;
  marginType: "RUNS" | "WICKETS" | "INNINGS" | null;
  marginRuns: number | null;
  marginWickets: number | null;
};

export type ScenarioEvaluation = {
  outcome: ScenarioOutcome;
  marginType: "RUNS" | "WICKETS" | "INNINGS" | null;
  marginValue: number | null;
  /** One plain sentence for the result banner. */
  text: string;
};

export const MAX_SCENARIO_ATTEMPTS = 64;

export function emptyScenarioLedger(): ScenarioRecordLedger {
  return { schemaId: SCENARIO_RECORD_LEDGER_SCHEMA_ID, records: [], attempts: [] };
}

export function evaluateScenarioResult(
  challenge: Pick<ScenarioChallenge, "playerTeamId" | "objective">,
  result: ScenarioResultInput,
): ScenarioEvaluation {
  const won = result.kind === "WIN" && result.winnerTeamId === challenge.playerTeamId;
  const lost = result.kind === "WIN" && result.winnerTeamId !== challenge.playerTeamId;
  const completed = challenge.objective === "WIN" ? won : !lost && result.kind !== "NO_RESULT";
  const marginValue = won ? (result.marginType === "WICKETS" ? result.marginWickets : result.marginRuns) : null;
  const marginType = won && marginValue !== null && marginValue > 0 ? result.marginType : null;
  const margin =
    marginType === "WICKETS" ? ` by ${marginValue} wicket${marginValue === 1 ? "" : "s"}` :
    marginType === "RUNS" ? ` by ${marginValue} run${marginValue === 1 ? "" : "s"}` :
    marginType === "INNINGS" ? ` by an innings and ${marginValue} run${marginValue === 1 ? "" : "s"}` : "";
  const what = won ? `Won${margin}` : lost ? "Lost" : result.kind === "TIE" ? "Tied" : result.kind === "DRAW" ? "Drawn" : "No result";
  return {
    outcome: completed ? "COMPLETED" : "FAILED",
    marginType,
    marginValue: marginType ? marginValue : null,
    text: `${what}. Challenge ${completed ? "completed" : "failed"}.`,
  };
}

function recordKey(scenarioId: string, challengeSha256: string): string {
  return `${scenarioId}:${challengeSha256}`;
}

function sortRecords(records: ScenarioPersonalBest[]): ScenarioPersonalBest[] {
  return records.sort((a, b) => (recordKey(a.scenarioId, a.challengeSha256) < recordKey(b.scenarioId, b.challengeSha256) ? -1 : 1));
}

/** Counts an attempt and remembers the match so it can be scored once. Idempotent for the same game. */
export function recordScenarioStart(
  ledgerRaw: ScenarioRecordLedger,
  attempt: Pick<ScenarioAttempt, "gameId" | "scenarioId" | "challengeSha256" | "playerTeamId" | "objective">,
): ScenarioRecordLedger {
  const ledger = ScenarioRecordLedgerSchema.parse(ledgerRaw);
  if (ledger.attempts.some((a) => a.gameId === attempt.gameId)) return ledger;
  const records = ledger.records.map((r) => ({ ...r }));
  const existing = records.find((r) => r.scenarioId === attempt.scenarioId && r.challengeSha256 === attempt.challengeSha256);
  if (existing) existing.attempts += 1;
  else
    records.push({
      scenarioId: attempt.scenarioId,
      challengeSha256: attempt.challengeSha256,
      attempts: 1,
      completions: 0,
      failures: 0,
      bestMarginType: null,
      bestMarginValue: null,
      lastOutcome: null,
    });
  // The oldest attempt drops off first. It stays counted; if it was unfinished it can no longer be scored.
  const attempts = [
    ...ledger.attempts,
    {
      gameId: attempt.gameId,
      scenarioId: attempt.scenarioId,
      challengeSha256: attempt.challengeSha256,
      playerTeamId: attempt.playerTeamId,
      objective: attempt.objective,
      outcome: null,
      resultText: null,
    },
  ].slice(-MAX_SCENARIO_ATTEMPTS);
  return ScenarioRecordLedgerSchema.parse({ ...ledger, records: sortRecords(records), attempts });
}

/** Scores a finished scenario match once. Returns the ledger unchanged when the game is not an active attempt. */
export function recordScenarioFinish(
  ledgerRaw: ScenarioRecordLedger,
  gameId: string,
  evaluation: ScenarioEvaluation,
): ScenarioRecordLedger {
  const ledger = ScenarioRecordLedgerSchema.parse(ledgerRaw);
  const attempt = ledger.attempts.find((a) => a.gameId === gameId);
  if (!attempt || attempt.outcome !== null) return ledger;
  const records = ledger.records.map((r) => ({ ...r }));
  const record = records.find((r) => r.scenarioId === attempt.scenarioId && r.challengeSha256 === attempt.challengeSha256);
  if (record) {
    record.lastOutcome = evaluation.outcome;
    if (evaluation.outcome === "COMPLETED") {
      record.completions += 1;
      if (
        evaluation.marginType &&
        evaluation.marginValue !== null &&
        (record.bestMarginValue === null || record.bestMarginType !== evaluation.marginType || evaluation.marginValue > record.bestMarginValue)
      ) {
        // A challenge only ever completes with one kind of margin (a chase by wickets, a defence by runs).
        if (record.bestMarginType === null || record.bestMarginType === evaluation.marginType) {
          record.bestMarginType = evaluation.marginType;
          record.bestMarginValue = evaluation.marginValue;
        }
      }
    } else record.failures += 1;
  }
  const attempts = ledger.attempts.map((a) =>
    a.gameId === gameId ? { ...a, outcome: evaluation.outcome, resultText: evaluation.text } : a,
  );
  return ScenarioRecordLedgerSchema.parse({ ...ledger, records, attempts });
}

export function scenarioAttemptFor(ledger: ScenarioRecordLedger, gameId: string): ScenarioAttempt | null {
  return ledger.attempts.find((a) => a.gameId === gameId) ?? null;
}
