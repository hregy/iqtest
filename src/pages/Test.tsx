import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { StartResponse, TestQuestion, QSignal } from "../types";
import { api, ApiError } from "../api";
import { useIntegrity } from "../hooks/useIntegrity";
import { QuestionView } from "../components/QuestionView";
import { EinsteinPortrait } from "../components/Einstein";
import { Turnstile } from "../components/Turnstile";
import { collectClient } from "../lib/clientProfile";
import { startRecording, stopRecording } from "../lib/recorder";

type Phase = "gate" | "running" | "submitting" | "error";

interface Current {
  token: string;
  question: TestQuestion;
  nonce: string;
  index: number;
  total: number;
  questionSeconds: number;
  watermark: string;
}

export function Test() {
  const location = useLocation();
  const navigate = useNavigate();
  const creds = location.state as { name?: string; voucher?: string; mode?: "classic" | "final" } | null;

  const [phase, setPhase] = useState<Phase>("gate");
  const [cur, setCur] = useState<Current | null>(null);
  const [error, setError] = useState("");
  const [siteKey, setSiteKey] = useState("");
  const [token, setToken] = useState("");

  const { integrity, obscured, fsLost, enterFullscreen } = useIntegrity(phase === "running");

  useEffect(() => {
    // Only a name is strictly required here; the server enforces whether a
    // voucher is needed (open-access mode lets users start without one).
    if (!creds?.name) navigate("/", { replace: true });
  }, [creds, navigate]);

  useEffect(() => {
    api.getConfig().then((c) => setSiteKey(c.turnstileSiteKey || "")).catch(() => {});
  }, []);

  // Unreversible + warn on exit while running.
  useEffect(() => {
    if (phase !== "running") return;
    history.pushState({ iq: true }, "");
    const onPop = () => history.pushState({ iq: true }, "");
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", onBefore);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onBefore);
    };
  }, [phase]);

  const begin = useCallback(async () => {
    if (!creds?.name) return;
    if (siteKey && !token) { setError("Please complete the bot check."); return; }
    await enterFullscreen(); // user gesture -> request fullscreen before the clock starts
    setError("");
    try {
      const client = await collectClient();
      const s: StartResponse = await api.startTest(creds.name, creds.voucher || "", token, client, creds.mode || "classic");
      setCur({
        token: s.attemptToken,
        question: s.question,
        nonce: s.nonce,
        index: s.index,
        total: s.total,
        questionSeconds: s.settings.questionSeconds,
        watermark: s.watermark,
      });
      startRecording();
      setPhase("running");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the test.");
      setPhase("error");
    }
  }, [creds, enterFullscreen, siteKey, token]);

  const handleReady = useCallback(() => {
    if (cur) api.ready(cur.token, cur.nonce);
  }, [cur]);

  const handleAnswer = useCallback(
    async (selectedIndex: number | null, renderDelayMs: number, q: QSignal) => {
      if (!cur) return;
      try {
        const r = await api.answer(cur.token, cur.nonce, selectedIndex, renderDelayMs, integrity.current, q);
        if (r.done && r.result) {
          setPhase("submitting");
          api.sendRecording(cur.token, stopRecording()); // upload session replay (fire-and-forget)
          navigate("/results", { replace: true, state: { result: r.result, review: r.review } });
        } else if (r.question && r.nonce !== undefined) {
          setCur({ ...cur, question: r.question, nonce: r.nonce, index: r.index ?? cur.index + 1 });
        }
      } catch {
        navigate("/", { replace: true });
      }
    },
    [cur, integrity, navigate]
  );

  if (!creds?.name) return null;

  if (phase === "gate") {
    const RULES = [
      ["🖥️", "Stays in full screen — leaving is recorded."],
      ["⏱", "Each question is timed on the server; no extra time."],
      ["➡️", "No going back. Each answer is final."],
    ];
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="hero">
          <div className="hero-inner">
            <EinsteinPortrait size={92} hair="var(--iq-chalk)" ring="var(--iq-accent)" />
            <h1 className="hero-title" style={{ marginTop: 14 }}>Ready, <span className="accent">{creds.name}</span>?</h1>
            <p className="hero-sub">
              {creds.mode === "final"
                ? "Final IQ Test — 30 questions across 5 difficulty levels, timed per question."
                : "The test runs in full screen and is timed per question."}
            </p>
          </div>
        </div>
        <div className="rules">
          {RULES.map(([ico, txt]) => (
            <div className="rule" key={txt}><div className="rule-ico">{ico}</div><div className="rule-txt">{txt}</div></div>
          ))}
        </div>
        {siteKey && <Turnstile siteKey={siteKey} onToken={setToken} />}
        {error && <p className="form-error" style={{ textAlign: "center" }}>{error}</p>}
        <button className="btn block primary" style={{ marginTop: 18 }} onClick={begin}>
          Enter full screen &amp; start
        </button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="screen center">
        <p className="form-error">{error}</p>
        <button className="btn primary" onClick={() => navigate("/", { replace: true })}>Back</button>
      </div>
    );
  }

  if (phase === "submitting" || !cur) {
    return <div className="screen center"><div className="spinner" /><p>Scoring…</p></div>;
  }

  return (
    <>
      <QuestionView
        question={cur.question}
        index={cur.index}
        total={cur.total}
        questionSeconds={cur.questionSeconds}
        watermark={cur.watermark}
        onReady={handleReady}
        onAnswer={handleAnswer}
      />

      {fsLost && !obscured && (
        <div className="capture-guard">
          <div className="capture-guard-card">
            <div className="capture-guard-icon">🖥️</div>
            <h2>Return to full screen</h2>
            <p>Exiting full screen is recorded. The timer keeps running — tap to continue.</p>
            <button className="btn primary" onClick={enterFullscreen}>Re-enter full screen</button>
          </div>
        </div>
      )}

      {obscured && (
        <div className="capture-guard">
          <div className="capture-guard-card">
            <div className="capture-guard-icon">🔒</div>
            <h2>Question hidden</h2>
            <p>Switching apps, opening developer tools, or taking screenshots is recorded and hides the question.</p>
          </div>
        </div>
      )}
    </>
  );
}
