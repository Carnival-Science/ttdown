// G1 metrics. Event matching, beat F-measure and tempo accuracy come from tests/metrics.js (G0) unchanged.
// Key and chord scoring follow mir_eval 0.8.2 exactly (read from its source); bench/crosscheck_mir_eval.py checks it.
"use strict";
const { match, events, tempo, WINDOW } = require("../../tests/metrics");
const { pitchClass, beatIntervals } = require("./loaders");
const r4 = v => v == null || !Number.isFinite(v) ? null : +v.toFixed(4);

// ---- the grid the app exports (chords, sections, MIDI, lined-up WAV): firstDown + n * barSec / 4 ----
// Same expression and order as tests/benchmark.js (G0), so results stay identical.
function exportGrid(p) {
  const beats = [], downbeats = [];
  for (let n = Math.ceil((-WINDOW - p.firstDown) / (p.barSec / 4)); p.firstDown + n * p.barSec / 4 <= p.duration; n++) {
    const t = p.firstDown + n * p.barSec / 4; beats.push(t); if (((n % 4) + 4) % 4 === 0) downbeats.push(t);
  }
  return { beats, downbeats };
}

// How far the exported beats sit from the true beats over the song (signed: + = export is late).
function drift(exportBeats, refBeats, win = WINDOW) {
  if (!refBeats.length || !exportBeats.length) return null;
  const E = exportBeats.slice().sort((a, b) => a - b); let j = 0;
  const offs = refBeats.map(r => { while (j + 1 < E.length && Math.abs(E[j + 1] - r) <= Math.abs(E[j] - r)) j++; return E[j] - r; });
  const abs = offs.map(Math.abs), k = Math.min(8, offs.length), med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const first = abs.findIndex(v => v > win);
  return { maxAbsMs: r4(1000 * Math.max(...abs)), startOffsetMs: r4(1000 * med(offs.slice(0, k))), endOffsetMs: r4(1000 * med(offs.slice(-k))),
    firstExceedSec: first < 0 ? null : r4(refBeats[first]), beatsWithin: r4(abs.filter(v => v <= win).length / abs.length) };
}

// Phase-unwrapped drift (review finding 2). Nearest-beat distance (drift above) can never exceed half a beat:
// once the grid slips by a whole beat it looks perfect again. Here exported beat n is tied to true beat n from
// the first true beat on, so displacement keeps accumulating across tempo changes. The exported grid is linear
// (firstDown + n * q, q = barSec / 4), so the k-th beat of a continuous annotated segment should sit on export beat
// n0 + k. Beats are never interpolated: at a declared gap (or an unexplained hole, counted as undeclaredGaps) the
// count restarts with a new anchor, because how many beats passed inside the gap is unknown. A declared tempo change
// does NOT restart it: the beats are continuous, and the fixed export grid really does drift away there.
function phaseDrift(p, refBeats, gaps = [], tempoChanges = [], win = WINDOW) {
  if (!refBeats || refBeats.length < 2) return null;
  const q = p.barSec / 4, R = refBeats.slice().sort((a, b) => a - b), med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const segStarts = [0]; let undeclared = 0;
  beatIntervals(R, gaps || [], tempoChanges || []).forEach((h, i) => { if (h.declaredGap || h.hole) { segStarts.push(i + 1); if (h.hole && !h.declaredGap) undeclared++; } });
  const off = [];
  segStarts.forEach((s, j) => { const e = j + 1 < segStarts.length ? segStarts[j + 1] : R.length, n0 = Math.round((R[s] - p.firstDown) / q);
    for (let k = s; k < e; k++) off.push((p.firstDown + (n0 + k - s) * q - R[k]) / q); }); // beats; + = export late
  const ms = off.map(v => v * q * 1000), abs = ms.map(Math.abs), k8 = Math.min(8, ms.length);
  const iMax = abs.indexOf(Math.max(...abs)), first = abs.findIndex(v => v > win * 1000), slip = off.findIndex(v => Math.abs(v) >= 0.5);
  return { maxAbsMs: r4(abs[iMax]), maxAbsBeats: r4(Math.abs(off[iMax])), maxSlipBeats: Math.round(Math.abs(off[iMax])), startOffsetMs: r4(med(ms.slice(0, k8))), endOffsetMs: r4(med(ms.slice(-k8))),
    endOffsetBeats: r4(med(off.slice(-k8))), firstExceedSec: first < 0 ? null : r4(R[first]), firstSlipSec: slip < 0 ? null : r4(R[slip]),
    beatsWithin: r4(abs.filter(v => v <= win * 1000).length / abs.length), segments: segStarts.length, undeclaredGaps: undeclared };
}

// predictions strictly inside a declared gap are not scored (there is no verified ground truth there)
const outsideGaps = (times, gaps) => !gaps || !gaps.length ? times : times.filter(t => !gaps.some(g => t > g.start && t < g.end));

// ---- key: mir_eval.key.weighted_score (a fifth counts only upward) + a category for failure analysis ----
function parseKey(s) { const [t, m] = String(s || "").trim().split(/\s+/); return { tonic: pitchClass(t), mode: (m || "").toLowerCase() }; }
function keyScore(estLabel, ref) {
  const e = parseKey(estLabel);
  if (!ref || !ref.scorable) return { scorable: false, refLabel: ref ? ref.label : null, est: estLabel };
  const d = ((e.tonic - ref.tonic) % 12 + 12) % 12, same = e.mode === ref.mode;
  let weighted = 0, category = "other";
  if (same && d === 0) { weighted = 1; category = "exact"; }
  else if (same && d === 7) { weighted = 0.5; category = "fifth-above"; }
  else if (!same && ref.mode === "major" && d === 9) { weighted = 0.3; category = "relative"; }
  else if (!same && ref.mode === "minor" && d === 3) { weighted = 0.3; category = "relative"; }
  else if (!same && d === 0) { weighted = 0.2; category = "parallel"; }
  else if (same && d === 5) category = "fifth-below"; // 0 in mir_eval, but worth seeing separately
  return { scorable: true, est: estLabel, ref: ref.label, exact: weighted === 1, weighted, category };
}

// ---- chords: mir_eval root and majmin, duration-weighted over the reference span ----
const MAJ = new Set(["maj", "7", "maj7", "9", "maj9", "11", "maj11", "13", "maj13", "6", "maj6"]), MIN = new Set(["min", "min7", "minmaj7", "min9", "min11", "min13", "min6"]);
function parseChord(label) { // -> { root: 0..11 | -1 (N) | null (X / unparsable), triad: "maj" | "min" | "N" | "other" }
  const s = String(label || "N").trim();
  if (s === "N") return { root: -1, triad: "N" };
  if (s === "X") return { root: null, triad: "other" };
  const [rootS, rest = "maj"] = s.split("/")[0].split(":");
  const root = pitchClass(rootS); if (root == null) return { root: null, triad: "other" };
  const q = rest.replace(/\(.*\)/, "") || "maj";
  return { root, triad: MAJ.has(q) ? "maj" : MIN.has(q) ? "min" : "other" };
}
// app chord names ("Am", "C#", "–") -> Harte
const appChordToHarte = c => !c || c === "–" ? "N" : c.endsWith("m") ? c.slice(0, -1) + ":min" : c + ":maj";

function chordScores(estSegs, refSegs) {
  if (!refSegs || !refSegs.length) return null;
  const lo = Math.min(...refSegs.map(s => s.start)), hi = Math.max(...refSegs.map(s => s.end));
  // estimate cropped/padded with N to the reference span (mir_eval.util.adjust_intervals)
  const est = estSegs.filter(s => s.end > lo && s.start < hi).map(s => ({ start: Math.max(lo, s.start), end: Math.min(hi, s.end), label: s.label }));
  const cuts = [...new Set([lo, hi, ...refSegs.flatMap(s => [s.start, s.end]), ...est.flatMap(s => [s.start, s.end])])].filter(t => t >= lo && t <= hi).sort((a, b) => a - b);
  const at = (segs, t) => { const s = segs.find(s => s.start <= t && t < s.end); return s ? s.label : "N"; };
  let rootW = 0, rootN = 0, mmW = 0, mmN = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1], dur = b - a; if (dur <= 0) continue; const mid = (a + b) / 2;
    const R = parseChord(at(refSegs, mid)), E = parseChord(at(est, mid));
    if (R.root !== null) { rootN += dur; if (R.root === E.root) rootW += dur; }            // root: ignore X references
    if (R.triad === "maj" || R.triad === "min" || R.triad === "N") { mmN += dur; if (R.root === E.root && R.triad === E.triad) mmW += dur; }
  }
  return { root: rootN ? r4(rootW / rootN) : null, majmin: mmN ? r4(mmW / mmN) : null, refSeconds: r4(hi - lo) };
}

// ---- notes (bass): onsets within ±win; a "note" also needs the same MIDI pitch ----
function noteScores(est, ref, win = 0.05) {
  if (!ref) return null;
  const on = events(est.map(n => n.onset), ref.map(n => n.onset), win);
  const m = match(est.map(n => n.onset), ref.map(n => n.onset), win);
  const pitchOk = m.filter(([e, r]) => est[e].midi === ref[r].midi).length, octave = m.filter(([e, r]) => est[e].midi !== ref[r].midi && (est[e].midi - ref[r].midi) % 12 === 0).length;
  const nm = match(est.map(n => n.onset), ref.map(n => n.onset), win, (e, r) => est[e].midi === ref[r].midi).length;
  const P = est.length ? nm / est.length : 0, R = ref.length ? nm / ref.length : 0;
  return { onset: on, noteF: r4(P + R ? 2 * P * R / (P + R) : (est.length || ref.length ? 0 : 1)), notePrecision: r4(P), noteRecall: r4(R),
    pitchAccuracyOnMatched: m.length ? r4(pitchOk / m.length) : null, octaveErrorRate: m.length ? r4(octave / m.length) : null, matched: m.length };
}

module.exports = { exportGrid, drift, phaseDrift, outsideGaps, keyScore, parseKey, chordScores, parseChord, appChordToHarte, noteScores, events, tempo, match, WINDOW, r4 };
