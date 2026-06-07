import { useEffect, useRef, useState } from "react";
import { api } from "../api";

export function SessionReplay({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { events } = await api.admin.attemptRecording(attemptId);
        if (!alive || !ref.current) return;
        if (!events || events.length < 2) { setState("none"); return; }
        const [{ default: rrwebPlayer }] = await Promise.all([
          import("rrweb-player"),
          import("rrweb-player/dist/style.css"),
        ]);
        if (!alive || !ref.current) return;
        ref.current.innerHTML = "";
        const Player = rrwebPlayer as unknown as new (cfg: { target: HTMLElement; props: Record<string, unknown> }) => unknown;
        new Player({
          target: ref.current,
          props: {
            events: events as unknown[],
            autoPlay: false,
            showController: true,
            width: Math.min(window.innerWidth - 80, 760),
            height: 460,
          },
        });
        setState("ready");
      } catch {
        if (alive) setState("none");
      }
    })();
    return () => { alive = false; };
  }, [attemptId]);

  return (
    <div className="report-modal" onClick={onClose}>
      <div className="report-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 840 }}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Session replay</h3>
          <button className="btn small ghost" onClick={onClose}>Close</button>
        </div>
        {state === "loading" && <div className="spinner" style={{ margin: "20px auto" }} />}
        {state === "none" && <p className="muted">No replay was recorded for this attempt.</p>}
        <div ref={ref} style={{ display: state === "ready" ? "block" : "none" }} />
      </div>
    </div>
  );
}
