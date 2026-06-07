import { EinsteinMark } from "./Einstein";

const ACCENT = "var(--iq-accent)";

export function BrandHeader({ sub, right }: { sub?: string; right?: React.ReactNode }) {
  return (
    <div className="brand-header">
      <EinsteinMark size={38} board="var(--iq-board)" hair="#E2961A" />
      <div style={{ flex: 1, lineHeight: 1.05 }}>
        <div className="brand-title">IQ&nbsp;Test</div>
        {sub && <div className="brand-sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// Circular countdown ring.
export function Ring({ size = 54, stroke = 5, frac = 1, tone = ACCENT, track = "var(--iq-line)", children }: {
  size?: number; stroke?: number; frac?: number; tone?: string; track?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset .25s linear, stroke .3s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
}

// Segmented progress bar.
export function Segments({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="seg" style={{
          background: i < current ? ACCENT : i === current ? "var(--iq-accent-soft)" : "var(--iq-line)",
        }} />
      ))}
    </div>
  );
}

// IQ gauge — 252° arc, value mapped 70..145.
export function Gauge({ value = 100, size = 216, display }: { value?: number; size?: number; display?: string }) {
  const min = 70, max = 145, sweep = 252, startDeg = 144, stroke = 16;
  const r = (size - stroke) / 2 - 6;
  const cx = size / 2, cy = size / 2;
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const c = 2 * Math.PI * r;
  const arcLen = (sweep / 360) * c;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <g transform={`rotate(${startDeg} ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--iq-line-2)" strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${arcLen} ${c}`} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={ACCENT} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${arcLen * frac} ${c}`}
            style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.22,1,.36,1)" }} />
        </g>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div className="iq-mono" style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: "var(--iq-ink)" }}>{display ?? value}</div>
          <div className="iq-label" style={{ marginTop: 4 }}>Your IQ</div>
        </div>
      </div>
    </div>
  );
}
