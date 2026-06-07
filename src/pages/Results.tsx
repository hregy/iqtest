import { useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import type { SubmitResult } from "../types";
import { iqFromPercent, bandForIq } from "../lib/scoring";

const CATEGORY_LABEL: Record<string, string> = {
  pattern: "Pattern",
  analogy: "Analogy",
  spatial: "Spatial",
  series: "Series",
};
const labelFor = (c: string) =>
  CATEGORY_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

export function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const result = (location.state as { result?: SubmitResult } | null)?.result;

  useEffect(() => {
    if (!result) navigate("/", { replace: true });
  }, [result, navigate]);
  if (!result) return null;

  const iq = iqFromPercent(result.percent);

  return (
    <div className="screen results">
      <h1>Your Result</h1>
      {result.practice && <p className="practice-badge">Practice run — not recorded</p>}

      <div className="score-ring">
        <div className="iq-value">{iq}</div>
        <div className="iq-label">estimated IQ</div>
      </div>
      <div className="band">{bandForIq(iq)}</div>
      <p className="score-line">
        {result.correct} / {result.total} correct ({result.percent}%)
      </p>

      <div className="breakdown">
        {Object.keys(result.byCategory)
          .filter((c) => result.byCategory[c].total > 0)
          .map((c) => {
            const { correct, total } = result.byCategory[c];
            const pct = Math.round((correct / total) * 100);
            return (
              <div className="cat-row" key={c}>
                <span className="cat-name">{labelFor(c)}</span>
                <div className="cat-bar">
                  <div className="cat-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="cat-count">{correct}/{total}</span>
              </div>
            );
          })}
      </div>

      <Link className="btn primary" to="/scoreboard">View Scoreboard</Link>
      <Link className="link" to="/">Back to start</Link>
      <p className="fineprint">For entertainment only — not a validated psychometric measure.</p>
    </div>
  );
}
