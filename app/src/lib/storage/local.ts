// localStorage access with the legacy page's exact semantics (index.html lsGet/lsSet): JSON, never throws, default on any
// failure. Same keys as the legacy page, so both apps share data on the same origin (docs/SVELTE_MIGRATION.md §8.2).
export const KEYS = {
  volume: "app_volume_v1", display: "display_v1", history: "teardown_history_v1", plan: "td_plan_v1", favs: "idea_favs_v1",
  journal: "beat_journal_v1", ear: "ear_training_v1", session: "td_session_v1", shelf: "sample_shelf_v1", progress: "fl_campaign_v1", log: "fl_log_v1",
} as const;
export function lsGet<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)) as T; } catch { return d; } }
export function lsSet(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked: callers that must not fail silently use lsTrySet */ } }
export function lsTrySet(k: string, v: unknown): boolean { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
