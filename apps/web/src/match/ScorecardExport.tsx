import React from "react";
import { createPortal } from "react-dom";
import type { View } from "./protocol.js";
import { scorecardCsv, scorecardRows } from "./scorecard-export.js";

export function ScorecardExport({ view }: { view: View }) {
  const rows = scorecardRows(view);
  function download() {
    const url = URL.createObjectURL(new Blob([scorecardCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "lord-cricket-scorecard.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <div className="scorecard-export-actions"><button type="button" onClick={download}>Download scorecard CSV</button><button type="button" onClick={() => window.print()}>Print scorecard</button></div>
    {createPortal(<section className="print-scorecard" aria-label="Printable scorecard"><h1>Lord Cricket XXVI scorecard</h1><table><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></section>, document.body)}
  </>;
}
