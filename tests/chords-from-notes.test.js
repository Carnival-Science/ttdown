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
// lowest note is F#3, so nothing sounds below C3. Pinned: the CHORD SEQUENCE main (92de5bc, no guard) read, per tempo. The region TIMES were pinned
// too (sha256), until chord boundaries were re-placed (docs/SYMBOLIC_CHORDS.md, "Chord boundaries"): the old reading put every F#m at beat 3
// (or 4), half a beat to a beat before the 2.5 beats where the fixture changes it; every F#m region now starts at 2.5 beats, within 10 ms.
const WITHOUT_GUARD = { "120": "0:A 0:F#m 1:A 1:F#m 2:A 2:F#m 3:A 3:F#m", "100": "0:A 0:F#m 1:A 1:F#m 2:A 3:F#m", "140": "0:A 1:F#m 2:A 2:F#m 3:A 3:F#m" };
for (const bpm of [120, 100, 140]) for (const bA of [45, 33]) {
  const { a, G, bar } = song(bpm, 0, 4), notes = [];
  for (let b = 0; b < 4; b++) { const t0 = b * bar, tc = t0 + 2.5 * bar / 4; [bA, 57, 61, 64].forEach(m => notes.push({ on: t0, off: tc, midi: m })); [54, 57, 61, 66].forEach(m => notes.push({ on: tc, off: t0 + bar, midi: m })); }
  const r = D.chordRegionsFromNotes(a, G, notes), seq = r.regions.filter(x => x.c !== "–").map(x => `${x.bar}:${x.c}`).join(" ");
  if (bpm === 120) check(seq === "0:A 0:F#m 1:A 1:F#m 2:A 2:F#m 3:A 3:F#m", `10: bass ${bA} then F#3 (above C3) inside every bar at 120 BPM: both chords in each bar: ${said(r).join(" | ")}`);
  check(seq === WITHOUT_GUARD[bpm], `10: bass ${bA} then F#3 inside every bar at ${bpm} BPM reads the same chords as without the guard: ${seq}`);
  const late = r.regions.filter(x => x.c === "F#m").map(x => x.t0 - x.bar * bar - 2.5 * bar / 4); check(late.length > 0 && late.every(d => Math.abs(d) < 0.01), `10: bass ${bA} at ${bpm} BPM: every F#m starts at 2.5 beats, where the fixture changes it (offsets ${late.map(d => d.toFixed(3)).join(", ")} s)`);
}
// 11: a change that is STRUCK on the "and" of beat 4 starts there, not an 8th earlier (the one-beat window used to let the next chord's
// notes vote before they sounded). Eb under a held Eb voicing, F struck at 3.5 beats (bass F2 plus F A C), a lone D5 melody note in beat 4 that
// belongs to neither chord; every bar, at 120 BPM (8th = 0.25 s) and at 105 BPM with bar 1 off the origin (8th = 0.2857 s).
for (const [bpm, off] of [[120, 0], [105, 0.571]]) {
  const bar = 240 / bpm, q = bar / 8, beats = [], downs = [], N = 6; for (let i = 0; i < N * 4; i++) beats.push(off + i * bar / 4); for (let b = 0; b < N; b++) downs.push(off + b * bar);
  const a = { duration: off + N * bar, bpm, barSec: bar, nBars: N, firstDown: off, key: "C major", grid: { beats, downbeats: downs } }, G = TM.forAnalysis(a), notes = [];
  for (let b = 0; b < N; b += 2) { const t = off + b * bar;
    [39, 51, 55, 58].forEach(m => notes.push({ on: t, off: t + 7 * q, midi: m }));   // Eb, held to the "and" of 4
    [41, 53, 57, 60, 65].forEach(m => notes.push({ on: t + 7 * q + 0.01, off: t + bar + 7 * q - 0.05, midi: m }));   // F, struck at 4&, held to the next 4&
    notes.push({ on: t + 6 * q, off: t + 7 * q, midi: 74 }); }   // D5 in beat 4, a tone of neither chord
  const r = D.chordRegionsFromNotes(a, G, notes), f = r.regions.filter(x => x.c === "F").map(x => x.t0 - (off + 7 * q));
  check(f.length >= 1 && f.every(d => Math.abs(d - Math.round(d / (2 * bar)) * 2 * bar) < 0.03), `11: F starts where it is struck, on the 4& (${bpm} BPM: offsets ${f.map(x => x.toFixed(3)).join(", ")} s from 4&)`);
}
// 12: a change is re-placed ONCE, by at most one 8th (PR #69 review: the refinement loop met a boundary it had just moved forward and moved it
// again, so a change could land two 8ths from where the decoding put it). 300 pseudo-random fixtures (held and arpeggiated chords of 1-6 8ths,
// some with a silent 8th between, a stray melody note): wherever the chord sequence is the same with and without the re-placement
// (opts.refine = false), no boundary differs by more than one 8th. Before the fix, 3 of ~2400 boundaries moved two 8ths.
{ let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const CH = [[45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 58, 62], [38, 57, 62, 65], [39, 55, 58, 63], [48, 60, 64, 67], [43, 59, 62, 67]];
  let bounds = 0, over = 0, compared = 0;
  for (let it = 0; it < 300; it++) { const { a, G } = mk(), q = BAR / 8, N = NB, notes = []; let t = 0;
    while (t < 6 * 8) { const len = 1 + Math.floor(rnd() * 6), gap = rnd() < 0.3 ? 1 : 0, c = CH[Math.floor(rnd() * CH.length)], on = t * q, off = Math.min(6 * 8, t + len - gap) * q - 0.02, arp = rnd() < 0.4;
      c.forEach((m, i) => notes.push(arp ? { on: on + i * q * 0.5, off, midi: m } : { on, off, midi: m })); if (rnd() < 0.5) notes.push({ on: on + q * Math.floor(rnd() * len), off: on + q * (1 + Math.floor(rnd() * len)), midi: 60 + Math.floor(rnd() * 14) }); t += len; }
    const A = D.chordRegionsFromNotes(a, G, notes, { refine: false }), B = D.chordRegionsFromNotes(a, G, notes); if (!A || !B || A.regions.map(r => r.c).join() !== B.regions.map(r => r.c).join()) continue;
    compared++; for (let i = 1; i < B.regions.length; i++) { bounds++; if (Math.abs(B.regions[i].t0 - A.regions[i].t0) > q + 1e-6) over++; } }
  check(compared > 100 && bounds > 500 && over === 0, `12: no change moves more than one 8th from where the decoding put it (${over} of ${bounds} boundaries in ${compared} fixtures)`); }
// 13: diminished, diminished seventh and augmented chords can be read and named (docs/SYMBOLIC_CHORDS.md, "Chord vocabulary"). The regression is
// the more please bar 2: F#dim7 resolving into Gm, which a major/minor-only reader had to call F#m or Gm.
{ const parse = D.chordParse; check(parse("F#dim7").root === 6 && parse("F#dim7").intervals.join() === "0,3,6,9" && parse("Bdim").intervals.join() === "0,3,6" && parse("Caug").intervals.join() === "0,4,8" && parse("Dm").intervals.join() === "0,3,7" && parse("A#").intervals.join() === "0,4,7", "13: chordParse reads \"\", m, dim, dim7 and aug names");
  check(parse("H").root === -1 && parse("Gm7").root === -1 && parse("Dmaj").root === -1 && parse("").root === -1 && parse(null).root === -1, "13: a name that is none of those gives root -1 (and no notes), not a guess");
  check(D.chordFromName("F#dim7").notes.join() === "54,57,60,63" && D.chordFromName("Dm").notes.join() === "50,53,57" && D.chordFromName("Caug").notes.join() === "48,52,56", "13: chordFromName writes four notes for a dim7 and three otherwise");
  check(D.chordNotes("F#dim7") === "F# · A · C · D#" && D.chordNotes("Bdim") === "B · D · F" && D.chordNotes("Dm") === "D · F · A", "13: chordNotes spells them");
  const hold = (notes, on, off, ms) => ms.forEach(m => notes.push({ on, off, midi: m })), at = (r, n) => r.regions.filter(x => x.c !== "–").map(x => `${x.bar}.${x.beat} ${x.c}`).join(" | ");
  { const { a, G } = mk(), notes = []; for (let b = 0; b < 4; b += 2) { const t = b * BAR;
      hold(notes, t, t + 0.95, [43, 55, 58, 62]); hold(notes, t + 1, t + BAR - 0.02, [42, 57, 60, 63]);   // Gm for two beats, F#dim7 for beats 3 and 4
      hold(notes, t + BAR, t + 2 * BAR - 0.02, [43, 55, 58, 62]); }                                       // then Gm for the next bar
    const r = D.chordRegionsFromNotes(a, G, notes), reg = r.regions.filter(x => x.c !== "–");
    check(reg.map(x => x.c).join(" ") === "Gm F#dim7 Gm F#dim7 Gm", `13: Gm, F#dim7 for beats 3-4, Gm again (${at(r)})`);
    check(reg.filter(x => x.c === "F#dim7").every(x => x.beat === 2), `13: the F#dim7 starts on beat 3 (${at(r)})`); }
  { const { a, G } = mk(), notes = []; hold(notes, 0, BAR - 0.05, [47, 59, 62, 65]); hold(notes, BAR, 2 * BAR - 0.05, [48, 60, 64, 68]);
    const r = D.chordRegionsFromNotes(a, G, notes), reg = r.regions.filter(x => x.c !== "–"); check(reg.map(x => x.c).join(" ") === "Bdim Caug", `13: a diminished triad and an augmented triad are named (${at(r)})`); }
  { const { a, G } = mk(), notes = []; ["C", "G", "Am", "F"].forEach((c, b) => P[c].forEach(m => notes.push({ on: b * BAR, off: b * BAR + BAR - 0.05, midi: m })));
    check(D.chordRegionsFromNotes(a, G, notes).regions.filter(x => x.c !== "–").map(x => x.c).join(" ") === "C G Am F", "13: an ordinary C G Am F stays major and minor (no diminished or augmented chord appears)"); }
  { const { a, G } = mk(), notes = [];   // a minor chord with a passing note that would make a dim7 out of three of its notes must stay minor
    hold(notes, 0, 2 * BAR - 0.05, [43, 55, 58, 62]); hold(notes, 0.5, 0.75, [66]);
    check(D.chordRegionsFromNotes(a, G, notes).regions.filter(x => x.c !== "–").map(x => x.c).join(" ") === "Gm", "13: Gm with a passing F# (a tone of F#dim7) stays Gm"); }
}
// 13: no chord tone is inferred (PR #70 review). Three sustained notes C3 F#3 A3 are F#dim over C, not Cdim7 with an E-flat nobody played; the
// diminished seventh is read when all four tones are there; its four notes reach the chord roll's MIDI.
{ const { a, G } = mk(), run = ms => { const notes = ms.map(m => ({ on: 0, off: 3.9, midi: m })); return D.chordRegionsFromNotes(a, G, notes).regions.filter(x => x.c !== "–").map(x => x.c).join(" "); };
  check(run([48, 54, 57]) === "F#dim" && run([54, 57, 60]) === "F#dim", `13: C3 F#3 A3 (and F#3 A3 C4) is F#dim, not a dim7 with a tone nobody played (${run([48, 54, 57])})`);
  check(run([48, 51, 54, 57]) === "Cdim7" && run([42, 57, 60, 63]) === "F#dim7", `13: all four tones played: a diminished seventh (${run([48, 51, 54, 57])}, ${run([42, 57, 60, 63])})`);
  check(run([48, 51, 54]) === "Cdim" && run([48, 52, 56]) === "Caug" && !/dim7/.test(run([48, 54])) && !/dim|aug/.test(run([48, 55])), `13: a diminished or augmented chord needs all its tones: Cdim, Caug from three, no dim from two (${run([48, 51, 54])}, ${run([48, 52, 56])}, ${run([48, 54])}, ${run([48, 55])})`);
  // the chord roll's MIDI: Gm, F#dim7 (beats 3-4), Gm; the F#dim7 region writes four notes
  const { decodeMidi } = require("./lib/smf"), TMg = TM.forAnalysis(a), notes = []; const hold = (on, off, ms) => ms.forEach(m => notes.push({ on, off, midi: m }));
  hold(0, 0.95, [43, 55, 58, 62]); hold(1, BAR - 0.02, [42, 57, 60, 63]); hold(BAR, 2 * BAR - 0.02, [43, 55, 58, 62]);
  a.chordRegions = D.chordRegionsFromNotes(a, TMg, notes); a.chords = { bars: ["Gm", "Gm"] };
  const m = D.partMidi(a, "chords", { timing: "original", grid: TMg }), d = m && decodeMidi(m.data), at = t => (d ? d.notes.filter(n => Math.abs(n.onTick / 480 * (60 / (d.tempos[0] ? d.tempos[0].bpm : 120)) - t) < 0.05).map(n => n.pitch).sort((x, y) => x - y).join() : "");
  check(!!d && at(1) === "54,57,60,63" && at(0) === "55,58,62", `13: the roll's chord MIDI writes the four notes of the F#dim7 (${d ? at(1) : "no file"}) and three for the Gm (${d ? at(0) : ""})`); }
console.log(`chords-from-notes tests: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
