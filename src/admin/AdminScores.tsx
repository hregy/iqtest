import { useEffect, useState } from "react";
import type { AdminScore } from "../types";
import { api } from "../api";

export function AdminScores() {
  const [list, setList] = useState<AdminScore[]>([]);
  const load = () => api.admin.scores().then(setList);
  useEffect(() => { load(); }, []);

  const editName = async (s: AdminScore) => {
    const name = window.prompt("Name:", s.name);
    if (name != null) { await api.admin.patchScore(s.id, { name }); load(); }
  };
  const editCorrect = async (s: AdminScore) => {
    const v = window.prompt(`Correct (0-${s.total}):`, String(s.correct));
    if (v != null) { await api.admin.patchScore(s.id, { correct: Number(v) }); load(); }
  };
  const toggleExcluded = async (s: AdminScore) => {
    await api.admin.patchScore(s.id, { excluded: !s.excluded }); load();
  };
  const del = async (s: AdminScore) => {
    if (confirm(`Delete ${s.name}'s score?`)) { await api.admin.deleteScore(s.id); load(); }
  };
  const clearAll = async () => {
    if (confirm("Delete ALL scores? This cannot be undone.")) { await api.admin.clearScores(); load(); }
  };

  return (
    <div className="panel">
      <div className="card">
        <div className="row between">
          <h3>Scores ({list.length})</h3>
          <div className="row gap">
            <button className="btn small" onClick={async () => { await api.admin.recalcScores(); load(); }}>
              Recalculate
            </button>
            <button className="btn small danger" onClick={clearAll}>Clear all</button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Score</th><th>%</th><th>Voucher</th><th>When</th><th>Shown</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className={s.excluded ? "dim" : ""}>
                  <td>
                    {s.name}
                    {s.flagged && (
                      <span className="flag" title={(s.integrity?.reasons || []).join("; ") || "flagged"}>
                        {" "}⚠️
                      </span>
                    )}
                    {s.flagged && s.integrity?.reasons?.length ? (
                      <div className="flag-reasons">{s.integrity.reasons.join(" · ")}</div>
                    ) : null}
                  </td>
                  <td>{s.correct}/{s.total}</td>
                  <td>{s.percent}%</td>
                  <td><code className="small">{s.voucher_code || "—"}</code></td>
                  <td className="small">{new Date(s.created_at).toLocaleString()}</td>
                  <td>{s.excluded ? "hidden" : "yes"}</td>
                  <td className="actions">
                    <button className="btn tiny" onClick={() => editName(s)}>Name</button>
                    <button className="btn tiny" onClick={() => editCorrect(s)}>Score</button>
                    <button className="btn tiny" onClick={() => toggleExcluded(s)}>{s.excluded ? "Show" : "Hide"}</button>
                    <button className="btn tiny danger" onClick={() => del(s)}>Del</button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="muted">No scores yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
