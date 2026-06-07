import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { StartResponse, AnswerInput } from "../types";
import { api } from "../api";
import { useAntiCheat } from "../hooks/useAntiCheat";
import { QuestionView } from "../components/QuestionView";

export function Test() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { start?: StartResponse } | null;
  const start = state?.start;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerInput[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const obscured = useAntiCheat(true);

  // No questions in navigation state (e.g. direct URL / reload) -> go home.
  useEffect(() => {
    if (!start) navigate("/", { replace: true });
  }, [start, navigate]);

  // Unreversible: trap the browser Back button.
  useEffect(() => {
    history.pushState({ iq: true }, "");
    const onPop = () => history.pushState({ iq: true }, "");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Warn before reload/close mid-test.
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, []);

  const finish = useCallback(
    async (final: AnswerInput[]) => {
      if (!start) return;
      setSubmitting(true);
      try {
        const result = await api.submitTest(start.sessionToken, final);
        navigate("/results", { replace: true, state: { result } });
      } catch {
        navigate("/", { replace: true });
      }
    },
    [start, navigate]
  );

  const handleAnswer = useCallback(
    (selectedIndex: number | null) => {
      if (!start) return;
      const q = start.questions[index];
      const next = [...answers, { id: q.id, selectedIndex }];
      if (index + 1 >= start.questions.length) {
        finish(next);
      } else {
        setAnswers(next);
        setIndex(index + 1);
      }
    },
    [start, index, answers, finish]
  );

  if (!start) return null;
  if (submitting) {
    return (
      <div className="screen center">
        <div className="spinner" />
        <p>Scoring…</p>
      </div>
    );
  }

  return (
    <>
      <QuestionView
        question={start.questions[index]}
        index={index}
        total={start.questions.length}
        questionSeconds={start.settings.questionSeconds}
        onAnswer={handleAnswer}
      />
      {obscured && (
        <div className="capture-guard">
          <div className="capture-guard-card">
            <div className="capture-guard-icon">🔒</div>
            <h2>Question hidden</h2>
            <p>
              Keep this screen in focus. Switching apps, taking screenshots, or
              leaving the tab hides the question.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
