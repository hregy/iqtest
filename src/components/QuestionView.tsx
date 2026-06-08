import { useEffect, useMemo, useRef, useState } from "react";
import type { TestQuestion, QSignal } from "../types";
import { useCountdown } from "../hooks/useCountdown";
import { useLang, bidiIsolate } from "../lib/i18n";
import { LoadedImage } from "./LoadedImage";
import { Ring, Segments } from "./brand";

interface Props {
  question: TestQuestion;
  index: number;
  total: number;
  questionSeconds: number;
  watermark?: string;
  onReady: () => void;
  onAnswer: (selectedIndex: number | null, renderDelayMs: number, q: QSignal) => void;
}

const LABELS = ["A", "B", "C", "D"];
const CATEGORY_LABEL: Record<string, string> = {
  pattern: "Visual pattern", analogy: "Visual analogy", spatial: "Odd one out", series: "Series",
};

export function QuestionView({ question, index, total, questionSeconds, watermark, onReady, onAnswer }: Props) {
  const { t, lang } = useLang();
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const mountAt = useRef(performance.now());
  const renderDelay = useRef(0);
  const pinged = useRef(false);
  const firstInputAt = useRef(-1); // ms from display to first pointer/touch/key

  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    if (question.puzzleImage) urls.push(question.puzzleImage);
    for (const o of question.options) if (o.kind === "image" && o.image) urls.push(o.image);
    return urls;
  }, [question]);

  // Shuffle the four options for display so the correct answer isn't always in
  // the same A/B/C/D slot. Each option keeps its original `idx`; the answer sent
  // back uses that idx, so the server's correctness check is unchanged and the
  // client never learns which option is correct.
  const displayOptions = useMemo(() => {
    const opts = [...question.options];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return opts;
  }, [question.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = loaded >= imageUrls.length;

  useEffect(() => {
    setSelected(null); setLocked(false); setLoaded(0);
    mountAt.current = performance.now(); renderDelay.current = 0; pinged.current = false;
    firstInputAt.current = -1;
  }, [question.id]);

  // Per-question input: record the first real pointer/touch/key for this question.
  useEffect(() => {
    const onInput = () => {
      if (firstInputAt.current < 0 && ready) {
        firstInputAt.current = Math.round(performance.now() - mountAt.current);
      }
    };
    window.addEventListener("pointerdown", onInput, { passive: true });
    window.addEventListener("touchstart", onInput, { passive: true });
    window.addEventListener("pointermove", onInput, { passive: true });
    window.addEventListener("keydown", onInput, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("touchstart", onInput);
      window.removeEventListener("pointermove", onInput);
      window.removeEventListener("keydown", onInput);
    };
  }, [question.id, ready]);

  useEffect(() => {
    if (ready && !pinged.current) {
      pinged.current = true;
      renderDelay.current = Math.round(performance.now() - mountAt.current);
      onReady();
    }
  }, [ready, onReady]);

  const oneLoaded = () => setLoaded((n) => n + 1);

  const commit = (choice: number | null) => {
    if (locked) return;
    setLocked(true);
    setSelected(choice);
    const q: QSignal = { hadInput: firstInputAt.current >= 0, msToFirst: firstInputAt.current };
    window.setTimeout(() => onAnswer(choice, renderDelay.current, q), choice === null ? 250 : 350);
  };

  const remaining = useCountdown(questionSeconds, question.id, !locked && ready, () => commit(null));
  const secs = Math.ceil(remaining);
  const frac = remaining / questionSeconds;
  const low = remaining <= 5;

  return (
    // The whole question screen keeps LTR layout (puzzle/options are visual and
    // designed LTR); Farsi prompt/option text still render RTL via their own dir.
    <div className="screen" dir="ltr">
      <div className="qtop">
        <div className="grow">
          <div className="iq-label" style={{ marginBottom: 7 }}>{t("question_of", { n: index + 1, total })}</div>
          <Segments total={total} current={index} />
        </div>
        <Ring size={54} stroke={5} frac={frac} tone={low ? "var(--iq-warn)" : "var(--iq-accent)"}>
          <span className="iq-mono" style={{ fontSize: 17, fontWeight: 800, color: low ? "var(--iq-warn)" : "var(--iq-ink)" }}>{secs}</span>
        </Ring>
      </div>

      <div style={{ marginTop: 18 }}>
        <span className="kind-chip">{CATEGORY_LABEL[question.category] || question.category.replace(/_/g, " ")}</span>
        {lang === "fa"
          ? (question.promptFa
              ? <p className="prompt-fa" dir="rtl" lang="fa">{bidiIsolate(question.promptFa)}</p>
              : question.prompt && <h2 className="prompt">{bidiIsolate(question.prompt)}</h2>)
          : (question.prompt
              ? <h2 className="prompt">{bidiIsolate(question.prompt)}</h2>
              : question.promptFa && <p className="prompt-fa" dir="rtl" lang="fa">{bidiIsolate(question.promptFa)}</p>)}
      </div>

      {/* Visual puzzle + option grid keep LTR layout regardless of UI language
          (they're designed LTR); Farsi option text still renders RTL via dir="auto". */}
      <div className={"qcontent" + (question.puzzleImage ? "" : " no-puzzle")} dir="ltr">
        {question.puzzleImage ? (
          <div className="figure">
            <LoadedImage className={"puzzle-img" + (ready ? "" : " hidden")} src={question.puzzleImage} alt="puzzle" onSettled={oneLoaded} />
          </div>
        ) : (
          // Only the classic odd-one-out items (no puzzle AND no prompt) get this
          // hint; prompt-driven text questions (final bank) speak for themselves.
          ready && !question.prompt && !question.promptFa && (
            <p className="odd-hint">{t("odd_hint")}</p>
          )
        )}

        {!ready && <div className="img-loading"><div className="spinner" /><span>{t("loading_question")}</span></div>}

        <div className={"options-grid" + (ready ? "" : " hidden")}>
          {displayOptions.map((o, i) => (
            <button key={o.idx} data-oidx={o.idx} className={"option-tile" + (selected === o.idx ? " selected" : "")}
              onClick={() => commit(o.idx)} disabled={locked || !ready}>
              <span className="tile-label">{LABELS[i]}</span>
              {o.kind === "image" && o.image ? (
                <LoadedImage className="tile-img" src={o.image} alt={`Option ${LABELS[i]}`} onSettled={oneLoaded} />
              ) : (
                <span className="tile-text" dir="auto" lang={lang}>{bidiIsolate(lang === "fa" ? (o.textFa ?? o.text) : (o.text ?? o.textFa))}</span>
              )}
            </button>
          ))}
        </div>

        {watermark && (
          <div className="watermark" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => <span key={i}>{watermark}</span>)}
          </div>
        )}
      </div>

      <div className="qfooter">{t("answers_final")}</div>
    </div>
  );
}
