import { useEffect, useMemo, useState } from "react";
import type { TestQuestion } from "../types";
import { useCountdown } from "../hooks/useCountdown";

interface Props {
  question: TestQuestion;
  index: number;
  total: number;
  questionSeconds: number;
  onAnswer: (selectedIndex: number | null) => void;
}

const LABELS = ["A", "B", "C", "D"];

export function QuestionView({ question, index, total, questionSeconds, onAnswer }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(0);

  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    if (question.puzzleImage) urls.push(question.puzzleImage);
    for (const o of question.options) if (o.kind === "image" && o.image) urls.push(o.image);
    return urls;
  }, [question]);

  const ready = loaded >= imageUrls.length;

  useEffect(() => {
    setSelected(null);
    setLocked(false);
    setLoaded(0);
  }, [question.id]);

  const oneLoaded = () => setLoaded((n) => n + 1);

  const commit = (choice: number | null) => {
    if (locked) return;
    setLocked(true);
    setSelected(choice);
    window.setTimeout(() => onAnswer(choice), choice === null ? 250 : 350);
  };

  const remaining = useCountdown(questionSeconds, question.id, !locked && ready, () =>
    commit(null)
  );
  const pct = (remaining / questionSeconds) * 100;
  const danger = remaining <= 3;

  return (
    <div className="screen question">
      <header className="qheader">
        <span className="counter">
          {index + 1} / {total}
        </span>
        <span className={"timer" + (danger ? " danger" : "")}>{Math.ceil(remaining)}s</span>
      </header>

      <div className="timerbar">
        <div
          className={"timerbar-fill" + (danger ? " danger" : "")}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="qcontent">
        {question.prompt && <p className="prompt">{question.prompt}</p>}

        {question.puzzleImage && (
          <div className="puzzle-wrap">
            <img
              className={"puzzle-img" + (ready ? "" : " hidden")}
              src={question.puzzleImage}
              alt="puzzle"
              draggable={false}
              onLoad={oneLoaded}
              onError={oneLoaded}
            />
          </div>
        )}

        {!ready && (
          <div className="img-loading">
            <div className="spinner" />
            <span>Loading question…</span>
          </div>
        )}

        <div className={"options-grid" + (ready ? "" : " hidden")}>
          {question.options.map((o, i) => (
            <button
              key={i}
              className={"option-tile" + (selected === i ? " selected" : "")}
              onClick={() => commit(i)}
              disabled={locked || !ready}
            >
              <span className="tile-label">{LABELS[i]}</span>
              {o.kind === "image" && o.image ? (
                <img
                  className="tile-img"
                  src={o.image}
                  alt={`Option ${LABELS[i]}`}
                  draggable={false}
                  onLoad={oneLoaded}
                  onError={oneLoaded}
                />
              ) : (
                <span className="tile-text">{o.text}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
