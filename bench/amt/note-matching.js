/* Note matching and counting for the research scorer (bench/amt/score-notes.js). Notes are { on, off, midi } in seconds.
 *
 * Matching follows mir_eval.transcription (checked against it by bench/amt/crosscheck_note_matching.py, run from
 * tests/amt-note-matching.test.js):
 *  - one-to-one and MAXIMUM-cardinality: the repo's tests/metrics.js `match` (greedy nearest-first, completed by augmenting paths;
 *    PR #21 fixed it because greedy alone undercounts when two notes sit closer than two windows apart);
 *  - EXACT MIDI pitch (mir_eval's 50-cent tolerance on integer MIDI pitches);
 *  - onset distance, rounded to 4 decimals (0.1 ms, half to even) as mir_eval does (its N_DECIMALS), <= `tol` (50 ms), so a distance
 *    that is exactly the tolerance in decimal (1.00 s vs 1.05 s) matches even though the binary difference is 0.050000000000000044;
 *  - with `offsets`, also the offset distance, rounded the same way, <= max(50 ms, 20% of the reference duration).
 * Inputs are validated (finite times, strictly positive durations, integer pitch 0..127), as mir_eval does: a malformed note throws. */
"use strict";
const metrics = require("../../tests/metrics");

const DECIMALS = 4, SCALE = 10 ** DECIMALS, ONSET_TOL = 0.05, OFFSET_RATIO = 0.2, OFFSET_MIN = 0.05;
// numpy.around: scale, round half to even, unscale
const rint = x => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1; };
const rounded = d => rint(d * SCALE) / SCALE;
const within = (d, tol) => rounded(Math.abs(d)) <= tol;

function validateNotes(notes, label = "notes") {
  if (!Array.isArray(notes)) throw new Error(`${label}: expected an array of notes`);
  notes.forEach((n, i) => {
    if (!n || !Number.isFinite(n.on) || !Number.isFinite(n.off)) throw new Error(`${label}[${i}]: onset and offset must be finite numbers`);
    if (!(n.off > n.on)) throw new Error(`${label}[${i}]: the note must end after it starts (on ${n.on}, off ${n.off})`);
    if (!Number.isInteger(n.midi) || n.midi < 0 || n.midi > 127) throw new Error(`${label}[${i}]: pitch must be an integer MIDI note 0..127`);
  });
  return notes;
}

/** match(ref, est, tol = 50 ms, offsets = false) -> { n, ur, ue, pairs }: the match count, the matched reference / estimate indices,
 *  and the [refIndex, estIndex] pairs. */
function match(ref, est, tol = ONSET_TOL, offsets = false) {
  if (!Number.isFinite(tol) || tol < 0) throw new Error("onset tolerance must be a finite number >= 0");
  validateNotes(ref, "reference"); validateNotes(est, "estimate");
  const allow = (j, i) => {
    const r = ref[i], e = est[j];
    return e.midi === r.midi && within(e.on - r.on, tol) && (!offsets || within(e.off - r.off, Math.max(OFFSET_MIN, OFFSET_RATIO * (r.off - r.on))));
  };
  // The window passed to metrics.match is a little wider (by more than the 0.05 ms rounding) so that candidates inside the ROUNDED tolerance reach `allow`, which decides.
  const m = metrics.match(est.map(e => e.on), ref.map(r => r.on), tol + 1e-4, allow), ur = new Set(), ue = new Set(), pairs = [];
  for (const [j, i] of m) { ue.add(j); ur.add(i); pairs.push([i, j]); }
  return { n: m.length, ur, ue, pairs };
}

/** TP / FP / FN and precision, recall, F1 (fractions, unrounded). Empty sides follow mir_eval: P = 0 with no estimates, R = 0 with no reference. */
function counts(tp, nRef, nEst) {
  const fp = nEst - tp, fn = nRef - tp, P = nEst ? tp / nEst : 0, R = nRef ? tp / nRef : 0;
  return { tp, fp, fn, P, R, F: P + R ? 2 * P * R / (P + R) : 0 };
}

/** Bar regions for a 4/4 track: pickup, bars 1..a-1, a..b-1, b..end. Every boundary sits `edge` seconds before its bar line (default
 *  20 ms, so a note played slightly early on a bar line counts in that bar), and every region is half-open [start, end). */
function barRegions(bar1, bpm, split, edge = 0.02) {
  if (!Number.isFinite(bar1)) throw new Error("--bar1 must be a finite number of seconds");
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("--bpm must be a finite number > 0");
  if (!Array.isArray(split) || split.length !== 2 || !split.every(Number.isInteger) || !(split[0] >= 2 && split[1] > split[0]))
    throw new Error("--split must be two whole bar numbers A,B with 2 <= A < B");
  if (!Number.isFinite(edge) || edge < 0) throw new Error("region edge must be a finite number >= 0");
  const bar = 240 / bpm, at = k => bar1 + (k - 1) * bar - edge, [a, b] = split;
  return [
    { name: "pickup", start: -Infinity, end: at(1) },
    { name: `bars 1-${a - 1}`, start: at(1), end: at(a) },
    { name: `bars ${a}-${b - 1}`, start: at(a), end: at(b) },
    { name: `bars ${b}-end`, start: at(b), end: Infinity },
  ];
}

/** Per-region counts. The matching is done ONCE over the whole track (the `m` from match); each note is then counted in the region that
 *  holds its OWN onset (reference notes by their aligned onset, estimates by theirs). A matched pair whose two onsets fall in different
 *  regions is a hit for recall in the reference note's region and for precision in the estimate's region; `straddling` counts such pairs
 *  in the region of the reference note. */
function regionCounts(ref, est, m, regions) {
  const inR = (t, g) => t >= g.start && t < g.end;
  return regions.map(g => {
    const rIdx = ref.map((r, i) => i).filter(i => inR(ref[i].on, g)), eIdx = est.map((e, j) => j).filter(j => inR(est[j].on, g));
    const straddling = m.pairs.filter(([i, j]) => inR(ref[i].on, g) && !inR(est[j].on, g)).length;
    return { name: g.name, start: g.start, end: g.end, ref: rIdx.length, refMatched: rIdx.filter(i => m.ur.has(i)).length,
      est: eIdx.length, estMatched: eIdx.filter(j => m.ue.has(j)).length, straddling };
  });
}

module.exports = { match, counts, barRegions, regionCounts, validateNotes, rounded, ONSET_TOL, OFFSET_RATIO, OFFSET_MIN, DECIMALS };
