import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { SubmitResult } from "../types";
import { iqFromPercent, bandForIq } from "../lib/scoring";
import { BrandHeader, Gauge } from "../components/brand";
import { EinsteinMark } from "../components/Einstein";

const CATEGORY_LABEL: Record<string, string> = {
  pattern: "Pattern", analogy: "Analogy", spatial: "Spatial", series: "Series",
};
const labelFor = (c: string) => CATEGORY_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

const QUOTES = [
  "The important thing is not to stop questioning.",
  "Imagination is more important than knowledge.",
  "I have no special talent. I am only passionately curious.",
  "Logic will get you from A to B. Imagination takes you everywhere.",
];

export function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const result = (location.state as { result?: SubmitResult } | null)?.result;

  useEffect(() => {
    if (!result) navigate("/", { replace: true });
  }, [result, navigate]);
  if (!result) return null;

  const iq = iqFromPercent(result.percent);
  const avgSec = result.total ? result.durationMs / 1000 / result.total : 0;
  const quote = QUOTES[result.correct % QUOTES.length];
  const stats: [string, string][] = [
    ["Correct", `${result.correct}/${result.total}`],
    ["Accuracy", `${result.percent}%`],
    ["Avg time", `${avgSec.toFixed(1)}s`],
  ];

  return (
    <div className="screen">
      <BrandHeader />

      <div style={{ textAlign: "center", marginTop: 10 }}>
        {result.practice && <p className="practice-badge">Practice run — not recorded</p>}
        <div style={{ display: "grid", placeItems: "center", marginTop: 8 }}>
          <Gauge value={iq} size={216} />
        </div>
        <div className="band-pill"><span className="band-dot" />{bandForIq(iq)}</div>
        <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--iq-ink-soft)" }}>
          {result.correct} of {result.total} correct.
        </p>
      </div>

      <div className="stats">
        {stats.map(([k, v]) => (
          <div className="stat" key={k}>
            <div className="iq-mono stat-v">{v}</div>
            <div className="iq-label stat-k">{k}</div>
          </div>
        ))}
      </div>

      {Object.keys(result.byCategory).filter((c) => result.byCategory[c].total > 0).length > 0 && (
        <div className="breakdown">
          {Object.keys(result.byCategory)
            .filter((c) => result.byCategory[c].total > 0)
            .map((c) => {
              const { correct, total } = result.byCategory[c];
              const pct = Math.round((correct / total) * 100);
              return (
                <div className="cat-row" key={c}>
                  <span className="cat-name">{labelFor(c)}</span>
                  <div className="cat-bar"><div className="cat-bar-fill" style={{ width: `${pct}%` }} /></div>
                  <span className="cat-count">{correct}/{total}</span>
                </div>
              );
            })}
        </div>
      )}

      <div className="quote-card">
        <EinsteinMark size={46} board="#11171A" hair="var(--iq-accent)" />
        <div>
          <p className="iq-quote">“{quote}”</p>
          <div className="by">— A. Einstein</div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <button className="btn block primary" onClick={() => navigate("/scoreboard")}>🏆 See the scoreboard</button>
        <button className="btn block ghost" onClick={() => navigate("/")}>Back to start</button>
      </div>

      <p className="fineprint">For entertainment — not a clinical IQ assessment.</p>
    </div>
  );
}
