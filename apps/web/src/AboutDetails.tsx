import { useId, useState, type ReactNode } from "react";

/**
 * A collapsed "About" note for technical detail (model versions, file formats, identifiers) that players do not need
 * to read to play. E5 moved such text out of the main copy and into these notes, so it is still there to check.
 * Inline (a span and a button) so it can sit inside a paragraph; the hidden text stays in the document.
 */
export function AboutDetails({ summary = "About", children }: { summary?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="about-details">
      {" "}
      <button type="button" className="about-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {summary}
      </button>
      <small id={id} hidden={!open}>
        {" "}
        {children}
      </small>
    </span>
  );
}
