import React, { useId, useLayoutEffect, useRef, useState } from "react";
import type { MatchAnalytics } from "@lcxxvi/projections";
import { displaySector } from "./analytics-geometry.js";
import {
  SECTOR_REGIONS, manhattanLayout, overByOverRows, oversText, wedgePath, wheelLabelPosition, wormLayout,
} from "./chart-layout.js";
import "../data-table.css";
import "./analytics-charts.css";

/**
 * Visual summaries of recorded events, never additional simulated tracking. CP08 (statistical visualisation): every
 * chart is drawn at its measured width so its text keeps its stated size (and the player's text scale), carries a
 * non-colour cue for each innings (bar pattern, line style, marker shape), has a written summary and a data table,
 * and has no motion. Every number comes from the match analytics projection the worker sends.
 */
export function AnalyticsPanel({ data, names, hands, inningsTeams = [], busy, rebuild, onRebuild, onCancel }: { data: MatchAnalytics; names: Readonly<Record<string, string>>; hands: Readonly<Record<string, "L" | "R">>; inningsTeams?: readonly string[]; busy: boolean; rebuild: { state: "IDLE" | "RUNNING" | "STOPPING" | "COMPLETE" | "CANCELLED"; applied: number; total: number }; onRebuild: () => void; onCancel: () => void }) {
  const innings = data.finalRuns.map((_, index) => index);
  const label = (index: number) => inningsTeams[index] ? `Innings ${index + 1}, ${inningsTeams[index]}` : `Innings ${index + 1}`;
  const finalLine = (index: number) => `${data.finalRuns[index] ?? 0}/${data.finalWickets[index] ?? 0} in ${oversText(data.finalLegalBalls[index] ?? 0)} overs`;
  return <section className="panel analytics-panel" aria-label="Event-derived match analytics">
    <h2>Match analytics</h2>
    <div className="action-row"><button type="button" disabled={busy} onClick={onRebuild}>Rebuild analytics</button>
      {(rebuild.state === "RUNNING" || rebuild.state === "STOPPING") && <button type="button" disabled={rebuild.state === "STOPPING"} onClick={onCancel}>Cancel analytics rebuild</button>}</div>
    {rebuild.state !== "IDLE" && <p role="status">{rebuild.state === "COMPLETE" ? "Analytics rebuild complete" : rebuild.state === "CANCELLED" ? "Analytics rebuild cancelled" : rebuild.state === "STOPPING" ? "Cancelling analytics rebuild" : "Rebuilding analytics"}: {rebuild.applied} / {rebuild.total} events.</p>}
    <p>Derived from accepted deliveries. Sectors show recorded direction only; no measured ball positions or distances.</p>
    <Manhattan data={data} innings={innings} label={label} />
    <Worm data={data} innings={innings} label={label} finalLine={finalLine} />
    <OverByOverTable data={data} innings={innings} label={label} />
    <h3>Partnerships</h3>
    <div className="table-wrap"><table className="data-table"><thead><tr><th scope="col" className="num">Innings</th><th scope="col">Batters</th><th scope="col" className="num">Runs</th><th scope="col" className="num">Balls</th></tr></thead><tbody>
      {data.partnerships.map(p => <tr key={`${p.inningsIndex}-${p.fromSequence}`}><td className="num">{p.inningsIndex + 1}</td><td>{p.players.map(id => names[id] ?? id).join(" and ")}</td><td className="num">{p.runs}</td><td className="num">{p.legalBalls}</td></tr>)}
    </tbody></table></div>
    <h3>Fall of wickets</h3>
    {data.fallOfWickets.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th scope="col" className="num">Innings</th><th scope="col" className="num">Wicket</th><th scope="col">Batter out</th><th scope="col" className="num">Score</th><th scope="col" className="num">Over</th></tr></thead><tbody>
      {data.fallOfWickets.map(wicket => <tr key={wicket.sequence}><td className="num">{wicket.inningsIndex + 1}</td><td className="num">{wicket.wickets}</td><td>{names[wicket.playerId] ?? wicket.playerId}</td><td className="num">{wicket.runs}/{wicket.wickets}</td><td className="num">{Math.floor(wicket.legalBalls / 6)}.{wicket.legalBalls % 6}</td></tr>)}
    </tbody></table></div> : <p>No wickets recorded.</p>}
    <WagonWheel data={data} names={names} hands={hands} label={label} innings={innings} />
    <PitchLengths data={data} />
  </section>;
}

/**
 * The chart's drawn width in CSS pixels (ResizeObserver) and the player's text scale, so SVG text is never scaled down
 * with the drawing and margins grow with the text.
 */
function useChartBox<T extends HTMLElement>(fallback: number): [React.RefObject<T | null>, number, number] {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState({ width: fallback, scale: 1 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const width = Math.floor(el.getBoundingClientRect().width);
      const scale = Math.min(2, Math.max(1, Number.parseFloat(getComputedStyle(el).getPropertyValue("--text-scale")) || 1));
      if (width > 0) setBox(prev => (prev.width === width && prev.scale === scale ? prev : { width, scale }));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, box.width, box.scale];
}

/** Innings series: colour token, bar pattern, line dash and wicket marker shape. Colour is never the only cue. */
const SERIES = [
  { colour: "var(--chart-series-1)", dash: undefined, pattern: "solid", marker: "circle", lineName: "solid line", markerName: "circles" },
  { colour: "var(--chart-series-2)", dash: "8 5", pattern: "hatch", marker: "square", lineName: "dashed line", markerName: "squares" },
  { colour: "var(--chart-series-3)", dash: "2 4", pattern: "dots", marker: "triangle", lineName: "dotted line", markerName: "triangles" },
  { colour: "var(--chart-series-4)", dash: "10 4 2 4", pattern: "cross", marker: "diamond", lineName: "dash and dot line", markerName: "diamonds" },
] as const;
const series = (s: number) => SERIES[s % SERIES.length]!;

function Pattern({ id, s }: { id: string; s: number }) {
  const style = series(s);
  return <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={style.pattern === "hatch" ? "rotate(45)" : undefined}>
    <rect width="6" height="6" style={{ fill: style.colour }} />
    {style.pattern === "hatch" && <rect width="2" height="6" className="chart-pattern-ink" />}
    {style.pattern === "dots" && <circle cx="3" cy="3" r="1.2" className="chart-pattern-ink" />}
    {style.pattern === "cross" && <path d="M0,0 L6,6 M6,0 L0,6" className="chart-pattern-line" />}
  </pattern>;
}

function Marker({ shape, x, y, r, className, style }: { shape: string; x: number; y: number; r: number; className?: string; style?: React.CSSProperties }) {
  if (shape === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} className={className} style={style} />;
  if (shape === "triangle") return <path d={`M${x},${y - r * 1.2} L${x + r * 1.1},${y + r * 0.8} L${x - r * 1.1},${y + r * 0.8} Z`} className={className} style={style} />;
  if (shape === "diamond") return <path d={`M${x},${y - r * 1.25} L${x + r * 1.25},${y} L${x},${y + r * 1.25} L${x - r * 1.25},${y} Z`} className={className} style={style} />;
  return <circle cx={x} cy={y} r={r} className={className} style={style} />;
}

function AxisTitles({ left, right, top, bottom, height, x }: { left: number; right: number; top: number; bottom: number; height: number; x: string }) {
  const mid = top + (bottom - top) / 2;
  return <>
    <text x={(left + right) / 2} y={height - 4} textAnchor="middle" className="chart-axis-title">{x}</text>
    <text x={12} y={mid} textAnchor="middle" className="chart-axis-title" transform={`rotate(-90 12 ${mid})`}>Runs</text>
  </>;
}

function Manhattan({ data, innings, label }: { data: MatchAnalytics; innings: number[]; label: (i: number) => string }) {
  const [ref, width, scale] = useChartBox<HTMLDivElement>(640);
  const prefix = useId().replace(/:/g, "");
  // Two innings share one chart, bars side by side for each over; a longer match gets one chart per innings.
  const groups = innings.length <= 2 ? [innings] : innings.map(i => [i]);
  const summary = innings.map(i => {
    const own = data.overSummaries.filter(o => o.inningsIndex === i);
    const top = own.reduce<{ overNumber: number; runs: number } | null>((a, o) => (!a || o.runs > a.runs ? o : a), null);
    const falls = own.filter(o => o.wickets > 0).map(o => o.wickets > 1 ? `${o.overNumber} (${o.wickets})` : `${o.overNumber}`);
    return `${label(i)}: ${top ? `biggest over ${top.runs} ${top.runs === 1 ? "run" : "runs"} (over ${top.overNumber})` : "no overs"}; ${falls.length ? `wickets fell in overs ${falls.join(", ")}` : "no wickets fell"}.`;
  }).join(" ");
  return <>
    <h3>Manhattan: runs by over</h3>
    <p className="chart-summary" id={`${prefix}-s`}>{summary}</p>
    <ul className="chart-legend" aria-hidden="true">
      {(groups.length === 1 ? innings : []).map((i, s) => <li key={i}><svg width="20" height="12"><defs><Pattern id={`${prefix}-l${s}`} s={s} /></defs><rect width="20" height="12" rx="2" fill={`url(#${prefix}-l${s})`} /></svg>{label(i)}</li>)}
      <li><svg width="14" height="14"><circle cx="7" cy="7" r="5" className="chart-wicket" /></svg>Wicket, one marker each</li>
    </ul>
    <div ref={ref} className="chart-frame" role="group" aria-label="Over-by-over runs">
      {groups.map(group => {
        const layout = manhattanLayout(data.overSummaries, group, Math.max(240, width), groups.length > 1 ? 200 : 240, scale, groups.length > 1 ? Math.max(1, ...data.overSummaries.map(o => o.runs)) : undefined);
        const id = `${prefix}-g${group.join("")}`;
        const patternFor = (inningsIndex: number) => `${id}-p${innings.indexOf(inningsIndex)}`;
        return <figure key={id} className="chart-figure">
          {groups.length > 1 && <figcaption className="chart-caption">{label(group[0]!)}</figcaption>}
          <svg className="chart-svg" width="100%" height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`Runs in each over${groups.length > 1 ? `, ${label(group[0]!)}` : ""}, with a marker for each wicket`} aria-describedby={`${prefix}-s`}>
            <defs>{group.map(i => <Pattern key={i} id={patternFor(i)} s={innings.indexOf(i)} />)}</defs>
            {layout.yTicks.map(t => <g key={t.value}><line x1={layout.plot.left} x2={layout.plot.right} y1={t.y} y2={t.y} className={t.value === 0 ? "chart-axis" : "chart-grid"} /><text x={layout.plot.left - 6} y={t.y + 4} textAnchor="end" className="chart-tick">{t.value}</text></g>)}
            {layout.bars.map(bar => <rect key={`${bar.inningsIndex}:${bar.overNumber}`} x={bar.x} y={bar.y} width={bar.width} height={Math.max(0, bar.height)} rx="1.5" fill={`url(#${patternFor(bar.inningsIndex)})`} className="chart-bar"><title>{`${label(bar.inningsIndex)}, over ${bar.overNumber}: ${bar.runs} runs, ${bar.wickets} ${bar.wickets === 1 ? "wicket" : "wickets"}`}</title></rect>)}
            {layout.wickets.map((w, n) => <circle key={n} cx={w.cx} cy={w.cy} r={w.r} className="chart-wicket" />)}
            {layout.xLabels.map(l => <text key={l.over} x={l.x} y={layout.plot.bottom + 16 * scale} textAnchor="middle" className="chart-tick">{l.over}</text>)}
            <AxisTitles {...layout.plot} height={layout.height} x="Over" />
          </svg>
        </figure>;
      })}
    </div>
  </>;
}

function Worm({ data, innings, label, finalLine }: { data: MatchAnalytics; innings: number[]; label: (i: number) => string; finalLine: (i: number) => string }) {
  const [ref, width, scale] = useChartBox<HTMLDivElement>(640);
  const prefix = useId().replace(/:/g, "");
  const layout = wormLayout(data.worm, innings, Math.max(260, Math.min(width, 900)), 260, scale);
  const summary = innings.map(i => `${label(i)}: ${finalLine(i)}.`).join(" ");
  return <>
    <h3>Cumulative score worm</h3>
    <p className="chart-summary" id={`${prefix}-s`}>{summary}</p>
    <ul className="chart-legend">{innings.map((i, s) => <li key={i}>
      <svg width="36" height="14" aria-hidden="true"><line x1="1" x2="35" y1="7" y2="7" className="chart-line" style={{ stroke: series(s).colour }} strokeDasharray={series(s).dash} /><Marker shape={series(s).marker} x={18} y={7} r={4} className="chart-worm-wicket" style={{ fill: series(s).colour }} /></svg>
      {label(i)}<span className="sr-only">: {series(s).lineName}, wickets marked with {series(s).markerName}</span>
    </li>)}<li className="chart-legend-note">Markers show each wicket</li></ul>
    <div ref={ref} className="chart-frame">
      <svg className="chart-svg" width="100%" height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Cumulative runs by legal balls, with one line per innings" aria-describedby={`${prefix}-s`} style={{ maxWidth: layout.width }}>
        {layout.yTicks.map(t => <g key={t.value}><line x1={layout.plot.left} x2={layout.plot.right} y1={t.y} y2={t.y} className={t.value === 0 ? "chart-axis" : "chart-grid"} /><text x={layout.plot.left - 6} y={t.y + 4} textAnchor="end" className="chart-tick">{t.value}</text></g>)}
        {layout.xTicks.map(t => <g key={t.over}><line x1={t.x} x2={t.x} y1={layout.plot.bottom} y2={layout.plot.bottom + 4} className="chart-axis" /><text x={t.x} y={layout.plot.bottom + 18 * scale} textAnchor="middle" className="chart-tick">{t.over}</text></g>)}
        <line x1={layout.plot.left} x2={layout.plot.left} y1={layout.plot.top} y2={layout.plot.bottom} className="chart-axis" />
        {layout.lines.map(line => <polyline key={line.inningsIndex} fill="none" points={line.points} className="chart-line" style={{ stroke: series(line.series).colour }} strokeDasharray={series(line.series).dash}><title>{label(line.inningsIndex)}</title></polyline>)}
        {layout.wickets.map(w => <Marker key={`${w.inningsIndex}:${w.wicket}`} shape={series(w.series).marker} x={w.x} y={w.y} r={4.5} className="chart-worm-wicket" style={{ fill: series(w.series).colour }} />)}
        <AxisTitles {...layout.plot} height={layout.height} x="Overs" />
      </svg>
    </div>
  </>;
}

function OverByOverTable({ data, innings, label }: { data: MatchAnalytics; innings: number[]; label: (i: number) => string }) {
  const rows = overByOverRows(data.overSummaries, innings);
  return <details className="chart-table">
    <summary>Manhattan and worm as a table</summary>
    <div className="table-wrap"><table className="data-table">
      <caption>Runs in each over (wickets in brackets) and the score after it</caption>
      <thead>
        <tr><th scope="col" rowSpan={2} className="num">Over</th>{innings.map(i => <th key={i} scope="colgroup" colSpan={2} className="group">{label(i)}</th>)}</tr>
        <tr>{innings.map(i => <React.Fragment key={i}><th scope="col" className="num">Runs</th><th scope="col" className="num">Score</th></React.Fragment>)}</tr>
      </thead>
      <tbody>{rows.map(row => <tr key={row.over}><td className="num">{row.over}</td>{row.cells.map((cell, s) => <React.Fragment key={s}>
        <td className="num">{cell ? `${cell.runs}${cell.wickets ? ` (${cell.wickets})` : ""}` : ""}</td>
        <td className="num">{cell ? `${cell.total}/${cell.totalWickets}` : ""}</td>
      </React.Fragment>)}</tr>)}</tbody>
    </table></div>
  </details>;
}

function WagonWheel({ data, names, hands, label, innings }: { data: MatchAnalytics; names: Readonly<Record<string, string>>; hands: Readonly<Record<string, "L" | "R">>; label: (i: number) => string; innings: number[] }) {
  const [batter, setBatter] = useState("ALL");
  const [inningsFilter, setInningsFilter] = useState("ALL");
  const [ref, width, scale] = useChartBox<HTMLDivElement>(420);
  const prefix = useId().replace(/:/g, "");
  const inInnings = data.shotSectors.filter(shot => inningsFilter === "ALL" || shot.inningsIndex === Number(inningsFilter));
  const batters = [...new Set(inInnings.map(shot => shot.batterId))].sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b));
  const chosen = batter !== "ALL" && batters.includes(batter) ? batter : "ALL";
  const hand = chosen !== "ALL" ? hands[chosen] : undefined;
  // Rows and wedges are in display order (a left-hander's sectors reflected); each keeps its recorded sector's name.
  const rows = Array.from({ length: 8 }, (_, display) => ({ display, recorded: hand === "L" ? displaySector(display, "L") : display, runs: 0, fours: 0, sixes: 0 }));
  for (const shot of inInnings) {
    if (chosen !== "ALL" && shot.batterId !== chosen) continue;
    const display = hand === "L" ? displaySector(shot.sector, "L") : shot.sector;
    rows[display]!.runs += shot.batRuns;
    rows[display]!.fours += shot.fours;
    rows[display]!.sixes += shot.sixes;
  }
  const maxRuns = Math.max(1, ...rows.map(r => r.runs));
  const total = rows.reduce((sum, r) => sum + r.runs, 0);
  const w = Math.max(260, Math.min(width, 520));
  const withRuns = w >= 420;
  const labelSpace = (withRuns ? 104 : 78) * scale;
  const radius = Math.max(52, Math.min(140, (w - 2 * labelSpace) / 2));
  const cx = w / 2, cy = radius + 30 * scale, height = 2 * radius + 62 * scale;
  const offOnLeft = hand === "L";
  const ranked = [...rows].filter(r => r.runs > 0).sort((a, b) => b.runs - a.runs).slice(0, 3);
  const detail = (r: { fours: number; sixes: number }) => [r.fours ? `${r.fours} ${r.fours === 1 ? "four" : "fours"}` : "", r.sixes ? `${r.sixes} ${r.sixes === 1 ? "six" : "sixes"}` : ""].filter(Boolean).join(", ");
  const name = (recorded: number) => SECTOR_REGIONS[recorded]!.name;
  return <>
    <h3>Shot-sector wagon wheel</h3>
    <div className="chart-controls">
      {innings.length > 1 && <label>Innings <select value={inningsFilter} onChange={event => setInningsFilter(event.currentTarget.value)}><option value="ALL">All innings</option>{innings.map(i => <option key={i} value={String(i)}>{label(i)}</option>)}</select></label>}
      <label>Batter <select value={chosen} onChange={event => setBatter(event.currentTarget.value)}><option value="ALL">All batters</option>{batters.map(id => <option key={id} value={id}>{names[id] ?? id}</option>)}</select></label>
    </div>
    <p>Shows bat runs by recorded shot sector; extras are excluded. Wedge lengths compare totals; they are not measured distances. {chosen === "ALL" ? "All batters: each shot sits on its own batter's off or leg side, drawn as for a right-hander." : hand === "L" ? "The left-handed batter's display is reflected. The off side is on the left." : hand === "R" ? "The selected batter's sectors are shown in the right-handed view." : "Handedness is unavailable; sectors remain batter-relative."}</p>
    <p className="chart-note">Regions follow the game's recorded sector convention (off side, straight, leg side) and use the names the commentary gives the same sectors. They are directions from the bat, not fielding positions measured on a field.</p>
    <p className="chart-summary" id={`${prefix}-s`}>{total === 0 ? "No bat runs with a recorded sector." : `${total} bat runs with a recorded sector. Most: ${ranked.map(r => `${name(r.recorded)} ${r.runs}`).join(", ")}.`}</p>
    <div className="chart-wheel-layout">
      <div ref={ref} className="chart-frame">
        <svg className="chart-svg chart-wheel" width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label="Bat runs by recorded shot sector" aria-describedby={`${prefix}-s`} style={{ maxWidth: w }}>
          {rows.map(r => <path key={`bg${r.display}`} d={wedgePath(r.display, cx, cy, 12, radius)} className={`chart-wheel-region ${SECTOR_REGIONS[r.recorded]!.side === "Off side" ? "is-off" : SECTOR_REGIONS[r.recorded]!.side === "Leg side" ? "is-leg" : "is-straight"}`} />)}
          <circle cx={cx} cy={cy} r={radius} className="chart-wheel-rim" />
          <rect x={cx - 4} y={cy - radius * 0.36} width={8} height={radius * 0.36 + 6} rx="2" className="chart-wheel-pitch" />
          {rows.map(r => r.runs > 0 && <path key={`v${r.display}`} d={wedgePath(r.display, cx, cy, 12, 12 + (radius - 12) * (r.runs / maxRuns))} className="chart-wheel-value"><title>{`${name(r.recorded)}: ${r.runs} bat runs`}</title></path>)}
          <circle cx={cx} cy={cy} r={4} className="chart-wheel-batter" />
          {rows.map(r => { const p = wheelLabelPosition(r.display, cx, cy, radius); return <text key={`t${r.display}`} x={p.x} y={p.y + 4} textAnchor={p.anchor} className="chart-wheel-label">{name(r.recorded)}{withRuns && <tspan className="chart-wheel-runs"> {r.runs}</tspan>}</text>; })}
          <text x={cx} y={14 * scale} textAnchor="middle" className="chart-tick">Bowler's end</text>
          <text x={offOnLeft ? 2 : w - 2} y={14 * scale} textAnchor={offOnLeft ? "start" : "end"} className="chart-axis-title">Off side</text>
          <text x={offOnLeft ? w - 2 : 2} y={14 * scale} textAnchor={offOnLeft ? "end" : "start"} className="chart-axis-title">Leg side</text>
          <text x={cx} y={height - 6} textAnchor="middle" className="chart-tick">Wicketkeeper</text>
        </svg>
      </div>
      <div role="group" aria-label="Recorded batting runs by shot sector" className="analytics-sectors">{rows.map(r => <div key={r.display}>
        <span className="sector-name">{name(r.recorded)}<small>{SECTOR_REGIONS[r.recorded]!.side}{detail(r) ? ` · ${detail(r)}` : ""}</small></span><span className="analytics-sector-track"><span style={{ width: `${r.runs / maxRuns * 100}%` }} /></span><strong>{r.runs}</strong>
      </div>)}</div>
    </div>
    {data.unlocatedShots > 0 && <p>{chosen === "ALL" ? `${data.unlocatedShots} scoring deliveries had no recorded sector and are omitted from the wagon sectors.` : "Some scoring deliveries in the match have no recorded sector."}</p>}
  </>;
}

const LENGTH_NAMES: Readonly<Record<string, string>> = { YORKER: "Yorker", FULL: "Full", GOOD: "Good length", SHORT: "Short", FULL_TOSS: "Full toss" };

function PitchLengths({ data }: { data: MatchAnalytics }) {
  const [ref, width, scale] = useChartBox<HTMLDivElement>(480);
  const prefix = useId().replace(/:/g, "");
  const total = data.pitchLengths.reduce((sum, item) => sum + item.attempts, 0);
  const maxPitch = Math.max(1, ...data.pitchLengths.map(item => item.attempts));
  const w = Math.max(260, Math.min(width, 560));
  const labelWidth = 96 * scale, valueWidth = 84 * scale, row = Math.round(34 * Math.max(1, scale * 0.85));
  const track = Math.max(40, w - labelWidth - valueWidth);
  const pct = (n: number) => total ? Math.round(n / total * 100) : 0;
  const top = [...data.pitchLengths].sort((a, b) => b.attempts - a.attempts)[0];
  const height = data.pitchLengths.length * row + 4;
  return <>
    <h3>Simulated pitch lengths</h3>
    <p>These are recorded length categories, not measured locations. Line and physical coordinates are unavailable.</p>
    {top && <>
      <p className="chart-summary" id={`${prefix}-s`}>{`${total} deliveries with a recorded length. Most often ${LENGTH_NAMES[top.length] ?? top.length}: ${top.attempts} (${pct(top.attempts)}%).`}</p>
      <div ref={ref} className="chart-frame">
        <svg className="chart-svg" width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label="Simulated deliveries by recorded length category" aria-describedby={`${prefix}-s`} style={{ maxWidth: w }}>
          {data.pitchLengths.map((item, index) => <g key={item.length} transform={`translate(0 ${index * row + 2})`}>
            <text x={0} y={row / 2 + 4} className="chart-bar-label">{LENGTH_NAMES[item.length] ?? item.length}</text>
            <rect className="chart-track" x={labelWidth} y={6} width={track} height={row - 12} rx="4" />
            <rect className="chart-pitch-bar" x={labelWidth} y={6} width={Math.max(3, item.attempts / maxPitch * track)} height={row - 12} rx="4" />
            <text x={w} y={row / 2 + 4} textAnchor="end" className="chart-bar-value">{item.attempts}<tspan className="chart-tick"> ({pct(item.attempts)}%)</tspan></text>
          </g>)}
        </svg>
      </div>
    </>}
    {data.pitchLengths.length ? <details className="chart-table"><summary>Pitch lengths as a table</summary><div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">Length</th><th scope="col" className="num">Deliveries</th><th scope="col" className="num">Share</th></tr></thead><tbody>{data.pitchLengths.map(item => <tr key={item.length}><td>{LENGTH_NAMES[item.length] ?? item.length}</td><td className="num">{item.attempts}</td><td className="num">{pct(item.attempts)}%</td></tr>)}</tbody></table></div></details> : <p>No pitch lengths were recorded.</p>}
    {data.unrecordedLengths > 0 && <p>{data.unrecordedLengths} deliveries have no recorded length.</p>}
  </>;
}
