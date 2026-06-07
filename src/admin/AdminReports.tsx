import { useEffect, useState } from "react";
import type { AttemptRow, AttemptReview } from "../types";
import { api } from "../api";
import { ReviewList } from "../components/ReviewList";

function fmtDur(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function AdminReports() {
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [open, setOpen] = useState<AttemptReview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.admin.attempts().then(setRows); }, []);

  const view = async (id: string) => {
    setLoading(true);
    try { setOpen(await api.admin.attemptReview(id)); }
    finally { setLoading(false); }
  };

  return (
    <div className="panel">
      <div className="card">
        <h3>Test reports ({rows.length})</h3>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Score</th><th>%</th><th>When</th><th>Type</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.flagged ? "dim" : ""}>
                  <td>{r.name}{r.flagged && <span className="flag" title="flagged"> ⚠️</span>}</td>
                  <td>{r.correct}/{r.total}</td>
                  <td>{r.total ? Math.round((r.correct / r.total) * 100) : 0}%</td>
                  <td className="small">{r.finished_at ? new Date(r.finished_at).toLocaleString() : "—"}</td>
                  <td className="small">{r.practice ? "practice" : "scored"}</td>
                  <td><button className="btn tiny" onClick={() => view(r.id)}>View report</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="muted">No completed attempts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {loading && <div className="card"><div className="spinner" style={{ margin: "10px auto" }} /></div>}

      {open && (
        <div className="report-modal" onClick={() => setOpen(null)}>
          <div className="report-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>{open.name}</h3>
                <div className="muted small">
                  {open.correct}/{open.total} · {fmtDur(open.durationMs)} · avg{" "}
                  {(open.durationMs / 1000 / Math.max(1, open.total)).toFixed(1)}s
                  {open.practice ? " · practice" : ""}
                </div>
                {open.integrity?.reasons?.length ? (
                  <div className="flag-reasons">⚠️ {open.integrity.reasons.join(" · ")}</div>
                ) : null}
              </div>
              <button className="btn small ghost" onClick={() => setOpen(null)}>Close</button>
            </div>
            <ReviewList review={open.review} />
          </div>
        </div>
      )}
    </div>
  );
}
