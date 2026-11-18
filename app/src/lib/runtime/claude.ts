// Optional Claude-artifact runtime (window.claude.use). Every capability may be absent: the app must work without any of
// them (founder decision: their absence never blocks cutover). Each call resolves to null instead of throwing.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Cap = "db" | "user" | "downloads" | "sample" | "dictation";
interface ClaudeRuntime { use(cap: Cap): Promise<any> }
const rt = (): ClaudeRuntime | null => { const c = (globalThis as any).claude; return c && typeof c.use === "function" ? c : null; };
// A capability that was obtained is kept for the page's lifetime. A failure or an absent capability is NOT kept: the next call tries
// again, so a transient failure (a runtime that was not ready yet, a dropped connection) cannot disable a feature until reload.
// Concurrent calls share one attempt.
const have = new Map<Cap, any>(), pending = new Map<Cap, Promise<any>>();
export function useCap(cap: Cap): Promise<any> {
  if (have.has(cap)) return Promise.resolve(have.get(cap));
  const running = pending.get(cap); if (running) return running;
  const p = (async () => {
    try { const r = rt(); const v = r ? await r.use(cap) : null; if (v) have.set(cap, v); return v || null; }
    catch { return null; }
    finally { pending.delete(cap); }
  })();
  pending.set(cap, p); return p;
}
export const hasRuntime = () => rt() !== null;
