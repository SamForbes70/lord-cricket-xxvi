import React, { useState } from "react";
import type { MatchAnalytics } from "@lcxxvi/projections";
import { displaySector, sectorEndpoint } from "./analytics-geometry.js";

/** Visual summaries of recorded events, never additional simulated tracking. */
export function AnalyticsPanel({ data, names, hands, busy, rebuild, onRebuild, onCancel }: { data: MatchAnalytics; names: Readonly<Record<string, string>>; hands: Readonly<Record<string, "L" | "R">>; busy: boolean; rebuild: { state: "IDLE" | "RUNNING" | "STOPPING" | "COMPLETE" | "CANCELLED"; applied: number; total: number }; onRebuild: () => void; onCancel: () => void }) {
  const [batter, setBatter] = useState("ALL");
  const maxOver = Math.max(1, ...data.overSummaries.map(o => o.runs));
  const batters = [...new Set(data.shotSectors.map(shot => shot.batterId))].sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b));
  const sectorRuns = Array<number>(8).fill(0);
  for (const shot of data.shotSectors) {
    if (batter !== "ALL" && shot.batterId !== batter) continue;
    const sector = batter !== "ALL" && hands[batter] === "L" ? displaySector(shot.sector, "L") : shot.sector;
    sectorRuns[sector]! += shot.batRuns;
  }
  const maxSector = Math.max(1, ...sectorRuns);
  const maxBalls = Math.max(1, ...data.worm.map(point => point.legalBalls));
  const maxRuns = Math.max(1, ...data.worm.map(point => point.totalRuns));
  const colours = ["#174f3a", "#9a3a2f", "#315a91", "#8b5a13"];
  return <section className="panel" aria-label="Event-derived match analytics">
    <h2>Match analytics</h2>
    <div className="action-row"><button type="button" disabled={busy} onClick={onRebuild}>Rebuild analytics</button>
      {(rebuild.state === "RUNNING" || rebuild.state === "STOPPING") && <button type="button" disabled={rebuild.state === "STOPPING"} onClick={onCancel}>Cancel analytics rebuild</button>}</div>
    {rebuild.state !== "IDLE" && <p role="status">{rebuild.state === "COMPLETE" ? "Analytics rebuild complete" : rebuild.state === "CANCELLED" ? "Analytics rebuild cancelled" : rebuild.state === "STOPPING" ? "Cancelling analytics rebuild" : "Rebuilding analytics"}: {rebuild.applied} / {rebuild.total} events.</p>}
    <p>Derived from accepted deliveries. Sectors show recorded direction only; no measured ball positions or distances.</p>
    <h3>Manhattan: runs by over</h3>
    <div className="analytics-overs" role="group" aria-label="Over-by-over runs">
      {data.finalRuns.map((_, innings) => <div key={innings}>
        <strong>Innings {innings + 1}</strong>
        <div className="analytics-barrow">{data.overSummaries.filter(o=>o.inningsIndex===innings).map(over =>
          <div key={`${innings}:${over.overNumber}`} className="analytics-over" title={`Over ${over.overNumber}: ${over.runs} runs, ${over.wickets} wickets`}>
            <span style={{ height: `${Math.max(2, over.runs/maxOver*70)}px` }} />
            <small>{over.overNumber}</small>
          </div>)}</div>
      </div>)}
    </div>
    <h3>Cumulative score worm</h3>
    <svg className="analytics-worm" viewBox="0 0 640 260" role="img" aria-label="Cumulative runs by legal balls, with one line per innings">
      <line x1="35" y1="225" x2="620" y2="225" stroke="currentColor" /><line x1="35" y1="15" x2="35" y2="225" stroke="currentColor" />
      {data.finalRuns.map((_, innings) => <polyline key={innings} fill="none" stroke={colours[innings % colours.length]} strokeWidth="3" points={[[35, 225], ...data.worm.filter(point => point.inningsIndex === innings).map(point => [35 + point.legalBalls / maxBalls * 585, 225 - point.totalRuns / maxRuns * 210])].map(point => point.join(",")).join(" ")}><title>Innings {innings + 1}</title></polyline>)}
      <text x="325" y="252" textAnchor="middle">Legal balls (0–{maxBalls})</text><text x="40" y="14">Runs (0–{maxRuns})</text>
    </svg>
    <ul className="analytics-legend">{data.finalRuns.map((_, innings) => <li key={innings}><span aria-hidden="true" style={{ backgroundColor: colours[innings % colours.length] }} /> Innings {innings + 1}</li>)}</ul>
    <table><caption>Score progression at over boundaries</caption><thead><tr><th>Innings</th><th>Over</th><th>Score</th><th>Wickets</th></tr></thead>
      <tbody>{data.worm.filter((p,index,all) => p.legalBalls % 6 === 0 && (index===all.length-1 || all[index+1]?.legalBalls !== p.legalBalls || all[index+1]?.inningsIndex !== p.inningsIndex)).map(p=><tr key={`${p.inningsIndex}-${p.sequence}`}><td>{p.inningsIndex+1}</td><td>{p.legalBalls/6}</td><td>{p.totalRuns}</td><td>{p.wickets}</td></tr>)}</tbody>
    </table>
    <h3>Partnerships</h3>
    <table><thead><tr><th>Innings</th><th>Batters</th><th>Runs</th><th>Legal balls</th></tr></thead><tbody>
      {data.partnerships.map(p => <tr key={`${p.inningsIndex}-${p.fromSequence}`}><td>{p.inningsIndex+1}</td><td>{p.players.map(id => names[id] ?? id).join(" / ")}</td><td>{p.runs}</td><td>{p.legalBalls}</td></tr>)}
    </tbody></table>
    <h3>Fall of wickets</h3>
    {data.fallOfWickets.length ? <table><thead><tr><th>Innings</th><th>Wicket</th><th>Player</th><th>Score</th><th>Over</th></tr></thead><tbody>
      {data.fallOfWickets.map(wicket => <tr key={wicket.sequence}><td>{wicket.inningsIndex + 1}</td><td>{wicket.wickets}</td><td>{names[wicket.playerId] ?? wicket.playerId}</td><td>{wicket.runs}</td><td>{Math.floor(wicket.legalBalls / 6)}.{wicket.legalBalls % 6}</td></tr>)}
    </tbody></table> : <p>No wickets recorded.</p>}
    <h3>Shot-sector wagon wheel</h3>
    <label>Batter <select value={batter} onChange={event => setBatter(event.currentTarget.value)}><option value="ALL">All batters</option>{batters.map(id => <option key={id} value={id}>{names[id] ?? id}</option>)}</select></label>
    <p>Shows bat runs by recorded sector. Line lengths compare totals; they are not measured distances. Extras are excluded. {batter === "ALL" ? "All-batter sectors are batter-relative." : hands[batter] === "L" ? "The left-handed batter's display is reflected." : hands[batter] === "R" ? "The selected batter's sectors are shown in the right-handed view." : "Handedness is unavailable; sectors remain batter-relative."}</p>
    <svg className="analytics-wheel" viewBox="0 0 200 200" role="img" aria-label="Bat runs by recorded shot sector">
      <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" />
      {sectorRuns.map((runs, sector) => { const end = sectorEndpoint(sector, runs / maxSector); return <line key={sector} x1="100" y1="100" x2={end.x} y2={end.y} stroke="#174f3a" strokeWidth="5"><title>Sector {sector + 1}: {runs} bat runs</title></line>; })}
      <circle cx="100" cy="100" r="3" fill="currentColor" />
    </svg>
    <div role="group" aria-label="Recorded batting runs by shot sector" className="analytics-sectors">{sectorRuns.map((runs,sector)=><div key={sector}>
      <span>Sector {sector+1}</span><span className="analytics-sector-track"><span style={{ width: `${runs/maxSector*100}%` }}/></span><strong>{runs}</strong>
    </div>)}</div>
    {data.unlocatedShots>0 && <p>{batter === "ALL" ? `${data.unlocatedShots} scoring deliveries had no recorded sector and are omitted from the wagon sectors.` : "Some scoring deliveries in the match have no recorded sector."}</p>}
    <h3>Simulated pitch lengths</h3>
    <p>These are recorded length categories, not measured locations. Line and physical coordinates are unavailable.</p>
    {data.pitchLengths.length > 0 && <svg className="analytics-pitch" viewBox="0 0 300 250" role="img" aria-label="Simulated deliveries by recorded length category">
      {data.pitchLengths.map((item, index) => <g key={item.length} transform={`translate(0 ${index * 45})`}><rect x="4" y="4" width="292" height="40" fill={index % 2 ? "#e5eadd" : "#f4f0df"} stroke="#6b7667" /><text x="14" y="29">{item.length.replaceAll("_", " ")}</text><text x="282" y="29" textAnchor="end">{item.attempts}</text></g>)}
    </svg>}
    {data.pitchLengths.length ? <table><thead><tr><th>Length</th><th>Deliveries</th></tr></thead><tbody>{data.pitchLengths.map(item => <tr key={item.length}><td>{item.length.replaceAll("_", " ")}</td><td>{item.attempts}</td></tr>)}</tbody></table> : <p>No pitch lengths were recorded.</p>}
    {data.unrecordedLengths > 0 && <p>{data.unrecordedLengths} deliveries have no recorded length.</p>}
  </section>;
}
