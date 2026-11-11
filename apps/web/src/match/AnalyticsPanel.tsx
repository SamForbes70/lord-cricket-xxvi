import React from "react";
import type { MatchAnalytics } from "@lcxxvi/projections";

/** Visual summaries of recorded events, never additional simulated tracking. */
export function AnalyticsPanel({ data, names, busy, rebuild, onRebuild, onCancel }: { data: MatchAnalytics; names: Readonly<Record<string, string>>; busy: boolean; rebuild: { state: "IDLE" | "RUNNING" | "STOPPING" | "COMPLETE" | "CANCELLED"; applied: number; total: number }; onRebuild: () => void; onCancel: () => void }) {
  const maxOver = Math.max(1, ...data.overSummaries.map(o => o.runs));
  const sectorRuns = Array.from({ length: 8 }, (_, index) => data.shotSectors.filter(s => s.sector === index).reduce((a,s)=>a+s.batRuns,0));
  const maxSector = Math.max(1, ...sectorRuns);
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
    <h3>Wagon sectors</h3>
    <div role="group" aria-label="Recorded batting runs by shot sector" className="analytics-sectors">{sectorRuns.map((runs,sector)=><div key={sector}>
      <span>Sector {sector+1}</span><span className="analytics-sector-track"><span style={{ width: `${runs/maxSector*100}%` }}/></span><strong>{runs}</strong>
    </div>)}</div>
    {data.unlocatedShots>0 && <p>{data.unlocatedShots} scoring deliveries had no recorded sector and are omitted from the wagon sectors.</p>}
  </section>;
}
