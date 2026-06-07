// Custom Einstein silhouette mark — frizzy-hair cloud + bushy mustache that
// reads even at favicon size. Pure SVG, no assets.

const PUFFS: [number, number, number][] = [
  [50, 17, 12], [36, 19, 11], [64, 19, 11],
  [25, 25, 11], [75, 25, 11], [50, 24, 13],
  [18, 36, 11], [82, 36, 11], [33, 30, 10], [67, 30, 10],
  [14, 49, 10], [86, 49, 10],
  [16, 61, 8.5], [84, 61, 8.5],
  [21, 70, 7], [79, 70, 7],
];

export function EinsteinFace({ size = 120, hair = "#E2961A", face = "#222A2E" }: {
  size?: number; hair?: string; face?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="Einstein">
      {PUFFS.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={hair} />)}
      <ellipse cx="50" cy="60" rx="20.5" ry="23" fill={face} />
      <circle cx="29.5" cy="60" r="4.2" fill={hair} />
      <circle cx="70.5" cy="60" r="4.2" fill={hair} />
      <rect x="36.5" y="50" width="11" height="4.2" rx="2.1" fill={hair} transform="rotate(-7 42 52)" />
      <rect x="52.5" y="50" width="11" height="4.2" rx="2.1" fill={hair} transform="rotate(7 58 52)" />
      <circle cx="42" cy="58.5" r="2.4" fill={hair} />
      <circle cx="58" cy="58.5" r="2.4" fill={hair} />
      <path d="M50 60 L49 67 Q50 68.5 51.4 67.4" stroke={hair} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <g fill={hair}>
        <path d="M50 70 Q41 67.5 35 69.5 Q31 71 32.5 75.5 Q34 79 37.5 77 Q42 74.5 46 73 Q49 72.2 50 73.4 Q51 72.2 54 73 Q58 74.5 62.5 77 Q66 79 67.5 75.5 Q69 71 65 69.5 Q59 67.5 50 70 Z" />
        <ellipse cx="50" cy="72" rx="5" ry="3.4" />
      </g>
    </svg>
  );
}

export function EinsteinMark({ size = 56, radius, board = "#222A2E", hair = "#E2961A", glow = false }: {
  size?: number; radius?: number; board?: string; hair?: string; glow?: boolean;
}) {
  const r = radius != null ? radius : Math.round(size * 0.26);
  return (
    <div style={{
      width: size, height: size, borderRadius: r, background: board,
      display: "grid", placeItems: "center", overflow: "hidden",
      boxShadow: glow ? `0 10px 26px ${hair}55` : "none", position: "relative", flexShrink: 0,
    }}>
      <div style={{ position: "absolute", inset: size * 0.12, borderRadius: "50%", border: `1px dashed ${hair}33` }} />
      <EinsteinFace size={size * 0.86} hair={hair} face={board} />
    </div>
  );
}

export function EinsteinPortrait({ size = 132, hair = "#EEEAE0", ring = "#E2961A" }: {
  size?: number; hair?: string; ring?: string;
}) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "radial-gradient(120% 120% at 50% 20%, #222A2E 0%, #1A2024 100%)",
      display: "grid", placeItems: "center", overflow: "hidden",
      boxShadow: `0 0 0 3px ${ring}, 0 14px 34px rgba(0,0,0,0.28)`, position: "relative", flexShrink: 0,
    }}>
      <EinsteinFace size={size * 0.92} hair={hair} face="#1E2529" />
    </div>
  );
}
