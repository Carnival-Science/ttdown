/* TimeMap: the one authoritative musical time model.
 *
 * Converts between audio time (seconds) and musical position, and records HOW each part of that mapping is known.
 * Pure data and arithmetic: no DOM, no audio APIs, no dependency on the analyzer. Loads in Node (require) and in the
 * page (classic <script>, global `TimeMap`), so it works from file:// as well as a server.
 *
 * Musical coordinate. `beat` (q) is a float number of TRACKED beats from bar 1 beat 1 (q = 0). Integer q's sit on tracked
 * beats; positions between beats are linearly interpolated, so the map follows tempo drift and tempo changes.
 * Beats before the anchor downbeat (a pickup) have q < 0. `bar` is 0-based (bar 0 is bar "1" in the UI); a pickup
 * lies in bar -1.
 *
 * Provenance. Every beat carries a `source`:
 *   "measured"      from the beat tracker
 *   "user"          placed or confirmed by the user
 *   "fallback-grid" synthesized from one constant BPM and a first downbeat (e.g. a saved result with no tracked
 *                   beats). Never reported as measured.
 * Positions outside the tracked range are extrapolated from the nearest beats and flagged `extrapolated: true`;
 * coverage() separates the measured span from the extrapolated seconds.
 *
 * Meter. { beatsPerBar, numerator, denominator, beatUnit, status, note }.
 *   beatsPerBar is the number of TRACKED PULSES per bar. That is not the time signature: a 6/8 groove can be tracked as 2
 *   (dotted-quarter) or 6 (eighth) pulses per bar, and 12/8 as 4. numerator/denominator/beatUnit are null unless stated by a
 *   person, because the tracker cannot know them; the fields exist so that compound meters can be represented later
 *   without changing the shape. Bar exports currently accept only 4 pulses per bar with no contradicting denominator.
 *   status: "measured" | "assumed" (the analyzer hard-codes 4) | "user" | "ambiguous" | "unsupported".
 *   With "ambiguous"/"unsupported" meter, or an unknown downbeat, there is no bar layer: bar/beatInBar are null and
 *   bars() is empty, instead of forcing a 4/4 reading.
 *
 * Immutability. TimeMap objects, and everything reachable from their public fields, are deeply frozen. Memoised values
 * live outside the object (a WeakMap). Corrections return a new map, keep the original in `origin`, record the correction
 * with source "user", and change `fingerprint()`, so a consumer that stored the fingerprint it computed from can tell its
 * results are stale. The fingerprint covers everything that changes a derived result: beats and their sources, anchor,
 * downbeat and meter status, source, duration and the settings.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TimeMap = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SCHEMA = "timemap/1";
  const MEASURED = "measured", USER = "user", FALLBACK = "fallback-grid";
  // Provisional thresholds. Chosen from reasoning, NOT tuned or calibrated on real recordings: see docs/TIMEMAP.md.
  const DEFAULTS = Object.freeze({
    tempoWindow: 4,             // beats each side for the local tempo fit
    constantTolerance: 0.03,    // local tempo within 3 % of the median everywhere => "constant"
    changeTolerance: 0.04,      // a tempo segment ends when the local tempo leaves ±4 % of the segment's own tempo
    changeMinBeats: 8,          // ...for at least this many consecutive beats
    snapFraction: 0.5,          // a downbeat must lie within this fraction of a beat interval of a tracked beat
    gridTolerance: 0.02,        // export: ONE tempo, pinned at the bar-one anchor, must reproduce every tracked beat within 20 ms
    maxExtrapolatedSeconds: 8   // export: more untracked audio than this at either end is called out
  });

  class TimeMapError extends Error {
    constructor(code, message) { super(message); this.name = "TimeMapError"; this.code = code; }
  }
  const fail = (code, msg) => { throw new TimeMapError(code, msg); };
  const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const isNum = v => typeof v === "number" && Number.isFinite(v);
  const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  function deepFreeze(o) { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }
  const CACHE = new WeakMap(); // memoised derived values, kept off the (frozen) instances
  const memo = o => { let c = CACHE.get(o); if (!c) CACHE.set(o, c = {}); return c; };

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
  function normMeter(m) {
    m = m || {};
    const n = m.beatsPerBar == null ? null : m.beatsPerBar;
    return { beatsPerBar: n, numerator: m.numerator == null ? null : m.numerator, denominator: m.denominator == null ? null : m.denominator,
      beatUnit: m.beatUnit == null ? null : m.beatUnit, status: m.status || "ambiguous", note: m.note || "" };
  }
  function hash(str) { // two independent 32-bit hashes => 64 bits
    let a = 0x811c9dc5, b = 0x9747b28c;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a ^= c; a = Math.imul(a, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x5bd1e995) >>> 0; b ^= b >>> 15; }
    return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
  }

  class TimeMapImpl {
    constructor(s) {
      this.schema = SCHEMA;
      this.duration = s.duration;
      this.t = deepFreeze(Array.from(s.t));            // beat times (s)
      this.src = deepFreeze(Array.from(s.src));        // per-beat source
      this.anchor = s.anchor;                          // beat index that is bar 0 beat 1, or null when the downbeat is unknown
      this.downbeat = deepFreeze(clone(s.downbeat));   // { status: "measured"|"user"|"unknown", t?, note? }
      this.meter = deepFreeze(normMeter(s.meter));
      this.tempoHypotheses = deepFreeze(clone(s.tempoHypotheses) || []); // alternatives, each { bpm, role, score:null, calibrated:false }
      this.source = s.source;                          // "tracker" | "fallback-grid" | "restored"
      this.corrections = deepFreeze(clone(s.corrections) || []); // user corrections, oldest first
      this.settings = deepFreeze(Object.assign({}, DEFAULTS, clone(s.settings) || {}));
      this.warnings = deepFreeze(Array.from(s.warnings || []));
      this.origin = s.origin || null;                  // the map as first built, before any user correction (null on an uncorrected map)
      Object.freeze(this);
    }

    /* ---- structure ---- */
    get beatCount() { return this.t.length; }
    get beatsPerBar() { return this.hasBars ? this.meter.beatsPerBar : null; }
    /** True when bar numbers are defined: a supported meter and a known downbeat. */
    get hasBars() { return this.anchor != null && this.meter.beatsPerBar > 0 && this.meter.status !== "ambiguous" && this.meter.status !== "unsupported"; }
    /** True only when the beats came from the tracker (or the user) and none is a synthesized fallback. */
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
    /** Full musical position at audio time t, with how it is known. Only times strictly outside the tracked span are extrapolated. */
    position(t) {
      const q = this.timeToBeat(t), T = this.t, extrapolated = t < T[0] || t > T[T.length - 1];
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

    /* ---- coverage ---- */
    /** What part of the audio is backed by tracked (or user-placed) beats, and how much is extrapolated.
     *  A fallback grid has no measured beats: measuredStart/End are null and all of the audio counts as extrapolated. */
    coverage() {
      const c = memo(this); if (c.cov) return c.cov;
      const T = this.t, idx = []; this.src.forEach((s, i) => { if (s === MEASURED || s === USER) idx.push(i); });
      if (!idx.length) return (c.cov = deepFreeze({ measuredStart: null, measuredEnd: null, measuredSeconds: 0, extrapolatedBefore: 0, extrapolatedAfter: 0, extrapolatedSeconds: this.duration, fractionMeasured: 0 }));
      const start = T[idx[0]], end = T[idx[idx.length - 1]], before = Math.max(0, start), after = Math.max(0, this.duration - end);
      return (c.cov = deepFreeze({ measuredStart: start, measuredEnd: end, measuredSeconds: end - start, extrapolatedBefore: before, extrapolatedAfter: after, extrapolatedSeconds: before + after,
        fractionMeasured: Math.min(1, (end - start) / this.duration) }));
    }

    /* ---- tempo ---- */
    /** Local tempo (BPM) at each tracked beat: least-squares fit over up to `tempoWindow` beats either side. */
    tempoCurve() {
      const c = memo(this); if (c.curve) return c.curve;
      const T = this.t, w = this.settings.tempoWindow;
      return (c.curve = deepFreeze(T.map((_, i) => lsBpm(T, Math.max(0, i - w), Math.min(T.length - 1, i + w)))));
    }
    tempoAt(t) { const i = nearestIndex(this.t, t); return this.tempoCurve()[i]; }
    /** Tempo summary: overall median, spread, whether local tempo is steady, and tempo segments/changes. */
    tempo() {
      const cc = memo(this); if (cc.tempo) return cc.tempo;
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
      return (cc.tempo = deepFreeze({
        bpm, min: Math.min(...c), max: Math.max(...c), maxDeviation: dev,
        isConstant: dev <= s.constantTolerance && changes.length === 0, segments: segs, changes,
        source: this.source === "tracker" ? "measured-from-beats" : this.source, hypotheses: this.tempoHypotheses
      }));
    }

    /* ---- the grid an exporter would write ---- */
    /** The single-tempo grid used by exports: bar 1 beat 1 sits exactly on the tracked (or user-confirmed) downbeat, and the
     *  tempo is the least-squares slope through that pinned anchor. Reports how far every TRACKED beat is from it (max and
     *  RMS), which is the error the exported file would actually carry. `interceptShiftMs` is what pinning the anchor costs
     *  against a free least-squares line. Null while the downbeat is unknown. */
    exportGrid() {
      const c = memo(this); if (c.eg !== undefined) return c.eg;
      if (this.anchor == null) return (c.eg = null);
      const T = this.t, n = T.length, a = this.anchor;
      let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { const x = i - a; sxy += (T[i] - T[a]) * x; sxx += x * x; }
      const period = sxx > 0 ? sxy / sxx : this._edge(1);
      let mx = 0, ss = 0; for (let i = 0; i < n; i++) { const r = T[i] - (T[a] + (i - a) * period); mx = Math.max(mx, Math.abs(r)); ss += r * r; }
      const per0 = 60 / lsBpm(T, 0, n - 1); let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += i; sy += T[i]; }
      const freeAtAnchor = sy / n - per0 * (sx / n) + per0 * a;
      return (c.eg = deepFreeze({ bpm: 60 / period, period, anchorBeatIndex: a, anchorTime: T[a], beats: n, maxDeviationMs: mx * 1000, rmsDeviationMs: Math.sqrt(ss / n) * 1000,
        interceptShiftMs: Math.abs(T[a] - freeAtAnchor) * 1000, toleranceMs: this.settings.gridTolerance * 1000, within: mx <= this.settings.gridTolerance }));
    }
    /** Time (s) of beat coordinate q on the exported single-tempo grid. */
    exportGridTime(q) { const g = this.exportGrid(); if (!g) fail("no-downbeat", "the downbeat is unknown, so there is no export grid"); return g.anchorTime + q * g.period; }

    /* ---- export gating ---- */
    /** Whether bar-based exports (MIDI, lined-up audio) are supported, and what is missing.
     *  state "allowed"            tracked grid, steady tempo, meter and downbeat confirmed (by a person, or measured meter + user downbeat)
     *  state "needs-confirmation" a stable grid whose meter and/or first downbeat are only the analyzer's assumption: `needs` lists them
     *  state "refused"            ambiguous/unsupported/non-4-pulse meter, tempo changes, unsteady tempo, or drift beyond the grid tolerance: `reasons`
     *  `exportRange` is the span of whole bars inside the tracked beats (the whole audio for a fallback grid); audio outside it is extrapolated
     *  and is not part of an export. Exports that need no musical grid are not governed by this. */
    exportEligibility() {
      const c = memo(this); if (c.elig) return c.elig;
      const reasons = [], needs = [], caveats = [], m = this.meter, n = m.beatsPerBar;
      if (m.status === "ambiguous" || m.status === "unsupported") reasons.push("meter-" + m.status);
      else if (n != null && (n !== 4 || (m.denominator != null && m.denominator !== 4))) reasons.push("meter-not-4/4");
      const tp = this.tempo();
      if (tp.changes.length) reasons.push("tempo-changes"); else if (!tp.isConstant) reasons.push("tempo-not-constant");
      const eg = this.exportGrid();
      if (!reasons.length && eg && !eg.within) reasons.push("tempo-drift"); // steady-looking tempo, but one tempo misses tracked beats by more than the tolerance
      if (this.anchor == null || this.downbeat.status !== USER) needs.push("downbeat");
      if (m.status !== USER && m.status !== MEASURED) needs.push("meter");
      const cov = this.coverage();
      if (!this.measured) caveats.push("grid is a fixed constant-tempo fallback, not tracked from the audio");
      else if (cov.extrapolatedSeconds > this.settings.maxExtrapolatedSeconds) caveats.push(`${Math.round(cov.extrapolatedSeconds)} s of the audio lie outside the tracked beats; an export covers only the tracked span`);
      let exportRange = null;
      if (this.hasBars) {
        const T = this.t, lo = cov.measuredStart != null ? cov.measuredStart : T[0], hi = cov.measuredEnd != null ? cov.measuredEnd : T[T.length - 1];
        const b0 = Math.ceil(this.timeToBeat(lo) / n - 1e-9) || 0, b1 = (Math.floor(this.timeToBeat(hi) / n + 1e-9) - 1) || 0; // `|| 0` turns -0 into 0
        if (b1 >= b0) exportRange = { startBar: b0, endBar: b1, start: this.beatToTime(b0 * n), end: this.beatToTime((b1 + 1) * n) };
      }
      const state = reasons.length ? "refused" : needs.length ? "needs-confirmation" : "allowed";
      return (c.elig = deepFreeze({ state, eligible: state === "allowed", reasons, needs, caveats, exportRange, exportGrid: eg, coverage: cov }));
    }

    /* ---- corrections (return a new TimeMap; the original is kept in `origin`) ---- */
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
    /** The user has listened and agrees the current first downbeat is right. Keeps its position, records the confirmation. */
    confirmDownbeat(opts) {
      if (this.anchor == null) fail("no-downbeat", "there is no downbeat to confirm; set one with withDownbeat()");
      return this._derive({ downbeat: { status: USER, t: this.t[this.anchor] } }, { type: "downbeat-confirm", from: this.t[this.anchor], to: this.t[this.anchor] }, opts);
    }
    /** Declare the meter. A number is beats (tracked pulses) per bar; an object may also state numerator, denominator, beatUnit. Keeps the anchor. */
    withMeter(spec, opts) {
      const o = typeof spec === "number" ? { beatsPerBar: spec } : spec || {}, n = o.beatsPerBar;
      if (!Number.isInteger(n) || n < 1 || n > 16) fail("bad-meter", "beatsPerBar must be an integer 1..16");
      return this._derive({ meter: { beatsPerBar: n, numerator: o.numerator, denominator: o.denominator, beatUnit: o.beatUnit, status: USER, note: o.note } }, { type: "meter", from: this.meter.beatsPerBar, to: n }, opts);
    }
    /** The user agrees with the current meter. Keeps it, marks it user-confirmed. */
    confirmMeter(opts) {
      if (this.meter.beatsPerBar == null) fail("no-meter", "there is no meter to confirm; set one with withMeter()");
      return this._derive({ meter: Object.assign({}, this.meter, { status: USER }) }, { type: "meter-confirm", from: this.meter.beatsPerBar, to: this.meter.beatsPerBar }, opts);
    }
    /** Declare that the track does not fit a single regular meter. Removes the bar layer; beats remain. */
    withMeterUnsupported(note, opts) {
      return this._derive({ meter: { beatsPerBar: null, status: "unsupported", note: note || "" } }, { type: "meter", from: this.meter.beatsPerBar, to: null, note: note || "" }, opts);
    }
    /** The map as first built, before any user correction (the machine's result is never overwritten). */
    original() { return this.origin || this; }

    /* ---- identity and serialization ---- */
    /** 64-bit hash of everything a derived result depends on (see the header). Store it with derived results; if it differs, they are stale. */
    fingerprint() {
      const c = memo(this); if (c.fp) return c.fp;
      const st = this.settings, sig = [SCHEMA, this.duration.toFixed(3), this.source, this.anchor, this.downbeat.status, JSON.stringify(this.meter),
        Object.keys(st).sort().map(k => k + "=" + st[k]).join(","), this.src.join(","), Array.from(this.t, x => x.toFixed(4)).join(";")].join("|");
      return (c.fp = "tm1-" + hash(sig));
    }
    toJSON() {
      return clone({ schema: SCHEMA, duration: this.duration, source: this.source, beats: Array.from(this.t, (t, i) => ({ t, source: this.src[i] })), anchor: this.anchor, downbeat: this.downbeat, meter: this.meter,
        tempoHypotheses: this.tempoHypotheses, corrections: this.corrections, settings: this.settings, origin: this.origin ? this.origin.toJSON() : null, fingerprint: this.fingerprint() });
    }
  }

  /* ---- construction ---- */
  function build(o) {
    return new TimeMapImpl({ duration: o.duration, t: o.t, src: o.src, anchor: o.anchor, downbeat: o.downbeat, meter: o.meter, tempoHypotheses: o.tempoHypotheses || [], source: o.source, corrections: [], settings: o.settings, warnings: o.warnings });
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
   * opts: { duration (required), meter: { beatsPerBar, status } (default: ambiguous unless downbeat spacing is regular,
   *         then "measured"), source, settings, tempoHypotheses }
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
    return build({ duration, t: beats, src: beats.map(() => MEASURED), anchor, downbeat, meter, source: opts.source || "tracker", tempoHypotheses: opts.tempoHypotheses || octaveHypotheses(bpm), settings, warnings });
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
      source: j.source, corrections: j.corrections || [], settings: j.settings, origin: j.origin ? fromJSON(j.origin) : null });
    if (j.fingerprint && j.fingerprint !== m.fingerprint()) fail("fingerprint-mismatch", "stored fingerprint does not match content");
    return m;
  }

  return { SCHEMA, DEFAULTS, TimeMapError, fromGrid, fromConstantGrid, fromJSON };
});
