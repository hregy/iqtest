import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, ApiError } from "../api";

export function Landing() {
  const [name, setName] = useState("");
  const [voucher, setVoucher] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const start = await api.startTest(name.trim(), voucher.trim());
      navigate("/test", { state: { start, name: name.trim() } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="screen start">
      <div className="brand">IQ</div>
      <h1>IQ Test</h1>
      <p className="subtitle">Enter your name and voucher to begin.</p>

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={40}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Voucher code</span>
          <input
            value={voucher}
            onChange={(e) => setVoucher(e.target.value.toUpperCase())}
            placeholder="e.g. IQ-ABC123"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="btn primary" disabled={busy}>
          {busy ? "Starting…" : "Begin Test"}
        </button>
      </form>

      <ul className="rules">
        <li><span>⏱</span> Each question is timed — it auto-advances.</li>
        <li><span>➡️</span> No going back. Each answer is final.</li>
        <li><span>🧩</span> Tap the answer tile you think is correct.</li>
      </ul>

      <Link className="link" to="/scoreboard">View scoreboard →</Link>
      <p className="fineprint">For entertainment — not a clinical IQ assessment.</p>
    </div>
  );
}
