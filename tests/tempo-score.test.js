/* The tempo-map scorer (bench/tempo/score.js, issue #57): pinned, because a scorer that can be wrong silently makes every comparison wrong.
 *   - predicted beats outside the annotated span (the audio's tail) are not false positives
 *   - a prediction half a beat late scores low on beat F and high on off-beat F
 *   - abstaining (unknown stretches) lowers Acc1-over-all-time but not Acc1 over the committed stretches, and coverage says so
 *   - the engine's beats: a steady track with timing jitter has no change, a step has exactly one, A-B-A has two, a +-2 % wander none
 *   - boundary errors are per transition (the worst is the worst transition, not the worst fixture mean)
 */
"use strict";
const assert = require("node:assert/strict"), SC = require("../bench/tempo/score"), { summary } = require("../bench/tempo/report");
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const beatsAt = (bpmAt, secs, jit = 0) => { const b = []; let t = 0; while (t < secs) { b.push(t + (rnd() - 0.5) * 2 * jit); t += 60 / bpmAt(t); } return b; };
const truthOf = (beats, regions) => ({ beats, regions: regions.map(r => ({ ...r, t0: beats[r.startBeat], t1: beats[Math.min(r.endBeat, beats.length - 1)] })) });
const pred = (beats, tempo, changes = []) => ({ beats, tempo, changes });

// a constant 120 BPM, 60 s truth
{ const tb = beatsAt(() => 120, 60), T = truthOf(tb, [{ startBeat: 0, endBeat: tb.length - 1, bpmStart: 120, bpmEnd: 120 }]);
  const perfect = SC.score(T, pred(tb, () => 120)); ok(perfect.beatF === 1 && perfect.acc1 === 1 && perfect.acc1All === 1, "a perfect prediction scores 1 (beat F " + perfect.beatF + ")");
  const tail = SC.score(T, pred([...tb, tb[tb.length - 1] + 0.5, tb[tb.length - 1] + 1], () => 120)); ok(tail.beatF === 1, "two predicted beats after the last annotated beat are not false positives (" + tail.beatF + ")");
  const late = SC.score(T, pred(tb.map(t => t + 0.25), () => 120)); ok(late.beatF < 0.05 && late.beatFOff > 0.95, "half a beat late: beat F " + late.beatF + ", off-beat F " + late.beatFOff);
  // commits to the first half only
  const half = SC.score(T, pred(tb.filter(t => t < 30), t => t < 30 ? 120 : null));
  ok(half.acc1 === 1 && Math.abs(half.coverage - 0.5) < 0.02 && Math.abs(half.acc1All - 0.5) < 0.02, "abstaining on half: Acc1 over committed " + half.acc1 + ", over all time " + half.acc1All + ", coverage " + half.coverage);
  const wrong = SC.score(T, pred(tb, () => 133)); ok(wrong.acc1 === 0 && wrong.acc1All === 0 && wrong.bpmErr > 12, "a wrong tempo scores 0 on both"); }

// boundary error per transition: two steps, a prediction that finds one 0.5 s late and the other 2 s late
{ const tb = beatsAt(t => t < 30 ? 120 : t < 60 ? 150 : 120, 90), a = tb.findIndex(t => t >= 30), b = tb.findIndex(t => t >= 60);
  const T = truthOf(tb, [{ startBeat: 0, endBeat: a, bpmStart: 120, bpmEnd: 120 }, { startBeat: a, endBeat: b, bpmStart: 150, bpmEnd: 150 }, { startBeat: b, endBeat: tb.length - 1, bpmStart: 120, bpmEnd: 120 }]);
  const s = SC.score(T, pred(tb, t => t < 30.5 ? 120 : t < 62 ? 150 : 120, [tb[a] + 0.5, tb[b] + 2]));
  ok(s.truthTransitions === 2 && s.missed === 0 && s.extra === 0 && s.boundaryErrsS.length === 2 && Math.abs(s.boundaryErrsS[0] - 0.5) < 0.01 && Math.abs(s.boundaryErrsS[1] - 2) < 0.01, "per-transition boundary errors " + s.boundaryErrsS);
  const rows = [{ id: "x", results: { k: { ...s, beatF: 1, beatFOff: 0, bpmErr: 0, acc1: 1, acc1oct: 1, coverage: 1, ms: 1 } } }, { id: "y", results: { k: { ...s, boundaryErrsS: [0.1], boundaryErrS: 0.1, beatF: 1, beatFOff: 0, bpmErr: 0, acc1: 1, acc1oct: 1, coverage: 1, ms: 1 } } }];
  ok(/\| 2 \|/.test(summary(rows, ["k"]).split("\n").find(l => l.startsWith("| k |"))), "the summary's worst boundary error is the worst transition (2 s), not the worst fixture mean"); }

// the engine's beats as a prediction: changes are stretch boundaries
{ const n = (name, beats, want) => { const e = SC.fromBeats(beats), c = e.changes.length; ok(c === want, `${name}: ${c} changes (want ${want})`); return e; };
  n("steady 128 with 12 ms jitter", beatsAt(() => 128, 120, 0.012), 0);
  const st = n("step 120 to 150 at 60 s", beatsAt(t => t < 60 ? 120 : 150, 120), 1); ok(Math.abs(st.changes[0] - 60) < 3, "  the boundary is at " + st.changes[0].toFixed(1) + " s");
  n("A-B-A 120, 150, 120", beatsAt(t => t < 40 || t >= 80 ? 120 : 150, 120), 2);
  n("a step between two tempi both far from the median: 100, 130, 160", beatsAt(t => t < 40 ? 100 : t < 80 ? 130 : 160, 120), 2);
  n("a +-2 % slow wander on 128", beatsAt(t => 128 * (1 + 0.02 * Math.sin(t / 8)), 120), 0);
  const e = SC.fromBeats(beatsAt(t => t < 60 ? 120 : 150, 120)); ok(e.variable === true, "TimeMap's own rule still calls the step variable"); }

console.log(pass + " passed, 0 failed");
