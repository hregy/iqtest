import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getToken, setToken, clearToken, ApiError } from "../api";
import { AdminVouchers } from "../admin/AdminVouchers";
import { AdminScores } from "../admin/AdminScores";
import { AdminQuestions } from "../admin/AdminQuestions";
import { AdminSettings } from "../admin/AdminSettings";

type Tab = "vouchers" | "scores" | "questions" | "settings";

export function Admin() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("vouchers");
  const [adminVoucher, setAdminVoucher] = useState("");

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api.admin
      .me()
      .then((r) => {
        setAdminVoucher(r.adminVoucher);
        setAuthed(true);
      })
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="screen center"><div className="spinner" /></div>;
  if (!authed) return <Login onAuthed={(av) => { setAdminVoucher(av); setAuthed(true); }} />;

  return (
    <div className="admin">
      <header className="admin-top">
        <h1>Admin</h1>
        <div className="admin-top-right">
          <Link className="link" to="/">View site →</Link>
          <button className="btn small ghost" onClick={() => { clearToken(); setAuthed(false); }}>
            Log out
          </button>
        </div>
      </header>

      <nav className="admin-tabs">
        {(["vouchers", "scores", "questions", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            className={"tab" + (tab === t ? " active" : "")}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <div className="admin-body">
        {tab === "vouchers" && <AdminVouchers adminVoucher={adminVoucher} />}
        {tab === "scores" && <AdminScores />}
        {tab === "questions" && <AdminQuestions />}
        {tab === "settings" && <AdminSettings />}
      </div>
    </div>
  );
}

function Login({ onAuthed }: { onAuthed: (adminVoucher: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { token } = await api.admin.login(password);
      setToken(token);
      const me = await api.admin.me();
      onAuthed(me.adminVoucher);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed.");
      setBusy(false);
    }
  };

  return (
    <div className="screen start">
      <div className="brand">IQ</div>
      <h1>Admin Login</h1>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "…" : "Log in"}</button>
      </form>
      <Link className="link" to="/">← Back to site</Link>
    </div>
  );
}
