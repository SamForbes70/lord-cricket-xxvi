import { useId } from "react";
import { CREST_OUTLINES, crestSpec } from "./crest.js";

/**
 * A team's built-in crest (owner decisions C1a and C3a). Drawn as inline SVG from the team's id, name and kit colours,
 * through React elements only (no markup strings), so nothing outside the game can reach the page through it.
 */
/**
 * Next to the team's written name, pass `decorative` so screen readers do not hear the name twice.
 */
export function TeamCrest(props: { teamId: string; name: string; colours: readonly string[]; size?: number; decorative?: boolean }) {
  const spec = crestSpec(props.teamId, props.name, props.colours);
  const size = props.size ?? 24;
  const clip = `crest-clip-${useId()}`;
  const outline = CREST_OUTLINES[spec.shape];
  return (
    <svg
      className="team-crest"
      {...(props.decorative ? { "aria-hidden": true } : { role: "img", "aria-label": `${props.name} crest` })}
      data-crest-shape={spec.shape}
      data-crest-pattern={spec.pattern}
      width={Math.round((size * 40) / 48)}
      height={size}
      viewBox="0 0 40 48"
      style={{ verticalAlign: "middle", marginRight: "0.35em" }}
    >
      <defs>
        <clipPath id={clip}>
          <path d={outline} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="0" width="40" height="48" fill={spec.primary} />
        {spec.pattern === "BAND" && <rect x="0" y="30" width="40" height="7" fill={spec.secondary} />}
        {spec.pattern === "CHEVRON" && <path d="M0 30 L20 40 L40 30 V38 L20 48 L0 38 Z" fill={spec.secondary} />}
        {spec.pattern === "HALVES" && <rect x="20" y="0" width="20" height="48" fill={spec.secondary} opacity="0.55" />}
      </g>
      <path d={outline} fill="none" stroke={spec.secondary} strokeWidth="2.5" />
      <text x="20" y="25" textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="700" fontFamily="system-ui, sans-serif" fill={spec.ink}>
        {spec.initials}
      </text>
    </svg>
  );
}
