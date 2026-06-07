import { useEffect, useState } from "react";
import type { Voucher } from "../types";
import { api } from "../api";

export function AdminVouchers({ adminVoucher }: { adminVoucher: string }) {
  const [list, setList] = useState<Voucher[]>([]);
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState("IQ");
  const [type, setType] = useState<"single" | "admin">("single");
  const [expiresAt, setExpiresAt] = useState("");
  const [created, setCreated] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => api.admin.vouchers().then(setList);
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const { created } = await api.admin.createVouchers(
        count, type, prefix, expiresAt || null
      );
      setCreated(created);
      await load();
    } finally {
      setBusy(false);
    }
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
        <div className="row gap">
          <label className="field sm"><span>Count</span>
            <input type="number" min={1} max={500} value={count}
              onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <label className="field sm"><span>Prefix</span>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={6} />
          </label>
          <label className="field sm"><span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as "single" | "admin")}>
              <option value="single">single-use</option>
              <option value="admin">admin (unlimited)</option>
            </select>
          </label>
          <label className="field sm"><span>Expires (optional)</span>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
          <button className="btn" disabled={busy} onClick={generate}>Generate</button>
        </div>

        {created.length > 0 && (
          <div className="created">
            <div className="row between">
              <strong>{created.length} created</strong>
              <button className="btn small" onClick={() => copy(created.join("\n"))}>Copy all</button>
            </div>
            <div className="code-list">
              {created.map((c) => <code key={c}>{c}</code>)}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>All vouchers ({list.length})</h3>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Code</th><th>Type</th><th>Status</th><th>Expires</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.code}>
                  <td><code>{v.code}</code></td>
                  <td>{v.type}</td>
                  <td>{v.type === "admin" ? "—" : v.used ? `used by ${v.used_by || "?"}` : "available"}</td>
                  <td>{v.expires_at ? new Date(v.expires_at).toLocaleDateString() : "—"}</td>
                  <td className="actions">
                    {v.used && v.type !== "admin" && (
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
