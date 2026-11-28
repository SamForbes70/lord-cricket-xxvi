import { useEffect, useState } from "react";
import { canonicalJson, type ScenarioChallenge, type ScenarioRecordLedger } from "@lcxxvi/contracts";
import { SCENARIO_PACK } from "@lcxxvi/data";
import { IndexedDbSaveRepository, sha256Text } from "@lcxxvi/persistence";
import "../career/career.css";
import { careerWorld } from "../career/world-state.js";
import { ART_WASH, groundArtBackground } from "../world/ground-art.js";
import { ModeMasthead } from "../ModeMasthead.js";

/** sessionStorage key the match screen reads once to start a chosen scenario. */
export const SCENARIO_LAUNCH_KEY = "lcxxvi-scenario-launch";

const FORMAT_LABELS: Record<ScenarioChallenge["format"], string> = { T20: "T20", ODI: "One-day", RED_BALL: "Five-day" };
const DIFFICULTY_LABELS: Record<ScenarioChallenge["difficulty"], string> = { STANDARD: "Standard", HARD: "Hard", ELITE: "Elite" };

type Best = { attempts: number; completions: number; best: string | null; last: string | null };

function bestText(type: string | null, value: number | null): string | null {
  if (!type || value === null) return null;
  if (type === "WICKETS") return `won by ${value} wicket${value === 1 ? "" : "s"}`;
  if (type === "INNINGS") return `won by an innings and ${value} run${value === 1 ? "" : "s"}`;
  return `won by ${value} run${value === 1 ? "" : "s"}`;
}

/**
 * Stage 12 Scenario Challenges. Curated fictional situations played on the real engines. Records are personal bests kept
 * apart from every career; nothing here changes a career save.
 */
export function ScenariosApp() {
  const [bests, setBests] = useState<Record<string, Best> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const ledger: ScenarioRecordLedger | null = await new IndexedDbSaveRepository().loadScenarioLedger();
        const next: Record<string, Best> = {};
        for (const challenge of SCENARIO_PACK) {
          const sha = await sha256Text(canonicalJson(challenge));
          const record = ledger?.records.find((r) => r.scenarioId === challenge.scenarioId && r.challengeSha256 === sha);
          next[challenge.scenarioId] = record
            ? {
                attempts: record.attempts,
                completions: record.completions,
                best: bestText(record.bestMarginType, record.bestMarginValue),
                last: record.lastOutcome === "COMPLETED" ? "Completed" : record.lastOutcome === "FAILED" ? "Failed" : "In progress",
              }
            : { attempts: 0, completions: 0, best: null, last: null };
        }
        if (live) setBests(next);
      } catch (error) {
        if (live) {
          setBests({});
          setProblem(error instanceof Error && error.message === "SCENARIO_LEDGER_DAMAGED"
            ? "Your scenario records are damaged and cannot be shown. Playing a scenario starts a new record."
            : "Scenario records are unavailable in this browser.");
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  const play = (scenarioId: string) => {
    try {
      sessionStorage.setItem(SCENARIO_LAUNCH_KEY, scenarioId);
    } catch {
      setProblem("This browser blocked session storage, so the scenario cannot be handed to the match screen.");
      return;
    }
    window.location.hash = "#exhibition";
  };
  return (
    <main className="career-shell" data-testid="scenarios-screen">
      <ModeMasthead title="Scenario challenges" back={{ label: "Title screen", href: "#title" }} />
      <p>
        Each challenge starts part-way through a match in the fictional world. Every ball before you take over was played by
        the match engine from a fixed seed, so the situation is the same each time; what happens next is up to you. Results
        are kept as personal bests here and never touch a career.
      </p>
      {problem && <p role="alert">{problem}</p>}
      {bests === null ? (
        <p role="status">Loading your records…</p>
      ) : (
        <ol className="career-stories" aria-label="Scenario challenges">
          {SCENARIO_PACK.map((challenge) => {
            const best = bests[challenge.scenarioId];
            return (
              <li key={challenge.scenarioId} className="career-panel scenario-card" data-difficulty={challenge.difficulty} data-testid={`scenario-${challenge.scenarioId}`}>
                <div className="scenario-art" aria-hidden="true" style={groundArtBackground(careerWorld.grounds.find((ground) => ground.groundId === challenge.groundId)?.name ?? challenge.groundId, ART_WASH.card)}>
                  <span className="scenario-difficulty">{DIFFICULTY_LABELS[challenge.difficulty]}</span>
                </div>
                <h2>{challenge.title}</h2>
                <p>
                  <small>
                    {FORMAT_LABELS[challenge.format]} · {DIFFICULTY_LABELS[challenge.difficulty]}
                  </small>
                </p>
                <p>{challenge.briefing}</p>
                <p>
                  <strong>Objective:</strong> {challenge.objectiveSummary}
                </p>
                <p data-testid={`scenario-record-${challenge.scenarioId}`}>
                  {best && best.attempts > 0
                    ? `Attempts ${best.attempts} · completed ${best.completions}${best.best ? ` · best: ${best.best}` : ""}${best.last ? ` · last: ${best.last}` : ""}`
                    : "Not attempted yet."}
                </p>
                <button type="button" className="primary" onClick={() => play(challenge.scenarioId)}>
                  Play {challenge.title}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
