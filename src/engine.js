/* Teardown analysis engine: decoding, tempo, beats, downbeat, drums, sections, key, chords, bass and hook.
 *
 * Moved out of index.html verbatim (migration M2, docs/SVELTE_MIGRATION.md) so the current page and the Svelte application run the
 * SAME analysis code. The only source change: the diagnostic counters are returned as ANALYSIS_STATS instead of being written to
 * window.__analysisStats here (the page assigns that global; the Svelte app exposes it only in its bench build).
 *
 * Framework-free: no UI, no storage. Needs a browser for decoding (OfflineAudioContext) and for reading a file's header duration
 * (an <audio> element). TimeMap is injected, never looked up implicitly, so a missing dependency fails loudly instead of quietly
 * dropping the tracked section times.
 *
 *   index.html   inlined between marker comments (npm run sync:timemap); creates the global TTEngine = createEngine({ TimeMap })
 *   Svelte app   import createEngine from "$engine"; createEngine({ TimeMap })
 *   Node         require("./src/engine.js") is the factory; the DSP helpers work, analyze() needs Web Audio
 *
 * Changing anything below changes analysis results: measure it against Version A (docs/BASELINE_A.md) like any analyzer change.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.TTEngine = factory({ TimeMap: root.TimeMap });
})(typeof self !== "undefined" ? self : this, function createEngine(deps) {
"use strict";
const TimeMap = deps && deps.TimeMap;
if (!TimeMap || typeof TimeMap.forAnalysis !== "function") throw new Error("Teardown engine: createEngine({ TimeMap }) needs the TimeMap module (src/timemap.js)");
/* ================= DSP ================= */
const fftCache = {};
function tables(n) {
  if (fftCache[n]) return fftCache[n];
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
  const win = new Float32Array(n); for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
  return (fftCache[n] = { rev, cos, sin, win, re: new Float32Array(n), im: new Float32Array(n) });
}
function mag(x, off, n, out) {
  const t = tables(n), re = t.re, im = t.im;
  for (let i = 0; i < n; i++) { const j = off + i; re[t.rev[i]] = j < x.length && j >= 0 ? x[j] * t.win[i] : 0; im[i] = 0; }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) for (let j = 0; j < half; j++) {
      const k = j * step, a = i + j, b = a + half;
      const tr = re[b] * t.cos[k] - im[b] * t.sin[k], ti = re[b] * t.sin[k] + im[b] * t.cos[k];
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}
const tick = () => new Promise(r => setTimeout(r, 0));
function detrend(env, w) {
  const out = new Float32Array(env.length); let s = 0, c = 0, lo = 0, hi = -1;
  for (let i = 0; i < env.length; i++) {
    while (hi < Math.min(env.length - 1, i + w)) { hi++; s += env[hi]; c++; }
    while (lo < i - w) { s -= env[lo]; lo++; c--; }
    out[i] = Math.max(0, env[i] - s / c);
  }
  return out;
}
function acfAt(e, maxLag) {
  const a = new Float32Array(maxLag + 1);
  for (let L = 0; L <= maxLag; L++) { let s = 0; for (let i = 0; i + L < e.length; i++) s += e[i] * e[i + L]; a[L] = s / (e.length - L); }
  const z = a[0] || 1; for (let L = 0; L <= maxLag; L++) a[L] /= z;
  return l => { const i = Math.floor(l), f = l - i; return i + 1 > maxLag ? 0 : a[i] * (1 - f) + a[i + 1] * f; };
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CAM_MAJ = { 0: "8B", 7: "9B", 2: "10B", 9: "11B", 4: "12B", 11: "1B", 6: "2B", 1: "3B", 8: "4B", 3: "5B", 10: "6B", 5: "7B" };
const CAM_MIN = { 9: "8A", 4: "9A", 11: "10A", 6: "11A", 1: "12A", 8: "1A", 3: "2A", 10: "3A", 5: "4A", 0: "5A", 7: "6A", 2: "7A" };
const PROF = [[5, 2, 3.5, 2, 4.5, 4, 2, 4.5, 2, 3.5, 1.5, 4], [5, 2, 3.5, 4.5, 2, 4, 2, 4.5, 3.5, 2, 1.5, 4]];
const PROF_K = [[6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]];
function corr(a, b) { const n = 12, ma = a.reduce((s, v) => s + v) / n, mb = b.reduce((s, v) => s + v) / n; let u = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { u += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return u / Math.sqrt(da * db || 1); }

/* ---- rough transcription: top-line hook (per 16th) and bass notes (per 8th) from the loudest section ---- */
function transcribe(x, SR, firstDown, barSec, sections, tune) {
  try {
    const sec = sections.find(s => s.label === "Drop" && s.bars >= 8) || sections.filter(s => s.label !== "Intro" && s.label !== "Outro").sort((p, q) => q.bars - p.bars)[0] || sections[0];
    const bars = Math.min(16, sec.bars - sec.bars % 4); if (bars < 4) return {};
    const t0 = firstDown + sec.startBar * barSec, stepSec = barSec / 16, reps = Math.floor(bars / 4);
    const run = (N, nSteps, stepLen, lo, hi, w, fLo, fHi, sub) => {
      const m = new Float32Array(N / 2), best = [], val = [], i0 = Math.max(2, Math.floor(fLo * N / SR)), i1 = Math.min(N / 2 - 2, Math.ceil(fHi * N / SR));
      for (let s = 0; s < nSteps; s++) {
        mag(x, Math.round((t0 + (s + 0.5) * stepLen) * SR - N / 2), N, m);
        // spectral peaks with interpolated frequency (much finer than one FFT bin, which matters for low bass notes)
        const P = []; for (let i = i0; i <= i1; i++) if (m[i] > m[i - 1] && m[i] >= m[i + 1]) { const a = Math.log(m[i - 1] + 1e-9), b = Math.log(m[i] + 1e-9), c = Math.log(m[i + 1] + 1e-9), d = a - 2 * b + c; P.push([(i + (d ? 0.5 * (a - c) / d : 0)) * SR / N, m[i]]); }
        const near = f => { let v = 0; for (const [pf, pv] of P) { const c = 1200 * Math.log2(pf / f); if (c > -90 && c < 90) { const q = pv * Math.exp(-(c / 40) * (c / 40)); if (q > v) v = q; } } return v; };
        let bm = -1, bs = 0;
        for (let n = lo; n <= hi; n++) { const f0 = 440 * Math.pow(2, (n - 69 + tune) / 12); let sal = 0; w.forEach((wt, h) => { sal += wt * near(f0 * (h + 1)); }); if (sub) { if (near(f0 / 2) > near(f0)) sal *= 0.5; sal *= 1 + 0.12 * (n - lo) / 12; } else if (near(f0) < 0.25 * sal / w[0]) sal *= 0.6; if (sal > bs) { bs = sal; bm = n; } }
        best.push(bm); val.push(bs);
      }
      const srt = val.slice().sort((p, q) => p - q), gate = 0.4 * (srt[Math.floor(srt.length * 0.75)] || 0);
      return best.map((n, i) => val[i] >= gate ? n : -1);
    };
    const foldNotes = (seq, per, unit) => {
      const out = [];
      for (let i = 0; i < per; i++) { const c = {}; let top = -1, tc = 0; for (let r = 0; r < reps; r++) { const v = seq[r * per + i]; c[v] = (c[v] || 0) + 1; if (c[v] > tc) { tc = c[v]; top = v; } } out.push(tc * 2 > reps || reps === 1 ? top : seq[i]); }
      const notes = []; out.forEach((n, i) => { const last = notes[notes.length - 1]; if (n < 0) return; if (last && last.midi === n && last.t + last.dur === i * unit && last.dur < 16) last.dur += unit; else notes.push({ t: i * unit, dur: unit, midi: n }); });
      return notes;
    };
    /* Bass at 16th-note resolution: find where each note starts from low-end onsets, then pick each note's pitch
       from the whole span it rings for (much steadier than one guess per 8th, and catches fast 808 re-hits). */
    const bass16 = () => {
      const N = 8192, lo = 24, hi = 47, w = [1, 0.8, 0.6, 0.4], nS = bars * 16, m = new Float32Array(N / 2), i0 = Math.max(2, Math.floor(28 * N / SR)), i1 = Math.ceil(520 * N / SR);
      const S = Array.from({ length: 64 }, () => new Float32Array(hi - lo + 1)), F = new Float32Array(64), E = new Float32Array(64);
      const N2 = 1024, m2 = new Float32Array(N2 / 2), b0 = Math.max(1, Math.floor(25 * N2 / SR)), b1 = Math.ceil(220 * N2 / SR); let prev = null;
      for (let st = 0; st < nS; st++) {
        const p = st % 64, tc = t0 + (st + 0.5) * stepSec;
        mag(x, Math.round(tc * SR - N / 2), N, m);
        const P = []; for (let i = i0; i <= i1; i++) if (m[i] > m[i - 1] && m[i] >= m[i + 1]) { const A = Math.log(m[i - 1] + 1e-9), B = Math.log(m[i] + 1e-9), C = Math.log(m[i + 1] + 1e-9), d = A - 2 * B + C; P.push([(i + (d ? 0.5 * (A - C) / d : 0)) * SR / N, m[i]]); }
        const near = f => { let v = 0; for (const [pf, pv] of P) { const c = 1200 * Math.log2(pf / f); if (c > -90 && c < 90) { const q = pv * Math.exp(-(c / 40) * (c / 40)); if (q > v) v = q; } } return v; };
        for (let n = lo; n <= hi; n++) { const f0 = 440 * Math.pow(2, (n - 69 + tune) / 12); let sal = 0; w.forEach((wt, h) => { sal += wt * near(f0 * (h + 1)); }); if (near(f0) < 0.25 * sal / w[0]) sal *= 0.6; S[p][n - lo] += sal; }
        // low-end onset strength: rise in 25-220 Hz energy from just before the step to just after it starts
        mag(x, Math.round((t0 + st * stepSec) * SR - 64), N2, m2); let e = 0; for (let i = b0; i <= b1; i++) e += m2[i];
        mag(x, Math.round((t0 + st * stepSec) * SR - N2 + 64), N2, m2); let eb = 0; for (let i = b0; i <= b1; i++) eb += m2[i];
        F[p] += Math.max(0, e - eb) / (eb + 1e-6 + 0.05 * e); E[p] += e; prev = e;
      }
      const top = S.map(v => Math.max(...v)), q = top.slice().sort((x1, y1) => x1 - y1), gate = 0.35 * (q[Math.floor(q.length * 0.75)] || 0);
      const fq = Array.from(F).sort((x1, y1) => x1 - y1), fMed = fq[32] || 0, fHi = fq[Math.floor(64 * 0.9)] || 0, thr = Math.max(fMed * 1.3, fHi * 0.2);
      const on = []; for (let p = 0; p < 64; p++) { const sounding = top[p] >= gate, wasOff = top[(p + 63) % 64] < gate; if (sounding && (wasOff || (F[p] > thr && F[p] >= F[(p + 63) % 64]))) on.push(p); }
      const pitchOf = (a0, a1) => { const acc = new Float32Array(hi - lo + 1); for (let p = a0; p < a1; p++) S[p].forEach((v, k) => acc[k] += v); let bk = 0; acc.forEach((v, k) => { if (v > acc[bk]) bk = k; }); return lo + bk; };
      const notes = []; on.forEach((st, i) => { const nx = i + 1 < on.length ? on[i + 1] : 64; let en = st + 1; while (en < nx && top[en] >= gate) en++; notes.push({ t: st, dur: en - st, midi: en - st >= 2 ? pitchOf(st + 1, Math.min(en, st + 5)) : pitchOf(st, en) }); }); // skip the attack: kick thump and 808 pitch punch live there
      return notes;
    };
    const mel = run(4096, bars * 16, stepSec, 60, 91, [1, 0.6, 0.4], 240, 4500, true);
    let bassNotes = []; try { bassNotes = bass16(); } catch (e) { bassNotes = []; }
    if (bassNotes.length < 2) bassNotes = foldNotes(run(8192, bars * 8, stepSec * 2, 24, 47, [1, 0.8, 0.6, 0.4], 28, 520, false), 32, 2);
    return { hook: { notes: foldNotes(mel, 64, 1), from: sec.label, bar: sec.startBar + 1 }, bass: { notes: bassNotes, from: sec.label, bar: sec.startBar + 1 } };
  } catch (e) { return {}; }
}
/* Chord regions (chords-v2): chords where they change, not one per bar. Harmonic evidence is read at every 8th note of the bar grid
   (pitch-class profile: C2-B3 from 8192-sample spectra for pitch resolution, C4-B5 from 4096-sample ones for timing; the bass from the transcribed bass line); every major or minor
   triad and "no chord" is scored at each 8th (as log-probabilities), and one Viterbi pass picks the sequence, with a cost per change so a
   passing melody note does not become a chord, and a preference for the bar's own chord (chords.bars) so the steady reading wins unless
   the 8ths clearly say otherwise. Tuned on the synthetic test songs (no worse than one chord per bar there) and ONE real paired render
   (more chords right, chord changes kept off the bar line): see docs/CHORDS.md. Adjacent 8ths with the same chord merge, so a region keeps its real start and end (seconds and bar.beat),
   which need not be bar lines. Pickup bar (-1) included. Triads only for now; "–" = no chord heard. Returns [{ t0, t1, bar, beat, endBar,
   endBeat, c }] (bar 0 = bar 1; beat = quarter-note position in that bar from 0, in 8ths; the end is exclusive) or null without a bar grid. Measurement-free: never changes chords.bars. */
const CR = { tau: 0.03, change: 3, offbeat: 0.6, onBar: 0.4, nc: 0.22, bassRoot: 0.3, bassTone: 0.08, outKey: 0.08, minStepEnergy: 0.02, barPrior: 0.1, pedalWin: 16, pedalShare: 0.85 };
/* Is there percussion in this track at all? Measured, not guessed from the drum pattern (that is always normalised to the loudest step, so it
   finds a "kick" even in a piano piece). Harmonic/percussive separation, light version: on a 2048-point spectrogram (hop 512) a bin's
   percussive share is its median across 17 neighbouring frequencies against its median across 17 neighbouring frames (sustained tones are
   steady in time, hits are steady in frequency). The share of energy that is percussive is taken over the whole spectrum (pAll) and
   below 200 Hz (pLo) in up to 8 windows of 8 s spread over the track; the highest window of each decides (the windows are the most transient-heavy ones of a cheap scan of the whole track plus evenly spaced ones), so an intro, a quiet passage or a short drum section does not hide the drums. found: false only when BOTH are clearly low, true when pAll is high, else null (unclear). Calibrated on a
   handful of files only (docs/DRUM_EVIDENCE.md), so a quiet or washed-out drum part can read as "none". */
const DRUM_EV = { win: 8, minWin: 5, maxWin: 8, picks: 4, none: { pAll: 0.20, pLo: 0.30 }, yes: { pAll: 0.30 } };
/* Bar-1 rules for pieces with no measured drums (issue #50, docs/BAR1_NO_DRUMS.md). Tuned on five real renders, so a regression guard, not a measurement. */
const BAR1 = { voteZ: 2, startWithin: 0.25 };
/* Seconds to the first 10 ms frame louder than 2% of the track's 99th-percentile frame RMS; null for silence. */
function firstSound(x, SR) {
  const hop = Math.round(SR / 100), rms = []; for (let i = 0; i + hop <= x.length; i += hop) { let q = 0; for (let k = i; k < i + hop; k++) q += x[k] * x[k]; rms.push(Math.sqrt(q / hop)); }
  const ref = rms.slice().sort((a, b) => a - b)[Math.floor(rms.length * 0.99)] || 0, k0 = rms.findIndex(v => v > 0.02 * ref);
  return k0 < 0 || !(ref > 0) ? null : k0 / 100;
}
function drumEvidence(x, SR) {
  try {
    const N = 2048, H = 512, K = N / 2, L = 8, W = Math.min(Math.round(DRUM_EV.win * SR), x.length); if (x.length < DRUM_EV.minWin * SR || W < 1) return null;
    const out = new Float32Array(K), kLo = Math.round(200 / (SR / N)), win = new Float32Array(2 * L + 1), med = () => { for (let i = 1; i < win.length; i++) { const v = win[i]; let j = i - 1; while (j >= 0 && win[j] > v) { win[j + 1] = win[j]; j--; } win[j + 1] = v; } return win[L]; };
    // which windows: the whole track is scanned cheaply for transient activity (normalised spectral flux, 1024-point frames), and the most active
    // windows are analysed together with evenly spaced ones, so drums that play in only one part of a long track are not skipped
    const starts = new Set(), last = Math.max(0, x.length - W), nEven = Math.min(DRUM_EV.maxWin - DRUM_EV.picks, Math.floor(x.length / W)) || 1;
    for (let w = 0; w < nEven; w++) starts.add(Math.floor(last * (w + 0.5) / nEven));
    { const n1 = 1024, h1 = 512, o1 = new Float32Array(n1 / 2), nf = Math.floor((x.length - n1) / h1); let prev = null; const fx = new Float32Array(Math.max(0, nf));
      for (let t = 0; t < nf; t++) { mag(x, t * h1, n1, o1); let up = 0, tot = 1e-9; for (let k = 2; k < n1 / 2; k++) { tot += o1[k]; if (prev) up += Math.max(0, o1[k] - prev[k]); } fx[t] = prev ? up / tot : 0; prev = Float32Array.from(o1); }
      const fw = Math.floor(W / h1), cs = new Float64Array(nf + 1); for (let t = 0; t < nf; t++) cs[t + 1] = cs[t] + fx[t];
      const cand = []; for (let t = 0; t + fw <= nf; t += Math.max(1, Math.floor(2 * SR / h1))) cand.push({ t, v: cs[t + fw] - cs[t] }); cand.sort((p, q) => q.v - p.v);
      const taken = []; for (const c of cand) { if (taken.length >= DRUM_EV.picks) break; if (taken.every(u => Math.abs(u - c.t) >= fw)) taken.push(c.t); }
      taken.forEach(t => starts.add(Math.min(last, t * h1))); }
    let bestAll = 0, bestLo = 0;
    for (const s0 of starts) {
      const nF = Math.floor((W - N) / H), S = []; for (let t = 0; t < nF; t++) { mag(x, s0 + t * H, N, out); S.push(Float32Array.from(out)); }
      let Ea = 0, Pa = 0, El = 0, Pl = 0;
      for (let t = L; t < nF - L; t++) { const sp = S[t]; for (let k = 1; k < K; k++) {
        for (let i = -L; i <= L; i++) win[i + L] = sp[Math.min(K - 1, Math.max(0, k + i))]; const p = med(); for (let i = -L; i <= L; i++) win[i + L] = S[t + i][k]; const h = med(); // frequency neighbours are clamped at both ends of the spectrum, so the lowest bins (kicks, sub bass) count
        const v = sp[k] * sp[k], pp = p * p, den = pp + h * h + 1e-12, P = v * pp / den; Ea += v; Pa += P; if (k <= kLo) { El += v; Pl += P; } } }
      if (Ea > 0) { bestAll = Math.max(bestAll, Pa / Ea); if (El > 0) bestLo = Math.max(bestLo, Pl / El); }
    }
    const found = bestAll < DRUM_EV.none.pAll && bestLo < DRUM_EV.none.pLo ? false : bestAll >= DRUM_EV.yes.pAll ? true : null;
    return { method: "percussive-share-v1", windows: starts.size, pAll: +bestAll.toFixed(3), pLo: +bestLo.toFixed(3), found };
  } catch (e) { return null; }
}
function chordRegions(x, SR, G, nBars, dur, tune, scale, bass, barChords) {
  try {
    if (!G || !(nBars > 0)) return null;
    const P = CR;
    const steps = [];
    for (let b = -1; b < nBars; b++) { const s0 = G.barStart(b), s1 = G.barStart(b + 1); if (!(s1 > 0) || !(s0 < dur)) continue;
      for (let i = 0; i < 8; i++) { const t0 = s0 + i * (s1 - s0) / 8, t1 = s0 + (i + 1) * (s1 - s0) / 8; if (t1 <= 0.02 || t0 >= dur - 0.02) continue; steps.push({ b, i, t0: Math.max(0, t0), t1: Math.min(dur, t1) }); } }
    if (!steps.length) return null;
    const NA = 4096, NB = 8192, ma = new Float32Array(NA / 2), mb = new Float32Array(NB / 2), pitch = f => 12 * Math.log2(f / 440) + 69 - tune;
    const bassNotes = (bass || []).filter(n => n && n.off > n.on);
    const feats = steps.map(st => {
      const mid = (st.t0 + st.t1) / 2, c = new Array(12).fill(0), v = new Float32Array(128);
      // low notes (C2-B3) from the long window for pitch resolution, higher ones (C4-B5) from the short one for time resolution
      mag(x, Math.round(mid * SR - NB / 2), NB, mb);
      for (let i = 8; i < NB / 2 - 1; i++) { const f = i * SR / NB; if (f > 255) break; const p = pitch(f), r = Math.round(p); if (r < 36 || r > 59 || Math.abs(p - r) > 0.4) continue; if (mb[i] > v[r]) v[r] = mb[i]; }
      mag(x, Math.round(mid * SR - NA / 2), NA, ma);
      for (let i = 8; i < NA / 2 - 1; i++) { const f = i * SR / NA; if (f > 1050) break; if (f < 250) continue; const p = pitch(f), r = Math.round(p); if (r < 60 || r > 83 || Math.abs(p - r) > 0.4) continue; if (ma[i] * NB / NA > v[r]) v[r] = ma[i] * NB / NA; }
      let e = 0; for (let r = 36; r <= 83; r++) { const q = Math.log1p(20 * v[r]); c[r % 12] += q * (r < 60 ? 1.3 : 1); e += q; }
      // the bass: the transcribed bass notes sounding in this 8th (the drums are not mistaken for it), weighted by how long they sound
      const bc = new Array(12).fill(0); let bs = 0; bassNotes.forEach(n => { const o = Math.min(n.off, st.t1) - Math.max(n.on, st.t0); if (o > 0) { bc[n.midi % 12] += o; bs += o; } });
      return { c, e, b: bs > 0 ? bc.map(q => q / bs) : null };
    });
    const eRef = feats.map(f => f.e).sort((p, q) => p - q)[Math.floor(feats.length * 0.9)] || 1;
    const CH = []; for (let r = 0; r < 12; r++) for (const [q, iv] of [["", [0, 4, 7]], ["m", [0, 3, 7]]]) CH.push({ name: NAMES[r] + q, tones: iv.map(d => (r + d) % 12), out: !iv.every(d => scale.has((r + d) % 12)) });
    const K = CH.length + 1, NC = CH.length; // last state = no chord
    // a pedal (one bass note held under changing chords, common in dance music) says nothing about the chord: where the bass in the
    // surrounding bars is (nearly) one note, it is not used
    const bw = feats.map((f, s) => { const h = new Array(12).fill(0); let t = 0; for (let j = Math.max(0, s - P.pedalWin); j <= Math.min(feats.length - 1, s + P.pedalWin); j++) if (feats[j].b) feats[j].b.forEach((v, k) => { h[k] += v; t += v; }); return t && Math.max(...h) / t >= P.pedalShare ? 0 : 1; });
    const emit = feats.map((f, s) => {
      const out = new Float32Array(K), mean = f.c.reduce((p, q) => p + q, 0) / 12, z = f.c.map(v => v - mean), nz = Math.sqrt(z.reduce((p, v) => p + v * v, 0));
      if (!(nz > 0) || f.e < P.minStepEnergy * eRef) { out.fill(-20); out[NC] = 0; return out; }
      CH.forEach((h, k) => { let sc = h.tones.reduce((p, t, j) => p + z[t] * (j === 0 ? 1.1 : 1), 0) / (nz * Math.sqrt(3));
        if (f.b && bw[s]) sc += P.bassRoot * (f.b[h.tones[0]] - 1 / 12) + P.bassTone * (f.b[h.tones[1]] + f.b[h.tones[2]] - 2 / 12);
        if (h.out) sc -= P.outKey;
        // the bar's own chord (read from the whole bar, steadier than one 8th) is preferred, so a change inside a bar needs clear evidence
        if (barChords && barChords[steps[s].b] === h.name) sc += P.barPrior;
        out[k] = sc; });
      out[NC] = P.nc;
      // as log-probabilities (softmax at temperature tau), so a steady preference adds up step by step against the cost of a change
      let mx = -Infinity; for (let k = 0; k < K; k++) mx = Math.max(mx, out[k] / P.tau); let se = 0; for (let k = 0; k < K; k++) se += Math.exp(out[k] / P.tau - mx);
      for (let k = 0; k < K; k++) out[k] = out[k] / P.tau - mx - Math.log(se); return out;
    });
    // Viterbi: score = sum of emissions - a cost per change (more on an off-beat 8th, less on a bar line)
    const n = steps.length, back = Array.from({ length: n }, () => new Int16Array(K)); let prev = Float64Array.from(emit[0]);
    for (let s = 1; s < n; s++) {
      const st = steps[s], cost = P.change + (st.i % 2 ? P.offbeat : 0) - (st.i === 0 ? P.onBar : 0), cur = new Float64Array(K);
      let bk = 0; for (let k = 1; k < K; k++) if (prev[k] > prev[bk]) bk = k;
      for (let k = 0; k < K; k++) { const stay = prev[k], sw = prev[bk] - cost; if (stay >= sw || bk === k) { cur[k] = stay + emit[s][k]; back[s][k] = k; } else { cur[k] = sw + emit[s][k]; back[s][k] = bk; } }
      prev = cur;
    }
    let k = 0; for (let j = 1; j < K; j++) if (prev[j] > prev[k]) k = j;
    const path = new Array(n); for (let s = n - 1; s >= 0; s--) { path[s] = k; k = back[s][k]; }
    const out = []; path.forEach((k, s) => { const c = k === NC ? "–" : CH[k].name, st = steps[s], last = out[out.length - 1];
      const endBar = st.i === 7 ? st.b + 1 : st.b, endBeat = st.i === 7 ? 0 : (st.i + 1) / 2;
      if (last && last.c === c && Math.abs(last.t1 - st.t0) < 1e-6) { last.t1 = st.t1; last.endBar = endBar; last.endBeat = endBeat; } else out.push({ t0: st.t0, t1: st.t1, bar: st.b, beat: st.i / 2, endBar, endBeat, c }); });
    return out.map(r => ({ t0: +r.t0.toFixed(3), t1: +r.t1.toFixed(3), bar: r.bar, beat: r.beat, endBar: r.endBar, endBeat: r.endBeat, c: r.c }));
  } catch (e) { return null; }
}
/* ---- full-track transcription: lead (per 16th) and bass (16th onsets) over EVERY bar, at their real times ----
   The 4-bar hook/bassline above stays as it is (a representative pattern from one section, folded). This one reads each 16th step of
   every bar on the bar grid G (the tracked grid when there is one, so it follows tempo drift), with the same harmonic-salience pitch
   picking, and keeps what it hears where it hears it: no folding, no repetition, gaps where nothing clears the gate. Notes carry absolute
   seconds and their bar/beat position. The bar before bar 1 is read too, so a pickup keeps its notes (bar -1, negative beat).
   Rough: same limits as the 4-bar version. */
function transcribeTrack(x, SR, G, firstDown, barSec, nBars, dur, sections, tune, prior) {
  try {
    // The detected key as a PRIOR, not a filter: a pitch outside the key keeps `prior.out` (0.8) of its acoustic salience, so a note with clearly stronger evidence than
    // any in-key rival still wins, and a weak or ambiguous one (overlapping harmonics, vibrato, reverb, noise) goes to the in-key neighbour. Nothing is snapped afterwards.
    const kf = pc => prior && prior.scale && !prior.scale.has(pc) ? prior.out : 1;
    const barAt = b => G ? G.barStart(b) : firstDown + b * barSec, steps = [];
    // every 16th step that lies inside the audio: a bar 1 that starts a hair before 0:00 (grid jitter) keeps its steps, a bar running past the end loses only the steps after it
    for (let b = -1; b <= nBars; b++) { const s0 = barAt(b), s1 = barAt(b + 1); if (!(s1 > 0) || !(s0 < dur)) continue; for (let i = 0; i < 16; i++) { const t0 = s0 + i * (s1 - s0) / 16, t1 = s0 + (i + 1) * (s1 - s0) / 16; if (t0 >= -0.02 && t1 <= dur) steps.push({ b, i, t0: Math.max(0, t0), t1 }); } }
    if (steps.length < 32) return null;
    const secOf = b => sections.findIndex(sc => b >= sc.startBar && b < sc.startBar + sc.bars);
    const peaks = (N, m, fLo, fHi) => { const P = [], i0 = Math.max(2, Math.floor(fLo * N / SR)), i1 = Math.min(N / 2 - 2, Math.ceil(fHi * N / SR)); for (let i = i0; i <= i1; i++) if (m[i] > m[i - 1] && m[i] >= m[i + 1]) { const A = Math.log(m[i - 1] + 1e-9), B = Math.log(m[i] + 1e-9), C = Math.log(m[i + 1] + 1e-9), d = A - 2 * B + C; P.push([(i + (d ? 0.5 * (A - C) / d : 0)) * SR / N, m[i]]); } return f0 => { let v = 0; for (const [pf, pv] of P) { const c = 1200 * Math.log2(pf / f0); if (c > -90 && c < 90) { const q = pv * Math.exp(-(c / 40) * (c / 40)); if (q > v) v = q; } } return v; }; };
    const hz = n => 440 * Math.pow(2, (n - 69 + tune) / 12);
    const vel = (v, ref) => Math.max(1, Math.min(127, Math.round(40 + 87 * Math.sqrt(Math.min(1, v / (ref || 1))))));
    const q = (arr, p) => { const srt = arr.slice().sort((u, w) => u - w); return srt[Math.floor((srt.length - 1) * p)] || 0; };
    const note = (st, en, midi, v) => ({ on: +st.t0.toFixed(3), off: +en.t1.toFixed(3), midi, vel: v, bar: st.b, beat: +(st.b * 4 + st.i / 4).toFixed(3), dur: +(((en.b * 16 + en.i + 1) - (st.b * 16 + st.i)) / 4).toFixed(3), section: secOf(st.b) });
    // lead: best note per step (MIDI 60-91), gated against the whole track; equal neighbours join into one note (at most a bar long)
    const N = 4096, m = new Float32Array(N / 2), w = [1, 0.6, 0.4], best = [], val = [];
    for (const st of steps) {
      mag(x, Math.round((st.t0 + st.t1) / 2 * SR - N / 2), N, m); const near = peaks(N, m, 240, 4500);
      let bm = -1, bs = 0; for (let n = 60; n <= 91; n++) { const f0 = hz(n); let sal = 0; w.forEach((wt, h) => { sal += wt * near(f0 * (h + 1)); }); if (near(f0 / 2) > near(f0)) sal *= 0.5; sal *= 1 + 0.12 * (n - 60) / 12; sal *= kf(n % 12); if (sal > bs) { bs = sal; bm = n; } }
      best.push(bm); val.push(bs);
    }
    const gate = 0.4 * q(val, 0.75), ref = q(val, 0.95), lead = [];
    let cur = null;
    steps.forEach((st, k) => {
      const n = val[k] >= gate ? best[k] : -1, prev = k ? steps[k - 1] : null, contiguous = prev && (prev.b * 16 + prev.i + 1 === st.b * 16 + st.i);
      if (cur && n === cur.midi && contiguous && cur.k1 - cur.k0 < 15) { cur.k1 = k; cur.v = Math.max(cur.v, val[k]); return; }
      if (cur) lead.push(note(steps[cur.k0], steps[cur.k1], cur.midi, vel(cur.v, ref)));
      cur = n >= 0 ? { k0: k, k1: k, midi: n, v: val[k] } : null;
    });
    if (cur) lead.push(note(steps[cur.k0], steps[cur.k1], cur.midi, vel(cur.v, ref)));
    // bass: per-step salience (MIDI 24-47) and low-end onset strength; a note starts on an onset or after silence and ends where the
    // pitch evidence drops below the gate or the next onset; its pitch is the strongest over the span after the attack
    const NB = 8192, mb = new Float32Array(NB / 2), N2 = 1024, m2 = new Float32Array(N2 / 2), wb = [1, 0.8, 0.6, 0.4], b0 = Math.max(1, Math.floor(25 * N2 / SR)), b1 = Math.ceil(220 * N2 / SR);
    const S = [], top = [], F = [];
    for (const st of steps) {
      mag(x, Math.round((st.t0 + st.t1) / 2 * SR - NB / 2), NB, mb); const near = peaks(NB, mb, 28, 520), row = new Float32Array(24);
      for (let n = 24; n <= 47; n++) { const f0 = hz(n); let sal = 0; wb.forEach((wt, h) => { sal += wt * near(f0 * (h + 1)); }); if (near(f0) < 0.25 * sal) sal *= 0.6; row[n - 24] = sal * kf(n % 12); }
      S.push(row); top.push(Math.max(...row));
      mag(x, Math.round(st.t0 * SR - 64), N2, m2); let e = 0; for (let i = b0; i <= b1; i++) e += m2[i];
      mag(x, Math.round(st.t0 * SR - N2 + 64), N2, m2); let eb = 0; for (let i = b0; i <= b1; i++) eb += m2[i];
      F.push(Math.max(0, e - eb) / (eb + 1e-6 + 0.05 * e));
    }
    const bg = 0.35 * q(top, 0.75), bref = q(top, 0.95), thr = Math.max(q(F, 0.5) * 1.3, q(F, 0.9) * 0.2), bass = [];
    const adj = k => k > 0 && (steps[k - 1].b * 16 + steps[k - 1].i + 1 === steps[k].b * 16 + steps[k].i);
    const on = []; for (let k = 0; k < steps.length; k++) { if (top[k] < bg) continue; const wasOff = !adj(k) || top[k - 1] < bg; if (wasOff || (F[k] > thr && F[k] >= F[k - 1])) on.push(k); }
    on.forEach((k, j) => {
      const nx = j + 1 < on.length ? on[j + 1] : steps.length; let en = k + 1; while (en < nx && adj(en) && top[en] >= bg && en - k < 16) en++;
      const a0 = en - k >= 2 ? k + 1 : k, a1 = en - k >= 2 ? Math.min(en, k + 5) : en, acc = new Float32Array(24); let pk = 0;
      for (let p = a0; p < a1; p++) S[p].forEach((v, i) => { acc[i] += v; if (v > pk) pk = v; });
      let bi = 0; acc.forEach((v, i) => { if (v > acc[bi]) bi = i; });
      bass.push(note(steps[k], steps[en - 1], 24 + bi, vel(pk, bref)));
    });
    return Object.assign({ version: 1, method: "salience-16th-track-v1", grid: G && G.tracked ? "tracked" : "fallback", lead, bass }, prior && prior.scale ? { keyPrior: { key: prior.key, out: prior.out } } : {});
  } catch (e) { return null; }
}
/* The same notes on another bar numbering (bar 1 moved; the 16th lattice is the same): bar, beat and section follow, times and lengths stay. */
function relabelTrack(tr, G, sections) {
  const secOf = b => sections.findIndex(sc => b >= sc.startBar && b < sc.startBar + sc.bars);
  const lab = n => { let b = G.barOf(n.on + 1e-6), s0 = G.barStart(b), i = Math.round(16 * (n.on - s0) / (G.barStart(b + 1) - s0)); if (i >= 16) { b++; i -= 16; }
    return Object.assign({}, n, { bar: b, beat: +(b * 4 + i / 4).toFixed(3), section: secOf(b) }); };
  return Object.assign({}, tr, { grid: G.tracked ? "tracked" : "fallback", lead: tr.lead.map(lab), bass: tr.bass.map(lab) });
}
/* Processing limits. Everything is analysed in the browser tab, so a file that is too large or too long can exhaust memory:
   a decoded stereo float track is about 21 MB per minute (8 min = 169 MB, plus analysis arrays). The numbers are policy
   choices, not measurements of any device; they are meant to be reviewed and tuned with the performance work (Phase 9).
   maxSeconds is the engine's own coverage: tempo, beats and drum patterns are computed for the first rhythmSeconds only, so a
   longer file is refused instead of being presented as a full teardown of material that was only partly analysed.
   Known gap: the duration is read from the file header before decoding, but a compressed file with a missing or wrong header
   duration is only caught AFTER decoding, which has already allocated the whole track. File size is the only hard bound before that. */
const LIMITS = Object.freeze({ maxFileBytes: 200 * 1024 * 1024, rhythmSeconds: 480, maxSeconds: 480, minSeconds: 8, silentPeak: 1e-4 /* about -80 dBFS */ });
class InputLimitError extends Error { constructor(msg) { super(msg); this.name = "InputLimitError"; } } // message is shown to the user as written
const fmtLen = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
/* Duration from the file's own header via the browser's media pipeline, without decoding it. null when unknown. */
function probeDuration(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file), a = document.createElement("audio"); a.preload = "metadata"; let done = false, timer;
    const finish = v => { if (done) return; done = true; clearTimeout(timer); a.onloadedmetadata = a.onerror = null; a.removeAttribute("src"); try { a.load(); } catch (e) {} URL.revokeObjectURL(url); resolve(v); };
    a.onloadedmetadata = () => finish(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : null); a.onerror = () => finish(null);
    timer = setTimeout(() => finish(null), 4000); a.src = url;
  });
}
function checkDuration(sec) {
  if (sec > LIMITS.maxSeconds) throw new InputLimitError(`That file is ${fmtLen(sec)} long. A full-track teardown supports up to ${fmtLen(LIMITS.maxSeconds)} today: tempo, beats and drum patterns are only analysed for that much. Trim it to the section you want to study and try again.`);
  if (sec < LIMITS.minSeconds) throw new InputLimitError(`That file is only ${sec.toFixed(1)} s long. A teardown needs at least ${LIMITS.minSeconds} s to find a tempo and bars. For a single sound or a short loop, use Sample Lab.`);
}
/* Counters for tests and diagnostics: checkpoints reached, analyses stopped early. */
const ANALYSIS_STATS = { checkpoints: 0, aborted: 0 }; // the page exposes it as window.__analysisStats
/* `signal` (optional AbortSignal) is honoured at every checkpoint: between decoding and each analysis stage, and every
   few percent inside the long arrangement pass. The stages themselves are synchronous, so a cancel takes effect at the next
   checkpoint, not instantly. (The Svelte app runs analyzeDecoded() in a Web Worker and stops it by ending the worker.) */
/* ---- Version B: one constant tempo for the whole recording, fitted from onset evidence ----
   `tot` is onset evidence per frame (low + mid + half of high band, each scaled to its own 98th percentile). A constant tempo is a comb of
   equally spaced beats: score(bpm, phase) = the mean evidence at beat positions t_n = phase + n*period (the strongest of the 3 nearest frames, so a
   hit a frame early or late still counts). BPM is scanned over the whole track at 0.05 and refined to 0.005; each QUARTER of the track is then fitted
   on its own. A steady tempo peaks at the same BPM in every quarter; a drifting or stepping tempo does not. The fit is accepted only when the
   whole-track peak stands clear of the scan (peak / median >= 1.5) and every quarter that has evidence (peak / median >= 1.3, at least 3 of 4) peaks within
   0.1 % of it. Otherwise null: the tracker's beats stand, as before. `locked` (a BPM the person typed) skips the test and fits only the phase.
   Returns { bpm, phase (frames), ratio, quarters:[bpm|null], locked } with beats at phase + n*60*fps/bpm. */
function fitConstantTempo(tot, fps, bpm0, locked) {
  const N = tot.length; if (N < fps * 20) return null;
  const sc = (bpm, from, to, ph0, ph1, step) => { const beat = fps * 60 / bpm; let bs = -1, bp = 0;
    for (let ph = ph0; ph < ph1; ph += step) { let s = 0, c = 0; for (let t = ph + Math.ceil((from - ph) / beat) * beat; t < to - 1; t += beat) { const i = Math.round(t); s += Math.max(tot[i - 1] || 0, tot[i], tot[i + 1] || 0); c++; } s = c ? s / c : 0; if (s > bs) { bs = s; bp = ph; } }
    return { s: bs, ph: bp }; };
  const phaseOf = (bpm, from, to, fine) => { const beat = fps * 60 / bpm, c = sc(bpm, from, to, from, from + beat, 0.5); return fine ? sc(bpm, from, to, c.ph - 0.5, c.ph + 0.5, 0.05) : c; };
  if (locked > 0) { const r = phaseOf(locked, 0, N, true); return { bpm: locked, phase: r.ph, ratio: null, quarters: [], locked: true }; }
  const lo = Math.max(60, bpm0 - Math.min(2.9, bpm0 * 0.03)), hi = bpm0 + Math.min(2.9, bpm0 * 0.03), scan = [];
  for (let b = lo; b <= hi + 1e-9; b += 0.05) scan.push([b, phaseOf(b, 0, N, false).s]);
  const sorted = scan.map(x => x[1]).sort((p, q) => p - q), med = sorted[Math.floor(sorted.length / 2)] || 1e-9; let top = scan[0]; scan.forEach(x => { if (x[1] > top[1]) top = x; });
  let gb = top[0], gs = top[1]; for (let b = top[0] - 0.1; b <= top[0] + 0.1 + 1e-9; b += 0.005) { const s = phaseOf(b, 0, N, false).s; if (s > gs) { gs = s; gb = b; } }
  const ratio = gs / med; if (ratio < 1.5) return null;
  // the comb's own tempo is only as fine as its phase steps; refine it from how the best local phase moves across 8 stretches (a straight
  // line through those phases IS the tempo error). Stretches locked on the off-beat count half a beat back.
  for (let it = 0; it < 2; it++) { const beatR = fps * 60 / gb, G0 = phaseOf(gb, 0, N, true).ph, xs = [], ys = [];
    for (let q = 0; q < 8; q++) { const from = Math.floor(N * q / 8), to = Math.floor(N * (q + 1) / 8); let d = ((phaseOf(gb, from, to, true).ph - G0) % beatR + beatR) % beatR; if (d > beatR / 2) d -= beatR;
      if (Math.abs(Math.abs(d) - beatR / 2) < beatR / 8) d -= Math.sign(d) * beatR / 2; if (Math.abs(d) < beatR / 8) { xs.push((from + to) / 2); ys.push(d); } }
    if (xs.length < 6) break; const mx = xs.reduce((p, v) => p + v, 0) / xs.length, my = ys.reduce((p, v) => p + v, 0) / ys.length; let sxy = 0, sxx = 0; xs.forEach((v, i) => { sxy += (v - mx) * (ys[i] - my); sxx += (v - mx) ** 2; });
    const slope = sxx ? sxy / sxx : 0; if (Math.abs(slope) > 0.002) break; gb = 60 * fps / (beatR * (1 + slope)); }
  const quarters = [], G = phaseOf(gb, 0, N, true), beat = fps * 60 / gb; let valid = 0, ok = true;
  for (let q = 0; q < 4; q++) { const from = Math.floor(N * q / 4), to = Math.floor(N * (q + 1) / 4), qs = []; let qt = null;
    for (let b = gb - 0.5; b <= gb + 0.5 + 1e-9; b += 0.02) qs.push([b, phaseOf(b, from, to, false).s]);
    const far = []; for (let b = lo; b <= hi + 1e-9; b += 0.25) far.push(phaseOf(b, from, to, false).s); far.sort((p, q2) => p - q2); const qmed = far[Math.floor(far.length / 2)] || 1e-9;
    qs.forEach(x => { if (!qt || x[1] > qt[1]) qt = x; });
    if (qt[1] / qmed >= 1.3) { valid++; quarters.push(+qt[0].toFixed(3));
      // a quarter's own tempo is only good to ~0.15% (its comb is coarse); what decides is whether the ONE grid stays on that quarter's
      // beats: its best phase at the global tempo within 30 ms of the global phase (or of the off-beat, where 8ths outweigh quarters)
      const lp = phaseOf(gb, from, to, true).ph; let d = ((lp - G.ph) % beat + beat) % beat; if (d > beat / 2) d -= beat; d = Math.abs(d) * 1000 / fps;
      if (Math.abs(qt[0] - gb) > 0.0015 * gb || Math.min(d, Math.abs(d - 500 * beat / fps)) > 30) ok = false; } else quarters.push(null); }
  if (valid < 3 || !ok) return null;
  return { bpm: gb, phase: G.ph, ratio: +ratio.toFixed(2), quarters, locked: false };
}
/* `forced` (optional) is what a person corrected: { bpm, downbeatShift }. With it, the analysis runs again from the same audio with the tempo
   fixed at `bpm` (instead of the detected one) and/or bar 1 moved by `downbeatShift` beats (applied where the engine picks which beat of the bar
   is "1"), and everything downstream (beats, bars, drums,
   sections, chords, notes) is derived from those values exactly as it is from detected ones: the result IS a fresh analysis at those values,
   not a patch of an old one. Without `forced` nothing below differs from the detected path. */
async function analyze(file, onProg, opts_compare, signal, forced) {
  return analyzeDecoded(await decode(file, onProg, signal), onProg, opts_compare, signal, forced);
}
/* Check a file against the limits and decode it (the browser's decoder; needs a page, not a worker). analyze() is decode() then
   analyzeDecoded(); the Svelte app runs the two apart, analyzeDecoded() in a Web Worker so the page keeps drawing. */
async function decode(file, onProg, signal) {
  const stopIfAborted = () => { if (signal && signal.aborted) { ANALYSIS_STATS.aborted++; throw new DOMException("Analysis cancelled", "AbortError"); } };
  stopIfAborted();
  if (file.size > LIMITS.maxFileBytes) throw new InputLimitError(`That file is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${LIMITS.maxFileBytes / 1048576} MB.`);
  if (file.size === 0) throw new InputLimitError("That file is empty.");
  onProg(5, "Checking the file…");
  const headerSec = await probeDuration(file); stopIfAborted(); // refuse an over-long file BEFORE decoding allocates its memory
  if (headerSec != null && headerSec > LIMITS.maxSeconds) checkDuration(headerSec);
  onProg(5, "Decoding audio…");
  const raw = await file.arrayBuffer(); stopIfAborted();
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const ab = await ctx.decodeAudioData(raw); stopIfAborted();
  checkDuration(ab.duration); // authoritative: the header can be missing or wrong
  return ab;
}
/* The analysis of audio that is already decoded (an AudioBuffer). analyze() decodes a file and calls this; the app calls it again, with
   `forced`, when the user corrects the tempo or the first downbeat. */
async function analyzeDecoded(ab, onProg, opts_compare, signal, forced) {
  const stopIfAborted = () => { if (signal && signal.aborted) { ANALYSIS_STATS.aborted++; throw new DOMException("Analysis cancelled", "AbortError"); } };
  const gate = async () => { await tick(); ANALYSIS_STATS.checkpoints++; stopIfAborted(); };
  const L = ab.getChannelData(0), R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L;
  const dur = ab.duration;
  // mono 22050 + stereo width
  const n22 = Math.floor(L.length / 2), x = new Float32Array(n22);
  let mm = 0, ss = 0, peak = 0;
  for (let i = 0; i < n22; i++) {
    const a = (L[2 * i] + R[2 * i]) * 0.5, b = (L[2 * i + 1] + R[2 * i + 1]) * 0.5; x[i] = (a + b) * 0.5;
  }
  for (let i = 0; i < L.length; i += 2) { const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5; mm += m * m; ss += s * s; const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (p > peak) peak = p; }
  const width = Math.sqrt(ss / (mm || 1));
  if (peak < LIMITS.silentPeak) throw new InputLimitError("That file is silent (its loudest sample is below -80 dBFS), so there is nothing to analyse.");
  const SR = 22050;
  await gate(); onProg(18, "Finding the tempo and drum pattern…");

  // ---- rhythm on up to 60 s from the middle ----
  const win = Math.min(n22, SR * LIMITS.rhythmSeconds), start = 0; // whole track (the input limit keeps it within 8 minutes), so every section gets its own drum pattern
  const n = 1024, hop = 256, fps = SR / hop, nb = n / 2;
  const cur = new Float32Array(nb), prev = new Float32Array(nb);
  const eAll = [], eLow = [], eMid = [], eHigh = [], eUp = [], eSp = [];
  const bS0 = Math.round(1000 * n / SR), bS1 = Math.round(8000 * n / SR);
  // 1-5 kHz spectrum per frame (quantized), to tell a snare/clap's ringing noise from a kick click or a synth note
  const sb0 = Math.round(1000 * n / SR), sb1 = Math.round(5000 * n / SR), sbN = sb1 - sb0 + 1, nFr = Math.max(0, Math.floor((win - n) / hop) + 1), spec8 = new Uint8Array(nFr * sbN); let fr8 = 0;
  const bLow = Math.round(150 * n / SR), bMid = Math.round(2000 * n / SR), bHigh = Math.round(5000 * n / SR);
  for (let off = start; off + n <= start + win; off += hop) {
    mag(x, off, n, cur);
    let fa = 0, fl = 0, fm = 0, fh = 0, fu = 0, sp = 0;
    for (let i = 1; i < nb; i++) {
      const v = Math.log1p(100 * cur[i]), d = v - prev[i]; prev[i] = v;
      if (d > 0) { fa += d; if (i <= bLow) fl += d; else if (i <= bMid) fm += d; else if (i >= bHigh) fh += d; else fu += d; if (i >= bS0 && i <= bS1 && d > 0.5) sp++; }
    }
    eAll.push(fa); eLow.push(fl); eMid.push(fm); eHigh.push(fh); eUp.push(fu); eSp.push(sp / (bS1 - bS0 + 1));
    if (fr8 < nFr) { const o = fr8 * sbN; for (let i = 0; i < sbN; i++) spec8[o + i] = Math.min(255, Math.round(Math.log1p(100 * cur[sb0 + i]) * 25)); fr8++; }
  }
  eAll[0] = eLow[0] = eMid[0] = eHigh[0] = eUp[0] = 0;
  const w = Math.round(fps * 0.4);
  const ea = detrend(eAll, w), el = detrend(eLow, w), em = detrend(eMid, w), eh = detrend(eHigh, w), eu = detrend(eUp, w);
  // a snare or clap is noisy: it jumps in the mids, upper mids and highs all at once. A synth or vocal note mostly jumps in the mids; a hi-hat only in the highs.
  const emRaw = Float32Array.from(em);
  { const q98 = e => { const f = Array.from(e).filter(v => v > 0).sort((p, q) => p - q); return f[Math.floor(f.length * 0.98)] || 1; }, qm = q98(em), qu = q98(eu), qh = q98(eh);
    // noisiness: a clap/snare lifts most frequencies at once; a synth or vocal note lifts only its few harmonics
    const es = detrend(eSp, w), qs = q98(es);
    for (let i = 0; i < em.length; i++) em[i] = Math.min(em[i] / qm, eu[i] / qu, eh[i] / qh, es[i] / qs); }
  const maxLag = Math.min(ea.length - 1, Math.round(fps * 4) + 4);
  const A = acfAt(ea, maxLag);
  let bpm = 120, best = -1; const scores = [];
  for (let b = 70; b <= 180; b += 0.25) {
    const lag = fps * 60 / b; let s = 0;
    for (let k = 1; k <= 4; k++) if (k * lag <= maxLag) s += A(k * lag) / k;
    s += 0.5 * A(lag / 2) + 0.25 * A(lag / 4); // the true tempo also lines up its 8ths and 16ths (hats)
    s *= Math.exp(-0.5 * Math.pow(Math.log2(b / 125) / 0.9, 2));
    scores.push(s); if (s > best) { best = s; bpm = b; }
  }
  const mean = scores.reduce((p, q) => p + q, 0) / scores.length;
  const bpmConf = best / (mean || 1);
  if (forced && forced.bpm > 0) bpm = forced.bpm; // a tempo the user chose: the beat period, tracker, bars and drums below follow it
  let beat = fps * 60 / bpm;
  // beat phase from low band (kick), then which beat is "1"
  let ph = 0, phS = -1;
  for (let p = 0; p < beat; p += 0.5) { let s = 0; for (let t = p; t < el.length; t += beat) s += el[Math.round(t)] || 0; s += 0; if (s > phS) { phS = s; ph = p; } }
  const at = (e, t) => { const i = Math.round(t); let m = 0; for (let k = i - 1; k <= i + 1; k++) if (e[k] > m) m = e[k]; return m; };
  let db = 0, dbS = -1e9;
  for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let t = ph + c * beat; t + 3 * beat < el.length; t += 4 * beat) s += at(el, t) + at(el, t + 2 * beat) * 0.5 + at(em, t + beat) + at(em, t + 3 * beat) - at(em, t) * 0.5;
    if (s > dbS) { dbS = s; db = c; }
  }
  if (forced && forced.downbeatShift) db = ((db + forced.downbeatShift) % 4 + 4) % 4; // bar 1 moved by the user, in beats
  let bar0 = ph + db * beat; const stepLen = beat / 4;
  // --- beat tracking (dynamic programming): follows small tempo drift so steps don't smear ---
  const beatsF = (() => {
    const N = ea.length; let mu = 0, sd = 0; for (let i = 0; i < N; i++) mu += ea[i]; mu /= N || 1; for (let i = 0; i < N; i++) sd += (ea[i] - mu) ** 2; sd = Math.sqrt(sd / (N || 1)) || 1;
    const o = Float32Array.from(ea, v => v / sd), sc = new Float32Array(N), bp = new Int32Array(N).fill(-1);
    for (let t = 0; t < N; t++) {
      let bs = -1e9, bi = -1;
      for (let pr = Math.max(0, Math.round(t - 2 * beat)); pr <= t - Math.round(beat / 2); pr++) { const v = sc[pr] - 100 * Math.log((t - pr) / beat) ** 2; if (v > bs) { bs = v; bi = pr; } }
      sc[t] = o[t] + (bi >= 0 ? Math.max(0, bs) : 0); bp[t] = bs > 0 ? bi : -1;
    }
    let t = N - 1, m = -1e9; for (let i = Math.max(0, N - Math.round(beat)); i < N; i++) if (sc[i] > m) { m = sc[i]; t = i; }
    const out = []; while (t >= 0) { out.push(t); t = bp[t]; } return out.reverse();
  })();
  // Version B: when one constant tempo explains the whole recording (or the person locked a tempo), the beats ARE that grid, not the tracker's wandering ones
  let tempoFit = null;
  { const q98 = e => { const f = Array.from(e).filter(v => v > 0).sort((p, q) => p - q); return f[Math.floor(f.length * 0.98)] || 1; }, qL = q98(el), qM = q98(emRaw), qH = q98(eh);
    const tot = new Float32Array(el.length); for (let i = 0; i < tot.length; i++) tot[i] = el[i] / qL + emRaw[i] / qM + 0.5 * eh[i] / qH;
    tempoFit = fitConstantTempo(tot, fps, bpm, forced && forced.bpm > 0 ? forced.bpm : 0);
    if (tempoFit) { const per = fps * 60 / tempoFit.bpm, nb2 = []; for (let t = tempoFit.phase - Math.floor(tempoFit.phase / per) * per; t < el.length - 1; t += per) nb2.push(t); beatsF.length = 0; beatsF.push(...nb2); } }
  let pat = null, downK0 = null; // downK0: index into beatsF of a beat chosen as "1" (recorded for measurement only)
  if (beatsF.length >= 16) {
    // the tracker can lock onto the offbeat: pick the quarter-beat shift where kick + snare hit hardest
    { let bsh = 0, bv = -1; for (const sh of [0, 0.25, 0.5, 0.75]) { let v = 0; for (let k = 0; k + 1 < beatsF.length; k++) { const t = beatsF[k] + sh * (beatsF[k + 1] - beatsF[k]); v += at(el, t) * 1.5 + at(emRaw, t); } if (v > bv) { bv = v; bsh = sh; } }
      if (bsh) { const nb3 = []; for (let k = 0; k + 1 < beatsF.length; k++) nb3.push(beatsF[k] + bsh * (beatsF[k + 1] - beatsF[k])); beatsF.length = 0; beatsF.push(...nb3); } }
    const nbt = beatsF.length, bAt = (e, k) => at(e, beatsF[k]);
    // which beat is "1": kick on 1 (and 3), snare/clap on 2 and 4
    let c0 = 0, cS = -1e9;
    for (let c = 0; c < 4; c++) { let a1 = 0, a2 = 0; for (let k = c; k + 3 < nbt; k += 4) { a1 += bAt(el, k) * 1.5 + bAt(el, k + 2) * 0.5 + bAt(em, k + 1) + bAt(em, k + 3) - bAt(em, k) * 0.5; a2 += bAt(el, k) * 1.5 + bAt(em, k + 2) * 2 - bAt(em, k) * 0.5 - (bAt(em, k + 1) + bAt(em, k + 3)) * 0.5; } const sc = Math.max(a1, a2); if (sc > cS) { cS = sc; c0 = c; } }
    const steps = []; // [bar][16] = frame
    for (let k = c0; k + 4 < nbt; k += 4) { const row = []; for (let q = 0; q < 4; q++) { const a0 = beatsF[k + q], a1 = beatsF[k + q + 1]; for (let s4 = 0; s4 < 4; s4++) row.push(a0 + (a1 - a0) * s4 / 4); } steps.push(row); }
    if (steps.length >= 4) {
      bar0 = beatsF[c0];
      const at2 = (e, t) => { const i = Math.round(t); let m = 0; for (let k = i - 2; k <= i + 2; k++) if (e[k] > m) m = e[k]; return m; };
      const val = e => steps.map(r => r.map(t => at2(e, t)));
      const p90q = M => { const f = M.flat().sort((p, q) => p - q); return f[Math.floor(f.length * 0.9)] || 1; };
      // noise fills the gaps between harmonics too: score = how much the quieter 30% of frequencies rose (a chord or synth note leaves those gaps quiet)
      const riseBuf = new Float32Array(sbN);
      const snScore = t => { t = Math.round(t); if (t < 6 || t + 8 >= fr8) return 0; for (let i = 0; i < sbN; i++) { let a1 = 0, b1 = 0; for (let k = 0; k < 4; k++) { a1 += spec8[(t + 4 + k) * sbN + i]; b1 += spec8[(t - 2 - k) * sbN + i]; } riseBuf[i] = (a1 - b1) / 100; } const r = Array.from(riseBuf).sort((p, q) => p - q); return Math.max(0, r[Math.floor(sbN * 0.3)]); };
      const snAt = t => Math.max(snScore(t - 1), snScore(t), snScore(t + 1));
      const atW = (e, t, lo, hi) => { const i = Math.round(t); let m = 0; for (let k = i - lo; k <= i + hi; k++) if (e[k] > m) m = e[k]; return m; };
      const VK0 = val(el), VU = val(eu), VSold = val(em), VSn = steps.map(r => r.map(snAt));
      // an 808 note alone also jumps in the low band; a kick adds a short click (2-5 kHz). Only used when the song clearly has both kinds of low hits.
      const VK = (() => { const kq0 = p90q(VK0), VHr = val(eh), hq1 = p90q(VHr), rr = [];
        VK0.forEach((r, b) => r.forEach((v, i) => { if (v < 0.15 * kq0 && VSn[b][i] < 0.02 && VHr[b][i] > 0.45 * hq1) rr.push(VU[b][i] / VHr[b][i]); })); rr.sort((p, q) => p - q);
        const hr = rr.length > 16 ? rr[Math.floor(rr.length * 0.8)] : 0, VUr = VU.map((r, b) => r.map((u, i) => Math.max(0, u - hr * VHr[b][i]))), hits = [];
        VK0.forEach((r, b) => r.forEach((v, i) => { if (v > 0.45 * kq0) hits.push(VUr[b][i]); }));
        if (hits.length < 16) return VK0; const srt = hits.slice().sort((p, q) => p - q), ref = srt[Math.floor(srt.length * 0.75)] || 0; if (!ref) return VK0;
        const lowShare = hits.filter(u => u < 0.2 * ref).length / hits.length, highShare = hits.filter(u => u > 0.6 * ref).length / hits.length;
        if (lowShare < 0.15 || highShare < 0.3) return VK0;
        return VK0.map((r, b) => r.map((v, i) => VUr[b][i] < 0.2 * ref && v > 0.45 * kq0 ? v * 0.3 : v)); })();
      const VH = steps.map(r => r.map((t, i) => i % 2 ? atW(eh, t, 2, Math.max(2, Math.round(0.35 * ((r[1] - r[0]) || 4)))) : at2(eh, t)));
      const VS = VSn.map((r, b) => r.map((v, i) => v * Math.min(1, 4 * VSold[b][i] / (p90q(VSold) || 1)))); // must also be an onset in the old sense
      // reference level for "a real hit"; for sparse parts (one snare a bar) the 90th percentile lands on silence, so step up
      const p90 = M => { const f = M.flat().sort((p, q) => p - q); return f[Math.floor(f.length * 0.9)] || 1; };
      // snares can be very sparse (one a bar): there the 90th percentile lands on silence, so step up
      const p90s = M => { const f = M.flat().sort((p, q) => p - q), L = f.length; let v = f[Math.floor(L * 0.9)]; const top = f[Math.floor(L * 0.99)] || 0; if (v < 0.25 * top) v = f[Math.floor(L * 0.96)]; return v || 1; };
      // kick click leaks into the mid band: remove the smallest typical ratio
      const kq = p90(VK), kickHits = []; VK.forEach((r, b) => r.forEach((v, i) => { if (v > 0.45 * kq) kickHits.push(VS[b][i] / (v || 1)); }));
      kickHits.sort((p, q) => p - q); const leak = kickHits.length ? 0.5 * kickHits[Math.floor(kickHits.length * 0.1)] : 0;
      // hats leak into the mid band too: remove that share, measured where hats hit without a kick
      const hq = p90(VH), hatHits = []; VH.forEach((r, b) => r.forEach((v, i) => { if (v > 0.45 * hq && VK[b][i] < 0.2 * kq) hatHits.push(VS[b][i] / (v || 1)); }));
      hatHits.sort((p, q) => p - q); const hleak = hatHits.length > 8 ? hatHits[Math.floor(hatHits.length * 0.3)] : 0;
      // a snare/clap has clearly more mid than a hat does; only hat-like steps get the hat share removed
      const VS2 = VS.map((r, b) => r.map((v, i) => { const k = Math.max(0, v - leak * VK[b][i]); return k > 2 * hleak * VH[b][i] ? k : Math.max(0, k - hleak * VH[b][i]); }));
      // snares and claps also spill into the top band: measure that share on strong snare hits and remove it from the hats
      const sq = p90s(VS2), snHits = []; VS2.forEach((r, b) => r.forEach((v, i) => { if (v > 0.6 * sq) snHits.push(VH[b][i] / (v || 1)); }));
      snHits.sort((p, q) => p - q); const sleak = snHits.length > 4 ? snHits[Math.floor(snHits.length * 0.5)] : 0;
      const hq0 = p90(VH), khits = []; VK.forEach((r, b) => r.forEach((v, i) => { if (v > 0.45 * kq && i > 0 && i < 15 && r && VH[b][i - 1] < 0.3 * hq0 && VH[b][i + 1] < 0.3 * hq0) khits.push(VH[b][i] / (v || 1)); })); khits.sort((p, q) => p - q);
      const kleakH = khits.length > 8 ? khits[Math.floor(khits.length * 0.2)] : 0;
      const VH2 = VH.map((r, b) => r.map((v, i) => Math.max(0, v - sleak * VS2[b][i] - kleakH * VK[b][i])));
      const summarize = (M, th, qf) => {
        const q = (qf || p90)(M) || 1, frac = new Array(16).fill(0), vel = new Array(16).fill(0);
        M.forEach(r => r.forEach((v, i) => { if (v > th * q) { frac[i]++; vel[i] += Math.min(1.5, v / q); } }));
        const nb2 = M.length; return { on: frac.map(f => f / nb2 >= 0.6), ghost: frac.map(f => f / nb2 >= 0.3 && f / nb2 < 0.6), vel: vel.map((v, i) => frac[i] ? +(Math.min(1, v / frac[i])).toFixed(2) : 0), freq: frac.map(f => +(f / nb2).toFixed(2)) };
      };
      // only bars where drums are playing count toward the main pattern (intros and breakdowns would water it down)
      const act = VK.map((r, b) => Math.max(...r) > 0.45 * kq || Math.max(...VS2[b]) > 0.5 * sq), useAct = act.filter(Boolean).length >= 4, sel = M => useAct ? M.filter((_, b) => act[b]) : M;
      const Kr = summarize(sel(VK), 0.45), Sr = summarize(sel(VS2), 0.5, p90s), Hr = summarize(sel(VH2), 0.4);
      // a step that is much louder on average than the typical step is a real hit, even if it misses some bars
      const means = M => Array.from({ length: 16 }, (_, i) => M.reduce((p, r) => p + r[i], 0) / M.length);
      [[Kr, sel(VK)], [Sr, sel(VS2)], [Hr, sel(VH2)]].forEach(([R, M]) => { const mu = means(M), med = mu.slice().sort((p, q) => p - q)[8] || 1e-9; R.freq.forEach((f, i) => { if (!R.on[i] && f >= 0.4 && mu[i] >= 2 * med) { R.on[i] = true; R.ghost[i] = false; } }); });
      // which beat is "1"? test the 4 rotations: kick on 1, snare on 2 and 4 (backbeat) or on 3 (half-time)
      let rot = 0, rS = -1e9;
      for (const r of [0, 4, 8, 12]) { const k = i => Kr.freq[(i + r) % 16], sn = i => Sr.freq[(i + r) % 16]; const v = k(0) * 1.5 + 0.5 * k(8) + Math.max(sn(4) + sn(12), 2 * sn(8)) - 0.5 * sn(0); if (v > rS + 1e-6) { rS = v; rot = r; } }
      if (forced && forced.downbeatShift) rot = ((rot + 4 * forced.downbeatShift) % 16 + 16) % 16; // bar 1 moved by the user, in beats (the drum pattern, bar 1 and everything after follow it)
      const rotA = A2 => A2.slice(rot).concat(A2.slice(0, rot));
      const fixR = R => ({ on: rotA(R.on), ghost: rotA(R.ghost), vel: rotA(R.vel), freq: rotA(R.freq) });
      const K = fixR(Kr), S = fixR(Sr), H = fixR(Hr);
      // a snare hides whether a hat plays under it: decide those steps from the hats around them
      S.on.forEach((on, i) => { if (!on) return; const peers = []; for (let j = i % 2; j < 16; j += 2) if (!S.on[j]) peers.push(H.on[j]); if (peers.length >= 4) H.on[i] = peers.filter(Boolean).length / peers.length >= 0.75; });
      if (rot) { const k = c0 + rot / 4; if (k < nbt) bar0 = beatsF[k]; }
      downK0 = c0 + rot / 4;
      // drift check: how far did the tracked beats wander from a fixed grid? (shows how much tracking helped)
      pat = { kick: K.on, snare: S.on, hats: H.on, ghost: { kick: K.ghost, snare: S.ghost, hats: H.ghost }, vel: { kick: K.vel, snare: S.vel, hats: H.vel }, freq: { kick: K.freq, snare: S.freq, hats: H.freq }, bars: steps.length, tracked: true };
      { const flatT = steps.flat(), kq1 = p90(sel(VK)), sq1 = p90s(sel(VS2)), hq1 = p90(sel(VH2));
        pat.rowsAt = r0 => { const re = M => { const f = M.flat().slice(r0), o = []; for (let i = 0; i + 16 <= f.length; i += 16) o.push(f.slice(i, i + 16)); return o; }, R = { K: re(VK), S: re(VS2), H: re(VH2), kq: kq1, sq: sq1, hq: hq1, t: [] };
          for (let i = 0; r0 + 16 * i + 15 < flatT.length; i++) R.t.push((start + flatT[r0 + 16 * i] * hop) / SR); return R; };
        pat.rot = rot; pat.rows = pat.rowsAt(rot); }
      // swing: how late do the in-between 16th notes land, compared with the 8th notes?
      { const pkAt = (e, lo, hi) => { lo = Math.ceil(lo); hi = Math.floor(hi); let bi = -1, bv = 0; for (let i = lo; i <= hi; i++) if (e[i] > bv) { bv = e[i]; bi = i; } if (bi < 1 || (bi === hi && e[bi + 1] > bv) || (bi === lo && e[bi - 1] > bv)) return null; const y0 = e[bi - 1], y2 = e[bi + 1] || 0, d = y0 - 2 * bv + y2; return { pos: bi + (d ? 0.5 * (y0 - y2) / d : 0), v: bv }; };
        const hq2 = p90(VH), offs = [], refs = [], med = A => A.length ? A.slice().sort((p, q) => p - q)[Math.floor(A.length / 2)] : 0;
        for (let k = 0; k + 1 < nbt; k++) { const b0 = beatsF[k], s16 = (beatsF[k + 1] - b0) / 4;
          for (const q of [1, 3]) { const pk = pkAt(eh, b0 + (q - 0.3) * s16, b0 + (q + 0.6) * s16); if (pk && pk.v > 0.35 * hq2) offs.push((pk.pos - (b0 + q * s16)) / s16); }
          const pr = pkAt(eh, b0 + 1.6 * s16, b0 + 2.4 * s16); if (pr && pr.v > 0.35 * hq2) refs.push((pr.pos - (b0 + 2 * s16)) / s16); }
        pat.swing = offs.length >= 16 ? { late: +Math.max(0, med(offs) - med(refs)).toFixed(2), n: offs.length } : null; }
      // tracked tempo (median beat length) refines the BPM
      const ib = []; for (let k = 1; k < nbt; k++) ib.push(beatsF[k] - beatsF[k - 1]); ib.sort((p, q) => p - q);
      const medB = ib[Math.floor(ib.length / 2)]; let mb = 0, mc = 0; ib.forEach(v => { if (Math.abs(v - medB) < 0.15 * medB) { mb += v; mc++; } });
      const tb = 60 * fps / (mb / (mc || 1)); if (Math.abs(tb - bpm) < 3) pat.trackedBpm = tb;
    }
  }
  function fold(e) {
    const acc = new Float32Array(16), cnt = new Float32Array(16);
    for (let t = bar0; t + 16 * stepLen < e.length; t += 16 * stepLen) for (let s = 0; s < 16; s++) { acc[s] += at(e, t + s * stepLen); cnt[s]++; }
    const v = Array.from(acc, (a, i) => a / (cnt[i] || 1)); const mx = Math.max(...v) || 1;
    return v.map(q => q / mx);
  }
  const fK = fold(el), fS = fold(em), fH = fold(eh);
  const pick = (f, th) => f.map(v => v >= th);
  // mid band also hears hats; subtract a share of the high band before picking snare hits
  // the kick's click also lands in the mid band: remove the typical kick bleed, keep what's extra
  const kSteps = fK.map((v, i) => i).filter(i => fK[i] > 0.5), ratios = kSteps.map(i => fS[i] / (fK[i] || 1)).sort((p, q) => p - q);
  const bleed = ratios.length ? ratios[0] : 0;
  const fS2 = fS.map((v, i) => Math.max(0, v - bleed * fK[i])), mS = Math.max(...fS2) || 1;
  const fH2 = fH.map((v, i) => Math.max(0, v - 0.5 * fS2[i] / mS)), mH = Math.max(...fH2) || 1;
  let kick = pick(fK, 0.55), snare = pick(fS2.map(v => v / mS), 0.6), hats = pick(fH2.map(v => v / mH), 0.5);
  if (pat) { kick = pat.kick; snare = pat.snare; hats = pat.hats; }
  const LA = acfAt(el, maxLag), HA = acfAt(eh, maxLag);
  const rhythm = {
    fourFloor: [0, 4, 8, 12].every(i => kick[i]),
    kickPerBar: kick.filter(Boolean).length,
    hatDiv: HA(beat / 4) > 0.3 && HA(beat / 4) > HA(beat / 2) * 0.7 ? 16 : (HA(beat / 2) > 0.25 ? 8 : 4),
    lowPulse: +LA(beat).toFixed(2),
    busy: +(eAll.reduce((p, q) => p + q, 0) / eAll.length).toFixed(1)
  };
  if (pat && pat.trackedBpm && !(forced && forced.bpm > 0)) { const r1 = Math.round(pat.trackedBpm), r10 = Math.round(pat.trackedBpm * 10) / 10; bpm = tempoFit ? (Math.abs(pat.trackedBpm - r1) < 0.03 ? r1 : Math.round(pat.trackedBpm * 100) / 100) : Math.abs(pat.trackedBpm - r1) < 0.25 ? r1 : r10; }
  await gate(); onProg(45, "Mapping the arrangement and frequency balance…");

  // ---- sections + spectral bands over whole track ----
  const N2 = 4096, hop2 = 2048, m2 = new Float32Array(N2 / 2);
  const edges = [20, 60, 250, 800, 2500, 6000, 11000];
  const bandBins = edges.map(f => Math.round(f * N2 / SR));
  const barSec = 240 / bpm, nBars = Math.max(1, Math.floor(dur / barSec));
  const barE = Array.from({ length: nBars }, () => ({ rms: 0, n: 0, bands: new Float64Array(6) }));
  let lastP = 45;
  for (let off = 0; off + N2 <= n22; off += hop2) {
    const b = Math.min(nBars - 1, Math.floor(off / SR / barSec));
    let e = 0; for (let i = off; i < off + hop2; i++) e += x[i] * x[i];
    barE[b].rms += e / hop2; barE[b].n++;
    if ((off / hop2) % 2 === 0) {
      mag(x, off, N2, m2);
      for (let k = 0; k < 6; k++) { let s = 0; for (let i = bandBins[k]; i < bandBins[k + 1]; i++) s += m2[i] * m2[i]; barE[b].bands[k] += s; }
    }
    const p = 45 + Math.round(35 * off / n22); if (p > lastP + 4) { lastP = p; onProg(p, "Mapping the arrangement and frequency balance…"); await gate(); }
  }
  const barDb = barE.map(b => 10 * Math.log10((b.rms / (b.n || 1)) + 1e-12));
  // blocks of 8 bars (4 if short)
  const blk = nBars >= 48 ? 8 : 4, nBlk = Math.ceil(nBars / blk), blocks = [];
  for (let i = 0; i < nBlk; i++) {
    const s = i * blk, e = Math.min(nBars, s + blk), sl = barDb.slice(s, e);
    const bands = new Float64Array(6); for (let k = s; k < e; k++) for (let j = 0; j < 6; j++) bands[j] += barE[k].bands[j];
    const tot = bands.reduce((p, q) => p + q, 0) || 1;
    blocks.push({ s, e, db: sl.reduce((p, q) => p + q, 0) / sl.length, low: (bands[0] + bands[1]) / tot, bands });
  }
  // Sections: find real changes (loudness jumps of 2.5+ dB or a clear tone change), not tiny wiggles.
  const valid = blocks.filter(b => b.db > -80), dbMax = Math.max(...valid.map(b => b.db));
  blocks.forEach(b => { const t = b.bands.reduce((p, q) => p + q, 0) || 1; b.share = Array.from(b.bands, v => v / t); b.down = dbMax - b.db; });
  const dist = (a, b) => a.share.reduce((p, v, j) => p + Math.abs(v - b.share[j]), 0) / 2;
  const segs = [];
  blocks.forEach((b, i) => {
    const prev = blocks[i - 1];
    const cut = !prev || Math.abs(b.db - prev.db) >= 2.5 || dist(b, prev) >= 0.12;
    if (cut) segs.push({ blocks: [b] }); else segs[segs.length - 1].blocks.push(b);
  });
  // fold tiny segments (one short block between two similar ones) back into the neighbor
  for (let i = 1; i < segs.length - 1; i++) {
    const sg = segs[i]; const bars = sg.blocks.reduce((p, b) => p + b.e - b.s, 0);
    if (bars < 8 && Math.abs(segs[i - 1].blocks[0].db - segs[i + 1].blocks[0].db) < 2.5) { segs[i - 1].blocks.push(...sg.blocks, ...segs[i + 1].blocks); segs.splice(i, 2); i--; }
  }
  segs.forEach(sg => { sg.down = sg.blocks.reduce((p, b) => p + b.down, 0) / sg.blocks.length; sg.low = sg.blocks.reduce((p, b) => p + b.low, 0) / sg.blocks.length; });
  const spread = Math.max(...segs.map(x => x.down)) - Math.min(...segs.map(x => x.down));
  const medLow = blocks.map(b => b.low).sort((a, b) => a - b)[Math.floor(blocks.length / 2)];
  const steady = segs.length === 1 || spread < 3;
  segs.forEach((sg, i) => {
    const edge = i === 0 ? "Intro" : i === segs.length - 1 ? "Outro" : "Breakdown";
    if (steady) sg.label = (sg.down >= 6 && (i === 0 || i === segs.length - 1)) ? edge : "Groove";
    else if (sg.down <= 1.5 && sg.low >= medLow * 0.85) sg.label = "Drop";
    else if (sg.down >= 5) sg.label = edge;
    else sg.label = "Groove";
  });
  if (!steady) segs.forEach((sg, i) => { const nx = segs[i + 1]; if (sg.label === "Groove" && nx && nx.label === "Drop" && i > 0 && sg.blocks.reduce((p, b) => p + b.e - b.s, 0) <= 16) sg.label = "Build"; });
  const sections = [];
  segs.forEach(sg => { const s0 = sg.blocks[0].s, bars = sg.blocks.reduce((p, b) => p + b.e - b.s, 0); const last = sections[sections.length - 1]; if (last && last.label === sg.label) last.bars += bars; else sections.push({ label: sg.label, startBar: s0, bars }); });
  const steadyGroove = steady;
  sections.forEach(s => { s.start = +(s.startBar * barSec).toFixed(1); s.end = +((s.startBar + s.bars) * barSec).toFixed(1); });
  // spectral balance from the loudest blocks
  const loud = blocks.slice().sort((a, b) => b.db - a.db).slice(0, Math.max(1, Math.round(blocks.length * 0.3)));
  const bandSum = new Float64Array(6); loud.forEach(b => b.bands.forEach((v, j) => bandSum[j] += v));
  const bt = bandSum.reduce((p, q) => p + q, 0) || 1;
  const balance = Array.from(bandSum, v => +(100 * v / bt).toFixed(1));
  // dynamics of the loud part
  let lr = 0, lc = 0, lp = 0;
  loud.forEach(b => { const s0 = Math.floor(b.s * barSec * SR), e0 = Math.min(n22, Math.floor(b.e * barSec * SR)); for (let i = s0; i < e0; i += 2) { lr += x[i] * x[i]; lc++; const a = Math.abs(x[i]); if (a > lp) lp = a; } });
  const loudRms = 20 * Math.log10(Math.sqrt(lr / (lc || 1)) + 1e-9), crest = 20 * Math.log10((lp + 1e-9)) - loudRms;
  await gate(); onProg(84, "Detecting the key…");

  // ---- key ----
  const N3 = 8192, m3 = new Float32Array(N3 / 2), notesAcc = [];
  const stepK = Math.max(N3 / 2, Math.floor(n22 / 900)), frameT = [];
  let cs = 0, sn = 0;
  for (let off = 0; off + N3 <= n22; off += stepK) {
    mag(x, off, N3, m3); const v = new Float32Array(128);
    for (let i = 10; i < N3 / 2 - 1; i++) {
      const f = i * SR / N3; if (f > 2200) break;
      const p = 12 * Math.log2(f / 440) + 69, r = Math.round(p);
      if (m3[i] > m3[i - 1] && m3[i] >= m3[i + 1]) { const ang = 2 * Math.PI * (p - r); cs += m3[i] * Math.cos(ang); sn += m3[i] * Math.sin(ang); }
    }
    notesAcc.push(m3.slice(0, Math.ceil(2200 * N3 / SR) + 2)); frameT.push((off + N3 / 2) / SR);
  }
  const tune = Math.atan2(sn, cs) / (2 * Math.PI);
  const chroma = new Array(12).fill(0), frameChroma = [], bassHist = new Array(12).fill(0);
  for (const fr of notesAcc) {
    const v = new Float32Array(128);
    for (let i = 10; i < fr.length - 1; i++) { const f = i * SR / N3; const p = 12 * Math.log2(f / 440) + 69 - tune, r = Math.round(p); if (r < 36 || r > 95 || Math.abs(p - r) > 0.4) continue; if (fr[i] > v[r]) v[r] = fr[i]; }
    const t = new Array(12).fill(0); let s = 0;
    for (let r = 36; r <= 95; r++) { const q = Math.log1p(20 * v[r]); t[r % 12] += q; s += q; }
    if (s > 0) for (let k = 0; k < 12; k++) chroma[k] += t[k] / s;
    // bass-weighted chroma for chords (C2–B4 matters most for harmony)
    const c2 = new Array(12).fill(0); for (let r = 36; r <= 71; r++) c2[r % 12] += Math.log1p(20 * v[r]) * (r < 60 ? 1.3 : 1);
    frameChroma.push(c2);
    // lowest strong note (bass / 808 fundamental, E1–E3): the bass usually sits on the home note
    let bn = -1, bv = 0; for (let i = 10; i < fr.length - 1; i++) { const f = i * SR / N3; if (f > 170) break; const p = 12 * Math.log2(f / 440) + 69 - tune, r = Math.round(p); if (r < 24 || Math.abs(p - r) > 0.4) continue; if (fr[i] > bv) { bv = fr[i]; bn = r; } }
    if (bn >= 0) bassHist[bn % 12] += Math.log1p(20 * bv);
  }
  const cands = [];
  const bTot = bassHist.reduce((p, q) => p + q, 0) || 1, bShare = bassHist.map(v => v / bTot);
  for (let t = 0; t < 12; t++) for (const mi of [0, 1]) {
    let sc = 0; for (const P of [PROF, PROF_K]) { const p = P[mi], rot = p.map((_, i) => p[((i - t) % 12 + 12) % 12]); sc += corr(chroma, rot) / 2; }
    // bass on the home note is strong evidence (fixes major vs relative-minor mix-ups)
    sc += 0.6 * (bShare[t] - 1 / 12) + 0.1 * (bShare[(t + 7) % 12] - 1 / 12);
    cands.push([sc, t, mi]);
  }
  cands.sort((a, b) => b[0] - a[0]);
  let [kr, kt, kmi] = cands[0];
  // ---- chords per bar ----
  const KEY_PRIOR_OUT = 0.8, priorFor = (t, m) => ({ out: KEY_PRIOR_OUT, key: NAMES[t] + (m ? " minor" : " major"), scale: new Set((m ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map(d => (d + t) % 12)) });
  const priorEarly = priorFor(kt, kmi);
  const ONSET_LAG = 0.032; // onset frames are stamped at the window start; the hit lands ~32 ms later (measured on test songs)
  const fr2s = f => +((start + f * hop) / SR + ONSET_LAG).toFixed(4);
  const firstDownOf = b0 => { let f = (((start + b0 * hop) / SR + ONSET_LAG) % barSec + barSec) % barSec; if (f > barSec / 2) f -= barSec; return f; }; // bar 1 starts at (or just before) the top of the song
  const gridOf = (dk = downK0) => ({ source: tempoFit ? (tempoFit.locked ? "constant-locked" : "constant-fit") : beatsF.length >= 16 ? "dp-tracker" : "dp-tracker (too few beats; downbeats not chosen)",
    beats: beatsF.map(fr2s), downbeats: dk == null ? [] : beatsF.filter((_, k) => ((k - dk) % 4 + 4) % 4 === 0).map(fr2s) });
  /* Version B, B2: which beat is "1" when there is no backbeat. Kick and snare chose bar 1 above; with no snare or clap on any step (piano,
     synth and chiptune pieces, ballads) that choice has no evidence behind it (the "kick" is the bass). There the notes decide: long notes
     and bass notes start on beat 1 more than anywhere else. The full-track transcription is read once on the current grid and its
     duration-weighted onsets are counted on the 8 eighth-note positions of a bar; a clear winner moves bar 1 there, by half a beat when
     it is an off-beat (which also fixes beats locked onto the 8ths). Notes keep their times; only their bar and beat are relabelled.
     Measured on a MIDI render with a two-note pickup (bench/paired-renders): bar 1 lands on the first chord. Not used when drums decide.
     Version B, B3 (issue #50): the same rule also runs when the drum evidence MEASURES no drums, because the snare steps the tracker finds on a
     piano are its attacks, not a backbeat. A syncopated piece gives the vote nothing to count (even perfect MIDI onsets favour the off-beats on
     3 of 4 renders), so the vote must win by a margin that is significant for the number of notes behind it ((best - second) / sqrt(best + second) >= BAR1.voteZ, the same on a 10 s loop and a 4 minute song). Without that, if the audio starts within BAR1.startWithin
     seconds the first sound is taken as bar 1 (a loop or bounce cut at a bar line): the beat lattice is moved half a beat if it sits on the
     off-beats and is extended back to that sound. A track that starts on a pickup with too few notes to vote is misread by this fallback. */
  let early = null, rephased = 0, anchor = null, voted = false;
  /* The beat phase (which beats are beats) and bar 1 are decided from the grid as the engine chose it, b0; a bar-1 move by the person is then
     added on top (forced.downbeatShift), so moving bar 1 never changes which beats the track lands on. */
  const shift = (forced && forced.downbeatShift) || 0, B0 = (((downK0 == null ? 0 : downK0) - shift) % 4 + 4) % 4;
  const de0 = drumEvidence(x, SR), noDrums = !!(de0 && de0.found === false);
  if (pat && downK0 != null && (!snare.some(Boolean) || noDrums) && beatsF.length >= 16) {
    const fd0 = firstDownOf(beatsF[B0]), G0 = (() => { try { return TimeMap.forAnalysis({ duration: dur, bpm, barSec, firstDown: fd0, grid: gridOf(B0) }); } catch (e) { return null; } })();
    early = G0 && G0.tracked ? transcribeTrack(x, SR, G0, fd0, barSec, nBars, dur, sections, tune, priorEarly) : null;
    if (early) {
      const T = beatsF.map(fr2s), e8 = []; for (let k = 0; k + 1 < T.length; k++) e8.push(T[k], (T[k] + T[k + 1]) / 2);
      const near = t => { let lo = 0, hi = e8.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (e8[m] <= t) lo = m; else hi = m; } return Math.abs(e8[hi] - t) < Math.abs(e8[lo] - t) ? hi : lo; };
      const v = new Array(8).fill(0); let cnt = 0;
      for (const [part, w] of [["lead", 1], ["bass", 1.5]]) for (const n of early[part]) { const i = near(n.on); if (Math.abs(e8[i] - n.on) > 0.04) continue; v[((i - 2 * B0) % 8 + 8) % 8] += w * Math.min(4, n.dur); cnt++; }
      const best = v.indexOf(Math.max(...v)), second = Math.max(...v.filter((_, i) => i !== best));
      voted = cnt >= 32 && v[best] >= 1.2 * second && (!noDrums || (v[best] - second) / Math.sqrt(v[best] + second) >= BAR1.voteZ); if (voted && best !== 0) rephased = best;
    }
    if (!voted && noDrums) { // B3 fallback: the first sound is bar 1
      const t0 = firstSound(x, SR), T = beatsF.map(fr2s);
      if (t0 != null && t0 < BAR1.startWithin) { anchor = { t0 }; rephased = (((Math.round((t0 - T[B0]) / ((T[T.length - 1] - T[0]) / (T.length - 1) / 2))) % 8) + 8) % 8; }
    }
    if (rephased || anchor) {
      const half = rephased % 2, s16 = 2 * rephased;
      if (half) { const nb = []; for (let k = 0; k + 1 < beatsF.length; k++) nb.push((beatsF[k] + beatsF[k + 1]) / 2); beatsF.length = 0; beatsF.push(...nb); if (tempoFit) tempoFit.phase += fps * 30 / tempoFit.bpm; }
      downK0 = ((B0 + (rephased - half) / 2 + shift) % 4 + 4) % 4;
      if (anchor) { // extend the lattice back to the first sound; the beat there is bar 1
        const Pf = beatsF[1] - beatsF[0]; while (beatsF.length < 4000 && fr2s(beatsF[0] - Pf) >= anchor.t0 - 0.03) beatsF.unshift(beatsF[0] - Pf);
        let bi = 0, bd = Infinity; beatsF.forEach((f, k) => { const d = Math.abs(fr2s(f) - anchor.t0); if (d < bd) { bd = d; bi = k; } }); downK0 = ((bi + shift) % 4 + 4) % 4;
      }
      bar0 = beatsF[downK0];
      const r16 = A => A.slice(s16 % 16).concat(A.slice(0, s16 % 16));
      for (const k of ["kick", "snare", "hats"]) { pat[k] = r16(pat[k]); for (const g of ["ghost", "vel", "freq"]) if (pat[g]) pat[g][k] = r16(pat[g][k]); }
      kick = pat.kick; snare = pat.snare; hats = pat.hats; rhythm.fourFloor = [0, 4, 8, 12].every(i => kick[i]);
      if (pat.rowsAt) pat.rows = pat.rowsAt(pat.rot + s16);
    }
  }
  let firstDown = firstDownOf(bar0);
  // where the drums change: one pattern per 8 bars, merging neighbours that are (nearly) the same
  let drumParts = null;
  if (pat && pat.rows) { const R = pat.rows, parts = [], f = (M, q, th, i0, i1) => { const fr = new Array(16).fill(0); for (let i = i0; i < i1; i++) M[i].forEach((v, j) => { if (v > th * q) fr[j]++; }); return fr.map(c => c / (i1 - i0) >= 0.6); };
    const hideFix = p => { p.snare.forEach((on, i) => { if (!on) return; const peers = []; for (let j = i % 2; j < 16; j += 2) if (!p.snare[j]) peers.push(p.hats[j]); if (peers.length >= 4) p.hats[i] = peers.filter(Boolean).length / peers.length >= 0.75; }); return p; };
    for (let i = 0; i + 4 <= R.t.length; i += 8) { const i1 = Math.min(R.t.length, i + 8), p = hideFix({ startBar: Math.max(0, Math.round((R.t[i] - firstDown) / barSec)), bars: i1 - i, kick: f(R.K, R.kq, 0.45, i, i1), snare: f(R.S, R.sq, 0.5, i, i1), hats: f(R.H, R.hq, 0.4, i, i1) });
      const last = parts[parts.length - 1], diff = last ? ["kick", "snare"].reduce((t, k) => t + p[k].filter((v, j) => v !== last[k][j]).length, 0) : 99;
      if (last && (diff <= 3 || p.bars < 8)) last.bars += p.bars; else parts.push(p); }
    if (parts.length && parts[0].startBar <= 1) { parts[0].bars += parts[0].startBar; parts[0].startBar = 0; }
    drumParts = parts.slice(0, 16); }
  const chordAcc = Array.from({ length: nBars + 1 }, () => new Array(12).fill(0));
  frameChroma.forEach((c, i) => { const b = Math.floor((frameT[i] - firstDown) / barSec); if (b >= 0 && b <= nBars) c.forEach((v, k) => chordAcc[b][k] += v); });
  const scaleOf = (t0, mi0) => new Set((mi0 ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map(d => (d + t0) % 12));
  const chordBars = scale => chordAcc.slice(0, nBars).map(c => {
    const mean = c.reduce((p, q) => p + q, 0) / 12, z = c.map(v => v - mean), nz = Math.sqrt(z.reduce((p, v) => p + v * v, 0));
    if (!(nz > 0)) return "–";
    let best = "–", bs = -9;
    for (let r = 0; r < 12; r++) for (const [q, iv] of [["", [0, 4, 7]], ["m", [0, 3, 7]]]) {
      const tones = iv.map(d => (r + d) % 12);
      let sc = tones.reduce((p, t, j) => p + z[t] * (j === 0 ? 1.1 : 1), 0) / (nz * Math.sqrt(3));
      if (!tones.every(t => scale.has(t))) sc -= 0.08; // prefer chords that fit the key
      if (sc > bs) { bs = sc; best = NAMES[r] + q; }
    }
    return bs > 0.45 ? best : "–";
  });
  const loopOf = bc => { const loops = {}; for (let b = 0; b + 4 <= bc.length; b += 4) { const k = bc.slice(b, b + 4).join(" "); if (!k.includes("–")) loops[k] = (loops[k] || 0) + 1; } return Object.entries(loops).sort((x, y) => y[1] - x[1])[0]; };
  let barChords = chordBars(scaleOf(kt, kmi)), mainLoop = loopOf(barChords);
  // the chords back up the key: songs keep coming home to the tonic chord, and their chords fit the key's notes.
  // This fixes relative major/minor and neighbouring-key mix-ups (e.g. C major vs A minor, C# minor vs F# minor).
  { const heard = barChords.filter(c => c && c !== "–"); if (heard.length >= 4) {
      const triad = c => { const m = c.endsWith("m"), r = NAMES.indexOf(m ? c.slice(0, -1) : c); return [0, m ? 3 : 4, 7].map(d => (r + d) % 12); };
      const first = mainLoop ? mainLoop[0].split(" ")[0] : null, last = mainLoop ? mainLoop[0].split(" ")[3] : null;
      cands.forEach(cd => { const [, t, mi] = cd, sc = scaleOf(t, mi), tonic = NAMES[t] + (mi ? "m" : ""), dom = NAMES[(t + 7) % 12];
        const fit = heard.filter(c => triad(c).every(x => sc.has(x))).length / heard.length, home = heard.filter(c => c === tonic).length / heard.length;
        cd[0] += 0.5 * fit + 0.6 * home + (first === tonic ? 0.15 : 0) + (last === tonic || last === dom ? 0.05 : 0); });
      cands.sort((a, b) => b[0] - a[0]);
      if (cands[0][1] !== kt || cands[0][2] !== kmi) { [kr, kt, kmi] = cands[0]; barChords = chordBars(scaleOf(kt, kmi)); mainLoop = loopOf(barChords); }
      else kr = cands[0][0]; } }
  const keyDebug = { cands: cands.slice(0, 4).map(c => [NAMES[c[1]] + (c[2] ? 'm' : ''), +c[0].toFixed(3)]), bShare: bShare.map(v => +v.toFixed(2)) };
  const altKeys = cands.slice(1, 4).map(([r, t, mi]) => ({ key: NAMES[t] + (mi ? " minor" : " major"), camelot: (mi ? CAM_MIN : CAM_MAJ)[t], gap: +(kr - r).toFixed(3) }));
  // Section times (Phase 2c step 2): a section's bar numbers are mapped to time through TimeMap, i.e. onto the TRACKED bar lines when
  // there are any (they follow tempo drift), otherwise firstDown + n * barSec as before. The arrangement pass itself is unchanged.
  // `timing` records which grid gave the times, so a saved teardown keeps them (saved results do not keep the tracked grid).
  const grid = gridOf();
  const barGrid = (() => { try { return TimeMap.forAnalysis({ duration: dur, bpm, barSec, firstDown, grid }); } catch (e) { return null; } })();
  sections.forEach(s => {
    const a0 = barGrid ? barGrid.barStart(s.startBar) : firstDown + s.startBar * barSec, a1 = barGrid ? barGrid.barStart(s.startBar + s.bars) : firstDown + (s.startBar + s.bars) * barSec;
    s.start = +Math.max(0, a0).toFixed(2); s.end = +Math.min(dur, a1).toFixed(2); if (barGrid && barGrid.tracked) s.timing = "tracked";
  });
  const tr = transcribe(x, SR, firstDown, barSec, sections, tune);
  // the early transcription (no-backbeat path) is the same reading of the same 16th lattice; only bar, beat and section follow bar 1
  const priorFinal = priorFor(kt, kmi), full = early && barGrid && early.keyPrior && early.keyPrior.key === priorFinal.key ? relabelTrack(early, barGrid, sections) : transcribeTrack(x, SR, barGrid, firstDown, barSec, nBars, dur, sections, tune, priorFinal); // the early reading is reused only if the key did not change since
  onProg(100, "Done");
  const result = {
    swing: pat ? pat.swing || null : null, drumParts, hook: tr.hook || null, bassline: tr.bass || null,
    title: "", duration: +dur.toFixed(1), bpm: +bpm.toFixed(1), bpmConf: +bpmConf.toFixed(2),
    key: NAMES[kt] + (kmi ? " minor" : " major"), camelot: (kmi ? CAM_MIN : CAM_MAJ)[kt], keyConf: +(kr - cands[1][0]).toFixed(3), bassNote: NAMES[bShare.indexOf(Math.max(...bShare))],
    relKey: NAMES[kmi ? (kt + 3) % 12 : (kt + 9) % 12] + (kmi ? " major" : " minor"), altKeys,
    chords: { bars: barChords, loop: mainLoop ? mainLoop[0].split(" ") : null, loopCount: mainLoop ? mainLoop[1] : 0 }, firstDown: +firstDown.toFixed(3),
    pattern: Object.assign({ kick, snare, hats }, pat ? { ghost: pat.ghost, vel: pat.vel, freq: pat.freq, bars: pat.bars, tracked: true } : {}), rhythm, sections, steady: steadyGroove, barSec: +barSec.toFixed(3), nBars,
    balance, width: +width.toFixed(2), loudRms: +loudRms.toFixed(1), crest: +crest.toFixed(1), peakDb: +(20 * Math.log10(peak + 1e-9)).toFixed(1)
  };
  if (tempoFit) result.tempoFit = { method: "constant-comb-v1", bpm: +tempoFit.bpm.toFixed(3), ratio: tempoFit.ratio, quarters: tempoFit.quarters, locked: tempoFit.locked };
  if (rephased || anchor) result.downbeatFit = { method: anchor ? "first-sound-v1" : "note-onsets-v1", movedBy8ths: rephased }; // bar 1 chosen from the notes (no backbeat); see B2 above
  if (de0) result.drumEvidence = de0; // after every Version A field, like the fields below
  if (full) result.transcription = full; // after every Version A field, so those are untouched and in their original order
  { const regions = chordRegions(x, SR, barGrid, nBars, dur, tune, scaleOf(kt, kmi), full && full.bass, barChords); if (regions) result.chordRegions = { method: "chords-v2", regions }; }
  /* Measurement only (G0): the tracked beat and downbeat times in seconds, as the engine computed them.
     Non-enumerable, so saved history, account sync, sharing and the coach see exactly what they saw before.
     Section times use this grid (Phase 2c step 2); chords and MIDI still use firstDown + n * barSec. */
  try { Object.defineProperty(result, "grid", { value: grid, enumerable: false, configurable: true }); } catch (e) {}
  /* The decoded audio travels with the result (non-enumerable) instead of being written to the shared `lastBuffer` here,
     so an upload that has been superseded can never replace the buffer of the teardown on screen. */
  if (!opts_compare) try { Object.defineProperty(result, "__buf", { value: ab, enumerable: false, configurable: true }); } catch (e) {}
  return result;
}

return Object.freeze({ analyze, decode, analyzeDecoded, drumEvidence, transcribe, transcribeTrack, fitConstantTempo, tick, mag, detrend, acfAt, NAMES, CAM_MAJ, CAM_MIN, LIMITS, InputLimitError, fmtLen, ANALYSIS_STATS });
});
