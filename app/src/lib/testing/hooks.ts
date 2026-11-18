// Test hooks for the benchmark harness and browser tests. Installed ONLY in the bench build (`vite build --mode bench`):
// `__TEST_HOOKS__` is a build-time constant, so the production bundle does not contain this code.
//
// The legacy page's contract (docs/SVELTE_MIGRATION.md §2.8), served the same way so bench/run.js and the browser tests read both apps alike:
//   window.__td               the result on screen (with its non-enumerable grid and __buf, exactly as the engine made it);
//                             assigned once per teardown shown, as the legacy render() did
//   window.__sn(a)            songNotes(a): the exported note times
//   window.__analysisStats    { checkpoints, aborted } from the engine
//   window.__loop             active loop range (defined by the player tools)
//   window.TimeMap            canonical TimeMap module
// Production builds expose none of these (no decoded audio through globals).
import { TimeMap } from "../timemap";
import { engine } from "../engine";
import { domain } from "../domain";

declare const __TEST_HOOKS__: boolean;
export const TEST_HOOKS: boolean = __TEST_HOOKS__;

export function installTestHooks(): void {
  if (!__TEST_HOOKS__) return;
  const w = window as unknown as Record<string, unknown>;
  const def = (k: string, v: PropertyDescriptor) => Object.defineProperty(w, k, { configurable: true, ...v });
  def("TimeMap", { value: TimeMap });
  def("__td", { value: undefined, writable: true }); // assigned by the teardown state each time a teardown is shown
  def("__sn", { value: (a: unknown) => domain.songNotes(a) });
  def("__analysisStats", { value: engine.ANALYSIS_STATS });
}
