import { TEST_LENGTH, QUESTION_SECONDS, POOL_SIZE } from "../config";

interface Props {
  onStart: () => void;
  locked: boolean;
}

export function Start({ onStart, locked }: Props) {
  return (
    <div className="screen start">
      <div className="brand">IQ</div>
      <h1>IQ Test</h1>
      <p className="subtitle">
        {TEST_LENGTH} visual puzzles drawn at random from a pool of {POOL_SIZE}.
      </p>

      <ul className="rules">
        <li><span>⏱</span> {QUESTION_SECONDS} seconds per question — it auto-advances.</li>
        <li><span>➡️</span> No going back. Each answer is final.</li>
        <li><span>🧩</span> Tap A, B, C or D to answer.</li>
        <li><span>📵</span> Stay on this screen — leaving hides the question.</li>
      </ul>

      {locked ? (
        <>
          <button className="btn primary" disabled>
            Already completed
          </button>
          <p className="fineprint">You have already taken this test on this device.</p>
        </>
      ) : (
        <button className="btn primary" onClick={onStart}>
          Begin Test
        </button>
      )}

      <p className="fineprint">
        For entertainment. This is a gamified estimate, not a clinical IQ assessment.
      </p>
    </div>
  );
}
