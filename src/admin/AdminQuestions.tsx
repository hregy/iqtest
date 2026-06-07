import { useEffect, useRef, useState } from "react";
import type { AdminQuestion } from "../types";
import { api, ApiError } from "../api";

const LETTERS = ["A", "B", "C", "D"];
const PAGE_SIZE = 12;

export function AdminQuestions() {
  const [list, setList] = useState<AdminQuestion[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(0);
  const [bankFilter, setBankFilter] = useState<"all" | "classic" | "final">("all");
  const [levelFilter, setLevelFilter] = useState<"all" | "1" | "2" | "3" | "4" | "5">("all");
  const load = () => api.admin.questions().then(setList);
  useEffect(() => { load(); }, []);

  const del = async (q: AdminQuestion) => {
    if (confirm(`Delete question #${q.id}?`)) { await api.admin.deleteQuestion(q.id); load(); }
  };
  const toggleActive = async (q: AdminQuestion) => {
    await api.admin.patchQuestion(q.id, { active: !q.active }); load();
  };
  const setCorrect = async (q: AdminQuestion, idx: number) => {
    await api.admin.patchQuestion(q.id, { correctIndex: idx }); load();
  };

  const bankOf = (q: AdminQuestion) => q.bank || "classic";
  const filtered = list.filter((q) => {
    if (bankFilter !== "all" && bankOf(q) !== bankFilter) return false;
    if (bankFilter === "final" && levelFilter !== "all" && String(q.level) !== levelFilter) return false;
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const finalCount = list.filter((q) => bankOf(q) === "final").length;

  return (
    <div className="panel">
      <div className="card">
        <div className="row between">
          <h3>Questions ({list.length}) · active {list.filter((q) => q.active).length}</h3>
          <button className="btn small" onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? "Close" : "+ Add question"}
          </button>
        </div>
        <div className="row gap wrap" style={{ marginTop: 8 }}>
          <label className="field sm"><span>Pool</span>
            <select value={bankFilter} onChange={(e) => { setBankFilter(e.target.value as typeof bankFilter); setPage(0); }}>
              <option value="all">All ({list.length})</option>
              <option value="classic">Quick test ({list.length - finalCount})</option>
              <option value="final">Final IQ ({finalCount})</option>
            </select></label>
          {bankFilter === "final" && (
            <label className="field sm"><span>Level</span>
              <select value={levelFilter} onChange={(e) => { setLevelFilter(e.target.value as typeof levelFilter); setPage(0); }}>
                <option value="all">All levels</option>
                {[1, 2, 3, 4, 5].map((l) => <option key={l} value={String(l)}>Level {l}</option>)}
              </select></label>
          )}
          <span className="muted small" style={{ alignSelf: "center" }}>Showing {filtered.length}</span>
        </div>
        {showAdd && <AddQuestion onDone={() => { setShowAdd(false); load(); }} />}
      </div>

      <div className="card">
        <div className="q-grid">
          {shown.map((q) => (
            <div className={"q-card" + (q.active ? "" : " inactive")} key={q.id}>
              <div className="q-thumbs">
                {q.puzzleImage && <img src={q.puzzleImage} alt="" className="q-thumb puzzle" />}
                <div className="q-opt-thumbs">
                  {q.options.map((o, i) => (
                    <div className={"q-opt" + (i === q.correctIndex ? " correct" : "")} key={i}>
                      <span>{LETTERS[i]}</span>
                      {o.image ? <img src={o.image} alt="" /> : <em>{o.text}</em>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="q-meta">
                {(q.bank || "classic") === "final" && <span className="tag" style={{ background: "var(--iq-accent)", color: "#fff" }}>Final · L{q.level}</span>}
                <span className="tag">{q.type}</span>
                <span className="tag light">{q.category}</span>
                {q.prompt && <span className="q-prompt">{q.prompt}</span>}
                {q.promptFa && <span className="q-prompt" dir="rtl" lang="fa" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>{q.promptFa}</span>}
              </div>
              <div className="row gap wrap">
                <label className="small">Correct:&nbsp;
                  <select value={q.correctIndex} onChange={(e) => setCorrect(q, Number(e.target.value))}>
                    {LETTERS.map((l, i) => <option key={i} value={i}>{l}</option>)}
                  </select>
                </label>
                <button className="btn tiny" onClick={() => toggleActive(q)}>{q.active ? "Disable" : "Enable"}</button>
                <button className="btn tiny danger" onClick={() => del(q)}>Delete</button>
              </div>
            </div>
          ))}
        </div>

        {pageCount > 1 && (
          <div className="pager">
            <button className="btn small ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹ Prev</button>
            <span className="pager-info">Page {safePage + 1} of {pageCount}</span>
            <button className="btn small ghost" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next ›</button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddQuestion({ onDone }: { onDone: () => void }) {
  const [type, setType] = useState("custom");
  const [category, setCategory] = useState("pattern");
  const [prompt, setPrompt] = useState("");
  const [promptFa, setPromptFa] = useState("");
  const [optionKind, setOptionKind] = useState<"image" | "text">("image");
  const [correctIndex, setCorrectIndex] = useState(0);
  const [texts, setTexts] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const puzzleRef = useRef<HTMLInputElement>(null);
  const optRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const submit = async () => {
    setError("");
    const fd = new FormData();
    fd.append("type", type);
    fd.append("category", category);
    fd.append("prompt", prompt);
    fd.append("promptFa", promptFa);
    fd.append("optionKind", optionKind);
    fd.append("correctIndex", String(correctIndex));
    if (puzzleRef.current?.files?.[0]) fd.append("puzzle", puzzleRef.current.files[0]);
    if (optionKind === "image") {
      for (let i = 0; i < 4; i++) {
        const f = optRefs[i].current?.files?.[0];
        if (!f) { setError(`Please choose an image for option ${LETTERS[i]}.`); return; }
        fd.append(`opt${i}`, f);
      }
    } else {
      texts.forEach((t, i) => fd.append(`text${i}`, t));
    }
    setBusy(true);
    try {
      await api.admin.createQuestion(fd);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add question.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="add-q">
      <div className="row gap wrap">
        <label className="field sm"><span>Type</span>
          <input value={type} onChange={(e) => setType(e.target.value)} /></label>
        <label className="field sm"><span>Category</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} /></label>
      </div>
      <div className="row gap wrap">
        <label className="field"><span>Prompt — English</span>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Find the missing piece" /></label>
        <label className="field"><span>Prompt — Farsi (فارسی)</span>
          <input value={promptFa} dir="rtl" lang="fa" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}
            onChange={(e) => setPromptFa(e.target.value)} placeholder="مثلاً: قطعهٔ گمشده را پیدا کنید" /></label>
      </div>

      <div className="row gap wrap">
        <label className="field sm"><span>Puzzle image (optional)</span>
          <input type="file" accept="image/*" ref={puzzleRef} /></label>
        <label className="field sm"><span>Options are</span>
          <select value={optionKind} onChange={(e) => setOptionKind(e.target.value as "image" | "text")}>
            <option value="image">images</option>
            <option value="text">text</option>
          </select></label>
        <label className="field sm"><span>Correct answer</span>
          <select value={correctIndex} onChange={(e) => setCorrectIndex(Number(e.target.value))}>
            {LETTERS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select></label>
      </div>

      <div className="opt-inputs">
        {LETTERS.map((l, i) => (
          <div className={"opt-input" + (i === correctIndex ? " correct" : "")} key={i}>
            <span className="opt-letter">{l}{i === correctIndex ? " ✓" : ""}</span>
            {optionKind === "image" ? (
              <input type="file" accept="image/*" ref={optRefs[i]} />
            ) : (
              <input value={texts[i]} placeholder={`Option ${l}`}
                onChange={(e) => setTexts((t) => t.map((x, j) => (j === i ? e.target.value : x)))} />
            )}
          </div>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}
      <button className="btn" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save question"}</button>
    </div>
  );
}
