#!/usr/bin/env node
/* Note matching in the research scorer (bench/amt/note-matching.js): maximum-cardinality, not greedy. The counterexample from the
 * audit of PR #21: reference notes at 40 ms and 100 ms, estimates at 0 ms and 60 ms, same pitch, window +-50 ms. Greedy
 * nearest-first pairs 40 ms with 60 ms (20 ms apart) and strands both others (1 match); the maximum matching pairs 40-0 and 100-60 (2). */
"use strict";
const assert = require("node:assert/strict"), { match } = require("../bench/amt/note-matching");
const N = (on, midi = 60, len = 0.5) => ({ on, off: on + len, midi });
let m = match([N(0.04), N(0.10)], [N(0.0), N(0.06)], 0.05);
assert.equal(m.n, 2, "two matches exist; greedy finds one"); assert.deepEqual([...m.ur].sort(), [0, 1]); assert.deepEqual([...m.ue].sort(), [0, 1]);
m = match([N(0.04, 60), N(0.10, 62)], [N(0.0, 60), N(0.06, 62)], 0.05); assert.equal(m.n, 2, "with pitches that allow it");
m = match([N(0.04, 60), N(0.10, 60)], [N(0.0, 60), N(0.06, 62)], 0.05); assert.equal(m.n, 1, "exact pitch is required: the 62 cannot match a 60");
m = match([N(0.0), N(1.0)], [N(0.0), N(1.0)], 0.05); assert.equal(m.n, 2, "separated notes: an exact match");
m = match([N(0.0)], [N(0.06)], 0.05); assert.equal(m.n, 0, "outside the window: no match");
m = match([N(0.0, 60, 1.0)], [N(0.0, 60, 0.5)], 0.05, true); assert.equal(m.n, 0, "with durations: an end 0.5 s off (limit 0.2 x 1.0 s) is not a match");
m = match([N(0.0, 60, 1.0)], [N(0.0, 60, 0.9)], 0.05, true); assert.equal(m.n, 1, "an end 0.1 s off (limit 0.2 s) is");
assert.deepEqual(match([], [N(0)], 0.05), { n: 0, ur: new Set(), ue: new Set() }, "no reference notes: nothing matches");
console.log("amt note matching tests passed (8)");
