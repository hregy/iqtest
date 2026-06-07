import type { ReviewItem } from "../types";

const LABELS = ["A", "B", "C", "D"];

function fmtSec(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function OptionMini({
  o, i, correctIndex, selectedIndex,
}: {
  o: ReviewItem["options"][number];
  i: number;
  correctIndex: number | null;
  selectedIndex: number | null;
}) {
  const isCorrect = i === correctIndex;
  const isChosen = i === selectedIndex;
  const cls =
    "rv-opt" + (isCorrect ? " correct" : "") + (isChosen && !isCorrect ? " wrong" : "");
  return (
    <div className={cls}>
      <span className="rv-opt-letter">{LABELS[i]}</span>
      {o.kind === "image" && o.image ? (
        <img src={o.image} alt={`Option ${LABELS[i]}`} draggable={false} />
      ) : (
        <span className="rv-opt-text" dir="auto" lang="fa">{o.text}</span>
      )}
      {isCorrect && <span className="rv-badge ok">✓ correct</span>}
      {isChosen && !isCorrect && <span className="rv-badge bad">your answer</span>}
      {isChosen && isCorrect && <span className="rv-badge ok">your answer</span>}
    </div>
  );
}

export function ReviewList({ review }: { review: ReviewItem[] }) {
  return (
    <div className="review">
      {review.map((r) => (
        <div className={"rv-card" + (r.correct ? " ok" : " bad")} key={r.index}>
          <div className="rv-head">
            <span className="rv-q">Q{r.index + 1}</span>
            <span className={"rv-status " + (r.correct ? "ok" : "bad")}>
              {r.correct ? "✓ Correct" : r.timedOut && r.selectedIndex === null ? "⏱ Timed out" : "✗ Wrong"}
            </span>
            <span className="rv-time iq-mono">{fmtSec(r.elapsedMs)}</span>
          </div>
          {r.prompt && <div className="rv-prompt">{r.prompt}</div>}
          {r.promptFa && <div className="rv-prompt-fa" dir="rtl" lang="fa">{r.promptFa}</div>}
          {r.puzzleImage && (
            <div className="rv-figure"><img src={r.puzzleImage} alt="puzzle" draggable={false} /></div>
          )}
          <div className="rv-opts">
            {r.options.map((o, i) => (
              <OptionMini key={i} o={o} i={i} correctIndex={r.correctIndex} selectedIndex={r.selectedIndex} />
            ))}
          </div>
          {r.selectedIndex === null && <div className="rv-note">No answer selected.</div>}
        </div>
      ))}
    </div>
  );
}
