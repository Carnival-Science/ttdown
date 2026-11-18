// Melody scoring (bench/lib/transcription.js): adversarial cases with hand-checked expectations. Pure Node.
// The same cases are re-evaluated by mir_eval in bench/crosscheck_transcription.py (npm run bench:transcription).
"use strict";
const assert = require("node:assert/strict");
const T = require("../bench/lib/transcription"), C = require("../bench/lib/classify"), { cases, frameCases } = require("./fixtures/transcription-cases");
const near = (a, b, tol, msg) => assert.ok(a != null && Math.abs(a - b) <= tol, `${msg}: expected ${b} ± ${tol}, got ${a}`);
let n = 0;

function evaluate(c) {
  const inside = x => !c.regions || c.regions.some(r => x >= r.start && x < r.end), keep = l => l.filter(x => inside(x.onset));
  const ns = c.ref.series ? null : T.noteScores(keep(c.est), keep(c.ref)), fr = T.frameScores(c.est, c.ref.series ? c.ref : { notes: c.ref }, { duration: c.dur, regions: c.regions || null });
  return { ns, fr };
}
for (const c of cases.concat(frameCases)) {
  const { ns, fr } = evaluate(c), e = c.expect || {}, what = c.name;
  const chk = (key, got, tol = 1e-9) => { if (!(key in e)) return; if (e[key] === null) assert.equal(got, null, `${what}: ${key}`); else near(got, e[key], tol, `${what}: ${key}`); };
  if (!c.ref.series) {
    chk("onsetF", ns.onset.F); chk("pitchOnsetF", ns.pitchOnset.F); chk("fullF", ns.full.F); chk("onsetTp", ns.onset.tp); chk("pitchOnsetTp", ns.pitchOnset.tp); chk("fullTp", ns.full.tp);
    chk("onsetP", ns.onset.P, 1e-4); chk("onsetR", ns.onset.R, 1e-4); chk("pitchOnsetR", ns.pitchOnset.R, 1e-4); chk("fp", ns.onset.fp); chk("fn", ns.onset.fn);
    chk("nRef", ns.nRef); chk("nEst", ns.nEst); chk("ignoredUnpitched", ns.ignoredUnpitched);
    if ("octaveErrors" in e) chk("octaveErrors", ns.octave ? ns.octave.octaveErrors : 0); if ("octaveRate" in e) chk("octaveRate", ns.octave.rate);
    if ("mergedEst" in e) chk("mergedEst", ns.merged.estNotesMerged); if ("fragmentedRef" in e) chk("fragmentedRef", ns.fragmentation.refNotesFragmented);
    if ("vacuous" in e) assert.equal(!!ns.vacuous, e.vacuous, what + ": vacuous");
    if ("klass" in e) assert.equal(C.melodyClass({ ...ns, frames: fr }), e.klass, what + ": failure class");
    if ("lenientPitchOnsetR" in e) near(ns.lenient.pitchOnset.R, e.lenientPitchOnsetR, 1e-4, what + ": lenient recall");
  }
  chk("rpa", fr.rawPitchAccuracy, e.rpaTol || 1e-9); chk("rca", fr.rawChromaAccuracy); chk("voicingRecall", fr.voicingRecall); chk("voicingFalseAlarm", fr.voicingFalseAlarm);
  if ("rpaMin" in e) assert.ok(fr.rawPitchAccuracy >= e.rpaMin, `${what}: rpa ${fr.rawPitchAccuracy} >= ${e.rpaMin}`);
  if ("voicingFalseAlarmMin" in e) assert.ok(fr.voicingFalseAlarm >= e.voicingFalseAlarmMin, `${what}: false alarm ${fr.voicingFalseAlarm}`);
  n++;
}

// the point of this module, in one assertion: the old hook metric (onset position only) calls a wrong-notes melody perfect
{ const c = cases.find(x => x.name.startsWith("right rhythm")), { ns } = evaluate(c); assert.equal(ns.onset.F, 1); assert.equal(ns.pitchOnset.F, 0); n++; }

// vacuous is never 1.0 and a class with nothing on either side never lifts an average
{ const v = T.noteScores([], []); assert.equal(v.vacuous, true); assert.equal(v.onset.F, null); assert.equal(v.full.P, null); assert.equal(v.full.vacuous, true);
  const f = T.frameScores([], { notes: [] }, { duration: 3 }); assert.equal(f.rawPitchAccuracy, null); assert.equal(f.voicingRecall, null); assert.equal(f.vacuous, true); n++; }

// configuration is reported and changeable
{ const r = T.noteScores([{ onset: 1.08, offset: 2, midi: 60 }], [{ onset: 1, offset: 2, midi: 60 }]); assert.equal(r.onset.tp, 0); assert.deepEqual(r.config, { onsetTol: 0.05, pitchTolCents: 50, offsetRatio: 0.2, offsetMinTol: 0.05 });
  const w = T.noteScores([{ onset: 1.08, offset: 2, midi: 60 }], [{ onset: 1, offset: 2, midi: 60 }], { onsetTol: 0.1 }); assert.equal(w.onset.tp, 1); assert.equal(w.config.onsetTol, 0.1); n++; }

// frame series: an f0 reference older than 2.5 sample spacings is unvoiced; the last sample at or before the frame is used
{ const f = T.seriesToFrames([{ t: 0, hz: 440 }, { t: 0.01, hz: 440 }, { t: 0.02, hz: 440 }, { t: 0.5, hz: 220 }], [0, 0.005, 0.01, 0.2, 0.5, 0.505]); assert.deepEqual(f, [440, 440, 440, 0, 220, 220]); n++; }
// overlapping reference notes: the latest onset wins (monophonic rule)
{ const f = T.notesToFrames([{ onset: 0, offset: 1, midi: 60 }, { onset: 0.5, offset: 1.5, midi: 64 }], [0.25, 0.75, 1.25, 1.75]); assert.equal(Math.round(f[0]), 262); assert.equal(Math.round(f[1]), 330); assert.equal(Math.round(f[2]), 330); assert.equal(f[3], 0); n++; }
console.log(`transcription tests passed (${n})`);
