// Test hooks for the benchmark harness and browser tests. Installed ONLY in the bench build (`vite build --mode bench`):
// `__TEST_HOOKS__` is a build-time constant, so the production bundle does not contain this code at all.
//
// Contract, kept compatible with the legacy page (docs/SVELTE_MIGRATION.md §2.8). Status in this build:
//   window.TimeMap            canonical TimeMap module                                  M1 (now)
//   window.__ttdownTest       { route(), navigate(id) }                                  M1 (now)
//   window.__td, window.__sn  current result and songNotes(result)                       M3, when the engine runs here
//   window.__analysisStats    { checkpoints, aborted }                                   M3
//   window.__loop             active loop range (getter)                                 M3
//   result.grid / __buf       non-enumerable, read through gridOf/bufferOf accessors      M2/M3
// Decoded audio buffers are never exposed through a production global.
import { TimeMap } from "../timemap";
import type { RouteId } from "../routing/routes";

declare const __TEST_HOOKS__: boolean;
export const TEST_HOOKS: boolean = __TEST_HOOKS__;

export function installTestHooks(api: { route: () => RouteId; navigate: (id: RouteId) => void }): void {
  if (!__TEST_HOOKS__) return;
  const w = window as unknown as Record<string, unknown>;
  Object.defineProperty(w, "TimeMap", { value: TimeMap, configurable: true });
  Object.defineProperty(w, "__ttdownTest", { value: Object.freeze({ route: api.route, navigate: api.navigate }), configurable: true });
}
