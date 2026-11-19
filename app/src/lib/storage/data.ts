// Saved teardowns (teardown_history_v1), with the persisted-timing contract (docs/PERSISTENCE.md). Same key, shape and limits as the
// legacy page, so both read each other's saves. Browser-only: no accounts, nothing leaves this device.
import { KEYS, lsGet, lsTrySet } from "./local";
import { TimingStore } from "../persistence/timing";
import type { AnalysisResult } from "../engine";

export function loadHist(): AnalysisResult[] {
  const list = lsGet<AnalysisResult[]>(KEYS.history, []);
  list.forEach(r => TimingStore.attach(r)); // saved tracked beats become the (non-enumerable) grid again
  return list;
}
/** Returns the user-facing note ("" when saved normally) and whether it is an error. Storage failures are never silent. */
export function saveHist(a: AnalysisResult): { note: string; bad: boolean } {
  const rest = lsGet<AnalysisResult[]>(KEYS.history, []).filter(x => x.title !== a.title || x.duration !== a.duration);
  let rec = TimingStore.forStorage(a), note = "", bad = false, ok = lsTrySet(KEYS.history, [rec].concat(rest).slice(0, 12));
  const r0 = rec as AnalysisResult & { chordRegions?: unknown };
  if (!ok && (rec.timing !== undefined || r0.chordRegions !== undefined)) {
    // the lean copy also leaves out the chord regions (the chords then reopen one per bar, from chords.bars)
    const lean = { ...r0 }; delete lean.timing; delete lean.chordRegions;
    if (lsTrySet(KEYS.history, [lean].concat(rest).slice(0, 12))) { ok = true; rec = lean; note = "Saved, but without its tracked beats or chord changes: this browser's storage is nearly full. It will reopen with a constant-tempo ruler and one chord per bar. Delete old teardowns to make room."; }
  }
  if (!ok) { note = "Couldn't save this teardown: this browser's storage is full. Your earlier saved teardowns were not changed. Delete some and try again."; bad = true; }
  return { note, bad };
}

/** Delete one saved teardown (same identity as a save: title and duration). Returns false when storage could not be written. */
export function deleteHist(a: AnalysisResult): boolean {
  const rest = lsGet<AnalysisResult[]>(KEYS.history, []).filter(x => x.title !== a.title || x.duration !== a.duration);
  return rest.length ? lsTrySet(KEYS.history, rest) : clearHist();
}
/** Delete every saved teardown. Saved teardowns hold no audio (it is never persisted), so removing the key removes everything. */
export function clearHist(): boolean { try { localStorage.removeItem(KEYS.history); return true; } catch { return false; } }
