// Checks the G1 harness code (bench/lib) on hand-made cases with known answers.  node tests/bench-metrics.test.js
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const M = require("../bench/lib/metrics"), C = require("../bench/lib/classify"), L = require("../bench/lib/loaders"), { summarize } = require("../bench/lib/stats");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-bench-")), file = (name, text) => { const p = path.join(tmp, name); fs.writeFileSync(p, text); return p; };

// loaders: '#' inside a token is a sharp, not a comment (this bug existed and broke F# keys and sharp chords)
assert.deepEqual(L.key(file("k1.txt", "F# minor\n")), { label: "F# minor", tonic: 6, mode: "minor", scorable: true });
assert.equal(L.key(file("k2.txt", "# annotator: A\nBb major  # checked twice\n")).tonic, 10);
assert.equal(L.key(file("k3.txt", "ambiguous\n")).scorable, false);
assert.deepEqual(L.chords(file("c.lab", "0 2 C#:min\n2 4 N\n")).map(c => c.label), ["C#:min", "N"]);
const B = L.beats(file("b.txt", "0.5 1\n1.0 2\r\n1.5 3\n2.0 4\n2.5 1\n"));
assert.deepEqual(B.downbeats, [0.5, 2.5]);
assert.equal(L.beats(file("b2.txt", "0.5\n1.0\n")).downbeats, null); // no positions = downbeats not annotated
const D = L.drums(file("d.txt", "0 bd\n0 hh\n0.5 clap\n0.5 ohh\n1 cowbell\n"));
assert.deepEqual([D.kick, D.snare, D.hihat, D.other], [[0], [0.5], [0, 0.5], 1]);

// match(): original indices, and an extra condition (same pitch)
assert.deepEqual(M.match([1.02, 0.0], [0, 1], 0.05).map(m => [m[0], m[1]]).sort(), [[0, 1], [1, 0]]);
assert.equal(M.match([0, 1], [0, 1], 0.05, (e, r) => e !== r).length, 0);

// key: mir_eval weighted score; a fifth counts only upward
const ref = (t, m) => ({ label: `${t} ${m}`, tonic: L.pitchClass(t), mode: m, scorable: true });
assert.equal(M.keyScore("C major", ref("C", "major")).weighted, 1);
assert.equal(M.keyScore("G major", ref("C", "major")).weighted, 0.5);
assert.equal(M.keyScore("F major", ref("C", "major")).weighted, 0);
assert.equal(M.keyScore("F major", ref("C", "major")).category, "fifth-below");
assert.equal(M.keyScore("A minor", ref("C", "major")).weighted, 0.3);
assert.equal(M.keyScore("C major", ref("A", "minor")).weighted, 0.3);
assert.equal(M.keyScore("C minor", ref("C", "major")).weighted, 0.2);
assert.equal(M.keyScore("C major", { label: "atonal", tonic: null, scorable: false }).scorable, false);

// chords: estimate padded with N to the reference span; X ignored; 7ths count as their triad; inversions ignored
const seg = (s, e, l) => ({ start: s, end: e, label: l });
assert.deepEqual(M.chordScores([seg(0, 4, "C:maj")], [seg(0, 4, "C:maj")]), { root: 1, majmin: 1, refSeconds: 4 });
assert.equal(M.chordScores([seg(1, 4, "C:maj")], [seg(0, 4, "C:maj")]).majmin, 0.75);
assert.equal(M.chordScores([seg(0, 4, "C:min")], [seg(0, 4, "C:maj")]).root, 1);
assert.equal(M.chordScores([seg(0, 4, "C:min")], [seg(0, 4, "C:maj")]).majmin, 0);
assert.equal(M.chordScores([seg(0, 2, "C:maj"), seg(2, 4, "C:maj")], [seg(0, 2, "C:maj"), seg(2, 4, "X")]).root, 1);
assert.equal(M.chordScores([seg(0, 4, "G:maj")], [seg(0, 4, "G:7/3")]).majmin, 1);
assert.equal(M.chordScores([seg(0, 4, "C:maj")], [seg(0, 4, "C:sus4")]).majmin, null);
assert.equal(M.appChordToHarte("F#m"), "F#:min"); assert.equal(M.appChordToHarte("–"), "N");

// exported grid and drift
const g = M.exportGrid({ firstDown: 0, barSec: 2, duration: 4 });
assert.deepEqual(g.beats, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]); assert.deepEqual(g.downbeats, [0, 2, 4]);
const refB = Array.from({ length: 20 }, (_, i) => i * 0.5);
assert.equal(M.drift(refB.map(t => t + 0.02), refB).maxAbsMs, 20);
const drifting = M.drift(refB.map((t, i) => t + i * 0.01), refB);
assert.equal(drifting.firstExceedSec, 4); assert.equal(C.driftClass(drifting), "cumulative-drift");
assert.equal(C.driftClass(M.drift(refB.map(t => t + 0.1), refB)), "constant-offset");

// notes: onset, pitch and octave errors
const n = (o, m) => ({ onset: o, offset: o + 0.2, midi: m });
const ns = M.noteScores([n(0, 33), n(1, 45), n(2, 30)], [n(0, 33), n(1, 33), n(2, 31)]);
assert.deepEqual([ns.onset.f, ns.noteF, ns.pitchAccuracyOnMatched, ns.octaveErrorRate], [1, 0.3333, 0.3333, 0.3333]);

// classifiers
assert.equal(C.tempoClass(M.tempo(87, 174)), "half"); assert.equal(C.tempoClass(M.tempo(195, 130)), "x1.5"); assert.equal(C.tempoClass(M.tempo(128, 128)), "ok");
assert.equal(C.beatClass(refB.map(t => t + 0.25), refB, "ok"), "off-beat");
const R = { beats: refB, positions: refB.map((_, i) => i % 4 + 1), downbeats: refB.filter((_, i) => i % 4 === 0) };
assert.equal(C.downbeatClass(refB.filter((_, i) => i % 4 === 1), R), "phase+1");
const w = (f, P = f, Rr = f) => ({ f, P, R: Rr, tp: 10, fn: 1 });
assert.equal(C.drumClass({ w30: w(0.5), w50: w(0.5), w100: w(0.95) }), "timing");
assert.equal(C.drumClass({ w30: w(0.5), w50: w(0.5, 0.9, 0.4), w100: w(0.5) }), "missed");

// bootstrap: seeded, so identical reruns; one value has no interval
assert.deepEqual(summarize([0, 1, 1, 1]), summarize([0, 1, 1, 1]));
assert.equal(summarize([1]).ci95, null); assert.equal(summarize([]).n, 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("bench metric tests passed");
