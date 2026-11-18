/* TimeMap: the one authoritative musical time model.
 *
 * Converts between audio time (seconds) and musical position, and records HOW each part of that mapping is known.
 * Pure data and arithmetic: no DOM, no audio APIs, no dependency on the analyzer. Loads in Node (require) and in the
 * page (classic <script>, global `TimeMap`), so it works from file:// as well as a server.
 *
 * Musical coordinate. `beat` (q) is a float number of beats from bar 1 beat 1 (q = 0). Integer q's sit on tracked
 * beats; positions between beats are linearly interpolated, so the map follows tempo drift and tempo changes.
 * Beats before the anchor downbeat (a pickup) have q < 0. `bar` is 0-based (bar 0 is bar "1" in the UI); a pickup
 * lies in bar -1.
 *
 * Provenance. Every beat carries a `source`:
 *   "measured"      from the beat tracker
 *   "user"          placed or confirmed by the user
 *   "fallback-grid" synthesized from one constant BPM and a first downbeat (e.g. a saved result with no tracked
 *                   beats). Never reported as measured.
 * Positions outside the tracked range are extrapolated from the nearest beats and flagged `extrapolated: true`.
 *
 * Meter has a status: "measured" | "assumed" (the analyzer hard-codes 4/4) | "user" | "ambiguous" | "unsupported".
 * With "ambiguous" or "unsupported" meter, or an unknown downbeat, there is no bar layer: bar/beatInBar are null
 * and bars() is empty, instead of forcing a 4/4 reading.
 *
 * TimeMap objects are immutable. Corrections return a new map, keep the original in `corrections` (with
 * source "user"), and change `fingerprint()`, so a consumer that stored the fingerprint it computed from can tell
 * its results are stale.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TimeMap = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SCHEMA = "timemap/1";
  const MEASURED = "measured", USER = "user", FALLBACK = "fallback-grid";
  // Provisional thresholds. Chosen from reasoning, NOT tuned or calibrated on data: see docs/TIMEMAP.md.
  const DEFAULTS = Object.freeze({
    tempoWindow: 4,          // beats each side for the local tempo median
    constantTolerance: 0.03, // local tempo within 3 % of the median everywhere => "constant"
    changeTolerance: 0.04,   // a tempo segment ends when the local tempo leaves ±4 % of the segment's own tempo
    changeMinBeats: 8,       // ...for at least this many consecutive beats
    snapFraction: 0.5,       // a downbeat must lie within this fraction of a beat interval of a tracked beat
    gridTolerance: 0.02      // export needs ONE tempo to reproduce every tracked beat within 20 ms (a bit under a third of the ±70 ms beat tolerance)
  });

  class TimeMapError extends Error {
    constructor(code, message) { super(message); this.name = "TimeMapError"; this.code = code; }
  }
  const fail = (code, msg) => { throw new TimeMapError(code, msg); };
  const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const isNum = v => typeof v === "number" && Number.isFinite(v);

  // Tempo (BPM) of beats lo..hi from the least-squares slope of beat time against beat index. The tracker places beats on a
  // coarse frame grid (about 11.6 ms), so single intervals alternate between neighbouring frame counts and their median
  // can be biased by about 1 %; a fit over many beats is not.
  function lsBpm(T, lo, hi) {
    const n = hi - lo + 1; if (n < 2) return NaN;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = lo; i <= hi; i++) { const x = i - lo, y = T[i]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    return 60 / ((n * sxy - sx * sy) / (n * sxx - sx * sx));
  }
  function nearestIndex(ts, t) { // ts sorted ascending
    let lo = 0, hi = ts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
    return Math.abs(ts[lo] - t) <= Math.abs(ts[hi] - t) ? lo : hi;
  }

  class TimeMapImpl {
    constructor(s) {
      this.schema = SCHEMA;
      this.duration = s.duration;
      this.t = s.t; this.src = s.src;               // beat times (s), per-beat source
      this.anchor = s.anchor;                        // beat index that is bar 0 beat 1, or null when the downbeat is unknown
      this.downbeat = s.downbeat;                    // { status: "measured"|"user"|"unknown", ... }
      this.meter = s.meter;                          // { beatsPerBar|null, status, note? }
      this.tempoHypotheses = s.tempoHypotheses;      // alternatives, each { bpm, role, score:null, calibrated:false }
      this.source = s.source;                        // "tracker" | "fallback-grid" | "restored"
      this.corrections = s.corrections;              // user corrections, oldest first, each { type, from, to, source:"user", at }
      this.settings = s.settings;
      this.warnings = Object.freeze((s.warnings || []).slice());
      this.origin = s.origin || null;                // the map as first built, before any user correction (null on an uncorrected map)
      this._cache = {};                              // memoised derived values; the only mutable part
      Object.freeze(this.t); Object.freeze(this.src); Object.freeze(this.corrections); Object.freeze(this);
    }

    /* ---- structure ---- */
    get beatCount() { return this.t.length; }
    get beatsPerBar() { return this.hasBars ? this.meter.beatsPerBar : null; }
    /** True when bar numbers are defined: a supported meter and a known downbeat. */
    get hasBars() { return this.anchor != null && this.meter.beatsPerBar > 0 && this.meter.status !== "ambiguous" && this.meter.status !== "unsupported"; }
    get measured() { return this.source === "tracker" && this.src.every(s => s !== FALLBACK); }

    _edge(side) { // beat interval used to extrapolate before the first / after the last beat
      const k = Math.min(8, this.t.length - 1), iv = [];
      if (side < 0) for (let i = 0; i < k; i++) iv.push(this.t[i + 1] - this.t[i]);
      else for (let i = this.t.length - 1; i > this.t.length - 1 - k; i--) iv.push(this.t[i] - this.t[i - 1]);
      return median(iv);
    }
    _q0() { return this.anchor == null ? 0 : this.anchor; } // beat index mapped to q = 0

    /* ---- conversion ---- */
    /** Audio time (s) -> beat coordinate q (float). */
    timeToBeat(t) {
      if (!isNum(t)) fail("bad-time", "time must be a finite number");
      const T = this.t, n = T.length, q0 = this._q0();
      if (t < T[0]) return -q0 + (t - T[0]) / this._edge(-1);
      if (t >= T[n - 1]) return n - 1 - q0 + (t - T[n - 1]) / this._edge(1);
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
      return lo - q0 + (t - T[lo]) / (T[lo + 1] - T[lo]);
    }
    /** Beat coordinate q -> audio time (s). Exact inverse of timeToBeat. */
    beatToTime(q) {
      if (!isNum(q)) fail("bad-beat", "beat must be a finite number");
      const T = this.t, n = T.length, x = q + this._q0();
      if (x < 0) return T[0] + x * this._edge(-1);
      if (x >= n - 1) return T[n - 1] + (x - (n - 1)) * this._edge(1);
      const i = Math.floor(x); return T[i] + (x - i) * (T[i + 1] - T[i]);
    }
    /** Full musical position at audio time t, with how it is known. */
    position(t) {
      const q = this.timeToBeat(t), T = this.t, extrapolated = t < T[0] || t >= T[T.length - 1];
      const out = { t, beat: q, bar: null, beatInBar: null, extrapolated, source: "extrapolated" };
      if (this.hasBars) { const n = this.meter.beatsPerBar, bar = Math.floor(q / n); out.bar = bar; out.beatInBar = q - bar * n + 1; }
      if (!extrapolated) {
        const i = Math.min(T.length - 2, Math.max(0, Math.floor(q + this._q0()))), a = this.src[i], b = this.src[i + 1];
        out.source = a === FALLBACK || b === FALLBACK ? FALLBACK : a === USER || b === USER ? USER : MEASURED;
      }
      return out;
    }
    /** Start time (s) of 0-based bar `bar` (negative for a pickup bar). Null when there is no bar layer. */
    barStart(bar) { return this.hasBars ? this.beatToTime(bar * this.meter.beatsPerBar) : null; }
    /** Bars that overlap [0, duration]: { bar, start, end, extrapolated }. Empty without a bar layer. */
    bars() {
      if (!this.hasBars) return [];
      const n = this.meter.beatsPerBar, first = Math.floor(this.timeToBeat(0) / n), out = [];
      for (let b = first; ; b++) {
        const start = this.beatToTime(b * n); if (start >= this.duration) break;
        const end = this.beatToTime((b + 1) * n);
        out.push({ bar: b, start, end, extrapolated: start < this.t[0] || end > this.t[this.t.length - 1] });
      }
      return out;
    }
    /** Snap t to a subdivision of the beat (default 16ths) and report the signed deviation, so quantizing is explicit
     *  and the groove (the deviation) is never discarded. */
    quantize(t, perBeat = 4) {
      const q = this.timeToBeat(t), qs = Math.round(q * perBeat) / perBeat, ts = this.beatToTime(qs);
      return { beat: qs, t: ts, deviation: t - ts, deviationBeats: q - qs };
    }
    timeToSample(t, sampleRate) { return Math.round(t * sampleRate); }
    sampleToTime(n, sampleRate) { return n / sampleRate; }

    /* ---- tempo ---- */
    /** Local tempo (BPM) at each tracked beat: least-squares fit over up to `tempoWindow` beats either side. */
    tempoCurve() {
      if (this._cache.curve) return this._cache.curve;
      const T = this.t, w = this.settings.tempoWindow;
      return (this._cache.curve = T.map((_, i) => lsBpm(T, Math.max(0, i - w), Math.min(T.length - 1, i + w))));
    }
    tempoAt(t) { const i = nearestIndex(this.t, t); return this.tempoCurve()[i]; }
    /** Tempo summary: overall median, spread, whether it is constant, and tempo segments/changes. */
    tempo() {
      if (this._cache.tempo) return this._cache.tempo;
      const c = this.tempoCurve(), s = this.settings, bpm = median(c), dev = Math.max(...c.map(v => Math.abs(v / bpm - 1)));
      // greedy segmentation with hysteresis: a segment ends after `changeMinBeats` consecutive beats outside ±changeTolerance of its own tempo
      const T = this.t, segs = []; let st = 0, run = 0;
      const close = endExcl => segs.push({ startBeat: st, endBeat: endExcl - 1, start: T[st], end: T[endExcl - 1], bpm: endExcl - st >= 2 ? lsBpm(T, st, endExcl - 1) : c[st] });
      for (let i = 1; i < c.length; i++) {
        if (Math.abs(c[i] / median(c.slice(st, i)) - 1) > s.changeTolerance) {
          if (++run >= s.changeMinBeats) { const ns = i - run + 1; close(ns); st = ns; run = 0; }
        } else run = 0;
      }
      close(c.length);
      const changes = segs.slice(1).map((g, k) => ({ t: g.start, fromBpm: segs[k].bpm, toBpm: g.bpm, ratio: g.bpm / segs[k].bpm }));
      // How well ONE constant tempo reproduces the tracked beats: least-squares line through (index, time), largest residual.
      // Local tempo can look steady while a small steady drift still pushes a constant grid tens of ms off by the end.
      const n = T.length, per = 60 / lsBpm(T, 0, n - 1); let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += i; sy += T[i]; }
      const icpt = sy / n - per * (sx / n); let maxRes = 0; for (let i = 0; i < n; i++) maxRes = Math.max(maxRes, Math.abs(T[i] - (icpt + per * i)));
      return (this._cache.tempo = {
        bpm, min: Math.min(...c), max: Math.max(...c), maxDeviation: dev,
        constantGrid: { bpm: 60 / per, maxDeviationMs: maxRes * 1000, within: maxRes <= s.gridTolerance },
        isConstant: dev <= s.constantTolerance && changes.length === 0, segments: segs, changes,
        source: this.source === "tracker" ? "measured-from-beats" : this.source, hypotheses: this.tempoHypotheses
      });
    }

    /* ---- export gating ---- */
    /** Whether bar-based exports (MIDI, lined-up audio) are supported for this map, and with what caveats.
     *  Never returns eligible:true for an ambiguous/unsupported meter, unknown downbeat, or tempo change. */
    exportEligibility() {
      const reasons = [], caveats = [];
      if (!this.hasBars) reasons.push(this.anchor == null ? "downbeat-unknown" : "meter-" + this.meter.status);
      else if (this.meter.beatsPerBar !== 4) reasons.push("meter-not-4/4");
      const tp = this.tempo();
      if (tp.changes.length) reasons.push("tempo-changes");
      else if (!tp.isConstant) reasons.push("tempo-not-constant");
      else if (!tp.constantGrid.within) reasons.push("tempo-drift"); // steady-looking tempo, but one constant tempo misses tracked beats by more than the tolerance
      if (reasons.length) return { eligible: false, verified: false, reasons, caveats, constantGridDeviationMs: tp.constantGrid.maxDeviationMs };
      if (this.meter.status === "assumed") caveats.push("meter is assumed to be 4/4, not measured");
      const tail = this.duration - this.t[this.t.length - 1];
      if (tail > 8) caveats.push(`tracked beats end ${Math.round(tail)} s before the audio ends; the rest is extrapolated`);
      if (this.downbeat.status !== MEASURED && this.downbeat.status !== USER) caveats.push("downbeat not measured");
      if (!this.measured) caveats.push("grid is a fixed constant-tempo fallback, not tracked from the audio");
      const verified = this.measured && (this.meter.status === MEASURED || this.meter.status === USER) && (this.downbeat.status === MEASURED || this.downbeat.status === USER);
      return { eligible: true, verified, grade: this.measured ? "tracked-constant-tempo" : "legacy-fixed-grid", reasons, caveats };
    }

    /* ---- corrections (return a new TimeMap; the original is kept in `corrections`) ---- */
    _derive(patch, correction, opts) {
      const at = (opts && opts.at) || new Date().toISOString();
      return new TimeMapImpl(Object.assign({}, this._state(), patch, { origin: this.origin || this, corrections: this.corrections.concat([Object.assign({ source: USER, at }, correction)]) }));
    }
    _state() { return { duration: this.duration, t: this.t, src: this.src, anchor: this.anchor, downbeat: this.downbeat, meter: this.meter, tempoHypotheses: this.tempoHypotheses, source: this.source, corrections: this.corrections, settings: this.settings, warnings: this.warnings, origin: this.origin }; }
    /** Declare which tracked beat (nearest to t) is bar 1 beat 1. */
    withDownbeat(t, opts) {
      const i = nearestIndex(this.t, t);
      return this._derive({ anchor: i, downbeat: { status: USER, t: this.t[i] } }, { type: "downbeat", from: this.anchor == null ? null : this.t[this.anchor], to: this.t[i] }, opts);
    }
    /** Declare the meter (beats per bar). Keeps the anchor downbeat. */
    withMeter(beatsPerBar, opts) {
      if (!Number.isInteger(beatsPerBar) || beatsPerBar < 1 || beatsPerBar > 16) fail("bad-meter", "beatsPerBar must be an integer 1..16");
      return this._derive({ meter: { beatsPerBar, status: USER } }, { type: "meter", from: this.meter.beatsPerBar, to: beatsPerBar }, opts);
    }
    /** Declare that the track does not fit a single regular meter. Removes the bar layer; beats remain. */
    withMeterUnsupported(note, opts) {
      return this._derive({ meter: { beatsPerBar: null, status: "unsupported", note: note || "" } }, { type: "meter", from: this.meter.beatsPerBar, to: null, note: note || "" }, opts);
    }
    /** The map as first built, before any user correction (the machine's result is never overwritten). */
    original() { return this.origin || this; }

    /* ---- identity and serialization ---- */
    /** Short stable hash of everything a derived result depends on. Store it with derived results; if it differs, they are stale. */
    fingerprint() {
      if (this._cache.fp) return this._cache.fp;
      let h = 0x811c9dc5; const mix = str => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
      mix(SCHEMA + "|" + this.duration.toFixed(3) + "|" + this.anchor + "|" + this.meter.beatsPerBar + "|" + this.meter.status + "|" + this.src.join(","));
      for (const x of this.t) mix(x.toFixed(4) + ";");
      return (this._cache.fp = "tm1-" + h.toString(16).padStart(8, "0"));
    }
    toJSON() {
      return { schema: SCHEMA, duration: this.duration, source: this.source, beats: Array.from(this.t, (t, i) => ({ t, source: this.src[i] })), anchor: this.anchor, downbeat: this.downbeat, meter: this.meter,
        tempoHypotheses: this.tempoHypotheses, corrections: this.corrections, settings: this.settings, origin: this.origin ? this.origin.toJSON() : null, fingerprint: this.fingerprint() };
    }
  }

  /* ---- construction ---- */
  function build(o) {
    const settings = Object.assign({}, DEFAULTS, o.settings || {});
    return new TimeMapImpl({ duration: o.duration, t: o.t, src: o.src, anchor: o.anchor, downbeat: o.downbeat, meter: o.meter, tempoHypotheses: o.tempoHypotheses || [], source: o.source, corrections: [], settings, warnings: o.warnings });
  }
  function checkBeats(beats, duration) {
    if (!Array.isArray(beats) || beats.length < 2) fail("too-few-beats", "need at least 2 beats to define a time map");
    if (!beats.every(isNum)) fail("bad-beats", "beat times must be finite numbers");
    for (let i = 1; i < beats.length; i++) if (!(beats[i] > beats[i - 1])) fail("bad-beats", "beat times must be strictly increasing");
    if (!(isNum(duration) && duration > 0)) fail("bad-duration", "duration must be a positive number of seconds");
  }
  function octaveHypotheses(bpm) {
    return [{ bpm, role: "selected", score: null, calibrated: false }, { bpm: bpm * 2, role: "alternative-double", score: null, calibrated: false },
      { bpm: bpm / 2, role: "alternative-half", score: null, calibrated: false }];
  }

  /**
   * Build from tracked beats. `grid` = { beats: [s], downbeats: [s] } as the analyzer's `result.grid`.
   * opts: { duration (required), meter: { beatsPerBar, status } (default: unknown => ambiguous unless downbeat spacing is regular,
   *         then "measured"), source, settings }
   * Downbeats that don't sit on a tracked beat (within snapFraction of an interval) are ignored and reported in `warnings`.
   */
  function fromGrid(grid, opts) {
    opts = opts || {}; const beats = grid && grid.beats, duration = opts.duration;
    checkBeats(beats, duration);
    const settings = Object.assign({}, DEFAULTS, opts.settings || {}), warnings = [];
    const idx = [];
    for (const d of (grid.downbeats || [])) {
      const i = nearestIndex(beats, d), iv = i + 1 < beats.length ? beats[i + 1] - beats[i] : beats[i] - beats[i - 1];
      if (Math.abs(beats[i] - d) <= settings.snapFraction * iv) { if (idx[idx.length - 1] !== i) idx.push(i); } else warnings.push("downbeat at " + d + " s is not on a tracked beat; ignored");
    }
    let anchor = null, downbeat = { status: "unknown" }, meter;
    if (idx.length) { anchor = idx[0]; downbeat = { status: MEASURED, t: beats[anchor] }; }
    const gaps = idx.slice(1).map((v, k) => v - idx[k]), regular = gaps.length > 0 && gaps.every(g => g === gaps[0]);
    if (opts.meter && opts.meter.beatsPerBar > 0) {
      meter = { beatsPerBar: opts.meter.beatsPerBar, status: opts.meter.status || "assumed" };
      if (gaps.length && !gaps.every(g => g === meter.beatsPerBar)) { meter = { beatsPerBar: null, status: "ambiguous", note: "downbeat spacing " + [...new Set(gaps)].join("/") + " disagrees with the stated meter " + opts.meter.beatsPerBar }; }
    } else if (regular) meter = { beatsPerBar: gaps[0], status: MEASURED };
    else meter = { beatsPerBar: null, status: "ambiguous", note: gaps.length ? "downbeat spacing is irregular" : "meter not determined" };
    const bpm = lsBpm(beats, 0, beats.length - 1);
    return build({ duration, t: beats.slice(), src: beats.map(() => MEASURED), anchor, downbeat, meter, source: opts.source || "tracker", tempoHypotheses: opts.tempoHypotheses || octaveHypotheses(bpm), settings, warnings });
  }

  /**
   * Build a labelled constant-tempo fallback: beats at firstDownbeat + n * 60 / bpm covering [0, duration].
   * Use only when no tracked beats exist (e.g. a saved result). Beats are tagged "fallback-grid" and the map is never `measured`.
   */
  function fromConstantGrid(o) {
    if (!(isNum(o.bpm) && o.bpm > 0)) fail("bad-bpm", "bpm must be positive");
    if (!(isNum(o.firstDownbeat))) fail("bad-downbeat", "firstDownbeat must be a number of seconds");
    const q = 60 / o.bpm, n = o.beatsPerBar || 4, beats = [];
    // beats at firstDownbeat + k*q for every k that lands in [-q, duration + q]; k = 0 (the downbeat itself) is always kept, even before t = 0
    let anchor = 0; const k0 = Math.min(0, Math.ceil((-q - o.firstDownbeat) / q));
    for (let k = k0; o.firstDownbeat + k * q <= o.duration + q; k++) { if (k === 0) anchor = beats.length; beats.push(o.firstDownbeat + k * q); }
    checkBeats(beats, o.duration);
    return build({ duration: o.duration, t: beats, src: beats.map(() => FALLBACK), anchor, downbeat: { status: "unknown", note: "from a stored first-downbeat value, not tracked", t: o.firstDownbeat }, meter: { beatsPerBar: n, status: "assumed" },
      source: FALLBACK, tempoHypotheses: octaveHypotheses(o.bpm), settings: o.settings });
  }

  function fromJSON(j) {
    if (!j || j.schema !== SCHEMA) fail("bad-schema", "not a " + SCHEMA + " document");
    checkBeats(j.beats.map(b => b.t), j.duration);
    const m = new TimeMapImpl({ duration: j.duration, t: j.beats.map(b => b.t), src: j.beats.map(b => b.source), anchor: j.anchor, downbeat: j.downbeat, meter: j.meter, tempoHypotheses: j.tempoHypotheses || [],
      source: j.source, corrections: j.corrections || [], settings: Object.assign({}, DEFAULTS, j.settings || {}), origin: j.origin ? fromJSON(j.origin) : null });
    if (j.fingerprint && j.fingerprint !== m.fingerprint()) fail("fingerprint-mismatch", "stored fingerprint does not match content");
    return m;
  }

  return { SCHEMA, DEFAULTS, TimeMapError, fromGrid, fromConstantGrid, fromJSON };
});
