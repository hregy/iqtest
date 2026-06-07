import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ScoreRow } from "../types";
import { api } from "../api";

export function Scoreboard() {
  const [rows, setRows] = useState<ScoreRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.scoreboard().then(setRows).catch(() => setError("Could not load scoreboard."));
  }, []);

  return (
    <div className="screen scoreboard">
      <h1>Scoreboard</h1>
      {error && <p className="form-error">{error}</p>}
      {!rows && !error && <div className="spinner" />}

      {rows && rows.length === 0 && <p className="muted">No scores yet — be the first!</p>}

      {rows && rows.length > 0 && (
        <div className="board">
          <div className="board-head">
            <span>#</span>
            <span>Name</span>
            <span>Score</span>
            <span>%</span>
          </div>
          {rows.map((r) => (
            <div className={"board-row" + (r.rank <= 3 ? " top" : "")} key={r.rank}>
              <span className="rank">{r.rank}</span>
              <span className="bname">{r.name}</span>
              <span>{r.correct}/{r.total}</span>
              <span>{r.percent}%</span>
            </div>
          ))}
        </div>
      )}

      <Link className="btn primary" to="/">Take the test</Link>
    </div>
  );
}
