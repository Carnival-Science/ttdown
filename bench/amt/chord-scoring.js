/* Scoring of chord readings against a chord annotation (pure functions; the CLI is bench/amt/score-chords.js; tested by
 * tests/amt-chord-scoring.test.js). Annotation: { bar1Sec, bpm, ranges: [[bar, beat, bar, beat]], segments: [{ at: [bar, beat], root,
 * triad, seventh, qualityUncertain?, ... }] }. A reading is a list of regions { t0, t1, c } with chord names like "Cm7", "F#dim7", "G#".
 * Steps are 8th notes whose middle lies in an annotated range. Quality (triad, seventh) skips segments with triad null or
 * qualityUncertain. Chord CHANGES: the annotation's changes exclude the first chord of each range (nothing precedes it inside the
 * range), and a reading's changes within `tol` of a range start are excluded in the same way, so a reading is not penalised for
 * starting a new region where the range opens. */
"use strict";
const metrics = require("../../tests/metrics");
const parse = n => { if (!n || n === "N" || n === "–") return null; const m = String(n).match(/^([A-G]#?)(.*)$/); if (!m) return null; const q = m[2];
  const triad = /^(dim|m7b5)/.test(q) ? "dim" : /^aug/.test(q) ? "aug" : /^sus/.test(q) ? "sus" : /^m(?!aj)/.test(q) ? "min" : "maj";
  const seventh = /^dim7/.test(q) ? "dim7" : /^maj7/.test(q) ? "maj7" : /^(m7|7|m7b5)/.test(q) ? "min7" : "none"; return { root: m[1], triad, seventh }; };
function prepare(ann, onlyRange) {
  const bar = 240 / ann.bpm, beat = 60 / ann.bpm, bar1 = ann.bar1Sec, tAt = ([b, be]) => bar1 + (b - 1) * bar + (be - 1) * beat;
  const ranges = (onlyRange != null ? [ann.ranges[onlyRange]] : ann.ranges).map(([b0, e0, b1, e1]) => ({ t0: tAt([b0, e0]), t1: tAt([b1, e1]) }));
  const rangeOf = t => ranges.find(r => t >= r.t0 - 1e-6 && t < r.t1 - 1e-6);
  const segs = ann.segments.map(s => ({ ...s, t0: tAt(s.at) })).filter(s => rangeOf(s.t0 + 1e-6));
  segs.forEach((s, i) => { const r = rangeOf(s.t0 + 1e-6), nx = segs[i + 1]; s.t1 = nx && nx.t0 < r.t1 - 1e-6 ? nx.t0 : r.t1; });
  const steps = [], last = Math.max(...ranges.map(r => r.t1));
  for (let t = bar1 - bar + bar / 16; t < last; t += bar / 8) { const s = segs.find(x => t >= x.t0 && t < x.t1); if (s) steps.push({ t, s }); }
  return { bar, bar1, ranges, rangeOf, segs, steps };
}
function score(P, R, tol = 0.15) {
  const at = t => { const r = R.find(x => t >= x.t0 && t < x.t1); return r ? parse(r.c) : null; };
  let n = 0, root = 0, nq = 0, tri = 0, sev = 0;
  for (const { t, s } of P.steps) { const L = at(t); n++; const okRoot = !!L && L.root === s.root; if (okRoot) root++;
    if (s.triad && !s.qualityUncertain) { nq++; const okT = okRoot && L.triad === s.triad; if (okT) tri++; if (okT && L.seventh === s.seventh) sev++; } }
  const nearStart = t => P.ranges.some(r => Math.abs(t - r.t0) <= tol);
  const ref = P.segs.map(s => s.t0).filter(t => !nearStart(t));                       // changes, not each range's first chord
  const est = R.slice(1).map(r => r.t0).filter(t => !!P.rangeOf(t) && !nearStart(t)); // the same rule for the reading
  const hit = metrics.match(est, ref, tol).length; // maximum-cardinality one-to-one (tests/metrics.js, #21), not first-come
  const p = est.length ? hit / est.length : 0, r = ref.length ? hit / ref.length : 0, barsInRanges = P.ranges.reduce((x, g) => x + (g.t1 - g.t0) / P.bar, 0);
  return { root: root / n, tri: nq ? tri / nq : 0, sev: nq ? sev / nq : 0, P: p, R: r, F: p + r ? 2 * p * r / (p + r) : 0, perBar: est.length / barsInRanges, nEst: est.length, nRef: ref.length, n, nq };
}
/* One-to-one matching of a reading's boundaries to the annotated changes, within `win` seconds: the MOST pairs possible, and among
 * matchings with that many pairs the smallest total timing error. Both lists are sorted, and for a sum of absolute differences a best
 * matching never crosses, so a dynamic program over (annotated i, boundary j) is exact. Returns [[refIndex, estIndex, signed error s]]. */
function matchOneToOne(est, ref, win) {
  const E = est.map((t, j) => [t, j]).sort((x, y) => x[0] - y[0]), Rf = ref.map((t, i) => [t, i]).sort((x, y) => x[0] - y[0]), n = Rf.length, m = E.length;
  const best = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => ({ k: 0, err: 0, from: null })));
  const better = (p, q) => p.k > q.k || (p.k === q.k && p.err < q.err - 1e-12);
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) { if (!i && !j) continue; let c = { k: -1, err: 0, from: null };
    if (i && better(best[i - 1][j], c)) c = { k: best[i - 1][j].k, err: best[i - 1][j].err, from: "r" };
    if (j && better(best[i][j - 1], c)) c = { k: best[i][j - 1].k, err: best[i][j - 1].err, from: "e" };
    if (i && j) { const d = E[j - 1][0] - Rf[i - 1][0]; if (Math.abs(d) <= win) { const p = { k: best[i - 1][j - 1].k + 1, err: best[i - 1][j - 1].err + Math.abs(d), from: "p" }; if (better(p, c)) c = p; } }
    best[i][j] = c; }
  const out = []; let i = n, j = m; while (i || j) { const c = best[i][j]; if (c.from === "p") { out.push([Rf[i - 1][1], E[j - 1][1], E[j - 1][0] - Rf[i - 1][0]]); i--; j--; } else if (c.from === "r") i--; else j--; }
  return out;
}
module.exports = { parse, prepare, score, matchOneToOne };
