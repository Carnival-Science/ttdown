// Adversarial melody-transcription cases: hand-checked expectations for the note and frame scorers (tests/transcription.test.js) and the
// same cases re-evaluated by mir_eval (bench/crosscheck_transcription.py). Notes are { onset, offset, midi, tags? } in seconds.
// `expect` lists only what is certain by construction; `dur` is the length of the recording for frame scoring.
"use strict";
const N = (onset, offset, midi, ...tags) => ({ onset, offset, midi, ...(tags.length ? { tags } : {}) });
const run = (start, midis, len, gap = 0) => midis.map((m, i) => N(start + i * (len + gap), start + i * (len + gap) + len, m));   // a phrase of equal notes

const cases = [
  { name: "perfect", dur: 6, ref: run(1, [60, 62, 64, 65], 1), est: run(1, [60, 62, 64, 65], 1), expect: { onsetF: 1, pitchOnsetF: 1, fullF: 1, octaveErrors: 0, rpa: 1 } },
  { name: "right rhythm, wrong notes (what the old hook metric could not see)", dur: 6, ref: run(1, [60, 62, 64, 65], 1), est: run(1, [61.5, 63.5, 65.5, 66.5], 1),
    expect: { onsetF: 1, pitchOnsetF: 0, fullF: 0, octaveErrors: 0, klass: "wrong-notes" } },
  { name: "octave errors: right onsets, every note an octave up", dur: 6, ref: run(1, [60, 62, 64, 65], 1), est: run(1, [72, 74, 76, 77], 1),
    expect: { onsetF: 1, pitchOnsetF: 0, octaveErrors: 4, octaveRate: 1, klass: "octave", rca: 1, rpa: 0 } },
  { name: "octave errors: two octaves down count too", dur: 6, ref: run(1, [72, 74], 1), est: run(1, [48, 50], 1), expect: { onsetF: 1, pitchOnsetF: 0, octaveErrors: 2 } },
  { name: "correct pitch but wrong durations (offset-aware score drops, pitch+onset does not)", dur: 6, ref: run(1, [60, 62, 64, 65], 1), est: [60, 62, 64, 65].map((m, i) => N(1 + i, 1.3 + i, m)),
    expect: { onsetF: 1, pitchOnsetF: 1, fullF: 0, klass: "timing-or-duration" } },
  { name: "repeated notes merged into one long note", dur: 5, ref: run(1, [60, 60, 60, 60], 0.4, 0.1), est: [N(1, 2.9, 60)],
    expect: { onsetTp: 1, onsetR: 0.25, mergedEst: 1, fragmentedRef: 0 } },
  { name: "one long note fragmented into repeated notes", dur: 5, ref: [N(1, 3, 60)], est: run(1, [60, 60, 60, 60], 0.4, 0.1),
    expect: { onsetTp: 1, onsetP: 0.25, fragmentedRef: 1, mergedEst: 0 } },
  { name: "repeated same-pitch notes, all found", dur: 5, ref: run(1, [60, 60, 60, 60], 0.4, 0.1), est: run(1, [60, 60, 60, 60], 0.4, 0.1), expect: { onsetF: 1, fullF: 1, fragmentedRef: 0, mergedEst: 0 } },
  { name: "glissando as a semitone staircase, found exactly", dur: 3, ref: run(1, [60, 61, 62, 63, 64, 65, 66, 67], 0.2), est: run(1, [60, 61, 62, 63, 64, 65, 66, 67], 0.2), expect: { pitchOnsetF: 1, fullF: 1 } },
  { name: "glissando flattened into one sustained note", dur: 3, ref: run(1, [60, 61, 62, 63, 64, 65, 66, 67], 0.2), est: [N(1, 2.6, 60)], expect: { onsetTp: 1, pitchOnsetTp: 1, pitchOnsetR: 0.125, fullTp: 0 } },
  { name: "ornament: a grace note 60 ms before the main note is missed", dur: 4, ref: [N(1, 1.06, 62), N(1.06, 2, 60)], est: [N(1.06, 2, 60)], expect: { onsetTp: 1, onsetP: 1, onsetR: 0.5, pitchOnsetTp: 1 } },
  { name: "ornament: a grace note 40 ms before the main note is inside the onset tolerance of both", dur: 4, ref: [N(1, 1.04, 62), N(1.04, 2, 60)], est: [N(1.04, 2, 60)], expect: { onsetTp: 1, fn: 1 } },
  { name: "silence: annotated absent, predicted present (false positives, F 0)", dur: 5, ref: [], est: run(1, [60, 62], 1), expect: { vacuous: false, pitchOnsetF: 0, fp: 2, klass: "extra" } },
  { name: "silence: nothing annotated and nothing predicted (vacuous: null, never 1.0)", dur: 5, ref: [], est: [], expect: { vacuous: true, pitchOnsetF: null, klass: "n/a" } },
  { name: "silence: annotated present, nothing predicted (F 0)", dur: 5, ref: run(1, [60, 62], 1), est: [], expect: { pitchOnsetF: 0, fn: 2 } },
  { name: "unpitched vocal consonant: an estimate on it is ignored, not a false positive", dur: 5, ref: [N(1, 2, 60), N(2.5, 2.58, 70, "unpitched"), N(3, 4, 62)], est: [N(1, 2, 60), N(2.52, 2.6, 71), N(3, 4, 62)],
    expect: { nRef: 2, nEst: 2, ignoredUnpitched: 1, fullF: 1 } },
  { name: "the same estimate WITHOUT the unpitched tag is a false positive", dur: 5, ref: [N(1, 2, 60), N(3, 4, 62)], est: [N(1, 2, 60), N(2.52, 2.6, 71), N(3, 4, 62)], expect: { nEst: 3, fp: 1, ignoredUnpitched: 0 } },
  { name: "ambiguous reference note: strict recall counts the miss, lenient recall does not", dur: 5, ref: [N(1, 2, 60), N(2, 3, 62, "ambiguous"), N(3, 4, 64)], est: [N(1, 2, 60), N(3, 4, 64)],
    expect: { pitchOnsetR: 0.6667, lenientPitchOnsetR: 1 } },
  { name: "melody switch: the candidate puts the second half in the wrong octave", dur: 6, ref: [...run(0.5, [60, 62], 1), ...run(3, [72, 74], 1)], est: [...run(0.5, [60, 62], 1), ...run(3, [60, 62], 1)], expect: { onsetF: 1, pitchOnsetF: 0.5, octaveErrors: 2 } },
  { name: "onset tolerance edge: exactly 50 ms matches, 51 ms does not", dur: 4, ref: [N(1, 2, 60), N(2, 3, 62)], est: [N(1.05, 2.05, 60), N(2.051, 3.051, 62)], expect: { onsetTp: 1 } },
  { name: "pitch tolerance edge: exactly 50 cents matches, 50.5 does not", dur: 4, ref: [N(1, 2, 60), N(2, 3, 62)], est: [N(1, 2, 60.5), N(2, 3, 62.505)], expect: { pitchOnsetTp: 1, onsetTp: 2 } },
  { name: "offset tolerance: 20% of a 1 s reference note is 0.2 s; a 0.1 s note gets the 50 ms floor", dur: 6, ref: [N(1, 2, 60), N(3, 3.1, 62)], est: [N(1, 2.2, 60), N(3, 3.16, 62)], expect: { fullTp: 1, pitchOnsetTp: 2 } },
  { name: "close notes need maximum matching: ref 40/100 ms, est 0/60 ms at 50 ms", dur: 2, ref: [N(0.04, 0.09, 60), N(0.1, 0.15, 60)], est: [N(0, 0.05, 60), N(0.06, 0.11, 60)], expect: { onsetTp: 2, pitchOnsetTp: 2 } },
  { name: "double-triggered estimate: one reference note can match once", dur: 4, ref: [N(1, 2, 60)], est: [N(1, 2, 60), N(1.01, 2, 60)], expect: { onsetTp: 1, fp: 1 } },
  // partial and out-of-range intervals: scored over [1.5, 4) by onset, frames only inside it
  { name: "partial scope: only notes whose onset is inside [1.5, 4) count; a note straddling the edge belongs to its onset", dur: 6, regions: [{ start: 1.5, end: 4 }],
    ref: [N(0.9, 1.7, 60), N(2, 3, 62), N(3.9, 4.6, 64), N(5, 6, 65)], est: [N(0.9, 1.7, 60), N(2, 3, 62), N(3.9, 4.6, 64), N(5, 6, 66)], expect: { nRef: 2, nEst: 2, fullF: 1 } }
];

// frame-level cases: an f0 series reference (Hz, 0 = unvoiced) against estimated notes
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const series = (f, from, to, hop = 0.01) => { const s = []; for (let k = Math.round(from / hop); k * hop < to - 1e-9; k++) { const t = +(k * hop).toFixed(6); s.push({ t, hz: f(t) }); } return s; };   // integer steps: no accumulated float error
const frameCases = [
  { name: "vibrato inside +/-50 cents: a steady note at the centre is always right", dur: 4, ref: { series: series(t => t < 1 || t >= 3 ? 0 : hz(60) * Math.pow(2, 40 * Math.sin(2 * Math.PI * 6 * t) / 1200), 0, 4) }, est: [N(1, 3, 60)], expect: { rpa: 1, voicingRecall: 1, voicingFalseAlarm: 0 } },
  { name: "vibrato of +/-60 cents: only about 63 % of frames are within 50 cents (analytic 2/pi * asin(5/6))", dur: 4, ref: { series: series(t => t < 1 || t >= 3 ? 0 : hz(60) * Math.pow(2, 60 * Math.sin(2 * Math.PI * 4 * t) / 1200), 0, 4) }, est: [N(1, 3, 60)], expect: { rpa: 0.6285, rpaTol: 0.03 } },
  { name: "glissando in the f0 series against a staircase of semitone notes", dur: 4, ref: { series: series(t => t < 1 || t >= 3 ? 0 : hz(60 + 6 * (t - 1)), 0, 4) }, est: run(1, [60.5, 61.5, 62.5, 63.5, 64.5, 65.5, 66.5, 67.5, 68.5, 69.5, 70.5, 71.5].filter((_, i) => i < 12), 1 / 6),
    expect: { rpaMin: 0.9 } },
  { name: "unvoiced spans: the estimate sings through a rest (a third of the unvoiced frames are false alarms)", dur: 4, ref: { series: series(t => t >= 1 && t < 2 ? hz(60) : 0, 0, 4) }, est: [N(1, 3, 60)], expect: { voicingRecall: 1, voicingFalseAlarmMin: 0.3 } }
];
module.exports = { cases, frameCases, N, run, series, hz };
