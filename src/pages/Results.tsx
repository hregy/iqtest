import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { SubmitResult, ReviewItem } from "../types";
import { bandForIq } from "../lib/scoring";
import { useLang } from "../lib/i18n";
import { BrandHeader, Gauge } from "../components/brand";
import { EinsteinMark } from "../components/Einstein";
import { ReviewList } from "../components/ReviewList";

const CATEGORY_LABEL: Record<string, string> = {
  pattern: "Pattern", analogy: "Analogy", spatial: "Spatial", series: "Series",
};
// Final-bank categories are domains like "quantitative_reasoning" — prettify
// underscores to spaces and capitalise so they read cleanly.
const labelFor = (c: string) =>
  CATEGORY_LABEL[c] ?? c.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

const QUOTES = [
  "The important thing is not to stop questioning.",
  "Imagination is more important than knowledge.",
  "I have no special talent. I am only passionately curious.",
  "Logic will get you from A to B. Imagination takes you everywhere.",
];

export function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLang();
  const state = location.state as { result?: SubmitResult; review?: ReviewItem[] } | null;
  const result = state?.result;
  const review = state?.review || [];
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    if (!result) navigate("/", { replace: true });
  }, [result, navigate]);
  if (!result) return null;

  const iq = result.iq ?? 70;
  const avgSec = result.total ? result.durationMs / 1000 / result.total : 0;
  const quote = QUOTES[result.correct % QUOTES.length];
  const stats: [string, string, string][] = [
    ["stat_correct", t("stat_correct"), `${result.correct}/${result.total}`],
    ["stat_accuracy", t("stat_accuracy"), `${result.percent}%`],
    ["stat_avg", t("stat_avg"), `${avgSec.toFixed(1)}s`],
    ["stat_total_time", t("stat_total_time"), fmtDuration(result.durationMs)],
  ];

  return (
    <div className="screen">
      <BrandHeader />

      <div style={{ textAlign: "center", marginTop: 10 }}>
        {result.practice && <p className="practice-badge">{t("practice_badge")}</p>}
        {result.testType === "final" && <p className="band-pill" style={{ marginTop: 0 }}>{t("final_weighted")}</p>}
        <div style={{ display: "grid", placeItems: "center", marginTop: 8 }}>
          <Gauge value={iq} size={216} display={iq.toFixed(2)} label={t("your_iq")} />
        </div>
        <div className="band-pill"><span className="band-dot" />{t(bandForIq(iq))}</div>
        <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--iq-ink-soft)" }}>
          {t("correct_of", { correct: result.correct, total: result.total })}
        </p>
      </div>

      <div className="stats">
        {stats.map(([k, label, v]) => (
          <div className="stat" key={k}>
            <div className="iq-mono stat-v">{v}</div>
            <div className="iq-label stat-k">{label}</div>
          </div>
        ))}
      </div>

      {Object.keys(result.byCategory).filter((c) => result.byCategory[c].total > 0).length > 0 && (
        <div className="breakdown">
          {Object.keys(result.byCategory)
            .filter((c) => result.byCategory[c].total > 0)
            .map((c) => {
              const { correct, total } = result.byCategory[c];
              const pct = Math.round((correct / total) * 100);
              return (
                <div className="cat-row" key={c}>
                  <span className="cat-name" title={labelFor(c)}>{labelFor(c)}</span>
                  <span className="cat-count">{correct}/{total}</span>
                  <div className="cat-bar"><div className="cat-bar-fill" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
        </div>
      )}

      <div className="quote-card">
        <EinsteinMark size={46} board="#11171A" hair="var(--iq-accent)" />
        <div>
          <p className="iq-quote">“{quote}”</p>
          <div className="by">— A. Einstein</div>
        </div>
      </div>

      {review.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button className="btn block ghost" onClick={() => setShowReview((s) => !s)}>
            {showReview ? t("review_hide") : t("review_show")}
          </button>
          {showReview && <ReviewList review={review} />}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <button className="btn block primary" onClick={() => navigate("/scoreboard")}>{t("see_scoreboard")}</button>
        <button className="btn block ghost" onClick={() => navigate("/")}>{t("back_to_start_plain")}</button>
      </div>

      <p className="fineprint">{t("fineprint")}</p>
    </div>
  );
}
