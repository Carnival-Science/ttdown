"use strict";
/* Scores a tempo map against the fixtures' exact answer (issue #57). A prediction is { beats: [seconds], tempo: t => bpm | null, changes: [seconds],
 * unknown: [[t0, t1]] }, built from segments by fromSegments(). Truth comes from truth/<id>.beats.txt and truth/<id>.tempomap.json.
 *
 *   beatF       one-to-one beat matching within +-70 ms (precision, recall, F)
 *   beatMs      median and 95th percentile of the matched beats' timing error; worstMs the largest
 *   bpmErr      time-weighted mean |predicted - true| BPM over the stretches the prediction commits to
 *   acc1        share of time (committed) within 4 % of the true BPM; acc1oct also accepts 1/2, 2, 1/3 and 3 times it. Reported separately
 *   perRegion   acc1 and bpmErr for each truth region, so a long dominant section cannot hide a broken one
 *   changes     predicted tempo changes against the truth's transitions (a step is a point, a ramp an interval), tolerance TOL_S either side
 *   coverage    share of the track the prediction commits to a tempo (the rest is "unknown")
 */
const fs = require("node:fs"), path = require("node:path");
const TOL_S = 3, BEAT_TOL = 0.07;

function loadTruth(manifestDir, track) {
  const beats = fs.readFileSync(path.join(manifestDir, track.annotations.beats), "utf8").split("\n").filter(l => /^\d/.test(l)).map(l => +l.split("\t")[0]);
  const regions = JSON.parse(fs.readFileSync(path.join(manifestDir, track.annotations.tempomap), "utf8")).regions;
  return { beats, regions: regions.map(r => ({ ...r, t0: beats[r.startBeat], t1: beats[Math.min(r.endBeat, beats.length - 1)] })) };
}
const truthBpmAt = (T, t) => { const b = T.beats; let lo = 0, hi = b.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m] <= t) lo = m; else hi = m - 1; } return 60 / (b[lo + 1] - b[lo]); };
/* the truth's transitions: [t0, t1] (a step: t0 = t1 = the beat where the tempo changes) */
function transitions(T) {
  const out = [], R = T.regions;
  R.forEach((r, i) => { if (r.bpmStart !== r.bpmEnd) out.push([r.t0, r.t1]); if (i && Math.abs(r.bpmStart - R[i - 1].bpmEnd) > 0.5) out.push([r.t0, r.t0]); });
  return out;
}
function matchBeats(pred, truth) { // greedy nearest, one to one, both sorted
  let i = 0, j = 0, tp = 0; const err = [];
  while (i < pred.length && j < truth.length) { const d = pred[i] - truth[j];
    if (Math.abs(d) <= BEAT_TOL) { tp++; err.push(Math.abs(d) * 1000); i++; j++; } else if (d < 0) i++; else j++; }
  return { tp, err };
}
const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const within = (p, t, tol) => Math.abs(p / t - 1) <= tol;
const oct = (p, t) => [1, 0.5, 2, 1 / 3, 3].some(k => within(p, t * k, 0.04));

function score(T, pred, ms) {
  // Predicted beats before the first or after the last ANNOTATED beat are not scored: the fixtures' audio keeps sounding after the last annotated beat, and counting those
  // beats as false positives capped every beat F near 0.984 whatever the method did (found in review).
  const lo = T.beats[0] - BEAT_TOL, hi = T.beats[T.beats.length - 1] + BEAT_TOL, beats = pred.beats.filter(t => t >= lo && t <= hi), m = matchBeats(beats, T.beats), P = m.tp / (beats.length || 1), Rc = m.tp / T.beats.length, F = P + Rc ? 2 * P * Rc / (P + Rc) : 0;
  // off-beat lock: the same beats moved half a beat later score as well (or better) against the truth, so the tempo is right and the phase is half a beat out (issue #50)
  const half = beats.slice(0, -1).map((t, i) => t + (beats[i + 1] - t) / 2), mh = matchBeats(half, T.beats), Ph = mh.tp / (half.length || 1), Rh = mh.tp / T.beats.length, Foff = Ph + Rh ? 2 * Ph * Rh / (Ph + Rh) : 0;
  // tempo error sampled every 0.5 s across the truth beats' span
  const t0 = T.beats[0], t1 = T.beats[T.beats.length - 1], samples = []; for (let t = t0; t < t1; t += 0.5) { const p = pred.tempo(t); samples.push({ t, truth: truthBpmAt(T, t), pred: p }); }
  const used = samples.filter(s => s.pred != null), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const bpmErr = mean(used.map(s => Math.abs(s.pred - s.truth))), acc1 = mean(used.map(s => within(s.pred, s.truth, 0.04) ? 1 : 0)), acc1oct = mean(used.map(s => oct(s.pred, s.truth) ? 1 : 0));
  // Acc1 above is over the stretches the prediction commits to, so abstaining raises it. These two count an unknown stretch as wrong: the number to compare methods by.
  const acc1All = mean(samples.map(s => s.pred != null && within(s.pred, s.truth, 0.04) ? 1 : 0)), acc1octAll = mean(samples.map(s => s.pred != null && oct(s.pred, s.truth) ? 1 : 0));
  const perRegion = T.regions.map(r => { const rs = used.filter(s => s.t >= r.t0 && s.t < r.t1);
    return { bpm: r.bpmStart === r.bpmEnd ? r.bpmStart : `${r.bpmStart}-${r.bpmEnd}`, acc1: mean(rs.map(s => within(s.pred, s.truth, 0.04) ? 1 : 0)), acc1oct: mean(rs.map(s => oct(s.pred, s.truth) ? 1 : 0)), bpmErr: mean(rs.map(s => Math.abs(s.pred - s.truth))), n: rs.length }; });
  const tr = transitions(T), ch = pred.changes || [], hitT = tr.map(([a, b]) => ch.some(c => c >= a - TOL_S && c <= b + TOL_S)), hitC = ch.map(c => tr.some(([a, b]) => c >= a - TOL_S && c <= b + TOL_S));
  const bErr = tr.map(([a, b]) => { const near = ch.filter(c => c >= a - TOL_S && c <= b + TOL_S); return near.length ? Math.min(...near.map(c => c < a ? a - c : c > b ? c - b : 0)) : null; }).filter(v => v != null);
  return { beatF: +F.toFixed(3), beatFOff: +Foff.toFixed(3), beatP: +P.toFixed(3), beatR: +Rc.toFixed(3), beatMsMed: m.err.length ? +pct(m.err, 0.5).toFixed(1) : null, beatMsP95: m.err.length ? +pct(m.err, 0.95).toFixed(1) : null, worstMs: m.err.length ? +Math.max(...m.err).toFixed(1) : null,
    bpmErr: bpmErr == null ? null : +bpmErr.toFixed(2), acc1: acc1 == null ? null : +acc1.toFixed(3), acc1oct: acc1oct == null ? null : +acc1oct.toFixed(3), acc1All: +acc1All.toFixed(3), acc1octAll: +acc1octAll.toFixed(3), coverage: +(used.length / (samples.length || 1)).toFixed(3),
    perRegion: perRegion.map(r => ({ ...r, acc1: r.acc1 == null ? null : +r.acc1.toFixed(2), acc1oct: r.acc1oct == null ? null : +r.acc1oct.toFixed(2), bpmErr: r.bpmErr == null ? null : +r.bpmErr.toFixed(1) })),
    nChanges: ch.length, truthTransitions: tr.length, missed: hitT.filter(h => !h).length, extra: hitC.filter(h => !h).length, boundaryErrS: bErr.length ? +mean(bErr).toFixed(2) : null, boundaryErrsS: bErr.map(v => +v.toFixed(2)), ms: ms == null ? null : Math.round(ms) };
}

/* segments (from segment.js: { a, b, bpm, phase, period } in frames, or ramp segments { a, b, bpm0, bpm1, beats }) -> a prediction */
function fromSegments(comb, segs, o = {}) {
  const fps = comb.fps, keep = segs.filter(s => !s.unknown), beats = []; segs.forEach(s => { if (!s.unknown) beats.push(...(s.beatsSec || comb.beats(s))); }); beats.sort((x, y) => x - y);
  const bpmOf = (s, t) => s.bpm0 != null ? s.bpm0 + (s.bpm1 - s.bpm0) * (t - s.a / fps) / ((s.b - s.a) / fps) : s.bpm;
  const tempo = t => { const s = keep.find(x => t >= x.a / fps && t < x.b / fps); return s ? bpmOf(s, t) : null; };
  const changes = []; keep.forEach(q => { if (q.bpm0 != null) changes.push(q.a / fps, q.b / fps); }); // a ramp is a transition: its start and its end
  for (let i = 1; i < keep.length; i++) { const p = keep[i - 1], q = keep[i]; if (p.b === q.a && p.bpm0 == null && q.bpm0 == null && Math.abs(bpmOf(q, q.a / fps) / bpmOf(p, p.b / fps) - 1) > (o.changeTol ?? 0.025)) changes.push(q.a / fps); }
  changes.sort((x, y) => x - y);
  return { beats, tempo, changes };
}
/* the engine's own tracked beats (a.grid.beats, seconds) as a prediction. Local tempo is the median of 9 neighbouring intervals (the window TimeMap uses). It is then cut into
   stretches the way the candidates' stretches are counted: a stretch ends when 4 consecutive local tempi all sit more than 3 % from the stretch's running median, and the new
   stretch starts at the first of them; neighbouring stretches whose medians are within 3 % are one. A change is one stretch boundary. (The first version counted both edges of every
   excursion from the whole-track median, which double-counted a wandering tracker and missed a step between two tempi that are both far from the median.) `variable` is
   TimeMap's own rule: any local tempo more than 3 % from the median. */
function fromBeats(beats, o = {}) {
  const iv = beats.slice(1).map((t, i) => t - beats[i]), loc = i => { const w = iv.slice(Math.max(0, i - 4), Math.min(iv.length, i + 5)).sort((a, b) => a - b); return 60 / w[w.length >> 1]; };
  const lt = iv.map((_, i) => loc(i)), tol = o.tol ?? 0.03, need = o.persist ?? 4, med = a => { const w = [...a].sort((x, y) => x - y); return w[w.length >> 1]; };
  const tempo = t => { let lo = 0, hi = iv.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (beats[m] <= t) lo = m; else hi = m - 1; } return t < beats[0] || t > beats[beats.length - 1] ? null : lt[lo]; };
  let runs = [{ start: 0, vals: [] }], dev = [];
  lt.forEach((v, i) => { const cur = runs[runs.length - 1];
    if (cur.vals.length && Math.abs(v / med(cur.vals) - 1) > tol) { dev.push([i, v]); if (dev.length >= need && dev.every(([, w]) => Math.abs(w / med(dev.map(d => d[1])) - 1) <= tol)) { runs.push({ start: dev[0][0], vals: dev.map(d => d[1]) }); dev = []; } else if (dev.length >= need) dev.shift(); }
    else { dev = []; cur.vals.push(v); } });
  for (let k = 1; k < runs.length;) { if (Math.abs(med(runs[k].vals) / med(runs[k - 1].vals) - 1) <= tol) { runs[k - 1].vals.push(...runs[k].vals); runs.splice(k, 1); } else k++; }
  const changes = runs.slice(1).map(r => beats[r.start]), m0 = med(lt);
  return { beats, tempo, changes, variable: lt.some(v => Math.abs(v / m0 - 1) > tol) };
}
module.exports = { loadTruth, score, fromSegments, fromBeats, truthBpmAt, transitions, TOL_S };
