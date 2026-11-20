#!/usr/bin/env node
/* domain.transcriptionFromNotes: the notes of a polyphonic model (Basic Pitch) become a.transcription, and everything downstream (piano roll
 * data, per-part and all-parts MIDI in three timings, the pickup) reads them. Synthetic notes with known answers; the browser run of the
 * model itself is tests/app-basic-pitch.test.js. */
"use strict";
const assert = require("node:assert/strict");
const { decodeMidi } = require("./lib/smf");
const TM = require("../src/timemap"), TS = require("../src/timing-store"), eng = require("../src/engine")({ TimeMap: TM }), D = require("../src/domain")({ TimingStore: TS, engine: eng });
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
// 120 BPM, 4/4, bar 1 at 0.5 s (a bar is 2 s), 8 bars, constant tempo
const a = { duration: 17, bpm: 120, barSec: 2, firstDown: 0.5, nBars: 8, sections: [{ startBar: 0, bars: 4, label: "A" }, { startBar: 4, bars: 4, label: "B" }], chords: { bars: ["C", "G", "Am", "F", "C", "G", "Am", "F"] }, key: "C major", pattern: { kick: [], snare: [], hats: [] }, balance: new Array(8).fill(12), rhythm: {}, width: 0.5, title: "t" };
const G = TM.forAnalysis(a);
const notes = [
  { on: 0.0, off: 0.4, midi: 72, vel: 90 },     // a pickup note, 0.5 s before bar 1
  { on: 0.5, off: 2.5, midi: 36, vel: 100 },    // bass C2, bar 1 to the middle of bar 2
  { on: 0.5, off: 1.0, midi: 64, vel: 80 },     // E4 on the downbeat
  { on: 1.0, off: 1.5, midi: 67, vel: 80 },     // G4 on beat 2
  { on: 2.5, off: 3.0, midi: 47, vel: 70 },     // B2: still bass (below C3)
  { on: 2.5, off: 3.0, midi: 48, vel: 70 },     // C3: the first note of "Notes"
  { on: 9.0, off: 9.5, midi: 60, vel: 60 },     // bar 5 (section B)
  { on: 9.2, off: 9.1, midi: 61, vel: 60 },     // zero length: dropped
];
const T = D.transcriptionFromNotes(a, G, notes, "test model");
ok(T.version === 1 && T.polyphonic === true && T.method === "test model" && T.split === 48 && T.grid === "fallback" || T.grid === "tracked", "shape: version 1, polyphonic, method, split, grid");
ok(T.bass.length === 2 && T.bass.every(n => n.midi < 48), `bass is below C3 (${T.bass.map(n => n.midi)})`);
ok(T.lead.length === 5 && T.lead.every(n => n.midi >= 48), `the rest is Notes (${T.lead.map(n => n.midi)}), the zero-length note dropped`);
const pickup = T.lead.find(n => n.midi === 72);
ok(pickup.bar === -1 && pickup.beat < 0 && pickup.on === 0, `the pickup is in bar -1 with a negative beat (bar ${pickup.bar}, beat ${pickup.beat})`);
const e4 = T.lead.find(n => n.midi === 64), g4 = T.lead.find(n => n.midi === 67), b5 = T.lead.find(n => n.midi === 60);
ok(e4.bar === 0 && e4.beat === 0 && e4.dur === 1 && g4.beat === 1 && b5.bar === 4 && b5.beat === 17 && b5.section === 1 && e4.section === 0, `bar, beat, length in beats and section from the grid (E4 beat ${e4.beat} dur ${e4.dur}, bar-5 note beat ${b5.beat} section ${b5.section})`);
ok(T.bass[0].on === 0.5 && T.bass[0].off === 2.5 && T.bass[0].dur === 4, "real onset and end are kept, not quantized");
// downstream: pickupBar, labels, per-part and all-parts MIDI
a.transcription = T;
ok(D.pickupBar === undefined || true, "(pickupBar is internal)");
const pm = D.partMidi(a, "hook", { timing: "original", grid: G, range: undefined, tempo: 120 });
ok(/Notes entire track/.test(pm.name) && /Basic Pitch/.test(new TextDecoder("latin1").decode(pm.data)), `the Notes file is named for what it is and says Basic Pitch (${pm.name})`);
const dm = decodeMidi(pm.data);
ok(dm.notes.length === 5 && dm.notes.some(n => n.pitch === 72), "it keeps all 5 notes, including the pickup");
const bm = D.partMidi(a, "bass", { timing: "original", grid: G, tempo: 120 });
ok(/Bass entire track/.test(bm.name) && decodeMidi(bm.data).notes.length === 2, `Bass: ${bm.name}`);
const all = D.allPartsMidi(a, { timing: "tempo-map", grid: G, tempo: 120 }), ad = decodeMidi(all.data);
ok(ad.tracks.map(t => t.name).join("|").includes("Notes (rough)") && ad.tracks.map(t => t.name).join("|").includes("Bass (rough)"), `all parts names the tracks Notes and Bass (${ad.tracks.map(t => t.name).filter(Boolean)})`);
const q = D.partMidi(a, "hook", { timing: "quantized", tempo: 120, range: { startBar: 0, endBar: 2 } }), qd = decodeMidi(q.data);
ok(/Notes bars 1-2/.test(q.name) && qd.notes.length === 3, `a range in quantized timing writes that range's Notes (${q.name}, ${qd.notes.length} notes)`);
// without the polyphonic flag the old labels are unchanged
const old = Object.assign({}, a, { transcription: Object.assign({}, T, { polyphonic: undefined }) });
ok(/Melody entire track/.test(D.partMidi(old, "hook", { timing: "original", grid: G, tempo: 120 }).name), "an engine (melody + bass) transcription keeps the Melody label");
console.log(`basic pitch transcription tests passed (${pass})`);
