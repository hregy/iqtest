import { useEffect, useRef, useState } from "react";
import type { Integrity } from "../types";

export interface IntegrityState {
  integrity: React.MutableRefObject<Integrity>;
  obscured: boolean; // tab hidden / window blurred
  fsLost: boolean; // not in fullscreen while the test is active
  enterFullscreen: () => Promise<void>;
}

/**
 * Tracks anti-cheat signals while `active`. The accumulated counters live in a
 * ref that the test sends to the server with each answer. Also blocks copy /
 * paste / context-menu and exposes focus-loss + fullscreen-exit state so the
 * UI can react (blur + warning overlay).
 */
export function useIntegrity(active: boolean): IntegrityState {
  const integrity = useRef<Integrity>({
    blur: 0, awayMs: 0, fsExits: 0, paste: 0, devtools: false,
    moves: 0, downs: 0, keys: 0, pathPx: 0,
  });
  const [obscured, setObscured] = useState(false);
  const [fsLost, setFsLost] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const baseline = useRef({ w: 0, h: 0 });
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      /* fullscreen may be blocked; not fatal */
    }
  };

  useEffect(() => {
    if (!active) return;
    baseline.current = {
      w: window.outerWidth - window.innerWidth,
      h: window.outerHeight - window.innerHeight,
    };

    const markHidden = () => {
      integrity.current.blur += 1;
      if (hiddenAt.current === null) hiddenAt.current = Date.now();
      setObscured(true);
    };
    const markVisible = () => {
      if (hiddenAt.current !== null) {
        integrity.current.awayMs += Date.now() - hiddenAt.current;
        hiddenAt.current = null;
      }
      if (document.visibilityState === "visible") setObscured(false);
    };

    const onVis = () => (document.visibilityState === "visible" ? markVisible() : markHidden());
    const onBlur = () => markHidden();
    const onFocus = () => markVisible();

    const block = (e: Event) => e.preventDefault();
    const onPaste = (e: Event) => {
      integrity.current.paste += 1;
      e.preventDefault();
    };

    const onFsChange = () => {
      const lost = !document.fullscreenElement;
      if (lost) integrity.current.fsExits += 1;
      setFsLost(lost);
    };

    // DevTools heuristic: a large, NEW gap between outer/inner size (vs the
    // baseline captured at start) usually means a docked devtools panel.
    const checkDevtools = () => {
      const dw = window.outerWidth - window.innerWidth - baseline.current.w;
      const dh = window.outerHeight - window.innerHeight - baseline.current.h;
      if (dw > 160 || dh > 160) {
        integrity.current.devtools = true;
        setObscured(true);
      }
    };
    const devtoolsTimer = window.setInterval(checkDevtools, 1000);

    // Behavioral biometrics: real humans move a pointer / touch and tap.
    const onMove = (e: PointerEvent | MouseEvent) => {
      integrity.current.moves += 1;
      const x = e.clientX, y = e.clientY;
      if (lastPos.current) {
        integrity.current.pathPx += Math.round(Math.hypot(x - lastPos.current.x, y - lastPos.current.y));
      }
      lastPos.current = { x, y };
    };
    const onDown = () => { integrity.current.downs += 1; };
    const onKey = () => { integrity.current.keys += 1; };
    // A genuine tap/click is trusted; a scripted .click() is not — count only
    // trusted ones as a fallback input signal (robust on any mobile browser).
    const onClick = (e: Event) => { if (e.isTrusted) integrity.current.downs += 1; };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("touchmove", onMove as EventListener, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    window.addEventListener("keydown", onKey, { passive: true });

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", onPaste);
    document.addEventListener("dragstart", block);
    document.addEventListener("fullscreenchange", onFsChange);

    return () => {
      window.clearInterval(devtoolsTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("touchmove", onMove as EventListener);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [active]);

  return { integrity, obscured, fsLost, enterFullscreen };
}
