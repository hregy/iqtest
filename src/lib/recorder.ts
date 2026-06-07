// Records a full session (DOM + input) for admin replay. rrweb is loaded
// lazily so it isn't in the initial bundle.
let events: unknown[] = [];
let stopFn: (() => void) | undefined;
const MAX_EVENTS = 6000;

export async function startRecording() {
  events = [];
  try {
    const { record } = await import("rrweb");
    stopFn = record({
      emit(e) {
        events.push(e);
        if (events.length > MAX_EVENTS) events.shift();
      },
      sampling: { mousemove: 50, scroll: 150, input: "last" },
      recordCanvas: false,
    });
  } catch {
    /* recording is best-effort */
  }
}

export function stopRecording(): unknown[] {
  try { stopFn?.(); } catch { /* ignore */ }
  stopFn = undefined;
  return events;
}
