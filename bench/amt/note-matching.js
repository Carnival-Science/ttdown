/* Note matching for the research scorers (bench/amt/score-notes.js). Maximum-cardinality one-to-one: the repo's own tests/metrics.js
 * `match` (greedy nearest-first, completed by augmenting paths), which PR #21 fixed because greedy alone undercounts when two notes sit
 * closer than two windows apart. Notes are { on, off, midi } in seconds. Same EXACT pitch and onset within `tol`; `dur` also needs
 * the end within max(50 ms, 20% of the reference duration) (the mir_eval convention). Returns { n, ur, ue }: the count and the
 * matched reference / estimate indices. */
"use strict";
const metrics = require("../../tests/metrics");
function match(ref, est, tol = 0.05, dur = false) {
  const allow = (j, i) => { const r = ref[i], e = est[j]; return e.midi === r.midi && (!dur || Math.abs(e.off - r.off) <= Math.max(0.05, 0.2 * (r.off - r.on))); };
  const m = metrics.match(est.map(e => e.on), ref.map(r => r.on), tol, allow), ur = new Set(), ue = new Set(); for (const [j, i] of m) { ue.add(j); ur.add(i); }
  return { n: m.length, ur, ue };
}
module.exports = { match };
