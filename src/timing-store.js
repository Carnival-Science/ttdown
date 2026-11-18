/* TimingStore: how a teardown's tracked timing is saved and read back.
 *
 * A fresh analysis carries the tracker's beats and downbeats as a NON-ENUMERABLE `grid` (so they never leak into serialization by
 * accident). Saving a teardown used to drop them, so a reopened teardown could only offer a constant-tempo fallback. This module is the
 * one place that decides what is persisted and how it is validated when read. It is shared by every consumer (the current page and
 * the future Svelte application) and has no DOM, no storage and no TimeMap dependency: callers do the actual reading and writing.
 *
 * Saved record  =  the analysis result as before  +  one additive field:
 *   timing: {
 *     v: 1,                                  timing schema version
 *     source: "tracker",                     where the beats came from
 *     engine: "dp-tracker",                  the analyzer's own label for the grid
 *     beats: [seconds],  downbeats: [seconds],
 *     meter: { beatsPerBar: 4, status: "assumed", source: "analyzer-assumption" },
 *     basis: { bpm, barSec, firstDown, duration }   what the tracker measured; kept when the user later corrects the tempo
 *   }
 * User timing corrections live in the record's own `timingCorrections` list ({ type, from, to, source: "user", at }), never inside
 * the measurement, so the original detection is always recoverable.
 *
 * NEVER persisted: the decoded audio buffer (`__buf`), the audio URL, derived rendering data, TimeMap instances. A TimeMap is rebuilt
 * from the beats on read. Records without `timing` (everything saved before this existed) stay valid and use the labelled fallback.
 * Storage keys, document ids and every existing field are untouched.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TimingStore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const VERSION = 1, MAX_BEATS = 30000, MAX_SECONDS = 36000;
  const isNum = v => typeof v === "number" && Number.isFinite(v);
  const increasing = a => { for (let i = 1; i < a.length; i++) if (!(a[i] > a[i - 1])) return false; return true; };

  /** Validate a `timing` block. Returns { ok, status, reason, grid }. status: "tracked" | "invalid" | "newer-version". Never throws. */
  function check(t) {
    const bad = reason => ({ ok: false, status: "invalid", reason, grid: null });
    try {
      if (!t || typeof t !== "object" || Array.isArray(t)) return bad("not-an-object");
      if (!Number.isInteger(t.v) || t.v < 1) return bad("no-version");
      if (t.v > VERSION) return { ok: false, status: "newer-version", reason: "written by a newer version (" + t.v + ")", grid: null };
      if (!Array.isArray(t.beats) || t.beats.length < 2) return bad("too-few-beats");
      if (t.beats.length > MAX_BEATS) return bad("too-many-beats");
      if (!t.beats.every(isNum) || !increasing(t.beats)) return bad("beats-not-increasing-numbers");
      if (t.beats[0] < -1 || t.beats[t.beats.length - 1] > MAX_SECONDS) return bad("beats-out-of-range");
      const d = Array.isArray(t.downbeats) ? t.downbeats : null;
      if (!d || !d.every(isNum) || !increasing(d)) return bad("downbeats-not-increasing-numbers");
      const set = new Set(t.beats); if (!d.every(x => set.has(x))) return bad("downbeat-not-a-tracked-beat");
      if (!t.meter || !Number.isInteger(t.meter.beatsPerBar) || t.meter.beatsPerBar < 1 || t.meter.beatsPerBar > 16 || typeof t.meter.status !== "string") return bad("bad-meter");
      const b = t.basis; if (!b || !isNum(b.duration) || b.duration <= 0 || !isNum(b.bpm) || b.bpm <= 0 || !isNum(b.barSec) || b.barSec <= 0 || !isNum(b.firstDown)) return bad("bad-basis");
      if (t.beats[t.beats.length - 1] > b.duration + 5) return bad("beats-past-the-end-of-the-audio");
      return { ok: true, status: "tracked", reason: null, grid: { source: typeof t.engine === "string" ? t.engine : "dp-tracker", beats: t.beats.slice(), downbeats: d.slice() } };
    } catch (e) { return bad("unreadable"); }
  }

  function build(a, basis) {
    const g = a.grid;
    return { v: VERSION, source: "tracker", engine: g.source || "dp-tracker", beats: g.beats.slice(), downbeats: g.downbeats.slice(),
      meter: { beatsPerBar: 4, status: "assumed", source: "analyzer-assumption" },
      basis: basis || { bpm: a.bpm, barSec: a.barSec, firstDown: a.firstDown, duration: a.duration } };
  }
  function gridOk(g) { return !!g && Array.isArray(g.beats) && Array.isArray(g.downbeats) && g.beats.length >= 2; }

  /**
   * The object to write to storage for analysis `a`: its own enumerable fields (so never the non-enumerable grid or the decoded buffer)
   * plus `timing`. If `a` has a live grid, `timing` is built from it, keeping an earlier `basis` (the original measurement) when one
   * exists. If it has no grid but carries a `timing` block (loaded earlier, unreadable here or written by a newer version), that
   * block is passed through untouched rather than discarded. Without either, the record simply has no `timing`.
   */
  function forStorage(a) {
    const rec = Object.assign({}, a);
    if (gridOk(a.grid)) { const prev = a.timing && check(a.timing).ok ? a.timing.basis : null; rec.timing = build(a, prev); }
    // no live grid: any `timing` the record already carries (unreadable here, or from a newer version) was copied above and is left untouched
    delete rec.__buf; delete rec.grid;
    return rec;
  }
  /** Before the first user correction of a fresh analysis: remember what the tracker measured (live `timing`, original basis). */
  function ensure(a) { if (!a.timing && gridOk(a.grid)) a.timing = build(a); return a; }
  /** After reading a record: if it has valid timing, attach the non-enumerable `grid` the page expects. Returns { status, reason }. */
  function attach(record) {
    if (!record || typeof record !== "object") return { status: "none", reason: null };
    if (record.timing === undefined) return { status: "none", reason: null };
    const c = check(record.timing);
    if (c.ok) { try { Object.defineProperty(record, "grid", { value: c.grid, enumerable: false, configurable: true, writable: true }); } catch (e) {} }
    return { status: c.status, reason: c.reason };
  }
  /** Bytes the record would take as JSON (for diagnostics and the quota path). */
  const size = rec => { try { return JSON.stringify(rec).length; } catch (e) { return Infinity; } };

  return { VERSION, MAX_BEATS, check, forStorage, ensure, attach, size };
});
