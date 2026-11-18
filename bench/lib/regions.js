// Scorable regions: the parts of a recording a track's annotations actually cover.
//
// A track can be annotated for an excerpt (or several disjoint excerpts). Everything the analyzer predicts outside those
// regions has no ground truth, so it must not count as a false positive, and everything annotated is only compared with
// predictions made inside the same regions. The SAME mask is applied to predictions and references, so the two can never
// disagree about what is being scored.
//
// Manifest, per track:   "scorable": [{ "start": 0, "end": 60 }, { "start": 120.5, "end": 180 }]   (seconds)
// Regions are HALF-OPEN: [start, end). An event exactly at `start` is inside, one exactly at `end` is outside, so adjacent
// regions never count an event twice. Regions must be finite, ordered, non-overlapping, with end > start >= 0.
// A track without `scorable` is scored over the whole recording, exactly as before.
//
// Optional per region:  "silent": ["drums", "bass", "chords"]  declares that those kinds are ANNOTATED as absent there (a drumless
// breakdown). That is different from "nobody annotated this region": a kind with no events in a region and no `silent` declaration is a
// validation failure (see requirements.js), because it cannot be told apart from a missing annotation. Declared silence stays scorable:
// anything the analyzer predicts there is a false positive. Beats cannot be silent (declare a `gap` for a free-time passage).
//
// Against the recording: validation at scoring time also rejects a region that starts after the audio ends, or ends more than
// 0.5 s after it (a benchmark whose declared regions miss the music would otherwise "complete" with only tempo and key scored).
"use strict";

const SILENT_KINDS = ["drums", "bass", "chords"], END_SLACK = 0.5;
function problems(regions, id = "track", duration = null) {
  if (!Array.isArray(regions) || !regions.length) return [`${id}: scorable must be a non-empty list of { start, end } regions`];
  const out = [];
  regions.forEach((r, i) => {
    if (!r || !Number.isFinite(r.start) || !Number.isFinite(r.end)) out.push(`${id}: scorable[${i}] needs numeric start and end`);
    else if (r.start < 0) out.push(`${id}: scorable[${i}] starts before 0 (${r.start})`);
    else if (!(r.end > r.start)) out.push(`${id}: scorable[${i}] must end after it starts (${r.start} to ${r.end})`);
    else {
      if (r.silent !== undefined) {
        if (!Array.isArray(r.silent) || r.silent.some(k => !SILENT_KINDS.includes(k))) out.push(`${id}: scorable[${i}].silent must be a list drawn from ${SILENT_KINDS.join(", ")}` + (Array.isArray(r.silent) && r.silent.includes("beats") ? " (beats cannot be silent: declare a gap for a free-time passage)" : ""));
      }
      if (Number.isFinite(duration)) {
        if (r.start >= duration) out.push(`${id}: scorable[${i}] starts at ${r.start} s, after the recording ends (${(+duration).toFixed(2)} s)`);
        else if (r.end > duration + END_SLACK) out.push(`${id}: scorable[${i}] ends at ${r.end} s, ${(r.end - duration).toFixed(2)} s after the recording ends (${(+duration).toFixed(2)} s)`);
      }
    }
  });
  if (out.length) return out;
  for (let i = 1; i < regions.length; i++) {
    if (regions[i].start < regions[i - 1].end) out.push(`${id}: scorable[${i}] (${regions[i].start}-${regions[i].end}) overlaps or precedes scorable[${i - 1}] (${regions[i - 1].start}-${regions[i - 1].end}); list regions in order without overlap`);
  }
  return out;
}
const normalize = regions => { const p = problems(regions); if (p.length) throw new Error(p[0]); return regions.map(r => ({ start: r.start, end: r.end, silent: r.silent || [] })); };
const inside = (R, t) => R.some(r => t >= r.start && t < r.end);
const filterTimes = (times, R) => (times || []).filter(t => inside(R, t));
// a note belongs to the region its ONSET is in
const filterNotes = (notes, R) => (notes || []).filter(n => inside(R, n.onset));
// every interval is cut to each region it overlaps; empty pieces are dropped (labels and other fields are kept)
function clipIntervals(list, R) {
  const out = [];
  for (const r of R) for (const s of list || []) { const a = Math.max(s.start, r.start), b = Math.min(s.end, r.end); if (b > a) out.push({ ...s, start: a, end: b }); }
  return out;
}
// true when [a, b) lies wholly inside ONE region
const containsInterval = (R, a, b) => R.some(r => a >= r.start && b <= r.end);
// the parts of [0, duration] that are NOT scorable, as { start, end } spans (used to restart drift at region edges)
function complement(R, duration) {
  const out = []; let at = 0;
  for (const r of R) { if (r.start > at) out.push({ start: at, end: r.start }); at = Math.max(at, r.end); }
  if (duration > at) out.push({ start: at, end: duration });
  return out;
}
const seconds = R => R.reduce((s, r) => s + (r.end - r.start), 0);

module.exports = { problems, normalize, inside, filterTimes, filterNotes, clipIntervals, containsInterval, complement, seconds };
