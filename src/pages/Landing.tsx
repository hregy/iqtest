import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandHeader } from "../components/brand";
import { EinsteinPortrait } from "../components/Einstein";
import { api } from "../api";

const RULES = [
  ["⏱", "Every question is timed — it auto-advances."],
  ["➡️", "No going back. Each answer is final."],
  ["🧩", "Tap the tile you think is correct."],
];

export function Landing() {
  const [name, setName] = useState("");
  const [voucher, setVoucher] = useState("");
  const [mode, setMode] = useState<"classic" | "final">("classic");
  const [voucherRequired, setVoucherRequired] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.getConfig().then((c) => setVoucherRequired(c.voucherRequired !== false)).catch(() => {});
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Enter a name to begin.");
    if (voucherRequired && !voucher.trim()) return setError("Enter your voucher code.");
    navigate("/test", { state: { name: name.trim(), voucher: voucher.trim(), mode } });
  };

  return (
    <div className="screen">
      <BrandHeader
        right={<button className="btn pill" onClick={() => navigate("/scoreboard")}>Scores</button>}
      />

      <div className="hero">
        <div className="hero-formulae" aria-hidden="true">
          E = mc²&nbsp;&nbsp;·&nbsp;&nbsp;π&nbsp;&nbsp;·&nbsp;&nbsp;∑ⁿ&nbsp;&nbsp;·&nbsp;&nbsp;√2&nbsp;&nbsp;·&nbsp;&nbsp;∞&nbsp;&nbsp;·&nbsp;&nbsp;a²+b²&nbsp;&nbsp;·&nbsp;&nbsp;Δt
        </div>
        <div className="hero-inner">
          <EinsteinPortrait size={104} hair="var(--iq-chalk)" ring="var(--iq-accent)" />
          <div className="hero-badge">THINK LIKE A GENIUS</div>
          <h1 className="hero-title">How smart are you, <span className="accent">really?</span></h1>
          <p className="hero-sub">Timed visual puzzles. One honest number. Find your IQ in minutes.</p>
        </div>
      </div>

      <form className="card form" style={{ marginTop: 16 }} onSubmit={submit}>
        <div className="field">
          <span>Choose your test</span>
          <div className="ttseg" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "classic"}
              className={"ttseg-btn" + (mode === "classic" ? " on" : "")} onClick={() => setMode("classic")}>
              <strong>Quick test</strong>
              <em>20 puzzles · warm-up</em>
            </button>
            <button type="button" role="tab" aria-selected={mode === "final"}
              className={"ttseg-btn" + (mode === "final" ? " on" : "")} onClick={() => setMode("final")}>
              <strong>Final IQ Test</strong>
              <em>30 questions · 5 levels</em>
            </button>
          </div>
        </div>
        <label className="field">
          <span>Your name</span>
          <input className="input" value={name} placeholder="e.g. Albert" maxLength={40}
            autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </label>
        {voucherRequired && (
          <label className="field">
            <span>Voucher code</span>
            <input className="input iq-mono" value={voucher} placeholder="IQ-ABC123"
              style={{ letterSpacing: "0.04em" }} autoComplete="off" autoCapitalize="characters"
              onChange={(e) => setVoucher(e.target.value.toUpperCase())} />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <button className="btn block primary">Begin test →</button>
      </form>

      <div className="rules">
        {RULES.map(([ico, txt]) => (
          <div className="rule" key={txt}>
            <div className="rule-ico">{ico}</div>
            <div className="rule-txt">{txt}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "auto", paddingTop: 20, textAlign: "center" }}>
        <button className="link" style={{ background: "none", border: "none", cursor: "pointer" }}
          onClick={() => navigate("/scoreboard")}>View scoreboard →</button>
        <p className="fineprint">For entertainment — not a clinical IQ assessment.</p>
      </div>
    </div>
  );
}
