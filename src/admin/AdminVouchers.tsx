import { useEffect, useState } from "react";
import type { Voucher } from "../types";
import { api } from "../api";

const usesLabel = (v: Voucher) => {
  if (v.type === "admin") return "∞ master";
  const max = v.max_uses ?? 1;
  const used = v.uses ?? 0;
  return max === 0 ? `${used} / ∞` : `${used} / ${max}`;
};

export function AdminVouchers({ adminVoucher }: { adminVoucher: string }) {
  const [list, setList] = useState<Voucher[]>([]);
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState("IQ");
  const [uses, setUses] = useState<"single" | "double" | "unlimited">("single");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [created, setCreated] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => api.admin.vouchers().then(setList);
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const { created } = await api.admin.createVouchers(count, uses, prefix, expiresAt || null, note);
      setCreated(created);
      setNote("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const editNote = async (v: Voucher) => {
    const n = window.prompt("Assign this voucher to (name / note):", v.note || "");
    if (n != null) { await api.admin.setVoucherNote(v.code, n); load(); }
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  return (
    <div className="panel">
      <div className="card info-card">
        <div>
          <div className="muted small">Master voucher (no expiry, unlimited, not scored)</div>
          <code className="big-code">{adminVoucher}</code>
        </div>
        <button className="btn small" onClick={() => copy(adminVoucher)}>Copy</button>
      </div>

      <div className="card">
        <h3>Generate vouchers</h3>
        <div className="row gap wrap">
          <label className="field sm"><span>Count</span>
            <input type="number" min={1} max={500} value={count}
              onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <label className="field sm"><span>Prefix</span>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={6} />
          </label>
          <label className="field sm"><span>Uses</span>
            <select value={uses} onChange={(e) => setUses(e.target.value as typeof uses)}>
              <option value="single">single use</option>
              <option value="double">double use</option>
              <option value="unlimited">unlimited</option>
            </select>
          </label>
          <label className="field sm"><span>Expires (optional)</span>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
          <label className="field"><span>Assign to / note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80}
              placeholder="e.g. John Smith — Grade 10" />
          </label>
          <button className="btn" disabled={busy} onClick={generate}>Generate</button>
        </div>

        {created.length > 0 && (
          <div className="created">
            <div className="row between">
              <strong>{created.length} created{note ? "" : ""}</strong>
              <button className="btn small" onClick={() => copy(created.join("\n"))}>Copy all</button>
            </div>
            <div className="code-list">{created.map((c) => <code key={c}>{c}</code>)}</div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>All vouchers ({list.length})</h3>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Code</th><th>Assigned to</th><th>Uses</th><th>Status</th><th>Expires</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.code}>
                  <td><code>{v.code}</code></td>
                  <td>{v.note || <span className="muted">—</span>}</td>
                  <td className="iq-mono">{usesLabel(v)}</td>
                  <td>{v.type === "admin" ? "—" : v.used ? `used by ${v.used_by || "?"}` : "available"}</td>
                  <td>{v.expires_at ? new Date(v.expires_at).toLocaleDateString() : "—"}</td>
                  <td className="actions">
                    {v.type !== "admin" && (
                      <button className="btn tiny" onClick={() => editNote(v)}>Note</button>
                    )}
                    {(v.uses ?? 0) > 0 && v.type !== "admin" && (
                      <button className="btn tiny" onClick={() => api.admin.resetVoucher(v.code).then(load)}>Reset</button>
                    )}
                    <button className="btn tiny" onClick={() => copy(v.code)}>Copy</button>
                    {v.type !== "admin" && (
                      <button className="btn tiny danger" onClick={() => api.admin.deleteVoucher(v.code).then(load)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
