import { useEffect, useState } from "react";
import { api } from "../api";

export function AdminSettings() {
  const [testLength, setTestLength] = useState("20");
  const [questionSeconds, setQuestionSeconds] = useState("10");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.admin.getSettings().then((s) => {
      if (s.test_length) setTestLength(s.test_length);
      if (s.question_seconds) setQuestionSeconds(s.question_seconds);
    });
  }, []);

  const save = async () => {
    await api.admin.putSettings({
      test_length: Number(testLength),
      question_seconds: Number(questionSeconds),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="panel">
      <div className="card">
        <h3>Test settings</h3>
        <p className="muted small">
          These apply to every <strong>new</strong> test. Server-enforced — changing
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
        <button className="btn" onClick={save}>Save</button>
        {saved && <span className="saved-note">Saved ✓</span>}
      </div>
    </div>
  );
}
