import type { Answer, Category } from "../types";
import { computeScore } from "../lib/scoring";

interface Props {
  answers: Answer[];
  onRestart: () => void;
  canRestart: boolean;
}

const CATEGORY_LABEL: Record<Category, string> = {
  numeric: "Numeric",
  verbal: "Verbal",
  spatial: "Spatial",
};

export function Results({ answers, onRestart, canRestart }: Props) {
  const score = computeScore(answers);

  return (
    <div className="screen results">
      <h1>Your Result</h1>

      <div className="score-ring">
        <div className="iq-value">{score.iq}</div>
        <div className="iq-label">estimated IQ</div>
      </div>

      <div className="band">{score.band}</div>

      <p className="score-line">
        {score.correct} / {score.total} correct ({score.percent}%)
      </p>

      <div className="breakdown">
        {(Object.keys(score.byCategory) as Category[])
          .filter((c) => score.byCategory[c].total > 0)
          .map((c) => {
            const { correct, total } = score.byCategory[c];
            const pct = Math.round((correct / total) * 100);
            return (
              <div className="cat-row" key={c}>
                <span className="cat-name">{CATEGORY_LABEL[c]}</span>
                <div className="cat-bar">
                  <div className="cat-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="cat-count">
                  {correct}/{total}
                </span>
              </div>
            );
          })}
      </div>

      {canRestart ? (
        <button className="btn primary" onClick={onRestart}>
          Take Again
        </button>
      ) : (
        <p className="fineprint">This test can only be taken once on this device.</p>
      )}

      <p className="fineprint">
        For entertainment only — not a validated psychometric measure.
      </p>
    </div>
  );
}
