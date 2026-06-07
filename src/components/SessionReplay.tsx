import { useEffect, useRef, useState } from "react";
import { api } from "../api";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function SessionReplay({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const replayer = useRef<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { events } = await api.admin.attemptRecording(attemptId);
        if (!alive || !ref.current) return;
        if (!Array.isArray(events) || events.length < 2) { setState("none"); return; }

        const [{ Replayer }] = await Promise.all([
          import("rrweb"),
          import("rrweb/dist/style.css"),
        ]);
        if (!alive || !ref.current) return;

        // Make the container visible BEFORE constructing the Replayer, otherwise
        // rrweb mounts into a display:none element and renders a blank frame.
        setState("ready");
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (!alive || !ref.current) return;

        // recorded viewport (from the Meta event) -> scale to fit the modal
        const meta: any = (events as any[]).find((e) => e.type === 4);
        const w = meta?.data?.width || 400;
        const h = meta?.data?.height || 760;
        const maxW = Math.min(window.innerWidth - 100, 720);
        const scale = Math.min(1, maxW / w);

        ref.current.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.style.width = `${w}px`;
        wrap.style.height = `${h}px`;
        wrap.style.transformOrigin = "top left";
        wrap.style.transform = `scale(${scale})`;
        ref.current.appendChild(wrap);
        ref.current.style.height = `${Math.round(h * scale)}px`;
        ref.current.style.overflow = "hidden";

        const r = new (Replayer as any)(events, { root: wrap, mouseTail: true, skipInactive: true });
        replayer.current = r;
        r.play();
        setPlaying(true);
      } catch {
        if (alive) setState("none");
      }
    })();
    return () => {
      alive = false;
      try { replayer.current?.pause?.(); } catch { /* ignore */ }
    };
  }, [attemptId]);

  const toggle = () => {
    const r = replayer.current;
    if (!r) return;
    if (playing) { r.pause(); setPlaying(false); }
    else { r.play(); setPlaying(true); }
  };
  const restart = () => {
    const r = replayer.current;
    if (!r) return;
    r.play(0);
    setPlaying(true);
  };

  return (
    <div className="report-modal" onClick={onClose}>
      <div className="report-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Session replay</h3>
          <div className="row gap">
            {state === "ready" && (
              <>
                <button className="btn small" onClick={toggle}>{playing ? "Pause" : "Play"}</button>
                <button className="btn small ghost" onClick={restart}>Restart</button>
              </>
            )}
            <button className="btn small ghost" onClick={onClose}>Close</button>
          </div>
        </div>
        {state === "loading" && <div className="spinner" style={{ margin: "24px auto" }} />}
        {state === "none" && (
          <p className="muted">No replay was recorded for this attempt (it was taken before session recording was enabled, or on an old cached page).</p>
        )}
        <div ref={ref} style={{ background: "#fff", borderRadius: 10, display: state === "ready" ? "block" : "none" }} />
      </div>
    </div>
  );
}
