import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandHeader } from "../components/brand";
import { EinsteinPortrait } from "../components/Einstein";
import { LangToggle } from "../components/LangToggle";
import { useLang } from "../lib/i18n";
import { api } from "../api";

export function Landing() {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [voucher, setVoucher] = useState("");
  const [mode, setMode] = useState<"classic" | "final">("classic");
  const [voucherRequired, setVoucherRequired] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const RULES: [string, string][] = [
    ["⏱", t("rule_timed")],
    ["➡️", t("rule_no_back")],
    ["🧩", t("rule_tap")],
  ];

  useEffect(() => {
    api.getConfig().then((c) => setVoucherRequired(c.voucherRequired !== false)).catch(() => {});
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t("err_enter_name"));
    if (voucherRequired && !voucher.trim()) return setError(t("err_enter_voucher"));
    navigate("/test", { state: { name: name.trim(), voucher: voucher.trim(), mode } });
  };

  return (
    <div className="screen">
      <BrandHeader
        right={<div className="row gap" style={{ alignItems: "center" }}>
          <LangToggle />
          <button className="btn pill" onClick={() => navigate("/scoreboard")}>{t("scores")}</button>
        </div>}
      />

      <div className="hero">
        <div className="hero-formulae" aria-hidden="true">
          E = mc²&nbsp;&nbsp;·&nbsp;&nbsp;π&nbsp;&nbsp;·&nbsp;&nbsp;∑ⁿ&nbsp;&nbsp;·&nbsp;&nbsp;√2&nbsp;&nbsp;·&nbsp;&nbsp;∞&nbsp;&nbsp;·&nbsp;&nbsp;a²+b²&nbsp;&nbsp;·&nbsp;&nbsp;Δt
        </div>
        <div className="hero-inner">
          <EinsteinPortrait size={104} hair="var(--iq-chalk)" ring="var(--iq-accent)" />
          <div className="hero-badge">{t("hero_badge")}</div>
          <h1 className="hero-title">{t("hero_title")}</h1>
          <p className="hero-sub">{t("hero_sub")}</p>
        </div>
      </div>

      <form className="card form" style={{ marginTop: 16 }} onSubmit={submit}>
        <div className="field">
          <span>{t("choose_test")}</span>
          <div className="ttseg" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "classic"}
              className={"ttseg-btn" + (mode === "classic" ? " on" : "")} onClick={() => setMode("classic")}>
              <strong>{t("quick_test")}</strong>
              <em>{t("quick_test_sub")}</em>
            </button>
            <button type="button" role="tab" aria-selected={mode === "final"}
              className={"ttseg-btn" + (mode === "final" ? " on" : "")} onClick={() => setMode("final")}>
              <strong>{t("final_test")}</strong>
              <em>{t("final_test_sub")}</em>
            </button>
          </div>
        </div>
        <label className="field">
          <span>{t("your_name")}</span>
          <input className="input" value={name} placeholder={t("name_placeholder")} maxLength={40}
            autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </label>
        {voucherRequired && (
          <label className="field">
            <span>{t("voucher_code")}</span>
            <input className="input iq-mono" value={voucher} placeholder="IQ-ABC123"
              style={{ letterSpacing: "0.04em" }} autoComplete="off" autoCapitalize="characters" dir="ltr"
              onChange={(e) => setVoucher(e.target.value.toUpperCase())} />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <button className="btn block primary">{t("begin_test")}</button>
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
          onClick={() => navigate("/scoreboard")}>{t("view_scoreboard")}</button>
        <p className="fineprint">{t("fineprint")}</p>
      </div>
    </div>
  );
}
