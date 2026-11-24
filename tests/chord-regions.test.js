#!/usr/bin/env node
/* Chord regions (docs/CHORDS.md): a chord where the harmony changes, not one per bar.
 *   1. engine: a synthetic track whose chord changes on beat 3 of every other bar gets regions that start there (not on the bar line),
 *      with the right chords, while chords.bars still names one chord per bar
 *   2. domain chordSpans: regions when the analysis has them, one per bar when it doesn't (older saved teardowns); a corrected bar is the
 *      person's chord for the whole bar; the pickup bar is kept
 *   3. what is built on them: the chord names text, the quantized chords MIDI and the timed (seconds) chords both change mid-bar */
"use strict";
const { decodeMidi } = require("./lib/smf");
const TM = require("../src/timemap"), TS = require("../src/timing-store"), eng = require("../src/engine")({ TimeMap: TM }), D = require("../src/domain")({ TimingStore: TS, engine: eng });
let pass = 0, fail = 0; const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL: " + msg); } };

// ---- 1. engine, on a synthetic track: 120 BPM, kick/snare/hats, a bass on the chord root and sustained triads.
// bars alternate | C (beats 1-2) G (beats 3-4) | Am | F (beats 1-2) G (beats 3-4) | C |
function synth() {
  const SR = 44100, bpm = 120, beat = 60 / bpm, bars = 16, lead = 0.5, dur = lead + bars * 4 * beat + 1, n = Math.round(dur * SR), L = new Float32Array(n);
  const hz = m => 440 * Math.pow(2, (m - 69) / 12), add = (t0, t1, f, amp, dec) => { const i0 = Math.round(t0 * SR), i1 = Math.min(n, Math.round(t1 * SR)); for (let i = i0; i < i1; i++) { const t = (i - i0) / SR, env = Math.exp(-t * dec) * Math.min(1, t * 200) * Math.min(1, (i1 - i) / (SR * 0.01)); L[i] += amp * env * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t) + 0.2 * Math.sin(6 * Math.PI * f * t)); } };
  const noise = (t0, len, amp) => { const i0 = Math.round(t0 * SR); for (let i = 0; i < len * SR && i0 + i < n; i++) L[i0 + i] += amp * (Math.random() * 2 - 1) * Math.exp(-i / SR * 40); };
  const tri = { C: [60, 64, 67], G: [55, 59, 62], Am: [57, 60, 64], F: [53, 57, 60] }, root = { C: 36, G: 43, Am: 45, F: 41 };
  const plan = [[["C", 0, 2], ["G", 2, 4]], [["Am", 0, 4]], [["F", 0, 2], ["G", 2, 4]], [["C", 0, 4]]], truth = [];
  for (let b = 0; b < bars; b++) {
    const t = lead + b * 4 * beat;
    for (let k = 0; k < 4; k++) { const tb = t + k * beat; add(tb, tb + 0.25, 55, 0.5, 18); if (k % 2) noise(tb, 0.15, 0.25); }
    for (let k = 0; k < 8; k++) noise(t + k * beat / 2, 0.03, 0.06);
    for (const [c, b0, b1] of plan[b % 4]) { const t0 = t + b0 * beat, t1 = t + b1 * beat; tri[c].forEach(m => add(t0, t1, hz(m), 0.12, 0.6)); add(t0, t1, hz(root[c]), 0.3, 1.2); truth.push({ t0, t1, c }); }
  }
  return { ab: { sampleRate: SR, length: n, duration: dur, numberOfChannels: 1, getChannelData: () => L }, truth };
}
(async () => {
  const { ab, truth } = synth(), a = await eng.analyzeDecoded(ab, () => {}, false);
  const R = a.chordRegions && a.chordRegions.regions;
  check(a.chordRegions && a.chordRegions.method === "chords-v2" && Array.isArray(R) && R.length > 0, "1: the analysis has chord regions (chords-v2)");
  check(Array.isArray(a.chords.bars) && a.chords.bars.length === a.nBars, `1: chords.bars still names one chord per bar (${a.chords.bars.length} of ${a.nBars})`);
  const at = (L, t) => (L.find(r => t >= r.t0 && t < r.t1) || {}).c;
  let ok = 0, nn = 0; for (let t = truth[0].t0 + 0.05; t < truth[truth.length - 1].t1; t += 0.05) { nn++; if (at(R, t) === at(truth, t)) ok++; }
  let okBar = 0; const G = TM.forAnalysis(a), bars = a.chords.bars.map((c, b) => ({ t0: G.barStart(b), t1: G.barStart(b + 1), c }));
  for (let t = truth[0].t0 + 0.05; t < truth[truth.length - 1].t1; t += 0.05) if (at(bars, t) === at(truth, t)) okBar++;
  check(ok / nn >= 0.85, `1: the regions name the sounding chord ${(100 * ok / nn).toFixed(0)}% of the time (one chord per bar: ${(100 * okBar / nn).toFixed(0)}%)`);
  check(ok > okBar, "1: and more often than one chord per bar does");
  const mids = truth.filter(x => x.c === "G"), hit = mids.filter(x => R.some(r => r.c === "G" && Math.abs(r.t0 - x.t0) < 0.2)).length;
  check(hit >= mids.length * 0.75, `1: a G region starts on beat 3 where the G comes in (${hit} of ${mids.length})`);
  check(R.some(r => r.c === "G" && r.beat === 2), "1: and its bar.beat says beat 3 (beat index 2), not the bar line");
  check(R.every((r, i) => r.t1 > r.t0 && (i === 0 || Math.abs(r.t0 - R[i - 1].t1) < 1e-6) && r.endBar * 16 + r.endBeat * 4 > r.bar * 16 + r.beat * 4), "1: regions are contiguous, each with a real start and end");

  // ---- 2. domain chordSpans, on a small hand-made analysis (bar = 2 s, bar 1 at 0 s)
  const grid = { barStart: b => 2 * b };
  const base = () => ({ duration: 8, chords: { bars: ["C", "G", "Am", "F"] }, chordRegions: { method: "chords-v2", regions: [
    { t0: 0, t1: 1, bar: 0, beat: 0, endBar: 0, endBeat: 2, c: "C" }, { t0: 1, t1: 4, bar: 0, beat: 2, endBar: 2, endBeat: 0, c: "G" },
    { t0: 4, t1: 6, bar: 2, beat: 0, endBar: 3, endBeat: 0, c: "Am" }, { t0: 6, t1: 7.5, bar: 3, beat: 0, endBar: 3, endBeat: 3, c: "F" }, { t0: 7.5, t1: 8, bar: 3, beat: 3, endBar: 4, endBeat: 0, c: "–" }] } });
  let x = base(), sp = D.chordSpans(x, grid);
  check(JSON.stringify(sp.map(s => [s.c, s.s, s.e])) === JSON.stringify([["C", 0, 8], ["G", 8, 32], ["Am", 32, 48], ["F", 48, 60]]), `2: spans follow the regions, in 16th steps, without "no chord" (${JSON.stringify(sp.map(s => [s.c, s.s, s.e]))})`);
  delete x.chordRegions; sp = D.chordSpans(x, grid);
  check(sp.length === 4 && sp.every((s, b) => s.s === b * 16 && s.e === (b + 1) * 16 && s.t0 === 2 * b), "2: without regions (an older teardown) it is one chord per bar, timed by the grid");
  x = base(); D.recordCorrection(x, { type: "chord", bar: 1, from: "G", to: "Em" }); x.chords.bars[1] = "Em"; sp = D.chordSpans(x, grid);
  check(JSON.stringify(sp.map(s => [s.c, s.s, s.e, s.corrected])) === JSON.stringify([["C", 0, 8, false], ["G", 8, 16, false], ["Em", 16, 32, true], ["Am", 32, 48, false], ["F", 48, 60, false]]), "2: a corrected bar is the person's chord for the whole bar; the region it cut keeps the rest");
  check(sp[1].t1 === 2 && sp[2].t0 === 2 && sp[2].t1 === 4, "2: the cut is on that bar's line");
  x = base(); x.chordRegions.regions = [{ t0: 0.2, t1: 0.5, bar: -1, beat: 3, endBar: 0, endBeat: 0, c: "D" }, ...base().chordRegions.regions.map(r => ({ ...r, t0: r.t0 + 0.5, t1: r.t1 + 0.5 }))];
  sp = D.chordSpans(x, grid); check(sp[0].c === "D" && sp[0].s === -4 && sp[0].bar === -1, "2: a chord in the pickup bar is kept (negative steps)");

  // ---- 3. built on the spans
  x = base();
  check(D.chordNamesText(x, { startBar: 0, bars: 4 }) === "C G | G | Am | F", `3: the chord names text lists a bar's chords in order ("${D.chordNamesText(x, { startBar: 0, bars: 4 })}")`);
  // 3b. the same chords with their times (docs/SYMBOLIC_CHORDS.md; "Copy chords with times" and the .csv in the roll)
  { const T = D.chordTimingText(x, { startBar: 0, bars: 4 }, grid).split("\n"), want = ["Bar 1 beat 1 · 0:00.000 · C", "Bar 1 beat 3 · 0:01.000 · G", "Bar 3 beat 1 · 0:04.000 · Am", "Bar 4 beat 1 · 0:06.000 · F"];
    check(JSON.stringify(T) === JSON.stringify(want), `3b: each chord is listed with its bar, beat and time (${JSON.stringify(T)})`);
    const cut = D.chordTimingText(x, { startBar: 1, bars: 1 }, grid);
    check(cut === "Bar 2 beat 1 · 0:02.000 · G", `3b: a chord that began before the section starts at the section's first bar line, not at its own start ("${cut}")`);
    const csv = D.chordTimingCsv(x, { startBar: 0, bars: 4 }, grid).split("\n");
    check(csv[0] === "bar,beat,start_s,end_s,chord,notes" && csv[1] === "1,1,0.000,1.000,C,C E G" && csv[2] === "1,3,1.000,4.000,G,G B D" && csv[4] === "4,1,6.000,7.500,F,F A C" && csv[5] === "", `3b: the .csv has bar, beat, start and end seconds, the chord and its notes (${JSON.stringify(csv)})`);
    const y = base(); y.chordRegions.regions = [{ t0: 1.25, t1: 4, bar: 0, beat: 2.5, endBar: 2, endBeat: 0, c: "G" }];
    check(D.chordTimingText(y, { startBar: 0, bars: 2 }, grid) === "Bar 1 beat 3.5 · 0:01.250 · G", "3b: a chord on the 'and' of a beat says so (beat 3.5)");
    check(D.chordTimingText(x, { startBar: 9, bars: 2 }, grid) === "" && D.chordTimingCsv(x, { startBar: 9, bars: 2 }, grid) === "bar,beat,start_s,end_s,chord,notes\n", "3b: a section with no chords gives no rows (empty text; the csv has its header only)"); }
  // 3c. the times stay inside the audio (PR #71 review: nominal bar lines outside the recording gave end_s past the duration and a negative start_s)
  { const old = () => ({ duration: 8.1, chords: { bars: ["C", "G", "Am", "F"] } }), g = off => ({ barStart: b => off + 2 * b }), sec = { startBar: 0, bars: 4 };
    const inside = (a, gr) => D.chordTimingRows(a, sec, gr).every(r => r.t0 >= 0 && r.t1 <= a.duration && r.t1 > r.t0);
    const last = D.chordTimingRows(old(), sec, g(0.5)).pop();
    check(last.c === "F" && Math.abs(last.t1 - 8.1) < 1e-9, `3c: a final partial bar ends at the audio's end, 8.1 s, not at the nominal bar line 8.5 s (F ends ${last.t1})`);
    check(D.chordTimingCsv(old(), sec, g(0.5)).split("\n").filter(Boolean).slice(1).every(l => +l.split(",")[3] <= 8.1), "3c: and so does the .csv");
    const first = D.chordTimingRows(old(), sec, g(-0.25))[0];
    check(first.t0 === 0 && D.chordTimingCsv(old(), sec, g(-0.25)).split("\n")[1].split(",")[2] === "0.000" && D.chordTimingText(old(), sec, g(-0.25)).startsWith("Bar 1 beat 1 · 0:00.000"), `3c: a negative first downbeat starts at 0, in the rows, the .csv and the text alike (${first.t0})`);
    const gone = { duration: 6.2, chords: { bars: ["C", "G", "Am", "F"] } };
    check(D.chordTimingRows(gone, sec, g(0.5)).map(r => r.c).join() === "C,G,Am" && inside(gone, g(0.5)), "3c: a chord that starts after the audio ends is left out");
    const fixed = old(); D.recordCorrection(fixed, { type: "chord", bar: 3, from: "F", to: "Em" }); fixed.chords.bars[3] = "Em";
    check(inside(fixed, g(0.5)) && D.chordTimingRows(fixed, sec, g(0.5)).pop().c === "Em", "3c: a corrected last bar is cut at the audio's end too");
    const reg = { duration: 8.1, chords: { bars: ["C"] }, chordRegions: { regions: [{ t0: 7, t1: 8.5, bar: 3, beat: 2, endBar: 4, endBeat: 0, c: "C" }] } };
    check(inside(reg, g(0.5)), "3c: a chord region that runs past the end is cut at the audio's end"); }
  const m = D.partMidi(x, "chords", { section: { startBar: 0, bars: 2 }, tempo: 120 }), d = decodeMidi(m.data), on = [...new Set(d.notes.map(n => n.onTick / d.division))].sort((p, q) => p - q);
  check(JSON.stringify(on) === "[0,2]" && d.notes.length === 6, `3: the quantized chords MIDI changes chord on beat 3 of bar 1 (onsets at beats ${on}, ${d.notes.length} notes)`);
  check(d.notes.filter(n => n.onTick === 0).every(n => n.offTick <= 2 * d.division) && d.notes.filter(n => n.onTick > 0).some(n => n.offTick >= 7 * d.division), "3: C lasts two beats; G holds through bar 2, as the region does");
  Object.assign(x, { barSec: 2, nBars: 4, bpm: 120, sections: [], pattern: { kick: [], snare: [], hats: [] } });
  const one = D.allPartsMidi(x, { timing: "quantized", tempo: 120 }), od = decodeMidi(one.data), ch = od.notes.filter(n => od.tracks[n.track].name === "Chords (suggested)");
  check([...new Set(ch.map(n => n.onTick / od.division))].includes(2), "3: all parts (quantized) writes the same mid-bar change");
  // ---- 4. the three export paths that must agree with the regions (review of PR 41)
  // (a) "Whole track": no range and no section writes every chord, not just a selected section; the section path still cuts at its bars
  x = base(); Object.assign(x, { barSec: 2, nBars: 4, bpm: 120, sections: [], pattern: { kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], snare: new Array(16).fill(0), hats: new Array(16).fill(0) }, balance: new Array(8).fill(12), key: "C major", rhythm: {}, width: 0.5, title: "t" });
  { const all = decodeMidi(D.partMidi(x, "chords", { tempo: 120 }).data), sec = decodeMidi(D.partMidi(x, "chords", { section: { startBar: 1, bars: 1 }, tempo: 120 }).data);
    check(all.notes.length === 12 && Math.max(...all.notes.map(n => n.offTick)) >= 14.9 * all.division, `4a: Whole track chords hold all four bars (${all.notes.length} notes)`);
    check(sec.notes.length === 3 && Math.max(...sec.notes.map(n => n.offTick)) <= 4 * sec.division, `4a: a section range still writes just its own bars (${sec.notes.length} notes)`); }
  // (b) a chord that began before the exported bars and still sounds in them is kept (G starts in bar 1 and runs through bar 2)
  { const bar2 = decodeMidi(D.allPartsMidi(x, { timing: "quantized", tempo: 120, range: { startBar: 1, endBar: 2 } }).data), ch = bar2.notes.filter(n => bar2.tracks[n.track].name === "Chords (suggested)");
    check(ch.length === 3 && ch.every(n => n.onTick === 0 && n.offTick >= 3.9 * bar2.division), `4b: exporting bar 2 alone keeps the G that began in bar 1 (${ch.length} notes from tick 0, ${ch.length && ch[0].offTick / bar2.division} beats)`); }
  { const bar2 = D.partMidi(x, "chords", { range: { startBar: 1, endBar: 2 }, tempo: 120 }), d = decodeMidi(bar2.data);
    check(d.notes.length === 3 && d.notes.every(n => n.onTick === 0), "4b: the same for the chords-only file"); }
  // (c) the full-song package and the Check-by-ear notes (songNotes) use the same regions as the piano roll
  { const N = D.songNotes(x), on = [...new Set(N.chords.map(n => n.t))].sort((p, q) => p - q);
    check(JSON.stringify(on) === "[0,8,32,48]" && N.chords.filter(n => n.t === 8).every(n => n.dur === 24), `4c: songNotes has the chords where they change (16th steps ${on})`);
    const files = D.songMidiFiles(x, { tempo: 120 }), cf = files.find(f => /Chords/.test(f.name)), cd = decodeMidi(cf.data), cOn = [...new Set(cd.notes.map(n => n.onTick / (cd.division / 4)))].sort((p, q) => p - q);
    check(JSON.stringify(cOn) === "[0,8,32,48]", `4c: the full-song package's chords file changes chord at the same steps (${cOn})`); }
  console.log(`chord region tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
