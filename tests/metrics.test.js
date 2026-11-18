// Checks the metric code itself, on hand-made cases with known answers.  node tests/metrics.test.js
"use strict";
const assert = require("node:assert/strict");
const { events, tempo } = require("./metrics");

const ref = [0, 0.5, 1, 1.5, 2];
let r = events(ref, ref); assert.equal(r.f, 1); assert.equal(r.meanAbsErrMs, 0);
r = events(ref.map(t => t + 0.05), ref); assert.equal(r.f, 1); assert.equal(r.meanErrMs, 50);          // inside ±70 ms
r = events(ref.map(t => t + 0.08), ref); assert.equal(r.tp, 0); assert.equal(r.f, 0);                 // outside
r = events(ref.map(t => t + 0.25), ref); assert.equal(r.f, 0);                                         // off-beat lock scores zero
r = events([0, 0.01, 0.02], [0]); assert.equal(r.tp, 1); assert.equal(r.fp, 2);                        // one-to-one: no double matching
r = events([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], [0, 1, 2, 3, 4]); assert.equal(r.R, 1); assert.equal(r.P, 0.5556); // double-time beats
r = events([0, 1, 2], ref); assert.equal(r.P, 1); assert.equal(r.R, 0.6);                              // half-time beats
r = events([], ref); assert.equal(r.f, 0); assert.equal(r.meanAbsErrMs, null);
r = events([], []); assert.equal(r.f, null); assert.equal(r.vacuous, true); assert.equal(r.P, null);      // nothing annotated, nothing predicted: not scored, never a free 1.0
r = events([1, 2], []); assert.equal(r.f, 0); assert.equal(r.fp, 2); assert.ok(!r.vacuous);                  // annotated absent, predicted present: false positives

let t = tempo(128, 128); assert.ok(t.acc1 && t.acc2 && !t.octaveError);
t = tempo(132, 128); assert.ok(t.acc1);                   // +3.1 %
t = tempo(134, 128); assert.ok(!t.acc1 && !t.acc2);       // +4.7 %
t = tempo(87, 174); assert.ok(!t.acc1 && t.acc2 && t.octaveError);
t = tempo(140, 70); assert.ok(t.octaveError);
t = tempo(96, 128); assert.ok(!t.acc2);                   // 3:4 is not an accepted octave

// ---- matching is MAXIMUM-cardinality, as in mir_eval (audit finding: greedy nearest-first undercounted dense events) ----
const { match } = require("./metrics");
r = events([0, 0.06], [0.04, 0.10], 0.05); assert.equal(r.tp, 2); assert.equal(r.f, 1);                    // the reported counterexample: greedy found 1 of 2
r = events([0.06, 0], [0.10, 0.04], 0.05); assert.equal(r.tp, 2);                                           // input order does not matter
r = events([0.05, 0.05], [0.05], 0.05); assert.equal(r.tp, 1); assert.equal(r.fp, 1);                        // duplicate onsets: one reference matches once
r = events([0.05], [0.05, 0.05], 0.05); assert.equal(r.tp, 1); assert.equal(r.fn, 1);
r = events([0, 0.1, 0.2, 0.3], [0.05, 0.15, 0.25, 0.35], 0.05); assert.equal(r.tp, 4, "a chain where every pair sits exactly on the tolerance edge");
r = events([0.02, 0.08], [0.05, 0.11], 0.05); assert.equal(r.tp, 2);
r = events([0.0, 0.01, 0.02], [0.0, 0.01, 0.02], 0.005); assert.equal(r.tp, 3, "dense retriggers, exact");
// with a pitch condition (note matching): e0 can only pair with r0 or r1 by time, but pitch lets only r1 take it
let m = match([0.0, 0.06], [0.04, 0.10], 0.05, (e, rr) => !(e === 1 && rr === 0)); assert.equal(m.length, 2, "augmenting path also respects the allow() condition");
// where greedy was already maximum, nothing changes (same pairs, same order): beats and downbeats are never affected
m = match([0.01, 0.52, 1.0], [0, 0.5, 1.0], 0.07); assert.deepEqual(m.map(x => [x[0], x[1]]).sort((p, q) => p[0] - q[0]), [[0, 0], [1, 1], [2, 2]]);
// randomized: equals brute-force maximum matching on small cases, with ties, duplicates and a mix of windows
function brute(est, ref, win) { // maximum bipartite matching by exhaustive search over reference choices
  let best = 0; const used = new Set();
  (function go(i, cnt) { if (i === ref.length) { best = Math.max(best, cnt); return; } go(i + 1, cnt); for (let j = 0; j < est.length; j++) if (!used.has(j) && Math.abs(est[j] - ref[i]) <= win) { used.add(j); go(i + 1, cnt + 1); used.delete(j); } })(0, 0);
  return best;
}
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let t = 0; t < 400; t++) {
  const ne = Math.floor(rnd() * 8), nr = Math.floor(rnd() * 8), win = [0.03, 0.05, 0.07][t % 3], grid = () => Math.round(rnd() * 12) * 0.025;
  const est = Array.from({ length: ne }, grid), ref = Array.from({ length: nr }, grid), got = match(est, ref, win), want = brute(est, ref, win);
  assert.equal(got.length, want, `random case ${t}: est ${JSON.stringify(est)} ref ${JSON.stringify(ref)} win ${win}: ${got.length} vs ${want}`);
  assert.equal(new Set(got.map(x => x[0])).size, got.length); assert.equal(new Set(got.map(x => x[1])).size, got.length);   // still one-to-one
  assert.ok(got.every(x => Math.abs(est[x[0]] - ref[x[1]]) <= win), "every match is inside the tolerance");
}
console.log("metrics tests passed");
