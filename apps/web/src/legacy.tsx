import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BUILD_CAPABILITIES, CommandSchema } from "@lcxxvi/contracts";
import "./legacy.css";
const example = {
  commandId: "cmd-0091",
  aggregateId: "match-0001",
  expectedRevision: 82,
  actorId: "USER:team-01",
  kind: "SET_BATTING_PLAN",
  payload: { playerId: "p017", aggression: 3, intent: "ROTATE" },
};
function App() {
  const [input, setInput] = useState(JSON.stringify(example, null, 2));
  const [result, setResult] = useState(
    "Paste a command to check its contract.",
  );
  const [scale, setScale] = useState("100");
  const validate = () => {
    try {
      CommandSchema.parse(JSON.parse(input));
      setResult(
        "Valid command structure. Match authority, phase and rules have not been checked.",
      );
    } catch {
      setResult(
        "Invalid command. Check required fields, types, ranges and unknown properties.",
      );
    }
  };
  return (
    <main className={`scale-${scale}`}>
      <header>
        <p className="eyebrow">HISTORICAL ENGINEERING SHELL / PASS 07A</p>
        <h1>
          Lord Cricket <span>XXVI</span>
        </h1>
        <p className="intro">
          Historical contract-check shell.{" "}
          <a href="/">Open the current T20 exhibition</a>.
        </p>
      </header>
      <section aria-labelledby="status">
        <h2 id="status">Frozen fictional world and match setup</h2>
        <p className="badge">
          M0 complete: verified world and immutable T20 setup
        </p>
        <p className="badge">SYNTHETIC_ALPHA: not empirically validated</p>
        <p>
          The immutable fictional world contains 160 players in eight
          independent squads of 20 and eight grounds. T20 XIs, captains,
          keepers, ground and exact rules/model hashes can be validated and
          copied into a frozen pre-toss setup. No complete match can be played
          yet.
        </p>
        <dl>
          <div>
            <dt>Available</dt>
            <dd>
              Supplied-delivery scoring, innings reducers, deterministic draws,
              fixed-point category sampling, state hashing, one-shot staged
              generator and validated fictional world with immutable T20 setup
            </dd>
          </div>
          <div>
            <dt>Not implemented</dt>
            <dd>
              Complete match orchestration, gameplay, persistent saves and
              careers
            </dd>
          </div>
          <div>
            <dt>Next pass</dt>
            <dd>{BUILD_CAPABILITIES.nextPass}</dd>
          </div>
        </dl>
        <button disabled>Play match (not available)</button>
      </section>
      <section aria-labelledby="validator">
        <h2 id="validator">Command contract check</h2>
        <p>
          This checks structure only. It does not execute a command or create a
          match.
        </p>
        <label htmlFor="command">Command JSON</label>
        <textarea
          id="command"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button onClick={validate}>Validate command</button>
        <p role="status" aria-live="polite">
          {result}
        </p>
      </section>
      <footer>
        <label htmlFor="scale">Text scale </label>
        <select
          id="scale"
          value={scale}
          onChange={(e) => setScale(e.target.value)}
        >
          {["100", "115", "125", "150"].map((v) => (
            <option key={v} value={v}>
              {v}%
            </option>
          ))}
        </select>
        <p>No empirical calibration or cricket-rules compliance is claimed.</p>
      </footer>
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
