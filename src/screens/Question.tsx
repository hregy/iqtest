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

// Clickable areas mapped onto the four answer boxes drawn inside each SVG.
// Must match `option_grid` in scripts/generate_questions.py:
//   boxes at x=30/205, y=330/435, size 165x95, viewBox 400x540.
const HOTSPOTS = [
  { left: "7.5%", top: "61.11%" }, // A
  { left: "51.25%", top: "61.11%" }, // B
  { left: "7.5%", top: "80.56%" }, // C
  { left: "51.25%", top: "80.56%" }, // D
];
const HOTSPOT_W = "41.25%"; // 165 / 400
const HOTSPOT_H = "17.6%"; // 95 / 540
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
        <div className="image-frame">
          <img
            ref={onImgRef}
            className={"qimage" + (ready ? "" : " hidden")}
            src={question.image}
            alt={`Question ${index + 1}`}
            draggable={false}
            onLoad={() => setReady(true)}
            onError={() => setReady(true)}
          />

          {/* Tap targets overlaid on the A-D boxes drawn in the image. */}
          {ready &&
            HOTSPOTS.map((pos, i) => (
              <button
                key={LABELS[i]}
                aria-label={`Answer ${LABELS[i]}`}
                className={"hotspot" + (selected === i ? " selected" : "")}
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: HOTSPOT_W,
                  height: HOTSPOT_H,
                }}
                onClick={() => commit(i)}
                disabled={locked}
              />
            ))}
        </div>

        {!ready && (
          <div className="img-loading">
            <div className="spinner" />
            <span>Loading question…</span>
          </div>
        )}
      </div>

      <p className="tap-hint">Tap an answer above</p>
    </div>
  );
}
