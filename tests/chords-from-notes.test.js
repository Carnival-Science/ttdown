/* Chords read from notes (domain.chordRegionsFromNotes), the default chord source once Basic Pitch's notes are there (docs/SYMBOLIC_CHORDS.md).
 *   1. a four-chord progression (C G Am F, one per bar, held voicings) is read as those chords on the bar lines
 *   2. an arpeggio (one note at a time, bass note first) is read as the chord it outlines, not one chord per note
 *   3. a chord change inside a bar (beat 3) starts there, not on the bar line
 *   4. silence is "no chord" ("–"); nothing to read (no notes, or an untracked grid) gives null so the audio detector's chords stay
 *   5. chordSpans (what the roll, readout and chord MIDI use) follows the regions, and a corrected bar still wins
 * Synthetic notes only; the real-music numbers are in docs/SYMBOLIC_CHORDS.md. */
"use strict";
const TM = require("../src/timemap"), TS = require("../src/timing-store"), eng = require("../src/engine")({ TimeMap: TM }), D = require("../src/domain")({ TimingStore: TS, engine: eng });
let pass = 0, fail = 0; const check = (ok, msg) => { if (ok) pass++; else { fail++; console.error("FAIL: " + msg); } };
const BAR = 2, NB = 10, mk = (tracked = true) => { const beats = [], downs = []; for (let i = 0; i < NB * 4; i++) beats.push(i * BAR / 4); for (let b = 0; b < NB; b++) downs.push(b * BAR);
  const a = { duration: NB * BAR, bpm: 120, barSec: BAR, nBars: NB, firstDown: 0, key: "C major", grid: tracked ? { beats, downbeats: downs } : undefined }; return { a, G: TM.forAnalysis(a) }; };
const names = r => r.regions.map(x => `${x.bar}.${x.beat} ${x.c}`).join(" | ");
const P = { C: [48, 60, 64, 67], G: [43, 59, 62, 67], Am: [45, 60, 64, 69], F: [41, 60, 65, 69] };
{ const { a, G } = mk(), notes = []; ["C", "G", "Am", "F", "C", "G", "Am", "F"].forEach((c, b) => P[c].forEach(m => notes.push({ on: b * BAR, off: b * BAR + BAR - 0.05, midi: m })));
  const r = D.chordRegionsFromNotes(a, G, notes), reg = r.regions.filter(x => x.c !== "–");
  check(r.method === "chords-from-notes-v1" && reg.map(x => x.c).join(" ") === "C G Am F C G Am F" && reg.every((x, i) => x.bar === i && x.beat === 0), `1: C G Am F twice, on the bar lines (${names(r)})`); }
{ const { a, G } = mk(), notes = []; for (let b = 0; b < 4; b++) [48, 55, 60, 64, 60, 55, 60, 64].forEach((m, i) => notes.push({ on: b * BAR + i * BAR / 8, off: b * BAR + i * BAR / 8 + BAR / 8 * 1.6, midi: m }));
  const r = D.chordRegionsFromNotes(a, G, notes), reg = r.regions.filter(x => x.c !== "–"); check(reg.length === 1 && reg[0].c === "C" && reg[0].bar === 0, `2: an arpeggio is one chord (${names(r)})`); }
{ const { a, G } = mk(), notes = []; for (let b = 0; b < 4; b++) { const first = b % 2 ? "G" : "C", second = b % 2 ? "C" : "G"; P[first].forEach(m => notes.push({ on: b * BAR, off: b * BAR + BAR / 2 - 0.03, midi: m })); P[second].forEach(m => notes.push({ on: b * BAR + BAR / 2, off: b * BAR + BAR - 0.03, midi: m })); }
  const r = D.chordRegionsFromNotes(a, G, notes), reg = r.regions.filter(x => x.c !== "–"); check(reg.slice(0, 4).map(x => `${x.bar}.${x.beat} ${x.c}`).join(" | ") === "0.0 C | 0.2 G | 1.2 C | 2.2 G", `3: changes on beat 3 start there, and equal neighbours merge across the bar line (${names(r)})`); }
{ const { a, G } = mk(), notes = []; P.C.forEach(m => notes.push({ on: 0, off: BAR - 0.05, midi: m }));
  const r = D.chordRegionsFromNotes(a, G, notes), tail = r.regions[r.regions.length - 1]; check(tail.c === "–" && tail.endBar >= NB - 1, `4: after the last note it says no chord (${names(r)})`);
  check(D.chordRegionsFromNotes(a, G, []) === null && D.chordRegionsFromNotes(a, G, null) === null, "4: no notes: null");
  const u = mk(false); check(D.chordRegionsFromNotes(u.a, u.G, notes) === null, "4: an untracked grid: null (the audio detector's chords stay)"); }
{ const { a, G } = mk(), notes = []; ["C", "G", "Am", "F"].forEach((c, b) => P[c].forEach(m => notes.push({ on: b * BAR, off: b * BAR + BAR - 0.05, midi: m })));
  a.chordRegions = D.chordRegionsFromNotes(a, G, notes); a.chords = { bars: ["Dm", "Dm", "Dm", "Dm"] };
  const sp = D.chordSpans(a, G).filter(s => s.c !== "–"); check(sp.map(s => s.c).join(" ") === "C G Am F", `5: chord spans follow the regions, not the audio per-bar chords (${sp.map(s => s.c)})`);
  a.timingCorrections = [{ type: "chord", bar: 1, to: "Em" }]; const sc = D.chordSpans(a, G).filter(s => s.c !== "–"); check(sc.find(s => s.bar === 1).corrected === true, "5: a corrected bar is marked corrected"); }
console.log(`chords-from-notes tests: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
