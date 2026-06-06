import { useCallback, useEffect, useState } from "react";
import questionsData from "./data/questions.json";
import type { Answer, Phase, Question } from "./types";
import { pickRandom } from "./lib/shuffle";
import { useAntiCheat } from "./hooks/useAntiCheat";
import {
  TEST_LENGTH,
  ONE_ATTEMPT_LOCK,
  LOCK_STORAGE_KEY,
} from "./config";
import { Start } from "./screens/Start";
import { Question as QuestionScreen } from "./screens/Question";
import { Results } from "./screens/Results";

const POOL = questionsData as Question[];

function isLocked(): boolean {
  if (!ONE_ATTEMPT_LOCK) return false;
  try {
    return localStorage.getItem(LOCK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("start");
  const [quiz, setQuiz] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [locked, setLocked] = useState(isLocked);

  const inTest = phase === "question";
  const obscured = useAntiCheat(inTest);

  // ---- Unreversible navigation: trap the browser Back button ----
  useEffect(() => {
    if (!inTest) return;
    // Push a state so the first Back press is absorbed here.
    history.pushState({ iq: true }, "");
    const onPop = () => {
      // Re-push to keep the user pinned on the test; Back does nothing.
      history.pushState({ iq: true }, "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [inTest]);

  // Warn before reload/close mid-test (also helps prevent accidental exit).
  useEffect(() => {
    if (!inTest) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [inTest]);

  const startTest = useCallback(() => {
    if (isLocked()) {
      setLocked(true);
      return;
    }
    const selected = pickRandom(POOL, TEST_LENGTH);
    // Warm the browser cache for every image up front so later questions
    // appear instantly even on a slow connection.
    selected.forEach((q) => {
      const img = new Image();
      img.src = q.image;
    });
    setQuiz(selected);
    setAnswers([]);
    setIndex(0);
    setPhase("question");
  }, []);

  const finish = useCallback((finalAnswers: Answer[]) => {
    setAnswers(finalAnswers);
    setPhase("results");
    if (ONE_ATTEMPT_LOCK) {
      try {
        localStorage.setItem(LOCK_STORAGE_KEY, "1");
      } catch {
        /* ignore storage failures */
      }
      setLocked(true);
    }
  }, []);

  const handleAnswer = useCallback(
    (selectedIndex: number | null) => {
      const q = quiz[index];
      const answer: Answer = {
        questionId: q.id,
        selectedIndex,
        correct: selectedIndex === q.correctIndex,
        category: q.category,
      };
      const next = [...answers, answer];

      if (index + 1 >= quiz.length) {
        finish(next);
      } else {
        setAnswers(next);
        setIndex(index + 1); // forward only — no way back
      }
    },
    [quiz, index, answers, finish]
  );

  const restart = useCallback(() => {
    setPhase("start");
    setQuiz([]);
    setAnswers([]);
    setIndex(0);
  }, []);

  return (
    <div className="app">
      {phase === "start" && <Start onStart={startTest} locked={locked} />}

      {phase === "question" && quiz[index] && (
        <QuestionScreen
          question={quiz[index]}
          index={index}
          total={quiz.length}
          onAnswer={handleAnswer}
        />
      )}

      {phase === "results" && (
        <Results answers={answers} onRestart={restart} canRestart={!locked} />
      )}

      {/* Screenshot / focus-loss deterrent overlay */}
      {inTest && obscured && (
        <div className="capture-guard">
          <div className="capture-guard-card">
            <div className="capture-guard-icon">🔒</div>
            <h2>Question hidden</h2>
            <p>
              Keep this screen in focus during the test. Switching apps, taking
              screenshots, or leaving the tab hides the question.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
