// Evaluation metrics, kept separate so they can be tested on their own (tests/metrics.test.js).
// Definitions follow the usual MIR conventions (as in mir_eval), with two documented differences:
// nothing is trimmed from the start of the song (mir_eval skips the first 5 s of beats by default),
// and matching is greedy nearest-first, which equals optimal matching whenever events are more than
// two windows apart (true for beats and downbeats).
"use strict";

const WINDOW = 0.07;   // ±70 ms: standard beat F-measure tolerance
const TEMPO_TOL = 0.04; // ±4 %: standard tempo Acc1/Acc2 tolerance

// One-to-one matching of estimated to reference event times (seconds). No estimate can match two references.
function events(est, ref, win = WINDOW) {
  est = (est || []).slice().sort((a, b) => a - b); ref = (ref || []).slice().sort((a, b) => a - b);
  const pairs = [];
  for (let i = 0; i < ref.length; i++) for (let j = 0; j < est.length; j++) { const d = Math.abs(est[j] - ref[i]); if (d <= win) pairs.push([d, i, j]); }
  pairs.sort((a, b) => a[0] - b[0]);
  const usedR = new Set(), usedE = new Set(), errs = [];
  for (const [d, i, j] of pairs) { if (usedR.has(i) || usedE.has(j)) continue; usedR.add(i); usedE.add(j); errs.push(est[j] - ref[i]); }
  const tp = errs.length, fp = est.length - tp, fn = ref.length - tp;
  const P = est.length ? tp / est.length : 0, R = ref.length ? tp / ref.length : 0;
  const f = ref.length === 0 && est.length === 0 ? 1 : (P + R ? 2 * P * R / (P + R) : 0);
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

module.exports = { events, tempo, WINDOW, TEMPO_TOL };
