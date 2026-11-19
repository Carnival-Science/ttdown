#!/usr/bin/env node
/* MIDI export round trip (issue #29, first slice). The bytes songMidiFiles writes are read back with an independent decoder
 * (tests/lib/smf.js, no code shared with the writer) and compared with the internal events (songNotes) and with the audio's tracked
 * beats. Needs the Version A prediction files (committed); no browser. The downloaded-file path is covered by tests/app-exports.test.js.
 *
 * What an export IS (docs/MIDI_EXPORT.md): grid-quantized. Onsets are whole 16th steps from bar 1, so they sit on the export grid, not on
 * the original event times; the grid's tempo is the TimeMap export grid's, so the file stays within the grid tolerance of the audio. */
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { decodeMidi, tickToSec, readZip } = require("./lib/smf");
const TM = require("../src/timemap"), TS = require("../src/timing-store"), eng = require("../src/engine")({ TimeMap: TM }), D = require("../src/domain")({ TimingStore: TS, engine: eng });
const ROOT = path.resolve(__dirname, ".."), load = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
let pass = 0, fail = 0; const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL: " + msg); } };
const recs = [...load("bench/baselines/version-a/predictions.json").tracks, ...load("bench/baselines/version-a/time-fixtures/predictions.json").tracks].filter(r => r.status === "ok");
const analysisOf = rec => { const a = Object.assign({}, rec.full); a.grid = rec.grid; return a; };
const byId = id => analysisOf(recs.find(r => r.id === id));
const gridOf = a => TM.forAnalysis(a).map.exportEligibility().exportGrid;
const opts = a => ({ tempo: gridOf(a).bpm }); // what the app passes: the export grid's tempo
const FILES = ["kick", "snare", "hats", "bass", "chords", "hook"];
const noteSets = (a, N) => ({ kick: N.D.kick, snare: N.D.snare, hats: N.D.hats, bass: N.bass, chords: N.chords, hook: N.hook });

/* Compare one decoded file with its internal events. Onsets/durations are checked in SECONDS from the file's own tempo, against the step
 * size of the tempo the export is meant to follow (`bpm`), tolerance one tick (the 16th is 24 ticks, so a tick is 1/96 beat). */
function compare(label, internal, d, bpm, { clip = false } = {}) {
  const tickSec = 60 / bpm / d.division, step = 15 / bpm;
  const exp = internal.map(n => ({ pitch: n.midi, on: n.t * step, dur: n.dur * step, vel: n.vel || 100 })).sort((x, y) => x.on - y.on || x.pitch - y.pitch);
  const got = d.notes.map(n => ({ pitch: n.pitch, on: tickToSec(d, n.onTick), off: tickToSec(d, n.offTick), vel: n.vel }));
  if (clip) { const last = new Map(); for (let i = exp.length - 1; i >= 0; i--) { const e = exp[i], nx = last.get(e.pitch); if (nx != null && e.on + e.dur > nx) e.dur = nx - e.on; last.set(e.pitch, e.on); } }
  check(d.unmatched.length === 0, `${label}: every note-on has a note-off and vice versa (${JSON.stringify(d.unmatched.slice(0, 2))})`);
  check(got.length === exp.length, `${label}: note count ${got.length} equals the ${exp.length} internal events`);
  if (got.length !== exp.length) return;
  let worstOn = 0, worstDur = 0, pitchBad = 0, velBad = 0;
  got.forEach((g, i) => { const e = exp[i]; if (g.pitch !== e.pitch) pitchBad++; worstOn = Math.max(worstOn, Math.abs(g.on - e.on)); worstDur = Math.max(worstDur, Math.abs((g.off - g.on) - e.dur)); if (g.vel !== e.vel) velBad++; });
  check(pitchBad === 0, `${label}: ${pitchBad} pitches differ`);
  check(worstOn <= tickSec * 0.5 + 1e-9, `${label}: worst onset error ${(worstOn * 1000).toFixed(2)} ms is within half a tick (${(tickSec * 500).toFixed(2)} ms)`);
  check(worstDur <= tickSec * 1.5 + 1e-9, `${label}: worst duration error ${(worstDur * 1000).toFixed(2)} ms is within 1.5 ticks (rounding plus the one-tick release gap)`);
  check(velBad === 0, `${label}: velocities preserved`);
}

/* 1. every real-music-shaped fixture the app would export: pitches, counts, onsets, durations, tempo, meter, track end */
let n1 = 0;
for (const rec of recs) {
  const a = analysisOf(rec), el = TM.forAnalysis(a).map.exportEligibility(); if (el.state === "refused") continue; n1++;
  const bpm = el.exportGrid.bpm, N = D.songNotes(a), sets = noteSets(a, N), files = D.songMidiFiles(a, opts(a));
  check(files.length === FILES.filter(k => sets[k].length).length, `${rec.id}: one MIDI file per non-empty part (${files.length})`);
  files.forEach(f => {
    const d = decodeMidi(f.data), key = FILES.find((k, i) => f.name.startsWith(`${i + 1} `)), L = `${rec.id}/${f.name}`;
    check(d.format === 0 && d.ntrks === 1 && d.division === 96, `${L}: SMF format 0, one track, 96 per quarter`);
    check(d.tempos.length === 1 && d.tempos[0].tick === 0, `${L}: exactly one tempo, at tick 0`);
    check(Math.abs(d.tempos[0].bpm - bpm) < 0.001, `${L}: tempo ${d.tempos[0].bpm.toFixed(4)} equals the export grid's ${bpm.toFixed(4)}`);
    check(d.timeSignatures.length === 1 && d.timeSignatures[0].tick === 0 && d.timeSignatures[0].num === 4 && d.timeSignatures[0].den === 4, `${L}: states 4/4 at tick 0 (${JSON.stringify(d.timeSignatures)})`);
    check(d.tracks[0].ended, `${L}: ends with an end-of-track event`);
    compare(L, sets[key], d, bpm);
  });
}
check(n1 >= 17, `exercised ${n1} exportable fixtures`);

/* 2. bar 1 and leading silence: the first bar's notes sit at tick 0 of the file, whatever the audio did before the downbeat */
for (const id of ["pop127_pad300", "pop127_pad1200", "leading_silence_2s", "pickup_2beats_late"]) {
  const a = byId(id), N = D.songNotes(a), first = Math.min(...[...N.D.kick, ...N.D.snare, ...N.D.hats].map(n => n.t)), files = D.songMidiFiles(a, opts(a)), kick = decodeMidi(files[0].data);
  check(N.D.kick.length && Math.min(...N.D.kick.map(n => n.t)) >= 0 && first >= 0, `${id}: no event before bar 1`);
  check(kick.notes[0].onTick === Math.round(N.D.kick[0].t * 24) && kick.notes[0].onTick % 24 === 0, `${id}: first kick is on a 16th boundary measured from bar 1 (tick ${kick.notes[0].onTick})`);
  const bar = N.stepSec * 16; check(Math.abs(bar - 240 / a.bpm) < 0.01, `${id}: a bar is ${bar.toFixed(3)} s`);
}


/* 3. repeated, overlapping, duplicated, long and octave-apart notes, written with midiBytes and read back */
{
  const dec = (notes, bpm = 120) => decodeMidi(D.midiBytes(notes, bpm)), span = d => d.notes.map(n => [n.pitch, n.onTick, n.offTick]);
  let d = dec([{ t: 0, dur: 1, midi: 60 }, { t: 1, dur: 1, midi: 60 }, { t: 2, dur: 1, midi: 60 }]);
  check(d.notes.length === 3 && d.unmatched.length === 0 && JSON.stringify(span(d)) === JSON.stringify([[60, 0, 23], [60, 24, 47], [60, 48, 71]]), "repeated 16th notes stay three separate notes: " + JSON.stringify(span(d)));
  d = dec([{ t: 0, dur: 4, midi: 60 }, { t: 4, dur: 4, midi: 60 }]);
  check(JSON.stringify(span(d)) === JSON.stringify([[60, 0, 95], [60, 96, 191]]), "back-to-back same-pitch notes: the first ends before the second starts: " + JSON.stringify(span(d)));
  d = dec([{ t: 0, dur: 8, midi: 60 }, { t: 4, dur: 2, midi: 60 }]);
  check(JSON.stringify(span(d)) === JSON.stringify([[60, 0, 95], [60, 96, 143]]), "a same-pitch note overlapped by the next one is cut at that onset, not swapped with it: " + JSON.stringify(span(d)));
  d = dec([{ t: 0, dur: 4, midi: 60 }, { t: 0, dur: 2, midi: 60 }]);
  check(d.notes.length === 1 && d.notes[0].offTick === 95 && d.unmatched.length === 0, "a duplicate (same pitch, same onset) is written once, as the longer note: " + JSON.stringify(span(d)));
  d = dec([{ t: 0, dur: 4, midi: 60 }, { t: 0, dur: 4, midi: 72 }, { t: 0, dur: 4, midi: 48 }]);
  check(d.notes.length === 3 && JSON.stringify(d.notes.map(n => n.pitch)) === "[48,60,72]" && d.notes.every(n => n.onTick === 0 && n.offTick === 95), "octave-apart notes at one onset are three notes, none merged: " + JSON.stringify(span(d)));
  d = dec([{ t: 0, dur: 3000, midi: 36 }]);
  check(d.notes.length === 1 && d.notes[0].offTick === 3000 * 24 - 1, "a very long sustain keeps its length (variable-length ticks above 2 bytes): " + d.notes[0].offTick);
  d = dec([{ t: 0, dur: 0.01, midi: 36 }]);
  check(d.notes[0].offTick > d.notes[0].onTick, "a note shorter than a tick still has a note-off after its note-on");
  d = dec([{ t: 3, dur: 1, midi: 60, vel: 300 }, { t: 3, dur: 1, midi: 61, vel: 0 }, { t: 3, dur: 1, midi: 62 }, { t: 3, dur: 1, midi: 63, vel: -5 }]);
  check(d.unmatched.length === 0 && d.notes.length === 4 && d.notes.map(n => n.vel).join() === "127,100,100,1", "velocity: 300 is clamped to 127, 0 or missing means the default 100, negatives clamp to 1; never a note-off by accident: " + d.notes.map(n => n.vel));
  assert.throws(() => D.midiBytes([{ t: -1, dur: 1, midi: 60 }], 120), /before bar 1/); check(true, "a note before bar 1 is refused, not written with a negative time");
  assert.throws(() => D.midiBytes([{ t: 0, dur: 1, midi: 60 }], NaN), /tempo/); assert.throws(() => D.midiBytes([], 0), /tempo/); check(true, "a missing or absurd tempo is refused");
  d = decodeMidi(D.midiBytes([], 120)); check(d.notes.length === 0 && d.tracks[0].ended && d.tempos.length === 1, "an empty part still reads back as a valid file");
  const m = D.midiBytes([{ t: 0, dur: 1, midi: 60 }], 100, { name: "Chords: café", text: "x".repeat(200) }), dm = decodeMidi(m);
  check(dm.tracks[0].name === Buffer.from("Chords: café").toString("latin1") && dm.tracks[0].text[0].text.length === 200, "track name (UTF-8) and a long text event (variable-length) round-trip");
}

/* 4. tempo: the file follows the export grid's tempo, not a.bpm rounded to 0.1 BPM */
{
  const rec = recs.find(r => r.id === "long_7min"), a = analysisOf(rec), real = gridOf(a).bpm;
  check(Math.abs(D.songMidiFiles(a)[0].data && decodeMidi(D.songMidiFiles(a)[0].data).tempos[0].bpm - a.bpm) < 0.001, "without a tempo option the analysis tempo (a.bpm) is written");
  const withGrid = decodeMidi(D.songMidiFiles(a, { tempo: real })[0].data).tempos[0].bpm;
  // a 7-minute track at 128.0 vs 128.04 BPM: 0.04/128 of 420 s is 130 ms of drift if the rounded tempo is written
  const secs = 420, driftRounded = Math.abs(secs * (1 - 128.0 / 128.04)) * 1000; check(driftRounded > 100, "(setup) writing 128.0 for a 128.04 BPM track drifts " + driftRounded.toFixed(0) + " ms over 7 minutes");
  const hi = decodeMidi(D.midiBytes([{ t: 0, dur: 1, midi: 60 }], 128.04)).tempos[0].bpm; check(Math.abs(hi - 128.04) < 0.0005, "a fractional tempo is written to microsecond precision: " + hi.toFixed(5));
  check(Math.abs(withGrid - real) < 0.001, "the app's tempo option is what is written: " + withGrid.toFixed(4));
}

/* 5. file names and metadata say what each file is */
{
  const a = byId("pop127_Amaj"), files = D.songMidiFiles(a, opts(a)), names = files.map(f => f.name);
  check(names.length === 6 && names.join("|") === "1 Kick - full song.mid|2 Snare or clap - full song.mid|3 Hi-hats - full song.mid|4 808 - full song.mid|5 Chords (suggested) - full song.mid|6 Hook (rough) - full song.mid", "file names: " + names.join(" | "));
  const ch = decodeMidi(files[4].data), kick = decodeMidi(files[0].data);
  check(/SUGGESTED voicings/.test(ch.tracks[0].text[0].text) && /not transcribed/.test(ch.tracks[0].text[0].text), "the chord file says its notes are suggested voicings, not transcribed");
  check(!/SUGGESTED/.test(kick.tracks[0].text[0].text) && /quantized to the 16th-note grid/.test(kick.tracks[0].text[0].text) && /not the original timing/.test(kick.tracks[0].text[0].text), "the drum files say they are quantized, not original timing");
  check(files.every(f => decodeMidi(f.data).tracks[0].name), "every file carries a track name");
}

/* 6. the export gate: stale results, refused grids, confirmation, corrected tempo */
{
  const gate = (id, confirmed, edit) => { const a = byId(id); if (edit) edit(a); return D.exportGate(a, TM.forAnalysis(a).map, confirmed); };
  for (const id of ["pop127_Amaj", "pop127_pad1200", "pickup_1beat", "long_7min"]) {
    const g0 = gate(id, false), g1 = gate(id, true);
    check(!g0.canExport && g0.state === "needs-confirmation" && g0.needs.includes("downbeat"), id + ": not exportable until the downbeat and 4/4 are confirmed (" + g0.state + ")");
    check(g1.canExport && g1.tempo > 0, id + ": exportable once confirmed, with the grid's tempo " + (g1.tempo && g1.tempo.toFixed(3)));
  }
  for (const id of ["drift_slow", "drift_fast", "tempo_change_step"]) {
    for (const c of [false, true]) { const g = gate(id, c); check(g.state === "refused" && !g.canExport && g.reasons.length > 0, id + (c ? " (confirmed)" : "") + ": an unsafe grid stays refused (" + g.reasons.join() + ")"); }
  }
  const t = gate("pop127_Amaj", true, a => { D.applyTempo(a, 120); });
  check(!t.canExport && t.stale.includes("tempo"), "a tempo correction made without the audio blocks the export even when confirmed (stale: " + t.stale + ")");
  const m = gate("pop127_Amaj", true, a => { D.applyMeter(a, true); });
  check(!m.canExport && m.stale.includes("meter"), "'not in 4/4' blocks the export even when confirmed");
  const k = gate("pop127_Amaj", true, a => { D.applyKey(a, "C major"); });
  check(k.canExport || k.stale.length === 0, "a key correction alone is not a bar-grid problem (it does not block bar-aligned exports: " + JSON.stringify(k.stale) + ")");
  const noGrid = D.exportGate(byId("pop127_Amaj"), { confirmDownbeat() { throw new Error("x"); }, exportEligibility() { throw new Error("x"); } }, true);
  check(!noGrid.canExport && noGrid.reasons.includes("no-grid"), "a map that cannot answer refuses");
  // after a tempo correction the files themselves are not generated by the app (the button is disabled); the stale tempo is what songMidiFiles would otherwise write
  const a = byId("pop127_Amaj"); D.applyTempo(a, 120); check(D.staleReasons(a).includes("tempo"), "applyTempo marks the result stale");
}

/* 7. per-part MIDI (the buttons beside the piano rolls and chords): the displayed phrase, through the same writer */
{
  let nPhrase = 0;
  for (const rec of recs) {
    const a = analysisOf(rec), el = TM.forAnalysis(a).map.exportEligibility(); if (el.state === "refused") continue;
    const bpm = el.exportGrid.bpm;
    for (const [part, src, min] of [["hook", a.hook, 3], ["bass", a.bassline, 2]]) {
      const m = D.partMidi(a, part, { tempo: bpm });
      if (!src || !src.notes || src.notes.length < min) { check(m === null, rec.id + " " + part + ": nothing displayed, nothing written"); continue; }
      nPhrase++; const d = decodeMidi(m.data), L = rec.id + "/" + m.name;
      compare(L, src.notes.map(n => ({ t: n.t, dur: n.dur, midi: n.midi, vel: n.vel })), d, bpm, { clip: true });
      check(d.tempos.length === 1 && Math.abs(d.tempos[0].bpm - bpm) < 0.001 && d.timeSignatures.length === 1 && d.timeSignatures[0].num === 4, L + ": grid tempo and 4/4 like the full-song files");
      check(d.notes.every(n => n.onTick < 64 * 24), L + ": the phrase is the displayed 4 bars, not the song-length repeat (last onset tick " + Math.max(...d.notes.map(n => n.onTick)) + ")");
      check(/rough transcription/.test(d.tracks[0].text[0].text) && /not the original timing/.test(d.tracks[0].text[0].text) && /4-bar phrase/.test(m.name), L + ": says rough, quantized, 4-bar phrase");
      const full = decodeMidi(D.songMidiFiles(a, { tempo: bpm }).find(x => /^4 /.test(x.name) && part === "bass" || /^6 /.test(x.name) && part === "hook").data);
      check(d.notes.length <= full.notes.length, L + ": no more notes than the full-song file, which repeats the phrase");
    }
    const sec = a.sections[0], ch = D.partMidi(a, "chords", { tempo: bpm, section: sec }), names = D.chordNamesText(a, sec);
    if (ch) { const d = decodeMidi(ch.data), L = rec.id + "/" + ch.name;
      const barsWith = a.chords.bars.slice(sec.startBar, sec.startBar + sec.bars).filter(c => c && c !== "–").length;
      check(d.notes.length === barsWith * 3 && d.notes.every(n => n.onTick % 384 === 0 && n.onTick < sec.bars * 384) && d.unmatched.length === 0, L + ": one triad per detected bar, starting at the section's first bar (" + d.notes.length + " notes, " + barsWith + " bars)");
      check(/SUGGESTED voicings/.test(d.tracks[0].text[0].text) && /suggested voicings/.test(ch.name), L + ": labelled as suggested voicings");
      check(names.split(" | ").length === Math.min(sec.bars, a.chords.bars.length - sec.startBar) && !/–/.test(names), L + ": chord names text \"" + names.slice(0, 40) + "\"");
    }
  }
  check(nPhrase > 6, "per-part phrases exercised: " + nPhrase);
  assert.throws(() => D.partMidi(byId("pop127_Amaj"), "drums", {}), /unknown part/); check(true, "an unknown part is refused");
  check(D.partMidi(byId("pop127_Amaj"), "chords", {}) === null, "chords without a section write nothing");
  const a0 = byId("pop127_Amaj"); a0.chords = { bars: ["–", "–"] }; check(D.partMidi(a0, "chords", { section: { startBar: 0, bars: 2 } }) === null && D.chordNamesText(a0, { startBar: 0, bars: 2 }) === "N.C. | N.C.", "bars with no chord write no notes and read N.C.");
}

/* 8. drumless detection: no kick and no snare anywhere (never a claim about vocals or other instruments) */
{
  const a = byId("pop127_Amaj"); check(D.noDrumsFound(a) === false, "a track with a kick and snare is not drumless");
  const b = JSON.parse(JSON.stringify(a)); b.pattern.kick = b.pattern.kick.map(() => false); b.pattern.snare = b.pattern.snare.map(() => false); (b.drumParts || []).forEach(p => { p.kick = p.kick.map(() => false); p.snare = p.snare.map(() => false); });
  check(D.noDrumsFound(b) === true, "no kick or snare anywhere: drumless (hi-hats alone do not make drums)");
  const c = JSON.parse(JSON.stringify(b)); if (c.drumParts && c.drumParts.length) c.drumParts[c.drumParts.length - 1].snare[4] = true; check(D.noDrumsFound(c) === (!(c.drumParts && c.drumParts.length)), "one snare in any section's pattern keeps the drum tools");
  const e = JSON.parse(JSON.stringify(b)); delete e.drumParts; check(D.noDrumsFound(e) === true, "a result with no per-section patterns is judged on the main pattern");
}

console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
