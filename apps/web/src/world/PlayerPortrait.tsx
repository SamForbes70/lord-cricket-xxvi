import { useId } from "react";
import { portraitSpec, ratingTier, ROLE_LABEL } from "./player-visuals.js";

/**
 * A fictional player's portrait (visual overhaul phase 2): head and shoulders in the club's kit, drawn as inline SVG
 * from the player's id. Always decorative: the player's name is written next to it, so screen readers skip it.
 */
export function PlayerPortrait(props: { playerId: string; role: string; kit: readonly string[]; size?: number }) {
  const s = portraitSpec(props.playerId, props.role, props.kit);
  const size = props.size ?? 48;
  const id = useId();
  const bg = `pp-bg-${id}`;
  const clip = `pp-clip-${id}`;
  const fw = s.faceWidth;
  return (
    <svg className="player-portrait" aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" focusable="false">
      <defs>
        <radialGradient id={bg} cx="50%" cy="30%" r="75%">
          <stop offset="0%" stopColor={s.trim} stopOpacity="0.55" />
          <stop offset="100%" stopColor={s.shirt} />
        </radialGradient>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="31" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="64" fill={`url(#${bg})`} />
        {/* Shoulders and shirt, with a collar in the trim colour. */}
        <path d="M6 64 C8 50 18 44 32 44 C46 44 56 50 58 64 Z" fill={s.shirt} />
        <path d="M24 45 L32 53 L40 45 L37 44 L32 49 L27 44 Z" fill={s.trim} />
        <rect x="28" y="38" width="8" height="8" rx="2" fill={s.skin} />
        {/* Head. */}
        <ellipse cx="32" cy="27" rx={fw / 1.55} ry="12.5" fill={s.skin} />
        <ellipse cx={32 - fw / 1.55} cy="28" rx="2" ry="3" fill={s.skin} />
        <ellipse cx={32 + fw / 1.55} cy="28" rx="2" ry="3" fill={s.skin} />
        {s.headgear === "NONE" && s.hairStyle !== 3 && (
          <path d={s.hairStyle === 0 ? "M21 24 C21 13 43 13 43 24 C40 18 24 18 21 24 Z" : s.hairStyle === 1 ? "M20 26 C19 11 45 11 44 26 C42 17 36 19 32 17 C28 19 22 17 20 26 Z" : "M21 23 C23 14 41 14 43 23 L43 20 C40 12 24 12 21 20 Z"} fill={s.hair} />
        )}
        {s.beard && <path d={`M${32 - fw / 1.7} 30 C${32 - fw / 1.8} 41 ${32 + fw / 1.8} 41 ${32 + fw / 1.7} 30 C30 35 34 35 ${32 - fw / 1.7} 30 Z`} fill={s.hair} opacity="0.9" />}
        {/* Eyes and brows. */}
        <circle cx="28" cy="28" r="1.2" fill="#1a1a1a" />
        <circle cx="36" cy="28" r="1.2" fill="#1a1a1a" />
        <path d={`M25.5 ${25 - s.browTilt} L30 ${25 + s.browTilt}`} stroke={s.hair} strokeWidth="1.3" strokeLinecap="round" />
        <path d={`M34 ${25 + s.browTilt} L38.5 ${25 - s.browTilt}`} stroke={s.hair} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M29.5 34 C31 35 33 35 34.5 34" stroke="#7a3f2e" strokeWidth="1" fill="none" strokeLinecap="round" />
        {s.headgear === "CAP" && (
          <g>
            <path d="M19.5 23 C19.5 11 44.5 11 44.5 23 Z" fill={s.shirt} />
            <path d="M19 23 L47 23 C47 25.5 44 26 40 25 L19 24.5 Z" fill={s.trim} />
          </g>
        )}
        {s.headgear === "HELMET" && (
          <g>
            <path d="M18.5 27 C17 9 47 9 45.5 27 L44 24 C42 16 22 16 20 24 Z" fill={s.shirt} />
            <path d="M18.5 24 L45.5 24" stroke={s.trim} strokeWidth="1.6" />
            <path d="M22 30 L42 30 M22 34 L42 34 M26 30 L26 38 M32 30 L32 39 M38 30 L38 38" stroke="#c9cfd2" strokeWidth="1.3" fill="none" />
          </g>
        )}
      </g>
      <circle cx="32" cy="32" r="31" fill="none" stroke={s.trim} strokeOpacity="0.6" strokeWidth="1.5" />
    </svg>
  );
}

/** The overall rating badge: a big number over "OVR", coloured by band. Decorative when the rating is written nearby. */
export function RatingBadge(props: { rating: number; label?: string; decorative?: boolean }) {
  return (
    <span className="rating-badge" data-tier={ratingTier(props.rating)} {...(props.decorative ? { "aria-hidden": true } : { role: "img", "aria-label": `Rated ${props.rating}` })}>
      <strong>{props.rating}</strong>
      <small>{props.label ?? "OVR"}</small>
    </span>
  );
}

/** A role chip with a small icon (bat, ball, gloves, or bat and ball). */
export function RoleChip(props: { role: string; decorative?: boolean }) {
  const icon =
    props.role === "BOWLER" ? <circle cx="8" cy="8" r="5.5" fill="#c94a3a" stroke="#f3d6c9" strokeWidth="0.8" /> :
    props.role === "KEEPER" ? <path d="M3 5 C3 2 13 2 13 5 L13 12 C13 14 3 14 3 12 Z" fill="#e7bb5f" /> :
    props.role === "ALLROUNDER" ? <g><path d="M3 13 L10 2 L12 3.2 L5 14 Z" fill="#e8d3a2" /><circle cx="11.5" cy="11.5" r="3" fill="#c94a3a" /></g> :
    <path d="M4 14 L11 2 L13 3.2 L6 15 Z" fill="#e8d3a2" />;
  return (
    <span className="role-chip" data-role={props.role} {...(props.decorative ? { "aria-hidden": true } : {})}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">{icon}</svg>
      {ROLE_LABEL[props.role] ?? props.role}
    </span>
  );
}
