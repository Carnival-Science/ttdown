// localStorage access with the legacy page's exact semantics (index.html lsGet/lsSet): JSON, never throws, default on any failure.
// The v1 app keeps only two things in this browser: saved teardowns and the volume. The legacy page's other keys (journal, practice
// log, favourites, shelf, ...) are left untouched, so nothing a person saved there is ever deleted by this app.
export const KEYS = { volume: "app_volume_v1", history: "teardown_history_v1" } as const;
export function lsGet<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)) as T; } catch { return d; } }
export function lsSet(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked: callers that must not fail silently use lsTrySet */ } }
export function lsTrySet(k: string, v: unknown): boolean { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
