import { useEffect, useState } from "react";
import { api } from "../api";

export function AdminSettings() {
  const [testLength, setTestLength] = useState("20");
  const [questionSeconds, setQuestionSeconds] = useState("10");
  const [finalPerLevel, setFinalPerLevel] = useState("6");
  const [finalQuestionSeconds, setFinalQuestionSeconds] = useState("30");
  const [voucherRequired, setVoucherRequired] = useState(true);
  const [dailyLimit, setDailyLimit] = useState("3");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.admin.getSettings().then((s) => {
      if (s.test_length) setTestLength(s.test_length);
      if (s.question_seconds) setQuestionSeconds(s.question_seconds);
      if (s.final_per_level) setFinalPerLevel(s.final_per_level);
      if (s.final_question_seconds) setFinalQuestionSeconds(s.final_question_seconds);
      if (s.voucher_required !== undefined) setVoucherRequired(s.voucher_required !== "0");
      if (s.daily_attempt_limit !== undefined) setDailyLimit(s.daily_attempt_limit);
    });
  }, []);

  const save = async () => {
    await api.admin.putSettings({
      test_length: Number(testLength),
      question_seconds: Number(questionSeconds),
      final_per_level: Number(finalPerLevel),
      final_question_seconds: Number(finalQuestionSeconds),
      voucher_required: voucherRequired ? "1" : "0",
      daily_attempt_limit: Math.max(0, Number(dailyLimit) || 0),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="panel">
      <div className="card">
        <h3>Access</h3>
        <label className="row gap" style={{ alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={voucherRequired}
            onChange={(e) => setVoucherRequired(e.target.checked)} />
          <span><strong>Require a voucher code to take a test</strong></span>
        </label>
        <p className="muted small" style={{ marginTop: 6 }}>
          {voucherRequired
            ? "On — users must enter a valid voucher code to start."
            : "Off — open access: anyone can take a test with just a name. The scoreboard keeps the best score per device, and the Anti-cheat tab groups repeat/same-device entries. Enabling the Turnstile bot check is recommended in this mode."}
        </p>
        <div className="row gap wrap" style={{ marginTop: 12 }}>
          <label className="field sm"><span>Attempts per user / day</span>
            <input type="number" min={0} max={50} value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)} /></label>
        </div>
        <p className="muted small">
          How many times one user can take <strong>each</strong> test (Quick / Final) per 24 hours.
          Users are identified by device fingerprint (IP + device as fallback) — the same evidence
          the Anti-cheat tab uses. <strong>0 = unlimited.</strong> Admin/practice runs are exempt.
        </p>
      </div>

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
