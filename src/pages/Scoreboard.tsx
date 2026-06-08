import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ScoreRow } from "../types";
import { api } from "../api";
import { iqFromPercent } from "../lib/scoring";
import { useLang } from "../lib/i18n";
import { fmtDuration } from "./Results";
// score = server combined iq (accuracy + speed); fall back for legacy rows

const initials = (n: string) =>
  n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export function Scoreboard() {
  const { t } = useLang();
  const [rows, setRows] = useState<ScoreRow[] | null>(null);
  const [tab, setTab] = useState<"classic" | "final">("final");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    setRows(null);
    setError("");
    api.scoreboard(tab).then(setRows).catch(() => setError(t("sb_error")));
  }, [tab, t]);

  return (
    <div className="screen">
      <div className="sb-head">
        <button className="iconbtn" onClick={() => navigate("/")}>‹</button>
        <div>
          <h1>{t("scoreboard")}</h1>
          <div className="muted small" style={{ fontWeight: 600 }}>
            {tab === "final" ? t("sb_sub_final") : t("sb_sub_quick")}
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 24 }}>🏆</div>
      </div>

      <div className="ttseg" role="tablist" style={{ marginTop: 14 }}>
        <button type="button" role="tab" aria-selected={tab === "final"}
          className={"ttseg-btn" + (tab === "final" ? " on" : "")} onClick={() => setTab("final")}>
          <strong>{t("tab_final")}</strong>
        </button>
        <button type="button" role="tab" aria-selected={tab === "classic"}
          className={"ttseg-btn" + (tab === "classic" ? " on" : "")} onClick={() => setTab("classic")}>
          <strong>{t("tab_quick")}</strong>
        </button>
      </div>

      {error && <p className="form-error" style={{ marginTop: 18 }}>{error}</p>}
      {!rows && !error && <div className="spinner" style={{ margin: "40px auto" }} />}
      {rows && rows.length === 0 && <p className="muted" style={{ marginTop: 24 }}>{t("sb_empty")}</p>}

      {rows && rows.length > 0 && (
        <div className="board">
          {rows.map((r) => {
            const iq = r.iq ?? iqFromPercent(r.percent);
            const medal = r.rank <= 3;
            return (
              <div className="board-row" key={r.rank}>
                <div className={"rank" + (medal ? " medal" : "")}>{r.rank}</div>
                <div className="avatar">{initials(r.name)}</div>
                <div className="bname">
                  <div className="nm">{r.name}</div>
                  <div className="bsub">
                    {r.correct}/{r.total}
                    {r.duration_ms != null && (
                      <> · ⏱ {fmtDuration(r.duration_ms)} · avg {(r.duration_ms / 1000 / Math.max(1, r.total)).toFixed(1)}s</>
                    )}
                  </div>
                </div>
                <div className="iq-mono biq">{iq.toFixed(2)}</div>
              </div>
            );
          })}
        </div>
      )}

      <button className="btn block ghost" style={{ marginTop: 18 }} onClick={() => navigate("/")}>{t("back_to_start")}</button>
    </div>
  );
}
