import { useEffect, useRef, useState } from "react";

/**
 * Per-question countdown. Restarts whenever `key` changes (i.e. a new
 * question) and is paused while `active` is false. Calls `onExpire` exactly
 * once when it reaches zero.
 */
export function useCountdown(
  seconds: number,
  key: string | number,
  active: boolean,
  onExpire: () => void
) {
  const [remaining, setRemaining] = useState(seconds);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const firedRef = useRef(false);

  useEffect(() => {
    // reset for a new question
    setRemaining(seconds);
    firedRef.current = false;
  }, [key, seconds]);

  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const left = Math.max(0, seconds - elapsed);
      setRemaining(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        clearInterval(id);
        onExpireRef.current();
      }
    }, 100);
    return () => clearInterval(id);
  }, [key, seconds, active]);

  return remaining;
}
