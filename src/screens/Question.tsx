import { useEffect, useState } from "react";
import type { Question as Q } from "../types";
import { QUESTION_SECONDS } from "../config";
import { useCountdown } from "../hooks/useCountdown";

interface Props {
  question: Q;
  index: number; // 0-based
  total: number;
  onAnswer: (selectedIndex: number | null) => void;
}

const LABELS = ["A", "B", "C", "D"];

export function Question({ question, index, total, onAnswer }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);

  // Reset local state for each new question.
  useEffect(() => {
    setSelected(null);
    setLocked(false);
  }, [question.id]);

  const commit = (choice: number | null) => {
    if (locked) return;
    setLocked(true);
    setSelected(choice);
    // brief pause so the tap feels acknowledged, then advance
    window.setTimeout(() => onAnswer(choice), choice === null ? 250 : 350);
  };

  const remaining = useCountdown(QUESTION_SECONDS, question.id, !locked, () =>
    commit(null)
  );

  const pct = (remaining / QUESTION_SECONDS) * 100;
  const danger = remaining <= 3;

  return (
    <div className="screen question">
      <header className="qheader">
        <span className="counter">
          {index + 1} / {total}
        </span>
        <span className={"timer" + (danger ? " danger" : "")}>
          {Math.ceil(remaining)}s
        </span>
      </header>

      <div className="timerbar">
        <div
          className={"timerbar-fill" + (danger ? " danger" : "")}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="image-wrap">
        <img
          className="qimage"
          src={question.image}
          alt={`Question ${index + 1}`}
          draggable={false}
        />
        {/* transparent shield over the image to deter long-press save */}
        <div className="image-shield" />
      </div>

      <div className="options">
        {LABELS.map((label, i) => (
          <button
            key={label}
            className={
              "option" +
              (selected === i ? " selected" : "") +
              (locked ? " locked" : "")
            }
            onClick={() => commit(i)}
            disabled={locked}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
