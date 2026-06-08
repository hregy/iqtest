import { useEffect, useState } from "react";
import type { AntiCheatResponse, IdentityCluster } from "../types";
import { api } from "../api";

function fmtDate(s: string) {
  return new Date(s).toLocaleString();
}

export function AdminAntiCheat() {
  const [data, setData] = useState<AntiCheatResponse | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const load = () => api.admin.antiCheat().then(setData).catch(() => setNote("Could not load anti-cheat data."));
  useEffect(() => { load(); }, []);

  const excludeCluster = async (c: IdentityCluster) => {
    const fps = c.fingerprints.filter(Boolean);
    if (!fps.length) { setNote("This identity has no device fingerprint to exclude (older attempts). Use the Scores tab."); return; }
    if (!confirm(`Exclude every score from this device (${c.names.join(", ")}) from the public board?`)) return;
    setBusy(c.id);
    try {
      let n = 0;
      for (const fp of fps) n += (await api.admin.excludeDevice(fp, true)).updated;
      setNote(`Excluded ${n} score(s) from the board.`);
      await load();
    } finally { setBusy(""); }
  };

  if (!data) return <div className="panel"><div className="card">{note || <div className="spinner" style={{ margin: "10px auto" }} />}</div></div>;

  const s = data.summary;
  return (
    <div className="panel">
      <div className="card">
        <h3>Anti-cheat</h3>
        <p className="muted small">
          Attempts grouped into likely-same-person identities by shared device fingerprint, or
          same IP + device. One device used under several names is the strongest cheat signal.
        </p>
        <div className="ac-stats">
          <div className="ac-stat"><b>{s.attempts}</b><span>attempts</span></div>
          <div className="ac-stat"><b>{s.distinctDevices}</b><span>devices</span></div>
          <div className="ac-stat"><b>{s.identityClusters}</b><span>linked groups</span></div>
          <div className="ac-stat warn"><b>{s.multiNameClusters}</b><span>multi-name</span></div>
          <div className="ac-stat warn"><b>{s.flagged}</b><span>flagged</span></div>
          <div className="ac-stat"><b>{s.onVpn}</b><span>on VPN</span></div>
        </div>
        {note && <p className="muted small" style={{ marginTop: 8 }}>{note}</p>}
      </div>

      {data.sharedNames.length > 0 && (
        <div className="card">
          <h4 style={{ margin: "0 0 6px" }}>Same name, multiple devices</h4>
          <p className="muted small">A name used from more than one device — possible sharing or impersonation.</p>
          <div className="row gap wrap" style={{ marginTop: 8 }}>
            {data.sharedNames.map((n) => (
              <span className="tag light" key={n.name}>{n.name} · {n.devices} devices</span>
            ))}
          </div>
        </div>
      )}

      {data.clusters.length === 0 && (
        <div className="card"><p className="muted">No linked identities yet — every completed attempt looks like a distinct device.</p></div>
      )}

      {data.clusters.map((c) => {
        const isOpen = !!open[c.id];
        return (
          <div className={"card ac-cluster" + (c.distinctNames >= 2 && !c.likelyCollision ? " suspect" : "")} key={c.id}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div className="row gap" style={{ alignItems: "center", flexWrap: "wrap" }}>
                  <span className={"ac-badge " + c.confidence}>
                    {c.likelyCollision ? "Likely different people" : c.confidence === "strong" ? "Strong match" : "Likely match"}
                  </span>
                  {c.distinctNames >= 2 && <span className="ac-badge warn">{c.distinctNames} names</span>}
                  {c.flaggedCount > 0 && <span className="ac-badge warn">{c.flaggedCount} flagged</span>}
                  {c.vpn && <span className="ac-badge">VPN</span>}
                </div>
                <div style={{ marginTop: 6 }}>
                  {c.names.map((n) => <span className="tag" key={n} style={{ marginRight: 4 }}>{n}</span>)}
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>
                  {c.evidence.join(" · ")} · {c.attempts} attempts · best {c.bestCorrect}/{c.bestTotal}
                </div>
                <div className="muted small">
                  {c.devices.join(" / ") || "—"} · {c.locations.join(" / ") || "—"} · {fmtDate(c.firstSeen)} → {fmtDate(c.lastSeen)}
                </div>
              </div>
              <div className="row gap" style={{ flexShrink: 0 }}>
                <button className="btn tiny" onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen }))}>{isOpen ? "Hide" : "Details"}</button>
                <button className="btn tiny danger" disabled={busy === c.id} onClick={() => excludeCluster(c)}>
                  {busy === c.id ? "…" : "Exclude from board"}
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="table-scroll" style={{ marginTop: 10 }}>
                <table className="table">
                  <thead><tr><th>Name</th><th>Score</th><th>Test</th><th>Human</th><th>Device</th><th>IP</th><th>Location</th><th>When</th></tr></thead>
                  <tbody>
                    {c.members.map((m) => (
                      <tr key={m.id} className={m.flagged ? "dim" : ""}>
                        <td>{m.name}{m.practice && <span className="muted small"> (practice)</span>}</td>
                        <td>{m.correct}/{m.total}</td>
                        <td className="small">{m.testType}</td>
                        <td>{m.humanness == null ? "—" : m.humanness}</td>
                        <td className="small">{m.device || "—"}</td>
                        <td className="small"><code>{m.ip || "—"}</code>{m.isVpn && <span className="flag" title="VPN"> VPN</span>}</td>
                        <td className="small">{m.location || "—"}</td>
                        <td className="small">{fmtDate(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
