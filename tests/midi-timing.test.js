/* MIDI in three timings (original, tempo map, quantized) and the all-parts Type 1 file, read back with the INDEPENDENT decoder in
 * tests/lib/smf.js. The claims checked are the ones the menu makes:
 *   original timing  - every note plays at its estimated audio time (within 1 ms) at the stated reference tempo, whatever the grid is
 *   tempo map        - every note plays at its audio time AND notes on tracked beats land on whole quarter notes (bar lines follow the song)
 *   quantized        - still governed by exportGate; the other two are not blocked by a refused grid
 *   all parts        - one Type 1 file: a tempo track then one named track per part, notes only in the part tracks
 */
"use strict";
const fs = require("node:fs"), path = require("node:path");
const { decodeMidi, tickToSec } = require("./lib/smf");
const TM = require("../src/timemap"), TS = require("../src/timing-store"), eng = require("../src/engine")({ TimeMap: TM }), D = require("../src/domain")({ TimingStore: TS, engine: eng });
const ROOT = path.resolve(__dirname, ".."), load = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
let pass = 0, fail = 0; const check = (ok, msg) => { if (ok) pass++; else { fail++; console.error("FAIL: " + msg); } };
const recs = [...load("bench/baselines/version-a/predictions.json").tracks, ...load("bench/baselines/version-a/time-fixtures/predictions.json").tracks].filter(r => r.status === "ok");
const byId = id => { const r = recs.find(x => x.id === id), a = JSON.parse(JSON.stringify(r.full)); a.grid = r.grid; return a; };
const MS = 0.001, melody = () => { const fx = load("tests/fixtures/melody_change_120.analysis.json"), a = JSON.parse(JSON.stringify(fx.full)); a.grid = fx.grid; return a; };

/* 1. a transcribed track (steady tempo): original timing and tempo map both reproduce the audio times */
{
  const a = melody(), g = TM.forAnalysis(a), modes = D.midiModes(a, g, false);
  check(modes.original.ok && modes.original.parts.hook && modes.original.parts.bass && modes.original.parts.chords, "original timing is offered for a transcribed track");
  check(g.tracked ? modes.tempoMap.ok : !modes.tempoMap.ok, "tempo map follows whether the beats were tracked");
  for (const part of ["hook", "bass"]) {
    const src = a.transcription[part === "hook" ? "lead" : "bass"], f = D.partMidi(a, part, { timing: "original", grid: g }), d = decodeMidi(f.data);
    check(d.format === 0 && d.division === 480 && d.unmatched.length === 0, `${part} original: valid single-track file`);
    check(d.tempos.length === 1 && Math.abs(d.tempos[0].bpm - modes.original.refTempo) < 1e-9, `${part} original: one tempo, the stated reference tempo`);
    check(d.notes.length === src.length, `${part} original: every transcribed note is written (${d.notes.length}/${src.length})`);
    const worst = Math.max(...d.notes.map((n, i) => Math.abs(tickToSec(d, n.onTick) - src.slice().sort((x, y) => x.on - y.on || x.midi - y.midi)[i].on)));
    check(worst <= MS, `${part} original: onsets within 1 ms of the audio estimate (worst ${(worst * 1000).toFixed(3)} ms)`);
    check(/original timing/.test(f.name) && /reference tempo/.test(d.tracks[0].text.map(t => t.text).join(" ")), `${part} original: name and text say original timing and the reference tempo`);
    if (modes.tempoMap.ok) {
      const tm = decodeMidi(D.partMidi(a, part, { timing: "tempo-map", grid: g }).data), t0 = g.barStart(Math.min(0, ...src.map(n => g.barOf(n.on))));
      const sorted = src.slice().sort((x, y) => x.on - y.on || x.midi - y.midi), w = Math.max(...tm.notes.map((n, i) => Math.abs(t0 + tickToSec(tm, n.onTick) - sorted[i].on)));
      check(tm.notes.length === src.length && w <= MS, `${part} tempo map: onsets within 1 ms of the audio (worst ${(w * 1000).toFixed(3)} ms)`);
    }
  }
  // a range: the file starts at that bar's time
  const r = { startBar: 4, endBar: 8 }, f = D.partMidi(a, "hook", { timing: "original", grid: g, range: r }), d = decodeMidi(f.data);
  const inR = a.transcription.lead.filter(n => n.bar >= 4 && n.bar < 8).sort((x, y) => x.on - y.on || x.midi - y.midi);
  check(d.notes.length === inR.length && Math.abs(tickToSec(d, d.notes[0].onTick) + g.barStart(4) - inR[0].on) <= MS, "original timing for bars 5-8 starts the file at bar 5's audio time");
  check(/bars 5-8/.test(f.name), "a range is named by its bars");
}

/* 2. a track whose tempo steps: quantized is refused, original timing and the tempo map still export, and the tempo map is exact */
for (const id of ["tempo_change_step", "drift_fast", "drift_slow"]) {
  const a = byId(id), g = TM.forAnalysis(a), map = g.map;
  // a synthetic transcription: one note on every tracked beat (bar numbers from the same grid), so the right answer is known exactly
  const beats = g.beats(0, a.duration, 0).filter(b => b.t >= 0 && b.bar >= 0).slice(0, 200);
  a.transcription = { version: 1, method: "test", grid: "tracked", lead: beats.map((b, i) => ({ on: b.t, off: b.t + 0.1, midi: 60 + (i % 12), vel: 90, bar: b.bar })), bass: [] };
  const modes = D.midiModes(a, g, true);
  check(!modes.quantized.canExport && modes.quantized.state === "refused", `${id}: quantized stays refused (${modes.quantized.reasons.join(",")})`);
  check(modes.original.ok && modes.tempoMap.ok, `${id}: original timing and tempo map are not blocked by the refused grid`);
  check(modes.tempoMap.caveats.some(c => /tempo moves/.test(c)), `${id}: the tempo map says the tempo moves`);
  const d = decodeMidi(D.partMidi(a, "hook", { timing: "tempo-map", grid: g }).data);
  check(d.tempos.length > 1, `${id}: the tempo map carries tempo changes (${d.tempos.length} tempo events)`);
  const onBeat = d.notes.every(n => n.onTick % 480 === 0), w = Math.max(...d.notes.map((n, i) => Math.abs(g.barStart(0) + tickToSec(d, n.onTick) - beats[i].t)));
  check(d.notes.length === beats.length && onBeat, `${id}: every note on a tracked beat lands on a whole quarter note`);
  check(w <= MS, `${id}: tempo-map notes play at their audio time (worst ${(w * 1000).toFixed(3)} ms over ${beats.length} beats)`);
  check(d.notes.every((n, i) => n.onTick === ((beats[i].bar * 4) + beats[i].beat - 1) * 480), `${id}: every note sits at its song bar and beat in the file (bar 1 beat 1 = tick 0)`);
  const o = decodeMidi(D.partMidi(a, "hook", { timing: "original", grid: g }).data), wo = Math.max(...o.notes.map((n, i) => Math.abs(tickToSec(o, n.onTick) - beats[i].t)));
  check(wo <= MS, `${id}: original-timing notes play at their audio time (worst ${(wo * 1000).toFixed(3)} ms)`);
  check(D.partMidi(a, "hook", { tempo: 120 }) && true, `${id}: the quantized writer itself still works when asked directly (the gate is the caller's)`);
}

/* 3. all parts: one Type 1 file */
{
  const a = melody(), g = TM.forAnalysis(a);
  for (const timing of ["original", "tempo-map", "quantized"]) {
    const f = D.allPartsMidi(a, { timing, grid: g, tempo: 120 }), d = decodeMidi(f.data);
    check(d.format === 1 && d.ntrks === 4 && d.unmatched.length === 0, `all parts (${timing}): Type 1 with a tempo track and 3 part tracks`);
    check(d.tracks.slice(1).map(t => t.name).join("|").match(/^Melody \(rough\)\|(Bass|808) \(rough\)\|Chords \(suggested\)$/), `all parts (${timing}): tracks named ${d.tracks.slice(1).map(t => t.name).join(", ")}`);
    check(d.notes.every(n => n.track > 0) && d.tempos.length >= 1 && d.tracks[0].events.every(e => e.type === "meta"), `all parts (${timing}): notes only in the part tracks, tempo in track 1`);
    check(new RegExp(timing === "tempo-map" ? "tempo map" : timing).test(f.name), `all parts (${timing}): file name says the timing`);
    check(/SUGGESTED/.test(d.tracks[3].text.map(t => t.text).join(" ")), `all parts (${timing}): chords are labelled suggested inside the file`);
  }
  const q = decodeMidi(D.allPartsMidi(a, { timing: "quantized", grid: g, tempo: 123.456 }).data);
  check(Math.abs(q.tempos[0].bpm - 123.456) < 0.001 && q.notes.every(n => n.onTick % 120 === 0), "all parts quantized: the gate's tempo and every onset on a 16th");
  const r = decodeMidi(D.allPartsMidi(a, { timing: "original", grid: g, range: { startBar: 2, endBar: 4 } }).data);
  check(r.notes.length > 0 && r.notes.length < decodeMidi(D.allPartsMidi(a, { timing: "original", grid: g }).data).notes.length, "all parts for a range holds fewer notes than the whole track");
}

/* 3b. a chosen set of parts: opts.parts picks the tracks (Notes + Bass without the suggested chords, any timing) */
{
  const a = melody(), g = TM.forAnalysis(a);
  for (const timing of ["original", "tempo-map", "quantized"]) {
    const nb = D.allPartsMidi(a, { timing, grid: g, tempo: 120, parts: ["hook", "bass"] }), d = decodeMidi(nb.data);
    check(d.format === 1 && d.ntrks === 3 && d.tracks.slice(1).map(t => t.name).join("|").match(/^Melody \(rough\)\|(Bass|808) \(rough\)$/), `parts hook+bass (${timing}): a tempo track and exactly two part tracks, no Chords (${d.tracks.slice(1).map(t => t.name).join(", ")})`);
    check(/Melody \+ (Bass|808)/.test(nb.name) && !/all parts/.test(nb.name) && nb.parts.join() === "hook,bass", `parts hook+bass (${timing}): the file name lists the parts, not "all parts" (${nb.name})`);
    const all = decodeMidi(D.allPartsMidi(a, { timing, grid: g, tempo: 120, parts: ["chords", "bass", "hook"] }).data), none = decodeMidi(D.allPartsMidi(a, { timing, grid: g, tempo: 120 }).data);
    check(all.ntrks === none.ntrks && all.notes.length === none.notes.length, `parts in any order, all three = the default all-parts file (${timing})`);
    const ch = decodeMidi(D.allPartsMidi(a, { timing, grid: g, tempo: 120, parts: ["chords"] }).data);
    check(ch.ntrks === 2 && ch.tracks[1].name === "Chords (suggested)", `parts chords only (${timing}): one part track`);
    const bn = decodeMidi(nb.data).notes.length; check(bn > 0 && bn + ch.notes.length === none.notes.length, `parts hook+bass plus chords add up to the whole (${timing}: ${bn} + ${ch.notes.length} = ${none.notes.length})`);
  }
}

/* 4. what is offered when */
{
  const a = byId("pop127_Amaj"), g = TM.forAnalysis(a), m = D.midiModes(a, g, false);
  check(m.original.ok && !m.original.parts.hook && m.original.parts.chords, "no transcription: original timing offers chords only");
  check(D.partMidi(a, "hook", { timing: "original", grid: g }) === null, "no transcription: melody in original timing is null, not invented");
  const s = Object.assign(byId("pop127_Amaj"), { bpmFixed: true }), ms = D.midiModes(s, TM.forAnalysis(s), true);
  check(!ms.tempoMap.ok && /Out of date/.test(ms.tempoMap.why) && !ms.quantized.canExport && ms.original.ok, "stale after a tempo correction: tempo map and quantized blocked, original timing still offered");
  const fb = byId("pop127_Amaj"); delete fb.grid; const mf = D.midiModes(fb, TM.forAnalysis(fb), true);
  check(!mf.tempoMap.ok && /No tracked beats/.test(mf.tempoMap.why), "fallback grid: no tempo map, and it says why");
  const nc = byId("pop127_Amaj"); nc.chords = { bars: [] }; const mn = D.midiModes(nc, TM.forAnalysis(nc), false);
  check(!mn.original.ok && mn.original.why.length > 0, "nothing time-resolved: original timing is disabled with a reason");
}

console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
