import { useEffect, useState } from "react";

/**
 * Best-effort anti-cheat measures for the web.
 *
 * IMPORTANT: A browser CANNOT truly block OS-level screenshots or screen
 * recording. These are *deterrents*: they make casual copying/capturing
 * harder and let the app react (blur + warn) when the page loses focus,
 * which is when most capture/lookup attempts happen.
 *
 * Returns `obscured` = true when the tab is hidden or the window is blurred,
 * so the UI can hide question content behind a warning overlay.
 */
export function useAntiCheat(enabled: boolean): boolean {
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const block = (e: Event) => {
      e.preventDefault();
      return false;
    };

    const onVisibility = () => setObscured(document.visibilityState !== "visible");
    const onBlur = () => setObscured(true);
    const onFocus = () => setObscured(document.visibilityState !== "visible");

    // Prevent copy / cut / paste / context menu / drag / text selection.
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("selectstart", block);

    // React to focus loss (screenshot apps, tab switching, app switching).
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    // Block common save/screenshot/devtools keyboard shortcuts (best effort).
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const shouldBlock =
        k === "printscreen" ||
        ((e.ctrlKey || e.metaKey) && ["s", "p", "c", "u"].includes(k)) ||
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k));
      if (shouldBlock) {
        e.preventDefault();
        // PrintScreen fires on keyup with the shot already taken; blur as a hint.
        if (k === "printscreen") setObscured(true);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [enabled]);

  return obscured;
}
