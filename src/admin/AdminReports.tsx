import { useEffect, useState } from "react";
import type { AttemptRow, AttemptReview } from "../types";
import { api } from "../api";
import { ReviewList } from "../components/ReviewList";
import { SessionReplay } from "../components/SessionReplay";

function fmtDur(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function AdminReports() {
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [open, setOpen] = useState<AttemptReview | null>(null);
  const [replayId, setReplayId] = useState<string | null>(null);
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
              <tr><th>Name</th><th>Human</th><th>Score</th><th>Location</th><th>Device</th><th>IP</th><th>When</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.flagged ? "dim" : ""}>
                  <td>
                    {r.name}{r.flagged && <span className="flag" title="flagged"> ⚠️</span>}
                    {r.bot_flags?.suspectedBot && <span title="suspected bot"> 🤖</span>}
                  </td>
                  <td>
                    {r.humanness == null ? "—" : (
                      <span style={{ fontWeight: 800, color: r.humanness >= 70 ? "var(--iq-safe)" : r.humanness >= 40 ? "var(--iq-warn)" : "var(--iq-danger)" }}>
                        {r.humanness}
                      </span>
                    )}
                  </td>
                  <td>{r.correct}/{r.total}</td>
                  <td className="small">
                    {r.country || "—"}{r.city ? `, ${r.city}` : ""}
                    {r.is_vpn && <span className="flag" title="VPN/proxy/datacenter"> VPN</span>}
                  </td>
                  <td className="small">{[r.browser, r.os].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="small"><code>{r.ip || "—"}</code></td>
                  <td className="small">{r.finished_at ? new Date(r.finished_at).toLocaleString() : "—"}</td>
                  <td><button className="btn tiny" onClick={() => view(r.id)}>Report</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="muted">No completed attempts yet.</td></tr>}
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
                  {typeof open.integrity?.humanness === "number" && (
                    <> · humanness <b>{Number(open.integrity.humanness)}/100</b></>
                  )}
                </div>
                {open.integrity?.reasons?.length ? (
                  <div className="flag-reasons">⚠️ {open.integrity.reasons.join(" · ")}</div>
                ) : null}
              </div>
              <div className="row gap">
                <button className="btn small" onClick={() => setReplayId(open.id)}>▶ Replay session</button>
                <button className="btn small ghost" onClick={() => setOpen(null)}>Close</button>
              </div>
            </div>

            {open.forensics && (
              <div className="forensics">
                <div className="fx-grid">
                  <div><span className="fx-k">IP</span><code>{open.forensics.ip || "—"}</code></div>
                  <div><span className="fx-k">Location</span>{[open.forensics.city, open.forensics.region, open.forensics.country].filter(Boolean).join(", ") || "—"}</div>
                  <div><span className="fx-k">ISP</span>{open.forensics.isp || "—"}</div>
                  <div><span className="fx-k">Browser</span>{open.forensics.browser || "—"}</div>
                  <div><span className="fx-k">OS</span>{open.forensics.os || "—"}</div>
                  <div><span className="fx-k">Device</span>{open.forensics.device || "—"}</div>
                  <div><span className="fx-k">Timezone</span>{(open.forensics.client?.timezone as string) || "—"}</div>
                  <div><span className="fx-k">Fingerprint</span><code>{open.forensics.fingerprint || "—"}</code></div>
                </div>
                {(open.forensics.isVpn || open.forensics.botFlags?.reasons?.length) ? (
                  <div className="flag-reasons">
                    {open.forensics.isVpn && "VPN/proxy/datacenter IP. "}
                    {open.forensics.botFlags?.reasons?.length ? `Bot signals: ${open.forensics.botFlags.reasons.join(", ")}.` : ""}
                  </div>
                ) : <div className="muted small" style={{ marginTop: 6 }}>No VPN or bot signals detected.</div>}
                {open.matches && open.matches.length > 0 && (
                  <div className="flag-reasons" style={{ marginTop: 6 }}>
                    Same IP/device also used by: {[...new Set(open.matches.map((m) => m.name))].join(", ")}
                  </div>
                )}
                <div className="muted small" style={{ marginTop: 6 }}>
                  Input during test: {Number(open.integrity?.moves) || 0} moves · {Number(open.integrity?.downs) || 0} taps ·{" "}
                  {Number(open.integrity?.keys) || 0} keys · {Number(open.integrity?.pathPx) || 0}px travel
                  {((Number(open.integrity?.moves) || 0) + (Number(open.integrity?.downs) || 0)) === 0 && open.review.some((r) => r.selectedIndex !== null)
                    ? " — ⚠️ no human movement"
                    : ""}
                </div>
              </div>
            )}

            <ReviewList review={open.review} />
          </div>
        </div>
      )}

      {replayId && <SessionReplay attemptId={replayId} onClose={() => setReplayId(null)} />}
    </div>
  );
}
