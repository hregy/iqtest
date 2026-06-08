import type { ReviewItem } from "../types";
import { useLang } from "../lib/i18n";

const LABELS = ["A", "B", "C", "D"];

function fmtSec(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function OptionMini({
  o, i, correctIndex, selectedIndex, lang, t,
}: {
  o: ReviewItem["options"][number];
  i: number;
  correctIndex: number | null;
  selectedIndex: number | null;
  lang: "en" | "fa";
  t: (k: string) => string;
}) {
  const isCorrect = i === correctIndex;
  const isChosen = i === selectedIndex;
  const cls =
    "rv-opt" + (isCorrect ? " correct" : "") + (isChosen && !isCorrect ? " wrong" : "");
  const text = lang === "fa" ? (o.textFa ?? o.text) : (o.text ?? o.textFa);
  return (
    <div className={cls}>
      <span className="rv-opt-letter">{LABELS[i]}</span>
      {o.kind === "image" && o.image ? (
        <img src={o.image} alt={`Option ${LABELS[i]}`} draggable={false} />
      ) : (
        <span className="rv-opt-text" dir="auto" lang={lang}>{text}</span>
      )}
      {isCorrect && <span className="rv-badge ok">{t("rv_badge_correct")}</span>}
      {isChosen && !isCorrect && <span className="rv-badge bad">{t("rv_badge_yours")}</span>}
      {isChosen && isCorrect && <span className="rv-badge ok">{t("rv_badge_yours")}</span>}
    </div>
  );
}

export function ReviewList({ review }: { review: ReviewItem[] }) {
  const { t, lang } = useLang();
  return (
    <div className="review">
      {review.map((r) => {
        const prompt = lang === "fa" ? (r.promptFa || r.prompt) : (r.prompt || r.promptFa);
        return (
        <div className={"rv-card" + (r.correct ? " ok" : " bad")} key={r.index}>
          <div className="rv-head">
            <span className="rv-q">Q{r.index + 1}</span>
            <span className={"rv-status " + (r.correct ? "ok" : "bad")}>
              {r.correct ? t("rv_correct") : r.timedOut && r.selectedIndex === null ? t("rv_timedout") : t("rv_wrong")}
            </span>
            <span className="rv-time iq-mono">{fmtSec(r.elapsedMs)}</span>
          </div>
          {prompt && <div className="rv-prompt" dir="auto" lang={lang}>{prompt}</div>}
          {r.puzzleImage && (
            <div className="rv-figure"><img src={r.puzzleImage} alt="puzzle" draggable={false} /></div>
          )}
          <div className="rv-opts">
            {r.options.map((o, i) => (
              <OptionMini key={i} o={o} i={i} correctIndex={r.correctIndex} selectedIndex={r.selectedIndex} lang={lang} t={t} />
            ))}
          </div>
          {r.selectedIndex === null && <div className="rv-note">{t("rv_no_answer")}</div>}
        </div>
        );
      })}
    </div>
  );
}
