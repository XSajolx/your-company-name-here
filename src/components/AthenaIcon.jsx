// AthenaIcon.jsx
// Usage: <AthenaIcon size={48} />  or  <AthenaIcon size={200} showWordmark />

import { useId } from "react";

export default function AthenaIcon({ size = 48, showWordmark = false, transparent = false }) {
  const viewBox = showWordmark ? "0 0 680 620" : "0 0 680 480";
  // Scope SVG <defs> ids per instance so multiple icons on the page don't collide.
  const uid = useId().replace(/:/g, "");
  const id = (k) => `ei-${k}-${uid}`;
  const ref = (k) => `url(#${id(k)})`;

  return (
    <svg
      width={size}
      height={showWordmark ? Math.round(size * (620 / 680)) : Math.round(size * (480 / 680))}
      viewBox={viewBox}
      role="img"
      aria-label="Athena AI logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Athena</title>
      <desc>Athena AI — Knowledge, Intelligence, Insight</desc>

      <defs>
        <linearGradient id={id("bgShield")} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#0D1B2A" />
          <stop offset="100%" stopColor="#070E18" />
        </linearGradient>

        <linearGradient id={id("neonRim")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00E5FF" />
          <stop offset="50%" stopColor="#BF5FFF" />
          <stop offset="100%" stopColor="#FF3CAC" />
        </linearGradient>

        <linearGradient id={id("neonRim2")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF3CAC" />
          <stop offset="100%" stopColor="#00E5FF" />
        </linearGradient>

        <linearGradient id={id("eyeIris")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00E5FF" />
          <stop offset="50%" stopColor="#7B2FFF" />
          <stop offset="100%" stopColor="#FF3CAC" />
        </linearGradient>

        <linearGradient id={id("pupilCore")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FF3CAC" stopOpacity="0.9" />
        </linearGradient>

        <linearGradient id={id("wordGrad")} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00E5FF" />
          <stop offset="50%" stopColor="#BF5FFF" />
          <stop offset="100%" stopColor="#FF3CAC" />
        </linearGradient>

        <radialGradient id={id("aura")} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7B2FFF" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#00E5FF" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#FF3CAC" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={id("glowCore")} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#00E5FF" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7B2FFF" stopOpacity="0" />
        </radialGradient>

        <filter id={id("neonBloom")} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={id("subtleBloom")} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="340" cy="238" rx="230" ry="220" fill={ref("aura")} />

      {!transparent && <polygon
        points="340,45 498,133 498,308 340,396 182,308 182,133"
        fill="none"
        stroke={ref("neonRim")}
        strokeWidth="1.5"
        opacity="0.25"
        filter={ref("neonBloom")}
      />}

      <polygon
        points="340,52 492,140 492,314 340,402 188,314 188,140"
        fill={transparent ? "none" : ref("bgShield")}
        stroke={transparent ? "none" : ref("neonRim")}
        strokeWidth="2"
      />

      <polygon
        points="340,78 468,152 468,298 340,372 212,298 212,152"
        fill="none"
        stroke={ref("neonRim2")}
        strokeWidth="0.7"
        opacity="0.3"
      />

      {[
        [228, 158, "#00E5FF", 0.7], [270, 118, "#FF3CAC", 0.6],
        [310, 100, "#00E5FF", 0.5], [370, 100, "#BF5FFF", 0.6],
        [414, 118, "#FF3CAC", 0.7], [455, 160, "#00E5FF", 0.6],
        [468, 238, "#BF5FFF", 0.5], [455, 316, "#FF3CAC", 0.6],
        [412, 358, "#00E5FF", 0.6], [268, 358, "#BF5FFF", 0.6],
        [225, 316, "#FF3CAC", 0.6], [212, 238, "#00E5FF", 0.5],
      ].map(([cx, cy, fill, opacity], i) => (
        <circle key={i} cx={cx} cy={cy} r="2" fill={fill} opacity={opacity} />
      ))}

      <g fill="none" opacity="0.2">
        <polyline
          points="228,158 270,118 310,100 340,95 370,100 414,118 455,160 468,238 455,316 412,358 340,378 268,358 225,316 212,238 228,158"
          stroke="#00E5FF" strokeWidth="0.6"
        />
        <line x1="270" y1="118" x2="310" y2="155" stroke="#FF3CAC" strokeWidth="0.6" />
        <line x1="414" y1="118" x2="370" y2="155" stroke="#00E5FF" strokeWidth="0.6" />
        <line x1="228" y1="158" x2="290" y2="195" stroke="#BF5FFF" strokeWidth="0.6" />
        <line x1="455" y1="160" x2="392" y2="195" stroke="#FF3CAC" strokeWidth="0.6" />
        <line x1="310" y1="155" x2="340" y2="238" stroke="#00E5FF" strokeWidth="0.6" />
        <line x1="370" y1="155" x2="340" y2="238" stroke="#FF3CAC" strokeWidth="0.6" />
        <line x1="290" y1="195" x2="340" y2="238" stroke="#BF5FFF" strokeWidth="0.6" />
        <line x1="392" y1="195" x2="340" y2="238" stroke="#00E5FF" strokeWidth="0.6" />
        <line x1="212" y1="238" x2="290" y2="238" stroke="#FF3CAC" strokeWidth="0.6" />
        <line x1="468" y1="238" x2="392" y2="238" stroke="#BF5FFF" strokeWidth="0.6" />
      </g>

      <g stroke={ref("neonRim")} strokeWidth="0.6" opacity="0.18" fill="none">
        <line x1="340" y1="238" x2="340" y2="88" />
        <line x1="340" y1="238" x2="340" y2="390" />
        <line x1="340" y1="238" x2="205" y2="163" />
        <line x1="340" y1="238" x2="475" y2="163" />
        <line x1="340" y1="238" x2="205" y2="313" />
        <line x1="340" y1="238" x2="475" y2="313" />
        <line x1="340" y1="238" x2="280" y2="108" />
        <line x1="340" y1="238" x2="400" y2="108" />
        <line x1="340" y1="238" x2="250" y2="360" />
        <line x1="340" y1="238" x2="430" y2="360" />
      </g>

      <path
        d="M232,238 Q286,174 340,171 Q394,174 448,238 Q394,302 340,305 Q286,302 232,238 Z"
        fill="none"
        stroke={ref("neonRim")}
        strokeWidth="1.5"
        opacity="0.4"
        filter={ref("subtleBloom")}
      />

      <path
        d="M236,238 Q288,178 340,175 Q392,178 444,238 Q392,298 340,301 Q288,298 236,238 Z"
        fill="#070E18"
        stroke={ref("neonRim")}
        strokeWidth="1.8"
      />

      <circle cx="340" cy="238" r="50" fill={ref("eyeIris")} opacity="0.15" filter={ref("subtleBloom")} />

      <circle cx="340" cy="238" r="44" fill="#0a0f1e" stroke={ref("eyeIris")} strokeWidth="2.5" />

      <circle cx="340" cy="238" r="36" fill="none" stroke="#00E5FF" strokeWidth="0.7" strokeDasharray="4 3" opacity="0.35" />
      <circle cx="340" cy="238" r="28" fill="none" stroke="#FF3CAC" strokeWidth="0.5" opacity="0.3" />

      <g stroke="#BF5FFF" strokeWidth="0.5" opacity="0.3" fill="none">
        <line x1="340" y1="196" x2="340" y2="202" />
        <line x1="340" y1="274" x2="340" y2="280" />
        <line x1="298" y1="238" x2="304" y2="238" />
        <line x1="376" y1="238" x2="382" y2="238" />
        <line x1="311" y1="209" x2="315" y2="213" />
        <line x1="365" y1="263" x2="369" y2="267" />
        <line x1="311" y1="267" x2="315" y2="263" />
        <line x1="365" y1="213" x2="369" y2="209" />
      </g>

      <circle cx="340" cy="238" r="20" fill="#04080F" />
      <circle cx="340" cy="238" r="14" fill={ref("glowCore")} opacity="0.9" />
      <ellipse cx="340" cy="238" rx="4.5" ry="13" fill={ref("pupilCore")} />
      <circle cx="340" cy="238" r="4" fill="#FFFFFF" filter={ref("subtleBloom")} />

      <ellipse cx="330" cy="226" rx="4.5" ry="2.5" fill="white" opacity="0.5" transform="rotate(-20,330,226)" />
      <circle cx="350" cy="231" r="1.5" fill="white" opacity="0.3" />

      {!transparent && <>
        <polygon
          points="322,402 340,438 358,402"
          fill={ref("bgShield")}
          stroke={ref("neonRim")}
          strokeWidth="2"
        />
        <line x1="340" y1="402" x2="340" y2="438" stroke={ref("neonRim")} strokeWidth="1" opacity="0.5" filter={ref("subtleBloom")} />
      </>}

      {showWordmark && (
        <>
          <text
            x="340" y="496"
            fontFamily="system-ui,-apple-system,sans-serif"
            fontSize="50"
            fontWeight="700"
            fill={ref("wordGrad")}
            textAnchor="middle"
            letterSpacing="10"
          >
            ATHENA
          </text>
          <text
            x="340" y="524"
            fontFamily="system-ui,-apple-system,sans-serif"
            fontSize="12"
            fontWeight="400"
            fill="#4A6080"
            textAnchor="middle"
            letterSpacing="4"
          >
            AI · KNOWLEDGE · INSIGHT
          </text>
          <rect x="220" y="533" width="260" height="1.5" rx="1" fill={ref("wordGrad")} opacity="0.5" />
        </>
      )}
    </svg>
  );
}
