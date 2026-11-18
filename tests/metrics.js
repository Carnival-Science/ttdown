// Evaluation metrics, kept separate so they can be tested on their own (tests/metrics.test.js).
// Definitions follow the usual MIR conventions (as in mir_eval), with two documented differences:
// nothing is trimmed from the start of the song (mir_eval skips the first 5 s of beats by default),
// and matching starts greedy nearest-first and is then completed to a MAXIMUM-cardinality one-to-one matching by augmenting
// paths, as mir_eval does. Greedy alone undercounts when events sit closer than two windows apart (fast fills, rolls,
// retriggers): reference 40/100 ms and estimate 0/60 ms at ±50 ms is two matches, greedy found one.
// An event class with nothing annotated AND nothing predicted is "vacuous": its F is null (not 1.0), so it cannot lift an
// average; predictions against an annotated-but-empty reference are false positives and score 0.
"use strict";

const WINDOW = 0.07;   // ±70 ms: standard beat F-measure tolerance
const TEMPO_TOL = 0.04; // ±4 %: standard tempo Acc1/Acc2 tolerance

// One-to-one matching of estimated to reference event times (seconds): candidate pairs within ±win, closest first.
// Returns [estIndex, refIndex, est - ref] using the caller's original indices. `allow(estIndex, refIndex)` can
// add a condition (e.g. same pitch). Only nearby pairs are visited, so long real tracks stay fast; the pair set
// and its order are exactly those of a full scan.
function match(est, ref, win = WINDOW, allow = null) {
  est = est || []; ref = ref || [];
  const ei = est.map((_, j) => j).sort((a, b) => est[a] - est[b] || a - b), ri = ref.map((_, i) => i).sort((a, b) => ref[a] - ref[b] || a - b);
  const E = ei.map(j => est[j]), Rf = ri.map(i => ref[i]), pairs = [];
  let j0 = 0;
  for (let i = 0; i < Rf.length; i++) {
    while (j0 < E.length && Rf[i] - E[j0] > win) j0++;
    for (let j = j0; j < E.length && E[j] - Rf[i] <= win; j++) { const d = Math.abs(E[j] - Rf[i]); if (d <= win && (!allow || allow(ei[j], ri[i]))) pairs.push([d, i, j]); }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const usedR = new Set(), usedE = new Set(), out = [], matchR = new Array(Rf.length).fill(-1), matchE = new Array(E.length).fill(-1);
  for (const [, i, j] of pairs) { if (usedR.has(i) || usedE.has(j)) continue; usedR.add(i); usedE.add(j); matchR[i] = j; matchE[j] = i; out.push([ei[j], ri[i], E[j] - Rf[i]]); }
  // complete to maximum cardinality: from every unmatched reference, search (breadth-first) for an alternating path to an unmatched estimate
  const adj = Rf.map(() => []); for (const [d, i, j] of pairs) adj[i].push([d, j]); adj.forEach(a => a.sort((x, y) => x[0] - y[0]));
  let augmented = false;
  for (let r0 = 0; r0 < Rf.length; r0++) {
    if (matchR[r0] !== -1 || !adj[r0].length) continue;
    const prevE = new Map(), seenR = new Set([r0]), queue = [r0]; let end = -1;
    for (let q = 0; q < queue.length && end < 0; q++) {
      const u = queue[q];
      for (const [, j] of adj[u]) {
        if (prevE.has(j)) continue; prevE.set(j, u);
        if (matchE[j] === -1) { end = j; break; }
        if (!seenR.has(matchE[j])) { seenR.add(matchE[j]); queue.push(matchE[j]); }
      }
    }
    if (end < 0) continue;
    for (let j = end; j !== undefined;) { const u = prevE.get(j), nextJ = matchR[u]; matchR[u] = j; matchE[j] = u; j = u === r0 ? undefined : nextJ; }
    augmented = true;
  }
  if (!augmented) return out;                       // greedy was already maximum: identical to the original result and order
  const res = []; for (let i = 0; i < Rf.length; i++) if (matchR[i] !== -1) res.push([ei[matchR[i]], ri[i], E[matchR[i]] - Rf[i]]);
  return res;
}

function events(est, ref, win = WINDOW) {
  est = est || []; ref = ref || [];
  const errs = match(est, ref, win).map(m => m[2]);
  const tp = errs.length, fp = est.length - tp, fn = ref.length - tp;
  if (ref.length === 0 && est.length === 0) return { tp: 0, fp: 0, fn: 0, P: null, R: null, f: null, vacuous: true, meanAbsErrMs: null, meanErrMs: null };
  const P = est.length ? tp / est.length : 0, R = ref.length ? tp / ref.length : 0;
  const f = P + R ? 2 * P * R / (P + R) : 0;
  const meanAbsErrMs = tp ? 1000 * errs.reduce((s, e) => s + Math.abs(e), 0) / tp : null;
  const meanErrMs = tp ? 1000 * errs.reduce((s, e) => s + e, 0) / tp : null; // signed: + means late
  return { tp, fp, fn, P: +P.toFixed(4), R: +R.toFixed(4), f: +f.toFixed(4), meanAbsErrMs: meanAbsErrMs == null ? null : +meanAbsErrMs.toFixed(1), meanErrMs: meanErrMs == null ? null : +meanErrMs.toFixed(1) };
}

// Acc1: within ±4 % of the true tempo. Acc2: also accepts ×2, ×½, ×3, ×⅓ (octave / metrical-level errors).
function tempo(est, ref, tol = TEMPO_TOL) {
  const rel = (est - ref) / ref, near = f => Math.abs(est - ref * f) <= tol * ref * f;
  const acc1 = near(1), acc2 = [1, 2, 0.5, 3, 1 / 3].some(near);
  return { est, ref, absErr: +Math.abs(est - ref).toFixed(3), relErr: +rel.toFixed(4), acc1, acc2, octaveError: !acc1 && acc2 };
}

module.exports = { match, events, tempo, WINDOW, TEMPO_TOL };
