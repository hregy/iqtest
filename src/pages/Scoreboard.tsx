import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ScoreRow } from "../types";
import { api } from "../api";
import { iqFromPercent } from "../lib/scoring";
import { fmtDuration } from "./Results";
// score = server combined iq (accuracy + speed); fall back for legacy rows

const initials = (n: string) =>
  n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export function Scoreboard() {
  const [rows, setRows] = useState<ScoreRow[] | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.scoreboard().then(setRows).catch(() => setError("Could not load scoreboard."));
  }, []);

  return (
    <div className="screen">
      <div className="sb-head">
        <button className="iconbtn" onClick={() => navigate("/")}>‹</button>
        <div>
          <h1>Scoreboard</h1>
          <div className="muted small" style={{ fontWeight: 600 }}>Top minds this week</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 24 }}>🏆</div>
      </div>

      {error && <p className="form-error" style={{ marginTop: 18 }}>{error}</p>}
      {!rows && !error && <div className="spinner" style={{ margin: "40px auto" }} />}
      {rows && rows.length === 0 && <p className="muted" style={{ marginTop: 24 }}>No scores yet — be the first!</p>}

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

      <button className="btn block ghost" style={{ marginTop: 18 }} onClick={() => navigate("/")}>‹ Back to start</button>
    </div>
  );
}
