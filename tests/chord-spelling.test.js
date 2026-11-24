"use strict";
/* Chord spelling follows the key (docs/SYMBOLIC_CHORDS.md, "Spelling"): the stored names stay sharps, what is shown is E♭ and B♭ in G minor.
   The motivating case is more please (G minor): D# and A# read as E♭ and B♭, the F#dim7 into Gm keeps its F#, and its seventh is E♭, not D#. */
const TM = require("../src/timemap"), TS = require("../src/timing-store"), eng = require("../src/engine")({ TimeMap: TM }), D = require("../src/domain")({ TimingStore: TS, engine: eng });
let pass = 0, fail = 0; const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL: " + msg); } };
const sp = (c, k) => D.spellChord(c, k), nt = (c, k) => D.chordNotes(c, k);

// 1. G minor, the piece this came from
check(sp("D#", "G minor") === "E♭" && sp("A#", "G minor") === "B♭" && sp("Gm", "G minor") === "Gm" && sp("F", "G minor") === "F" && sp("A#m", "G minor") === "B♭m", `1: D#, A#, A#m read E♭, B♭, B♭m in G minor (${sp("D#", "G minor")}, ${sp("A#", "G minor")}, ${sp("A#m", "G minor")})`);
check(sp("F#dim7", "G minor") === "F#dim7" && nt("F#dim7", "G minor") === "F# · A · C · E♭", `1: the F#dim7 into Gm keeps its F# (the leading tone) and its seventh is E♭ (${sp("F#dim7", "G minor")}: ${nt("F#dim7", "G minor")})`);
check(nt("A#", "G minor") === "B♭ · D · F" && nt("D#", "G minor") === "E♭ · G · B♭" && nt("Gm", "G minor") === "G · B♭ · D", "1: the notes of B♭, E♭ and Gm are spelled in letters (B♭ D F, E♭ G B♭, G B♭ D)");

// 2. other keys: sharp keys keep sharps, flat keys use flats, the neutral keys keep the stored sharps
check(sp("A#", "F major") === "B♭" && sp("D#", "C minor") === "E♭" && sp("G#", "C minor") === "A♭" && sp("A#m", "A# minor") === "B♭m", "2: flat keys: F major B♭, C minor E♭ and A♭, A# minor is B♭ minor");
check(sp("F#m", "A major") === "F#m" && sp("G#m", "E major") === "G#m" && sp("D#m", "F# major") === "D#m" && sp("A#m", "A major") === "A#m" && sp("A#", "C major") === "B♭", "2: sharp keys keep sharps where the chord can be written with them (A major F#m and A#m, E major G#m, F# major D#m); a chord that would need double sharps is not (A# in C major is B♭)");
check(nt("F#m", "A major") === "F# · A · C#" && nt("D#m", "F# major") === "D# · F# · A#", "2: and their notes (F# A C#, D# F# A#)");

// 3. no double accidentals: a chord whose key spelling would need them is respelled from its enharmonic root
check(sp("A#", "A minor") === "B♭" && nt("A#", "A minor") === "B♭ · D · F" && sp("D#aug", "C major") === "E♭aug" && nt("D#aug", "C major") === "E♭ · G · B", `3: A# in A minor is B♭ (not A# C## E#), D#aug in C major is E♭aug (${nt("A#", "A minor")}; ${nt("D#aug", "C major")})`);
const all = []; for (const k of ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]) for (const m of ["major", "minor"]) for (let r = 0; r < 12; r++) for (const q of ["", "m", "dim", "dim7", "aug"]) all.push([D.NAMES ? D.NAMES[r] : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][r] + q, k + " " + m]);
check(nt("Cdim7", "C major") === "C · E♭ · G♭ · A" && nt("Baug", "C major") === "B · D# · G", "3: a double accidental no root avoids is written as its plain neighbour (Cdim7 is C E♭ G♭ A, Baug is B D# G)");
check(all.every(([c, k]) => !/##|♭♭/.test(nt(c, k) + sp(c, k))), `3: no chord in any of the 24 keys is written with a double sharp or flat (${all.length} chord/key pairs)`);
check(all.every(([c, k]) => { const n = nt(c, k).split(" · "), p = D.chordParse(c); const L = x => "CDEFGAB".indexOf(x[0]); return new Set(n.map(L)).size === n.length && L(sp(c, k)) === L(n[0]); }), "3: and every chord's notes use a different letter each, starting with the root's letter");

// 4. stored data is untouched; no key or an unknown name falls back to the stored spelling
check(nt("F#dim7") === "F# · A · C · D#" && nt("A#") === "A# · D · F" && sp("A#", undefined) === "A#" && sp("A#", "nonsense") === "A#" && sp("–", "G minor") === "–" && sp("Gm7", "G minor") === "Gm7" && nt("Gm7", "G minor") === "", "4: without a key the notes keep the stored sharps; an unknown key or name comes back unchanged");
check(D.chordParse("A#").root === 10 && D.chordParse("A#m").intervals.join() === "0,3,7" && D.chordFromName("D#").notes.join() === "51,55,58", "4: chordParse and chordFromName still read the stored sharp names");

// 5. what is copied and saved follows it
{ const grid = { barStart: b => 2 * b }, a = { key: "G minor", duration: 8, chords: { bars: ["A#", "D#", "Gm", "F"] }, chordRegions: { regions: [
    { t0: 0, t1: 2, bar: 0, beat: 0, endBar: 1, endBeat: 0, c: "A#" }, { t0: 2, t1: 4, bar: 1, beat: 0, endBar: 2, endBeat: 0, c: "D#" }, { t0: 4, t1: 5, bar: 2, beat: 0, endBar: 2, endBeat: 2, c: "F#dim7" }, { t0: 5, t1: 8, bar: 2, beat: 2, endBar: 4, endBeat: 0, c: "Gm" }] } };
  check(D.chordNamesText(a, { startBar: 0, bars: 3 }) === "B♭ | E♭ | F#dim7 Gm", `5: the copied chord names are spelled (${D.chordNamesText(a, { startBar: 0, bars: 3 })})`);
  check(D.chordTimingText(a, { startBar: 0, bars: 3 }, grid) === ["Bar 1 beat 1 · 0:00.000 · B♭", "Bar 2 beat 1 · 0:02.000 · E♭", "Bar 3 beat 1 · 0:04.000 · F#dim7", "Bar 3 beat 3 · 0:05.000 · Gm"].join("\n"), "5: and so are the chords with times");
  const csv = D.chordTimingCsv(a, { startBar: 0, bars: 3 }, grid).split("\n"); check(csv[1] === "1,1,0.000,2.000,B♭,B♭ D F" && csv[3] === "3,1,4.000,5.000,F#dim7,F# A C E♭", `5: and the .csv (${csv[1]} / ${csv[3]})`);
  const b = { ...a, key: "A major" }; const c = { ...a, key: "A major", chordRegions: { regions: a.chordRegions.regions.map(r => ({ ...r, c: r.c === "A#" ? "A#m" : r.c === "D#" ? "D#m" : r.c })) } };
  check(D.chordNamesText(c, { startBar: 0, bars: 2 }) === "A#m | D#m", "5: in a sharp key the stored sharp names that can be written with sharps are shown as they are"); }

console.log(`chord spelling tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
