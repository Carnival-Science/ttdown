// Scorable-region helpers (bench/lib/regions.js): half-open boundaries, disjoint regions, clipping, validation.
"use strict";
const assert = require("node:assert/strict");
const R = require("../bench/lib/regions");

// validation
assert.deepEqual(R.problems([{ start: 0, end: 10 }, { start: 20, end: 30 }]), []);
assert.deepEqual(R.problems([{ start: 0, end: 10 }, { start: 10, end: 20 }]), [], "adjacent regions are allowed");
assert.match(R.problems([])[0], /non-empty/); assert.match(R.problems(undefined)[0], /non-empty/);
assert.match(R.problems([{ start: 5, end: 5 }])[0], /must end after it starts/); assert.match(R.problems([{ start: 6, end: 5 }])[0], /must end after it starts/);
assert.match(R.problems([{ start: -1, end: 5 }])[0], /before 0/); assert.match(R.problems([{ start: 0, end: NaN }])[0], /numeric/); assert.match(R.problems([{ start: "a", end: 3 }])[0], /numeric/);
assert.match(R.problems([{ start: 0, end: 10 }, { start: 9.99, end: 20 }], "t1")[0], /t1: scorable\[1\].*overlaps or precedes/);
assert.match(R.problems([{ start: 20, end: 30 }, { start: 0, end: 10 }])[0], /overlaps or precedes/, "unordered regions are refused, not silently sorted");
assert.throws(() => R.normalize([{ start: 3, end: 1 }]));

// boundaries are half-open: start in, end out
const A = R.normalize([{ start: 10, end: 20 }]);
assert.equal(R.inside(A, 10), true); assert.equal(R.inside(A, 19.999999), true); assert.equal(R.inside(A, 20), false); assert.equal(R.inside(A, 9.999999), false);
// adjacent regions: an event on the shared edge is counted once (in the second), never twice or never
const adj = R.normalize([{ start: 0, end: 10 }, { start: 10, end: 20 }]);
assert.deepEqual(R.filterTimes([0, 10, 20], adj), [0, 10]);
// disjoint regions: the gap between them is excluded
const D = R.normalize([{ start: 0, end: 10 }, { start: 30, end: 40 }]);
assert.deepEqual(R.filterTimes([1, 9.9, 10, 15, 29.9, 30, 39.9, 40, 50], D), [1, 9.9, 30, 39.9]);
// notes belong to the region of their onset, even if they ring past the end
assert.deepEqual(R.filterNotes([{ onset: 9.9, offset: 12, midi: 33 }, { onset: 10, offset: 11, midi: 33 }, { onset: 30, offset: 31, midi: 35 }], D).map(n => n.onset), [9.9, 30]);
// intervals are clipped at every region edge, fields kept, empty pieces dropped
const clipped = R.clipIntervals([{ start: 5, end: 35, label: "A:min" }, { start: 12, end: 28, label: "N" }, { start: 40, end: 45, label: "X" }], D);
assert.deepEqual(clipped, [{ start: 5, end: 10, label: "A:min" }, { start: 30, end: 35, label: "A:min" }]);
assert.deepEqual(R.clipIntervals([{ start: 10, end: 12, label: "C" }], R.normalize([{ start: 0, end: 10 }])), [], "touching only at the edge is empty");
// containment of a whole interval in ONE region
assert.equal(R.containsInterval(D, 2, 8), true); assert.equal(R.containsInterval(D, 8, 12), false); assert.equal(R.containsInterval(D, 9, 31), false, "spanning two regions is not inside either");
// complement and size
assert.deepEqual(R.complement(D, 60), [{ start: 10, end: 30 }, { start: 40, end: 60 }]); assert.deepEqual(R.complement(R.normalize([{ start: 0, end: 60 }]), 60), []);
assert.deepEqual(R.complement(R.normalize([{ start: 5, end: 10 }]), 12), [{ start: 0, end: 5 }, { start: 10, end: 12 }]); assert.equal(R.seconds(D), 20);
console.log("bench regions tests passed");
