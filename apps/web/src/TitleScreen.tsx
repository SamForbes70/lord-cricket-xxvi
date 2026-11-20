import { useState } from "react";
import { TeamCrest } from "./world/TeamCrest.js";
import { playUiClick, setSoundOn, soundOn } from "./ui-sound.js";
import { CricketerFigure } from "./world/CricketerFigure.js";
import { careerWorld } from "./career/world-state.js";

/** Session flag read by the exhibition setup: start a T20 with the suggested XIs straight away (valid for a minute). */
export const QUICK_MATCH_KEY = "lcxxvi-quick-match";
/** Persistent flag for the guided first match: the match screen shows the coach until the player ends it. */
export const GUIDED_MATCH_KEY = "lcxxvi-guided-match";

function launchQuickMatch(guided: boolean) {
  playUiClick();
  try {
    sessionStorage.setItem(QUICK_MATCH_KEY, String(Date.now()));
    if (guided) localStorage.setItem(GUIDED_MATCH_KEY, "1");
    else localStorage.removeItem(GUIDED_MATCH_KEY);
  } catch {
    /* Storage blocked: the setup screen still opens and the player starts by hand. */
  }
  window.location.hash = "#exhibition";
}

const MODES: { href: string; title: string; text: string; icon: string }[] = [
  { href: "#career", title: "Career", text: "Manage a club through seasons, contracts and a growing record.", icon: "M4 20 V9 L12 4 L20 9 V20 Z M9 20 V14 H15 V20" },
  { href: "#tournaments", title: "Tournaments", text: "Cups, series, tours and auctions.", icon: "M7 4 H17 V8 A5 5 0 0 1 7 8 Z M12 13 V17 M8 20 H16 M7 6 H4 A3 3 0 0 0 7 10 M17 6 H20 A3 3 0 0 1 17 10" },
  { href: "#scenarios", title: "Scenarios", text: "Take over a match at the crunch.", icon: "M12 3 A9 9 0 1 0 12.01 3 Z M12 7 V12 L15 14" },
  { href: "#rain", title: "Rain and reviews", text: "Weather stoppages and player reviews.", icon: "M6 14 A4 4 0 0 1 7 6 A6 6 0 0 1 18 8 A3.5 3.5 0 0 1 18 15 Z M8 18 L7 21 M12 18 L11 21 M16 18 L15 21" },
  { href: "#exhibition", title: "Custom match", text: "Pick the format, ground and both XIs.", icon: "M5 19 L15 9 M15 9 L17 7 L19 9 L17 11 Z M6 6 A2 2 0 1 0 6.01 6" },
];

/**
 * The title screen (owner order of 20 November 2026, step 2): the game's front door, in the night-match style the
 * owner set as the bar for menus. Quick match starts a T20 with the suggested XIs in one click; the guided first
 * match is the same with a coach explaining each decision. Opened by the launchers at `#title`; the root address
 * still opens the career screen.
 */
export function TitleScreen() {
  const teams = careerWorld.teams;
  const [sound, setSound] = useState(() => soundOn());
  return (
    <main className="title-screen" data-testid="title-screen">
      <div className="title-hero">
        <CricketerFigure className="title-figure title-figure-left" pose="batter" kit={teams[0]?.colours ?? []} seed="title-batter" height={380} />
        <CricketerFigure className="title-figure title-figure-right" pose="bowler" kit={teams[7]?.colours ?? teams[1]?.colours ?? []} seed="title-bowler" height={380} />
        <div className="title-crests" aria-hidden="true">
          {teams.map((team) => (
            <TeamCrest key={team.teamId} teamId={team.teamId} name={team.name} colours={team.colours ?? []} size={40} decorative />
          ))}
        </div>
        <p className="title-eyebrow">Fictional cricket management</p>
        <h1 className="title-wordmark">
          Lord Cricket <span>XXVI</span>
        </h1>
        <p className="title-tagline">Eight clubs, eight grounds, every ball decided by you or your captain.</p>
        <div className="title-actions">
          <button type="button" className="primary title-play" onClick={() => launchQuickMatch(false)}>
            Quick match
            <small>T20 · suggested XIs · one click</small>
          </button>
          <button type="button" className="title-guided" onClick={() => launchQuickMatch(true)}>
            Guided first match
            <small>Learn each decision as it comes</small>
          </button>
        </div>
      </div>
      <nav className="title-modes" aria-label="Game modes">
        {MODES.map((mode) => (
          <a key={mode.href} className="title-mode" href={mode.href} onClick={() => playUiClick()}>
            <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d={mode.icon} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <strong>{mode.title}</strong>
            <span>{mode.text}</span>
          </a>
        ))}
      </nav>
      <div className="title-sound">
        <button type="button" aria-pressed={sound} onClick={() => setSound(!setSoundOn(!sound).muted)}>
          Sound: {sound ? "on" : "off"}
        </button>
      </div>
      <p className="title-footer">Plays offline. Saves stay in this browser; use Export in the game to keep a copy.</p>
    </main>
  );
}
