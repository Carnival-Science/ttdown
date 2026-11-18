// Failure classes, version 1. Fixed rules so every error lands in a named bucket the failure atlas can count.
// Thresholds are first guesses to be revisited after the G1a pilot's listening review; they are versioned.
"use strict";
const { events, WINDOW } = require("../../tests/metrics");
const CLASSIFIER_VERSION = "2"; // v2: export-grid class uses phase-locked drift and adds "slipped-beats"

function tempoClass(t) {
  if (!t) return "n/a"; if (t.acc1) return "ok";
  const r = t.est / t.ref, near = f => Math.abs(r - f) <= 0.04 * f;
  return near(0.5) ? "half" : near(2) ? "double" : near(2 / 3) ? "x2/3" : near(1.5) ? "x1.5" : near(1 / 3) ? "third" : near(3) ? "triple" : "other";
}

function beatClass(est, ref, tempoCls) {
  if (!est || !ref || !ref.length) return "n/a";
  if (events(est, ref).f >= 0.9) return "ok";
  if (tempoCls !== "ok" && tempoCls !== "n/a") return "metrical-level";
  const ibi = ref.length > 1 ? (ref[ref.length - 1] - ref[0]) / (ref.length - 1) : 0.5;
  if (events(est.map(t => t + ibi / 2), ref).f >= 0.8) return "off-beat";
  const inSpan = est.filter(t => t >= ref[0] - WINDOW && t <= ref[ref.length - 1] + WINDOW);
  if (events(inSpan, ref).f >= 0.9) return "edges"; // fine inside the music, extra/missing beats outside it
  return "other";
}

// est downbeats vs true beats by position: landing on true beat 2, 3 or 4 = a phase error of 1, 2 or 3 beats
function downbeatClass(estDown, ref) {
  if (!estDown || !ref || !ref.downbeats) return "n/a";
  if (events(estDown, ref.downbeats).f >= 0.9) return "ok";
  for (const k of [2, 3, 4]) { const on = ref.beats.filter((_, i) => ref.positions[i] === k); if (events(estDown, on).f >= 0.8) return `phase+${k - 1}`; }
  return "other";
}

// d: phase-locked drift (metrics.phaseDrift). "slipped-beats" = the grid lost at least half a beat somewhere,
// which nearest-beat distance cannot see.
function driftClass(d) {
  if (!d) return "n/a"; if (d.maxAbsMs <= WINDOW * 1000) return "ok";
  if (d.maxAbsBeats != null && d.maxAbsBeats >= 0.5) return "slipped-beats";
  return Math.abs(d.endOffsetMs - d.startOffsetMs) < WINDOW * 500 ? "constant-offset" : "cumulative-drift";
}

const keyClass = k => !k || !k.scorable ? "n/a" : k.category === "exact" ? "ok" : k.category;

function drumClass(m) { // m: { w30, w50, w100 } event scores for one class
  if (!m || m.w50.vacuous) return "n/a";                    // nothing annotated and nothing predicted: not scored
  if (m.w50.tp + m.w50.fn === 0) return "extra";            // annotated as absent, but the analyzer predicted hits: false positives
  if (m.w50.f >= 0.9) return "ok";
  if (m.w100.f >= 0.9) return "timing";
  if (m.w50.R < m.w50.P - 0.2) return "missed";
  if (m.w50.P < m.w50.R - 0.2) return "extra";
  return "mixed";
}

const chordClass = c => !c || c.majmin == null ? "n/a" : c.majmin >= 0.9 ? "ok" : c.root >= 0.9 ? "quality" : "root";

// melody: m = noteScores result (+ frames). "onset-only high but pitch low" is exactly what the old hook metric could not see.
function melodyClass(m) {
  if (!m || m.vacuous) return "n/a";
  if (m.nRef === 0) return "extra";                                  // annotated as absent, notes predicted
  if (m.nEst === 0) return "missed";                                 // annotated present, nothing predicted
  if (m.pitchOnset.F >= 0.8) return m.full.F >= 0.8 ? "ok" : "timing-or-duration";
  if (m.octave && m.octave.wrongPitch > 0 && m.octave.octaveErrors / m.octave.wrongPitch >= 0.5 && m.onset.F >= 0.8) return "octave";
  if (m.onset.F >= 0.8) return "wrong-notes";
  if (m.fragmentation && m.fragmentation.rate >= 0.3) return "fragmented";
  return m.onset.R < m.onset.P - 0.2 ? "missed" : m.onset.P < m.onset.R - 0.2 ? "extra" : "mixed";
}

function bassClass(b) {
  if (!b || b.onset.vacuous) return "n/a";
  if (b.onset.tp + b.onset.fn === 0) return "extra";        // annotated as absent, but the analyzer predicted notes
  if (b.onset.f >= 0.8 && b.pitchAccuracyOnMatched >= 0.8) return "ok";
  if (b.onset.f < 0.5) return "missed-onsets";
  const wrong = 1 - (b.pitchAccuracyOnMatched || 0);
  return wrong > 0 && b.octaveErrorRate / wrong >= 0.5 ? "octave" : "wrong-notes";
}

module.exports = { CLASSIFIER_VERSION, tempoClass, beatClass, downbeatClass, driftClass, keyClass, drumClass, chordClass, bassClass, melodyClass };
