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
r = events([], []); assert.equal(r.f, 1);

let t = tempo(128, 128); assert.ok(t.acc1 && t.acc2 && !t.octaveError);
t = tempo(132, 128); assert.ok(t.acc1);                   // +3.1 %
t = tempo(134, 128); assert.ok(!t.acc1 && !t.acc2);       // +4.7 %
t = tempo(87, 174); assert.ok(!t.acc1 && t.acc2 && t.octaveError);
t = tempo(140, 70); assert.ok(t.octaveError);
t = tempo(96, 128); assert.ok(!t.acc2);                   // 3:4 is not an accepted octave

console.log("metrics tests passed");
