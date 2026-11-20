import { useId } from "react";

/**
 * Full-figure cricketers for menus (owner order of 20 November 2026, step 3: free, AI-made art). Original stylised
 * vector figures in a club's kit colours: a batter at the top of the backlift and a bowler celebrating a wicket. Drawn
 * from limbs as thick round-capped strokes with a darker shade for the far side, so they read as sports-poster
 * pictograms rather than imitations of any real player or game. Always decorative.
 */
export type FigurePose = "batter" | "bowler";

const SKINS = ["#f1c9a5", "#e0ac83", "#c68b5f", "#a86e45", "#7d4f30", "#5a3824"] as const;
const HEX = /^#[0-9a-f]{6}$/i;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function seeded(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

type Limb = [number, number, number, number, number];
const limb = ([x1, y1, x2, y2, w]: Limb, colour: string, key: string) => (
  <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth={w} strokeLinecap="round" />
);

export function CricketerFigure(props: { pose: FigurePose; kit: readonly string[]; seed?: string; height?: number; className?: string }) {
  const shirt = props.kit[0] && HEX.test(props.kit[0]) ? props.kit[0] : "#1f5a4a";
  const trim = props.kit[1] && HEX.test(props.kit[1]) ? props.kit[1] : "#e7bb5f";
  const skin = SKINS[seeded(props.seed ?? props.pose) % SKINS.length]!;
  const far = shade(shirt, -0.32);
  const trousers = shade(shirt, -0.18);
  const trousersFar = shade(shirt, -0.42);
  const id = useId();
  const glow = `cf-glow-${id}`;
  const height = props.height ?? 360;
  return (
    <svg className={props.className ?? "cricketer-figure"} viewBox="0 -24 240 444" width={(height * 240) / 444} height={height} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={glow} cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="124" cy="404" rx="86" ry="12" fill={`url(#${glow})`} />
      {props.pose === "batter" ? <Batter {...{ shirt, trim, skin, far, trousers, trousersFar }} /> : <Bowler {...{ shirt, trim, skin, far, trousers, trousersFar }} />}
    </svg>
  );
}

type Paint = { shirt: string; trim: string; skin: string; far: string; trousers: string; trousersFar: string };

/** A right-hander at the top of the backlift, side-on, front shoulder pointing down the pitch (to the right). */
function Batter({ shirt, trim, skin, far, trousers, trousersFar }: Paint) {
  const pad = "#f4f1e8", padShade = "#cfcabb", glove = "#f4f1e8";
  return (
    <g>
      {/* Bat, held high behind the head. */}
      <line x1="96" y1="96" x2="80" y2="66" stroke="#2b2b2b" strokeWidth="7" strokeLinecap="round" />
      <path d="M78 66 L46 6 Q42 -2 50 -4 L58 -2 Q64 0 66 8 L90 62 Z" fill="#e8cf98" stroke="#a9874c" strokeWidth="2" />
      <path d="M60 4 L84 58" stroke="#c9a96a" strokeWidth="3" strokeLinecap="round" />
      {/* Back (far) leg and pad. */}
      {limb([114, 176, 100, 250, 34], trousersFar, "bt")}
      {limb([100, 252, 92, 330, 34], padShade, "bp")}
      <path d="M78 334 Q90 326 104 332 L106 344 L74 346 Z" fill="#20262a" />
      {/* Back arm. */}
      {limb([112, 100, 90, 116, 21], far, "ba1")}
      {limb([90, 116, 96, 92, 19], shade(skin, -0.12), "ba2")}
      {/* Torso. */}
      <path d="M98 92 Q120 82 144 90 L138 180 Q120 188 104 180 Z" fill={shirt} />
      <path d="M98 92 Q120 82 144 90 L143 101 Q120 93 99 102 Z" fill={trim} />
      <path d="M131 92 L128 178" stroke={trim} strokeWidth="4" />
      {/* Front leg and pad. */}
      {limb([126, 176, 150, 246, 35], trousers, "ft")}
      {limb([150, 248, 160, 326, 35], pad, "fp")}
      <path d="M150 262 L168 260 M152 286 L170 286 M154 310 L172 310" stroke={padShade} strokeWidth="3" />
      <path d="M144 330 Q162 322 182 330 L184 342 L144 344 Z" fill="#20262a" />
      {/* Front arm across the chest to the handle. */}
      {limb([132, 100, 120, 124, 22], shirt, "fa1")}
      {limb([120, 124, 100, 96, 19], skin, "fa2")}
      <circle cx="98" cy="94" r="10" fill={glove} stroke={padShade} strokeWidth="2" />
      {/* Head and helmet, facing the bowler. */}
      <circle cx="124" cy="62" r="20" fill={skin} />
      <path d="M102 60 Q100 34 124 32 Q148 32 150 56 L146 58 Q140 44 124 44 Q110 46 108 62 Z" fill={shirt} />
      <path d="M140 52 L158 56 L156 60 L140 58 Z" fill={trim} />
      <path d="M140 62 L150 62 M140 68 L150 68 M141 74 L149 74 M145 58 L145 78" stroke="#c9cfd2" strokeWidth="2" fill="none" />
      <rect x="118" y="80" width="10" height="10" rx="3" fill={skin} />
    </g>
  );
}

/** A bowler celebrating a wicket: arms up, ball in hand, mid-leap. */
function Bowler({ shirt, trim, skin, far, trousers, trousersFar }: Paint) {
  const skinFar = shade(skin, -0.12);
  return (
    <g>
      {/* Far leg, kicked back. */}
      {limb([112, 196, 92, 262, 34], trousersFar, "bl1")}
      {limb([92, 262, 70, 318, 31], trousersFar, "bl2")}
      <path d="M52 322 Q64 312 80 318 L82 330 L50 332 Z" fill="#20262a" />
      {/* Far arm, raised. */}
      {limb([106, 108, 80, 70, 22], far, "ba1")}
      {limb([80, 70, 74, 26, 19], skinFar, "ba2")}
      <circle cx="73" cy="20" r="9" fill={skinFar} />
      {/* Torso, chest out. */}
      <path d="M94 100 Q124 88 152 100 L144 200 Q122 208 102 200 Z" fill={shirt} />
      <path d="M94 100 Q124 88 152 100 L150 113 Q123 103 96 113 Z" fill={trim} />
      <path d="M110 112 L108 198 M136 112 L136 198" stroke={trim} strokeWidth="3" opacity="0.8" />
      {/* Near leg, planted. */}
      {limb([132, 196, 146, 270, 36], trousers, "fl1")}
      {limb([146, 270, 150, 340, 32], trousers, "fl2")}
      <path d="M134 342 Q152 334 176 342 L178 354 L134 356 Z" fill="#20262a" />
      {/* Near arm, raised with the ball. */}
      {limb([142, 106, 170, 66, 23], shirt, "fa1")}
      {limb([170, 66, 180, 22, 20], skin, "fa2")}
      <circle cx="181" cy="15" r="10" fill={skin} />
      <circle cx="186" cy="6" r="8" fill="#c94a3a" />
      <path d="M180 4 Q186 8 192 4" stroke="#f3d6c9" strokeWidth="1.5" fill="none" />
      {/* Head, tipped back in the shout, with a cap. */}
      <rect x="117" y="78" width="12" height="14" rx="4" fill={skin} />
      <circle cx="123" cy="62" r="21" fill={skin} />
      <path d="M100 58 Q100 34 124 34 Q146 34 146 56 Z" fill={shirt} />
      <path d="M140 52 L164 46 L164 52 L142 58 Z" fill={trim} />
      <path d="M116 72 Q124 80 132 72 Z" fill="#5b2a20" />
    </g>
  );
}
