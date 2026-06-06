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
  const [ready, setReady] = useState(false);

  // Reset local state for each new question.
  useEffect(() => {
    setSelected(null);
    setLocked(false);
    setReady(false);
  }, [question.id]);

  // If the image is cached it may already be complete before onLoad fires.
  const onImgRef = (el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) setReady(true);
  };

  const commit = (choice: number | null) => {
    if (locked) return;
    setLocked(true);
    setSelected(choice);
    // brief pause so the tap feels acknowledged, then advance
    window.setTimeout(() => onAnswer(choice), choice === null ? 250 : 350);
  };

  // The countdown only runs once the image is actually visible, so a slow
  // network can never show a blank question with a ticking timer.
  const remaining = useCountdown(
    QUESTION_SECONDS,
    question.id,
    !locked && ready,
    () => commit(null)
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
          ref={onImgRef}
          className={"qimage" + (ready ? "" : " hidden")}
          src={question.image}
          alt={`Question ${index + 1}`}
          draggable={false}
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
        />
        {!ready && (
          <div className="img-loading">
            <div className="spinner" />
            <span>Loading question…</span>
          </div>
        )}
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
            disabled={locked || !ready}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
