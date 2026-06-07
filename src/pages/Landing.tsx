import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export function Landing() {
  const [name, setName] = useState("");
  const [voucher, setVoucher] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter your name.");
    if (!voucher.trim()) return setError("Please enter a voucher code.");
    // Defer starting (and consuming the voucher) until the Test page, so we can
    // enter full screen first and start the server clock at the right moment.
    navigate("/test", { state: { name: name.trim(), voucher: voucher.trim() } });
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

        <button className="btn primary">Continue</button>
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
