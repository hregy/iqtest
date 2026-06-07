import { useEffect, useState } from "react";
import { api } from "../api";

export function AdminSettings() {
  const [testLength, setTestLength] = useState("20");
  const [questionSeconds, setQuestionSeconds] = useState("10");
  const [finalPerLevel, setFinalPerLevel] = useState("6");
  const [finalQuestionSeconds, setFinalQuestionSeconds] = useState("30");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.admin.getSettings().then((s) => {
      if (s.test_length) setTestLength(s.test_length);
      if (s.question_seconds) setQuestionSeconds(s.question_seconds);
      if (s.final_per_level) setFinalPerLevel(s.final_per_level);
      if (s.final_question_seconds) setFinalQuestionSeconds(s.final_question_seconds);
    });
  }, []);

  const save = async () => {
    await api.admin.putSettings({
      test_length: Number(testLength),
      question_seconds: Number(questionSeconds),
      final_per_level: Number(finalPerLevel),
      final_question_seconds: Number(finalQuestionSeconds),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="panel">
      <div className="card">
        <h3>Quick test settings</h3>
        <p className="muted small">
          These apply to every <strong>new</strong> Quick test. Server-enforced — changing
          “seconds per question” changes the real time limit, not just the display.
        </p>
        <div className="row gap wrap">
          <label className="field sm"><span>Questions per test</span>
            <input type="number" min={1} max={100} value={testLength}
              onChange={(e) => setTestLength(e.target.value)} /></label>
          <label className="field sm"><span>Seconds per question</span>
            <input type="number" min={3} max={120} value={questionSeconds}
              onChange={(e) => setQuestionSeconds(e.target.value)} /></label>
        </div>
      </div>

      <div className="card">
        <h3>Final IQ Test settings</h3>
        <p className="muted small">
          The Final test draws an equal random slice from each of the 5 difficulty
          levels (questions = per-level × 5). Harder levels are weighted more in the score.
        </p>
        <div className="row gap wrap">
          <label className="field sm"><span>Questions per level</span>
            <input type="number" min={1} max={30} value={finalPerLevel}
              onChange={(e) => setFinalPerLevel(e.target.value)} /></label>
          <label className="field sm"><span>Seconds per question</span>
            <input type="number" min={5} max={180} value={finalQuestionSeconds}
              onChange={(e) => setFinalQuestionSeconds(e.target.value)} /></label>
        </div>
        <p className="muted small">Total Final questions: <strong>{Number(finalPerLevel) * 5 || 0}</strong></p>
      </div>

      <div className="card">
        <button className="btn" onClick={save}>Save</button>
        {saved && <span className="saved-note">Saved ✓</span>}
      </div>
    </div>
  );
}
