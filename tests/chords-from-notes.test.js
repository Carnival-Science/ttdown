/* Chords read from notes (domain.chordRegionsFromNotes), the default chord source once Basic Pitch's notes are there (docs/SYMBOLIC_CHORDS.md).
 *   1. a four-chord progression (C G Am F, one per bar, held voicings) is read as those chords on the bar lines
 *   2. an arpeggio (one note at a time, bass note first) is read as the chord it outlines, not one chord per note
 *   3. a chord change inside a bar (beat 3) starts there, not on the bar line
 *   4. silence is "no chord" ("–"); nothing to read (no notes, or an untracked grid) gives null so the audio detector's chords stay
 *   5. chordSpans (what the roll, readout and chord MIDI use) follows the regions, and a corrected bar still wins
 *   6. a pedal bass (an A1 808 on the key root under A F#m D E, as in test-songs/pop127_Amaj.wav) is not taken as every chord's root:
 *      F#m is read from its bar line at several tempos and bar-1 offsets (before the pedal guard it was read as A, or a beat late)
 *   7. Basic Pitch's own notes for the first 8 bars of pop127_Amaj (tests/fixtures/pop127-basic-pitch-notes.json): every chord bar starts
 *      on its bar line with its chord, F#m in bars 2 and 6 (before the guard they were A)
 *   8. a moving bass is read exactly as before the pedal guard (the regions match those of the reader at c41a590, byte for byte)
 *   9. a chord change inside the bar with the bass moving too (A for 2.5 beats over A, F#m for 1.5 beats over F#, every bar, at 120 BPM) is
 *      not a pedal: both chords are read in every bar, as without the guard (PR #59 review; the first guard read F#m from bar 1 on)
 *  10. the same change with the bass moving up across C3 (A2 or A1 under A, then F#3 lowest under F#m, no note below C3): no bass reading
 *      is not evidence of a held bass, so it is not a pedal; at 120 BPM both chords are read in every bar, and at 100, 120 and 140 BPM the
 *      regions are exactly those without the guard (main at 92de5bc). Before the heard-in-every-beat test the guard read F#m from 1 s on.
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
// 6-8: pop127_Amaj's progression on the app's tracked grid at a given tempo and bar-1 time (8 bars of 4/4, beats from bar 1 on)
const crypto = require("node:crypto");
const song = (bpm, fd, nb = 8) => { const bar = 240 / bpm, beats = [], downs = []; for (let i = 0; i < nb * 4 + 4; i++) { const t = fd + i * bar / 4; if (t >= 0) beats.push(+t.toFixed(6)); }
  for (let b = 0; b <= nb; b++) downs.push(+(fd + b * bar).toFixed(6));
  const a = { duration: +(fd + nb * bar + 0.2).toFixed(3), bpm, barSec: bar, nBars: nb, firstDown: fd, key: "A major", grid: { beats, downbeats: downs } }; return { a, G: TM.forAnalysis(a), bar }; };
const AFDE = [[57, 61, 64], [54, 57, 61], [50, 54, 57], [52, 56, 59]], said = r => r.regions.filter(x => x.c !== "–" && x.bar >= 0).map(x => `${x.bar}.${x.beat} ${x.c}`);
const VARIANTS = [[127, 0], [127, 0.5], [127, 0.25], [120, 0], [100, 0]];
for (const [bpm, fd] of VARIANTS) {
  const { a, G, bar } = song(bpm, fd), step = bar / 16, notes = [];
  for (let b = 0; b < 8; b++) { const t0 = fd + b * bar; AFDE[b % 4].forEach(m => notes.push({ on: t0, off: t0 + bar, midi: m }));
    for (const s of [0, 10]) notes.push({ on: t0 + s * step, off: t0 + (s + 6) * step, midi: 33 }); } // the generator's 808: A1 on the kicks (16ths 0 and 10), 6 16ths long
  const r = D.chordRegionsFromNotes(a, G, notes), s = said(r);
  check(s.includes("1.0 F#m") && s.includes("5.0 F#m") && s.includes("2.0 D") && s.includes("6.0 D") && !s.some(x => /^[15]\.\d+ A$/.test(x)),
    `6: over an A1 pedal, bars 2 and 6 are F#m from their bar lines (${bpm} BPM, bar 1 at ${fd} s): ${s.join(" | ")}`);
}
{ const fx = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "fixtures", "pop127-basic-pitch-notes.json"), "utf8")), { a, G } = song(127, 0);
  const s = said(D.chordRegionsFromNotes(a, G, fx.notes));
  const starts = ["0.0 A", "1.0 F#m", "2.0 D", "3.0 E", "5.0 F#m", "6.0 D", "7.0 E"]; // bar 5's A may start before its bar line (the E bar's last 8ths), as it does without the guard
  check(fx.notes.length === 122 && starts.every(x => s.includes(x)) && !s.some(x => /^[15]\.\d+ A$/.test(x)), `7: Basic Pitch's notes of pop127_Amaj: each chord on its bar line, F#m in bars 2 and 6: ${s.join(" | ")}`); }
// 8: the same progression over a moving bass (the root for 3 beats, then the fifth): sha256 of the regions as the reader at c41a590 gave them
const BEFORE = { "127/0": "7f43b6dfcb5d6da6", "127/0.5": "2e1d72c192351955", "127/0.25": "87f546b9010ea6c3", "120/0": "e6978733a48dcd15", "100/0": "f4c34e43a15a72af" };
for (const [bpm, fd] of VARIANTS) {
  const { a, G, bar } = song(bpm, fd), notes = [];
  for (let b = 0; b < 8; b++) { const t0 = fd + b * bar; AFDE[b % 4].forEach(m => notes.push({ on: t0, off: t0 + bar, midi: m }));
    notes.push({ on: t0, off: t0 + bar * 0.75, midi: AFDE[b % 4][0] - 24 }, { on: t0 + bar * 0.75, off: t0 + bar, midi: AFDE[b % 4][2] - 24 }); }
  const r = D.chordRegionsFromNotes(a, G, notes), h = crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex").slice(0, 16);
  const chords = r.regions.filter(x => x.c !== "–").map(x => x.c).join(" ");
  check(h === BEFORE[`${bpm}/${fd}`] && chords === "A F#m D E A F#m D E", `8: a moving bass reads exactly as before the pedal guard (${bpm} BPM, bar 1 at ${fd} s; ${h}): ${chords}`);
}
// 9: an intra-bar change with the bass moving with it is not a pedal (PR #59 review). The bass is lowest on A for 5 of each bar's 8ths and
// on F# for 3, so "the most frequent lowest note" alone took it for an A pedal and read F#m from 1 s to the end.
for (const [bA, bF] of [[45, 42], [33, 30]]) {
  const { a, G } = song(120, 0, 4), notes = [];
  for (let b = 0; b < 4; b++) { const t0 = b * 2, tc = t0 + 1.25; [57, 61, 64, bA].forEach(m => notes.push({ on: t0, off: tc, midi: m })); [54, 57, 61, bF].forEach(m => notes.push({ on: tc, off: t0 + 2, midi: m })); }
  const r = D.chordRegionsFromNotes(a, G, notes), seq = r.regions.filter(x => x.c !== "–").map(x => `${x.bar}:${x.c}`).join(" ");
  check(seq === "0:A 0:F#m 1:A 1:F#m 2:A 2:F#m 3:A 3:F#m", `9: A then F#m inside every bar, bass ${bA} -> ${bF}, both chords read in each bar: ${said(r).join(" | ")}`);
}
// 10: the bass moves up across C3 inside the bar (PR #59 review, C3 crossing). Each bar: A2 (or A1) with A major for 2.5 beats, then F#m whose
// lowest note is F#3, so nothing sounds below C3. Pinned: sha256 of the regions from main (92de5bc), which has no guard.
const WITHOUT_GUARD = { "120": "373f3c1348859f63", "100": "9699c63909cc0f80", "140": "e235b68f3c233690" };
for (const bpm of [120, 100, 140]) for (const bA of [45, 33]) {
  const { a, G, bar } = song(bpm, 0, 4), notes = [];
  for (let b = 0; b < 4; b++) { const t0 = b * bar, tc = t0 + 2.5 * bar / 4; [bA, 57, 61, 64].forEach(m => notes.push({ on: t0, off: tc, midi: m })); [54, 57, 61, 66].forEach(m => notes.push({ on: tc, off: t0 + bar, midi: m })); }
  const r = D.chordRegionsFromNotes(a, G, notes), h = crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex").slice(0, 16), seq = r.regions.filter(x => x.c !== "–").map(x => `${x.bar}:${x.c}`).join(" ");
  if (bpm === 120) check(seq === "0:A 0:F#m 1:A 1:F#m 2:A 2:F#m 3:A 3:F#m", `10: bass ${bA} then F#3 (above C3) inside every bar at 120 BPM: both chords in each bar: ${said(r).join(" | ")}`);
  check(h === WITHOUT_GUARD[bpm], `10: bass ${bA} then F#3 inside every bar at ${bpm} BPM reads exactly as without the guard (${h}): ${seq}`);
}
console.log(`chords-from-notes tests: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
