import { NO_VALUE_TEXT } from "./display-labels.js";
import "./data-table.css";

/**
 * CP02B (CD-030, CD-048): the one mark for "there is no value here" in tables and figures. It is the word "none" in
 * muted text, so it cannot be read as a dot ball, a minus sign or a dash, and screen readers say the same word.
 */
export function NoValue() {
  return <span className="no-value">{NO_VALUE_TEXT}</span>;
}
