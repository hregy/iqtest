import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  className?: string;
  alt?: string;
  onSettled: () => void; // fired once: on successful load, or after retries are exhausted
}

const MAX_RETRIES = 6; // ~0.4+0.8+1.6+3.2+5+5 ≈ 16s of retry budget

// An <img> that automatically retries on error (with backoff + cache-busting),
// so a transient server/network hiccup never leaves a question blank.
export function LoadedImage({ src, className, alt, onSettled }: Props) {
  const [display, setDisplay] = useState(src);
  const tries = useRef(0);
  const settled = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    tries.current = 0;
    settled.current = false;
    setDisplay(src);
    return () => window.clearTimeout(timer.current);
  }, [src]);

  const settle = () => {
    if (!settled.current) {
      settled.current = true;
      onSettled();
    }
  };

  const onError = () => {
    if (settled.current) return;
    if (tries.current < MAX_RETRIES) {
      tries.current += 1;
      const delay = Math.min(400 * 2 ** (tries.current - 1), 5000);
      timer.current = window.setTimeout(() => {
        const bust = `${src}${src.includes("?") ? "&" : "?"}retry=${tries.current}_${Date.now()}`;
        setDisplay(bust);
      }, delay);
    } else {
      settle(); // give up after retries so the test can proceed rather than hang
    }
  };

  return (
    <img
      className={className}
      src={display}
      alt={alt}
      draggable={false}
      onLoad={settle}
      onError={onError}
    />
  );
}
