"use strict";
/* Research candidates for a PIECEWISE tempo map (issue #57). Nothing here is wired into src/engine.js or the app: it is evaluated offline by
 * bench/tempo/run.js against the tempo-map fixtures, next to the engine's own beats (the "engine" row).
 *
 * Shared machinery: the comb table.
 *   For every candidate tempo c (geometric steps of `rel`, 70 to 200 BPM) and every integer starting phase p, the grid t_k = p + k * P_c (frames)
 *   has a cumulative sum of the evidence s at its beats. The score of that grid on any stretch [a, b) is then two lookups, so the best (tempo, phase) on
 *   any stretch costs one pass over (tempo, phase) pairs, and every candidate below is a different way of choosing stretches:
 *     const        one stretch (the whole track): the constant-tempo model the engine's fitConstantTempo implements (this is the same idea, not the same
 *                  code; "engine" is the actual engine)
 *     dp           exact optimal partition into stretches by dynamic programming: maximise sum(score) - lambda * (stretches - 1)   (the penalised
 *                  change-point objective PELT solves; at this size the O(M^2) recursion is exact and cheap), minimum stretch length, then a boundary
 *                  refinement pass on a finer step (coarse to fine)
 *     ctf          the founder's coarse-to-fine proposal, top down: fit the stretch with one grid, find the split that most improves the fit,
 *                  accept it when the gain exceeds lambda, recurse into both halves (handles A-B-A and several changes because every half is tested again)
 *     tempogram    local tempo by windowed comb scores over (time x tempo), decoded by Viterbi with a jump penalty; stretches are the runs of the decoded path
 *   Octave: the grid score is  sum(s at beats) - gamma * beats, so a grid twice as fast must earn its extra beats; the candidate list is
 *   not constrained by a prior beyond that (the engine's log-Gaussian prior at 125 BPM is optional, `prior`).
 */
/* the engine stamps an onset frame at its window start; the hit lands about 32 ms later (engine.js ONSET_LAG, measured on its test songs) */
const ONSET_LAG = 0.032;
class Comb {
  constructor(ev, o = {}) {
    this.ev = ev; this.fps = ev.fps; this.N = ev.N; this.s = ev.s;
    this.gamma = o.gamma ?? 0.35; this.prior = o.prior ?? 0; this.rel = o.rel ?? 0.0015;
    const lo = o.bpmLo ?? 70, hi = o.bpmHi ?? 180; /* the engine's own range (engine.js scans 70-180) */ this.bpm = []; for (let b = lo; b <= hi; b *= 1 + this.rel) this.bpm.push(b);
    this.C = this.bpm.length; this.P = this.bpm.map(b => this.fps * 60 / b); this.tbl = new Array(this.C);
    const N = this.N, s = this.s;
    for (let c = 0; c < this.C; c++) {
      const P = this.P[c], np = Math.ceil(P), K = Math.ceil(N / P) + 2, cum = new Float32Array(np * (K + 1)), cnt = new Int32Array(np);
      for (let p = 0; p < np; p++) { let acc = 0, k = 0; const base = p * (K + 1); cum[base] = 0;
        for (let t = p; t < N; t += P, k++) { acc += s[Math.round(t)] - this.gamma; cum[base + k + 1] = acc; } cnt[p] = k; }
      this.tbl[c] = { cum, cnt, K, np };
    }
  }
  /* score of grid (c, p) on frames [a, b): the sum over its beats in that stretch, and how many beats */
  score(c, p, a, b) {
    const P = this.P[c], T = this.tbl[c]; if (p >= T.np) return [0, 0];
    const kA = Math.max(0, Math.ceil((a - p) / P)), kB = Math.min(T.cnt[p], Math.ceil((b - p) / P)); if (kB <= kA) return [0, 0];
    const base = p * (T.K + 1); return [T.cum[base + kB] - T.cum[base + kA], kB - kA];
  }
  /* best phase for tempo c on [a, b): { S, p, n } (integer phase) */
  bestPhase(c, a, b) {
    const P = this.P[c], T = this.tbl[c]; let bs = -1e30, bp = 0, bn = 0;
    for (let p = 0; p < T.np; p++) { const base = p * (T.K + 1), kA = Math.max(0, Math.ceil((a - p) / P)), kB = Math.min(T.cnt[p], Math.ceil((b - p) / P));
      if (kB <= kA) continue; const v = T.cum[base + kB] - T.cum[base + kA]; if (v > bs) { bs = v; bp = p; bn = kB - kA; } }
    return { S: bs, p: bp, n: bn };
  }
  prior1(bpm) { return this.prior ? -this.prior * Math.pow(Math.log2(bpm / 125) / 0.9, 2) : 0; }
  /* best (tempo, phase) on [a, b): refined to sub-step tempo and sub-frame phase by parabolic interpolation. Also how far the peak stands above the
     tempo scan (z over the per-tempo best scores): the evidence that this stretch has a pulse at all. */
  fit(a, b, lo = 0, hi = Infinity) {
    const per = new Float32Array(this.C); let bc = -1, bs = -1e30, bph = null, sum = 0, sum2 = 0;
    for (let c = 0; c < this.C; c++) { if (this.bpm[c] < lo || this.bpm[c] > hi) { per[c] = 0; continue; } const r = this.bestPhase(c, a, b), v = r.S + (r.n ? this.prior1(this.bpm[c]) * r.n : 0); per[c] = v; sum += v; sum2 += v * v; if (v > bs) { bs = v; bc = c; bph = r; } }
    const m = sum / this.C, sd = Math.sqrt(Math.max(1e-12, sum2 / this.C - m * m));
    return { c: bc, bpm: this.bpm[bc], phase: bph.p, S: bs, n: bph.n, z: (bs - m) / sd, a, b, period: this.P[bc] };
  }
  /* Refine a fit on the raw evidence. The table's grid is anchored at frame 0, so changing its period moves the beats far from frame 0 the most: re-anchor
     at the stretch's middle beat, then scan a small joint neighbourhood (period within +-0.3 %, middle beat within +-1.5 frames) for the grid that
     lands on the real onset peaks (raw evidence, linearly interpolated). Used on the stretches a candidate ends with, not inside its search. */
  refine(f) {
    const raw = this.ev.tot, lerp = t => { const i = Math.floor(t), fr = t - i; return (raw[i] || 0) * (1 - fr) + (raw[i + 1] || 0) * fr; };
    const P0 = f.period, kmid = Math.round(((f.a + f.b) / 2 - f.phase) / P0), tm0 = f.phase + kmid * P0; let best = -1e30, bp = P0, bt = tm0;
    for (let e = -0.003; e <= 0.003 + 1e-9; e += 0.0002) { const P = P0 * (1 + e);
      for (let d = -1.5; d <= 1.5 + 1e-9; d += 0.25) { const tm = tm0 + d; let v = 0; for (let k = Math.ceil((f.a - tm) / P); tm + k * P < f.b; k++) v += lerp(tm + k * P); if (v > best) { best = v; bp = P; bt = tm; } } }
    const phase = ((bt % bp) + bp) % bp; return { ...f, period: bp, bpm: this.fps * 60 / bp, phase };
  }
  /* share of a stretch's beats that land on an onset (the evidence at the beat is more than `thr` standard deviations above the track's mean). A drumless stretch
     with one pad or bass onset per bar has a high comb score at the right BAR period and still hits only about one beat in four: the tempo in beats is
     then not identified, whatever the comb says. */
  hitRate(f, thr = 1) { let n = 0, h = 0; if (f.ramp) { for (const t of f.beatsSec) { n++; if (this.s[Math.round((t - ONSET_LAG) * this.fps)] > thr) h++; } }
    else for (let t = f.phase + Math.ceil((f.a - f.phase) / f.period) * f.period; t < f.b; t += f.period) { n++; if (this.s[Math.round(t)] > thr) h++; } return n ? h / n : 0; }
  /* beat times (seconds) of a fitted stretch */
  beats(f, a = f.a, b = f.b) { const P = f.period, out = []; let k = Math.ceil((a - f.phase) / P); for (let t = f.phase + k * P; t < b; t += P) out.push(t / this.fps + ONSET_LAG); return out; }
  /* best-phase score of every tempo on [a, b): the tempogram column */
  column(a, b) { const col = new Float32Array(this.C); for (let c = 0; c < this.C; c++) { const r = this.bestPhase(c, a, b); col[c] = r.n ? r.S + this.prior1(this.bpm[c]) * r.n : 0; } return col; }
}

const cache = (comb) => { const m = new Map(); return (a, b) => { const k = a + ":" + b; let f = m.get(k); if (!f) { f = comb.fit(a, b); m.set(k, f); } return f; }; };

/* ---- const: the whole track as one stretch ---- */
function constant(comb) { const f = comb.refine(comb.fit(0, comb.N)); return { name: "const", segs: [f] }; }

/* ---- dp: optimal partition ---- */
function dp(comb, o = {}) {
  const fps = comb.fps, N = comb.N, step = Math.round((o.stepSec ?? 2) * fps), minLen = Math.round((o.minSec ?? 8) * fps), lambda = o.lambda ?? 12, fit = cache(comb);
  const B = []; for (let t = 0; t < N; t += step) B.push(t); B.push(N);
  const M = B.length, best = new Float64Array(M).fill(-1e30), from = new Int32Array(M).fill(-1); best[0] = 0;
  for (let j = 1; j < M; j++) for (let i = 0; i < j; i++) {
    if (best[i] < -1e29) continue; const len = B[j] - B[i]; if (len < minLen && !(i === 0 && j === M - 1)) continue;
    const v = best[i] + fit(B[i], B[j]).S - (i === 0 ? 0 : lambda); if (v > best[j]) { best[j] = v; from[j] = i; } }
  let cuts = [], j = M - 1; while (j > 0) { cuts.push(B[j]); j = from[j]; if (j < 0) return constant(comb); } cuts.push(0); cuts.reverse();
  // coarse to fine: move each interior cut within +-step on a finer grid to where the two refitted sides score best
  const fine = Math.max(1, Math.round((o.fineSec ?? 0.1) * fps));
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < cuts.length - 1; i++) { let bs = -1e30, bt = cuts[i];
    for (let t = Math.max(cuts[i - 1] + minLen, cuts[i] - step); t <= Math.min(cuts[i + 1] - minLen, cuts[i] + step); t += fine) { const v = comb.fit(cuts[i - 1], t).S + comb.fit(t, cuts[i + 1]).S; if (v > bs) { bs = v; bt = t; } }
    cuts[i] = bt; }
  return { name: "dp", segs: cuts.slice(0, -1).map((a, i) => comb.refine(comb.fit(a, cuts[i + 1]))) };
}

/* ---- ctf: coarse-to-fine, top down ---- */
function ctf(comb, o = {}) {
  const fps = comb.fps, step = Math.round((o.stepSec ?? 2) * fps), minLen = Math.round((o.minSec ?? 8) * fps), lambda = o.lambda ?? 12, fit = cache(comb), out = [];
  const go = (a, b) => { const whole = fit(a, b); let bs = -1e30, bt = -1;
    if (b - a >= 2 * minLen) for (let t = a + minLen; t <= b - minLen; t += step) { const v = fit(a, t).S + fit(t, b).S; if (v > bs) { bs = v; bt = t; } }
    // A -> B -> A: no single split of the whole stretch explains it (each half still mixes two tempi), but two splits do. Try the best pair when one fails.
    if (o.lookahead !== false && (bt < 0 || bs - whole.S <= lambda) && b - a >= 3 * minLen) { let b3 = -1e30, t1 = -1, t2 = -1;
      for (let x = a + minLen; x <= b - 2 * minLen; x += step) for (let y = x + minLen; y <= b - minLen; y += step) { const v = fit(a, x).S + fit(x, y).S + fit(y, b).S; if (v > b3) { b3 = v; t1 = x; t2 = y; } }
      if (t1 >= 0 && b3 - whole.S > 2 * lambda) { go(a, t1); go(t1, t2); go(t2, b); return; } }
    if (bt < 0 || bs - whole.S <= lambda) { out.push(whole); return; }
    // refine the split on a fine step, then recurse
    const fine = Math.max(1, Math.round((o.fineSec ?? 0.1) * fps)); let b2 = -1e30, t2 = bt;
    for (let t = Math.max(a + minLen, bt - step); t <= Math.min(b - minLen, bt + step); t += fine) { const v = comb.fit(a, t).S + comb.fit(t, b).S; if (v > b2) { b2 = v; t2 = t; } }
    go(a, t2); go(t2, b); };
  go(0, comb.N); out.sort((p, q) => p.a - q.a);
  return { name: "ctf", segs: out.map(f => comb.refine(comb.fit(f.a, f.b))) };
}

/* ---- tempogram + Viterbi ---- */
function tempogram(comb, o = {}) {
  const fps = comb.fps, N = comb.N, hop = Math.round((o.hopSec ?? 1) * fps), half = Math.round((o.windowSec ?? 12) * fps / 2), kappa = o.kappa ?? 0.6, cap = o.cap ?? 80, C = comb.C;
  const T = []; for (let t = 0; t <= N; t += hop) T.push(t);
  const cols = T.map(t => comb.column(Math.max(0, t - half), Math.min(N, t + half)));
  // Viterbi, maximise sum(column) - kappa * min(|d index|, cap) per step. Distance transform in two passes.
  let prev = Float32Array.from(cols[0]); const back = T.map(() => new Int32Array(C));
  for (let ti = 1; ti < T.length; ti++) {
    const cur = new Float32Array(C), arg = back[ti], top = prev.indexOf(Math.max(...prev)), fwd = new Float32Array(C), fa = new Int32Array(C);
    for (let c = 0; c < C; c++) { let v = prev[c], a = c; if (c > 0 && fwd[c - 1] - kappa > v) { v = fwd[c - 1] - kappa; a = fa[c - 1]; } fwd[c] = v; fa[c] = a; }
    const bwd = new Float32Array(C), ba = new Int32Array(C);
    for (let c = C - 1; c >= 0; c--) { let v = fwd[c], a = fa[c]; if (c < C - 1 && bwd[c + 1] - kappa > v) { v = bwd[c + 1] - kappa; a = ba[c + 1]; } bwd[c] = v; ba[c] = a; }
    for (let c = 0; c < C; c++) { let v = bwd[c], a = ba[c]; const far = prev[top] - kappa * cap; if (far > v) { v = far; a = top; } cur[c] = cols[ti][c] + v; arg[c] = a; }
    prev = cur;
  }
  const path = new Int32Array(T.length); let c = prev.indexOf(Math.max(...prev)); for (let ti = T.length - 1; ti >= 0; ti--) { path[ti] = c; c = back[ti][c]; }
  // runs of the decoded path (tempo within 1.5 % = the same run), each refitted on its own stretch (halfway between neighbouring columns)
  const runs = []; let from = 0; for (let ti = 1; ti <= T.length; ti++) if (ti === T.length || Math.abs(comb.bpm[path[ti]] / comb.bpm[path[from]] - 1) > 0.015) { runs.push([from, ti - 1]); from = ti; }
  const minLen = Math.round((o.minSec ?? 8) * fps); let cuts = [0]; runs.forEach((r, i) => { if (i) cuts.push(Math.round((T[r[0]] + T[runs[i - 1][1]]) / 2)); }); cuts.push(N);
  cuts = cuts.filter((t, i, A) => i === 0 || i === A.length - 1 || (t - A[i - 1] >= minLen && A[A.length - 1] - t >= minLen));
  return { name: "tempogram", segs: cuts.slice(0, -1).map((a, i) => comb.refine(comb.fit(a, cuts[i + 1]))), path: Array.from(path, ci => comb.bpm[ci]) };
}


/* ---- coalesce: neighbouring stretches at the same tempo (within 1 %) whose grids also agree in PHASE at the join (within 25 ms), are one stretch. The
   optimiser splits a steady tempo into several when each piece may pick its own phase and tempo (real music: a steady 161 BPM track came out as five stretches
   at 161.35-161.49), which says nothing about the tempo map. A same-tempo pair whose phases DISAGREE stays split: that is a phase break (a section that
   returns to the same tempo off the old grid, as the 150 BPM drop does after the 128 BPM section in the local "Init" file), and a single grid would put its beats
   off the music. */
function coalesce(comb, res, o = {}) {
  const tol = o.tempoTol ?? 0.01, gapMs = o.gapMs ?? 25, fps = comb.fps; let segs = res.segs.slice(), merged = true;
  const gap = (p, q) => { const tb = q.a, t1 = p.phase + Math.round((tb - p.phase) / p.period) * p.period, t2 = q.phase + Math.round((tb - q.phase) / q.period) * q.period, d = Math.abs(t1 - t2) % p.period; return Math.min(d, p.period - d) * 1000 / fps; };
  while (merged) { merged = false;
    for (let i = 0; i + 1 < segs.length; i++) { const p = segs[i], q = segs[i + 1]; if (p.ramp || q.ramp || p.b !== q.a || Math.abs(Math.log(q.bpm / p.bpm)) > tol || gap(p, q) > gapMs) continue;
      const m = comb.refine(comb.fit(p.a, q.b, Math.min(p.bpm, q.bpm) * 0.98, Math.max(p.bpm, q.bpm) * 1.02));
      // z is the evidence that a tempo exists at all; two stretches at the same tempo and phase add evidence, and a long span only looks worse because real music
      // wanders by a few ms (merging a steady real track loses 13-68 % of the comb score, so the score cannot decide), so the merged stretch keeps the better z
      segs.splice(i, 2, { ...m, z: Math.max(p.z, q.z) }); merged = true; break; } }
  return { ...res, segs };
}

/* ---- ramps: a stretch whose best CONSTANT grid does not stand out (z below zmin) may be a gradual tempo change. Fit a grid whose period moves
   linearly in time from P0 (at the stretch's start) to P1 (at its end), on the raw evidence: scan P0 and P1 (0.6 % steps, within 30 % of each other)
   and the first beat's position (1-frame steps). z is how far the best of those grids stands above all the grids tried; it must reach the same zmin as
   a constant stretch, otherwise the stretch stays "unknown" (a drumless or silent ramp may simply not carry the evidence). */
function rampFit(comb, a, b, o = {}) {
  const fps = comb.fps, raw = comb.ev.tot, lerp = t => { const i = Math.floor(t), fr = t - i; return (raw[i] || 0) * (1 - fr) + (raw[i + 1] || 0) * fr; };
  const bp = []; for (let v = comb.bpm[0]; v <= comb.bpm[comb.C - 1]; v *= 1.006) bp.push(v);
  let rawMean = 0; for (let i = 0; i < raw.length; i++) rawMean += raw[i]; rawMean /= raw.length || 1; // a grid placed at random sees about this per beat
  let best = -1e30, bi = null, sum = 0, sum2 = 0, cnt = 0; const len = b - a;
  for (const b0 of bp) for (const b1 of bp) { if (Math.abs(Math.log(b1 / b0)) > 0.3) continue; const P0 = fps * 60 / b0, P1 = fps * 60 / b1;
    for (let t0 = a; t0 < a + P0; t0 += 1) { let t = t0, v = 0, n = 0; while (t < b) { v += lerp(t); n++; t += P0 + (P1 - P0) * (t - a) / len; }
      v -= n * rawMean; sum += v; sum2 += v * v; cnt++; if (v > best) { best = v; bi = [b0, b1, t0]; } } }
  const m = sum / cnt, sd = Math.sqrt(Math.max(1e-12, sum2 / cnt - m * m)); if (!bi) return null;
  const [b0, b1, t0] = bi, P0 = fps * 60 / b0, P1 = fps * 60 / b1, beats = []; let t = t0; while (t < b) { beats.push(t / fps + ONSET_LAG); t += P0 + (P1 - P0) * (t - a) / len; }
  return { a, b, bpm0: b0, bpm1: b1, bpm: Math.sqrt(b0 * b1), z: (best - m) / sd, ramp: true, beatsSec: beats };
}
function withRamps(comb, res, o = {}) {
  const zmin = o.zmin ?? 5, out = []; let run = [];
  const flush = () => { if (!run.length) return; const a = run[0].a, b = run[run.length - 1].b, r = (b - a) / comb.fps >= 4 ? rampFit(comb, a, b, o) : null;
    if (r && r.z >= zmin && comb.hitRate(r) >= (o.hmin ?? 0.5) && Math.abs(Math.log(r.bpm1 / r.bpm0)) > 0.01) out.push(r); else out.push(...run); run = []; };
  for (const f of res.segs) { if (f.z < zmin) run.push(f); else { flush(); out.push(f); } } flush();
  return { ...res, segs: out };
}

/* ---- octave: the comb cannot tell a tempo from its double when the double's extra beats are also onsets (hats on the 8ths at 87 BPM make 174 look as
   good as 87). The app already decides that once for the whole track, with its own rule (engine.js: autocorrelation score x a log-Gaussian prior around
   125 BPM, a.bpm). The candidates keep that decision at the start and then keep octave CONTINUITY: each stretch (in time order, skipping unknown ones) is
   moved by a factor of 1/2, 1 or 2 to the octave closest, in log tempo, to the stretch before it; the first is placed against the engine's tempo. A change
   of more than a factor of 1.41 between neighbouring stretches would be folded the wrong way (a step 100 -> 150 reads as 100 -> 75): that limit is stated in
   the report. (Anchoring every stretch to one whole-track number is worse: dev_multi spans 100-150 BPM and the engine says 98.7.) */
function foldOctaves(comb, res, anchorBpm) {
  if (!(anchorBpm > 0)) return res; let ref = anchorBpm;
  const segs = res.segs.map(f => { if (f.unknown) return f;
    const k = [-1, 0, 1].reduce((bk, q) => Math.abs(Math.log2(f.bpm * 2 ** q / ref)) < Math.abs(Math.log2(f.bpm * 2 ** bk / ref)) ? q : bk, 0); let g = f;
    if (k !== 0 && f.bpm * 2 ** k >= comb.bpm[0] * 1.03 && f.bpm * 2 ** k <= comb.bpm[comb.C - 1] / 1.03) { const m = 2 ** k; // outside the table's 70-180 range there is nothing to fold to: leave the stretch as it is
      if (f.ramp) { let beats = f.beatsSec; if (k < 0) { const sc = par => beats.filter((_, i) => i % 2 === par).reduce((x, t) => x + (comb.s[Math.round((t - ONSET_LAG) * comb.fps)] || 0), 0); beats = beats.filter((_, i) => i % 2 === (sc(0) >= sc(1) ? 0 : 1)); }
        else { const out = []; beats.forEach((t, i) => { out.push(t); if (i + 1 < beats.length) out.push((t + beats[i + 1]) / 2); }); beats = out; }
        g = { ...f, bpm0: f.bpm0 * m, bpm1: f.bpm1 * m, bpm: f.bpm * m, beatsSec: beats, folded: k }; }
      else { const t = f.bpm * m; g = { ...comb.refine(comb.fit(f.a, f.b, t * 0.97, t * 1.03)), z: f.z, folded: k }; } }
    ref = g.ramp ? g.bpm1 : g.bpm; return g; });
  return { ...res, segs };
}

module.exports = { Comb, constant, dp, ctf, tempogram, rampFit, withRamps, foldOctaves, coalesce };
