// Optional Claude-artifact runtime (window.claude.use). Every capability may be absent: the app must work without any of
// them (founder decision: their absence never blocks cutover). Each call resolves to null instead of throwing.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Cap = "db" | "user" | "downloads" | "sample" | "dictation";
interface ClaudeRuntime { use(cap: Cap): Promise<any> }
const rt = (): ClaudeRuntime | null => { const c = (globalThis as any).claude; return c && typeof c.use === "function" ? c : null; };
const cache = new Map<Cap, Promise<any>>();
export function useCap(cap: Cap): Promise<any> {
  if (!cache.has(cap)) cache.set(cap, (async () => { try { const r = rt(); return r ? await r.use(cap) : null; } catch { return null; } })());
  return cache.get(cap)!;
}
export const hasRuntime = () => rt() !== null;
