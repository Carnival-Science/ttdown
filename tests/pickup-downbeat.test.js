/* Version B, B2: bar 1 and pickups.
 *   1. MIDI keeps a pickup in every timing: notes before bar 1 (bar -1 in the transcription) are written, before the bar-1 notes, in
 *      quantized (the whole-track file starts one bar early), tempo map (the file starts at the pickup bar) and original timing.
 *   2. A real paired render, when it is on this machine (never in the repo): a drumless piece with a two-note pickup into the first chord.
 *      Its own MIDI file is the answer key. Bar 1 must sit on the first chord, the beats must not be on the off-beats, the pickup notes
 *      must be transcribed before bar 1, and a typed tempo must give the same bar 1. Set TT_PAIRED to "audio|midi" to point elsewhere.
 */
"use strict";
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
const { decodeMidi, tickToSec } = require("./lib/smf");
const TM = require("../src/timemap"), TS = require("../src/timing-store"), eng = require("../src/engine")({ TimeMap: TM }), D = require("../src/domain")({ TimingStore: TS, engine: eng });
const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0; const check = (ok, msg) => { if (ok) pass++; else { fail++; console.error("FAIL: " + msg); } };

/* 1. a pickup in the transcription survives every MIDI timing */
{
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/melody_change_120.analysis.json"), "utf8")), a = JSON.parse(JSON.stringify(fx.full)); a.grid = JSON.parse(JSON.stringify(fx.grid));
  // this fixture's bar 1 is at 0:00; move the whole song (beats, bar 1, notes) one second later so a pickup has room before it
  const SH = 1; a.grid.beats = a.grid.beats.map(t => t + SH); a.grid.downbeats = a.grid.downbeats.map(t => t + SH); a.firstDown += SH; a.duration += SH;
  ["lead", "bass"].forEach(p => a.transcription[p].forEach(n => { n.on += SH; n.off += SH; }));
  const g = TM.forAnalysis(a), b0 = g.barStart(0), b1 = g.barStart(1), beat = (b1 - b0) / 4;
  // two pickup notes on beat 4 and the "and" of beat 4 of the bar before bar 1, as a render with leading audio would have them
  const pk = [{ on: b0 - beat, off: b0 - beat / 2 - 0.01, midi: 81, vel: 90, bar: -1, beat: -1, dur: 0.5, section: -1 }, { on: b0 - beat / 2, off: b0 - 0.01, midi: 82, vel: 90, bar: -1, beat: -0.5, dur: 0.5, section: -1 }];
  a.transcription.lead = pk.concat(a.transcription.lead);
  const firstBar1 = a.transcription.lead.find(n => n.bar >= 0);
  // quantized: 96 per quarter, the file's step 0 is the pickup bar
  const q = decodeMidi(D.partMidi(a, "hook", { source: "transcribed", tempo: 120 }).data);
  const ons = q.notes.map(n => n.onTick).sort((x, y) => x - y);
  check(ons[0] === 12 * 24 && ons[1] === 14 * 24, `quantized: the pickup is written on beat 4 and its "and" of the bar before bar 1 (ticks ${ons.slice(0, 2)})`);
  check(ons.includes((16 + Math.round(firstBar1.beat * 4)) * 24), "quantized: bar 1 starts one bar into the file");
  check(/pickup is kept/.test(q.tracks[0].text.map(t => t.text).join(" ")), "quantized: the file says it starts one bar early for the pickup");
  const all = decodeMidi(D.allPartsMidi(a, { timing: "quantized", grid: g, tempo: 120 }).data), mel = all.notes.filter(n => n.track === 1), ch = all.notes.filter(n => n.track === 3);
  check(mel[0].pitch === 81 && mel[0].onTick === 12 * 120, "all parts quantized: the melody's first note is the pickup, in the pickup bar");
  check(ch.length && Math.min(...ch.map(n => n.onTick)) % 1920 === 0 && Math.min(...ch.map(n => n.onTick)) >= 1920, "all parts quantized: chords start at bar 1, one bar into the file");
  // tempo map: the file starts at the pickup bar and every note plays at its audio time
  const tm = decodeMidi(D.partMidi(a, "hook", { timing: "tempo-map", grid: g }).data), t0 = g.barStart(-1);
  check(tm.notes[0].pitch === 81 && Math.abs(t0 + tickToSec(tm, tm.notes[0].onTick) - pk[0].on) < 0.001, "tempo map: the pickup is the first note, at its audio time");
  check(tm.notes[0].onTick === 3 * 480, "tempo map: the pickup sits on beat 4 of the file's first bar");
  // original timing: audio seconds from 0:00, so the pickup is simply the first note
  const o = decodeMidi(D.partMidi(a, "hook", { timing: "original", grid: g }).data);
  check(o.notes[0].pitch === 81 && Math.abs(tickToSec(o, o.notes[0].onTick) - pk[0].on) < 0.001, "original timing: the pickup is the first note, at its audio time");
  // a range that starts at bar 1 is still bar 1 (an explicit range is not widened)
  const r = decodeMidi(D.partMidi(a, "hook", { range: { startBar: 0, endBar: 4 }, tempo: 120 }).data);
  check(!r.notes.some(n => n.pitch === 81 && n.onTick < 4 * 96), "a range from bar 1 does not pull the pickup in");
}

/* 2. the real paired render */
const [AUDIO, MIDI] = (process.env.TT_PAIRED || "/Users/keina/Downloads/more please.mp3|/Users/keina/Downloads/more please.mid").split("|");
(async () => {
  if (!fs.existsSync(AUDIO) || !fs.existsSync(MIDI)) console.log("SKIP paired render (audio or MIDI not on this machine)");
  else {
    let raw; try { raw = cp.execFileSync("ffmpeg", ["-v", "error", "-i", AUDIO, "-ac", "1", "-ar", "44100", "-f", "f32le", "-"], { maxBuffer: 1 << 30 }); } catch (e) { raw = null; }
    if (!raw) console.log("SKIP paired render (no ffmpeg)");
    else {
      const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), ab = { sampleRate: 44100, length: x.length, duration: x.length / 44100, numberOfChannels: 1, getChannelData: () => x };
      const d = decodeMidi(fs.readFileSync(MIDI)), notes = d.notes.slice().sort((p, q) => p.onTick - q.onTick), bar = 4 * d.division;
      const downTick = Math.ceil(notes[0].onTick / bar) * bar, beatSec = 60 / d.tempos[0].bpm;
      // the render starts at its first note (the MIDI's empty leading bars are trimmed): find that first sound
      let i0 = 0; { const hop = 441, rms = []; for (let i = 0; i + hop <= x.length; i += hop) { let s = 0; for (let k = i; k < i + hop; k++) s += x[k] * x[k]; rms.push(Math.sqrt(s / hop)); } const ref = rms.slice().sort((p, q) => p - q)[Math.floor(rms.length * 0.99)]; i0 = rms.findIndex(v => v > 0.02 * ref) / 100; }
      const off = i0 - tickToSec(d, notes[0].onTick), down = tickToSec(d, downTick) + off, pickup = notes.filter(n => n.onTick < downTick);
      for (const forced of [undefined, { bpm: Math.round(d.tempos[0].bpm) }]) {
        const a = await eng.analyzeDecoded(ab, () => {}, false, undefined, forced), g = a.grid, tag = forced ? `typed ${forced.bpm} BPM` : "detected";
        const nearest = g.downbeats.reduce((p, q) => Math.abs(q - down) < Math.abs(p - down) ? q : p);
        check(Math.abs(nearest - down) <= 0.07, `${tag}: bar 1 on the first chord (${nearest.toFixed(3)} s vs ${down.toFixed(3)} s)`);
        const onBeat = g.beats.filter(t => { const ph = ((t - down) / beatSec) % 1; return Math.min(Math.abs(ph), 1 - Math.abs(ph)) * beatSec <= 0.07; }).length / g.beats.length;
        check(onBeat >= 0.95, `${tag}: the beats are on the beat, not the off-beat (${(100 * onBeat).toFixed(0)} %)`);
        check(g.downbeats.every(t => Math.abs(((t - down) / (4 * beatSec)) - Math.round((t - down) / (4 * beatSec))) * 4 * beatSec <= 0.07), `${tag}: every downbeat is on a bar line of the MIDI`);
        const before = a.transcription.lead.filter(n => n.bar < 0);
        check(pickup.every(p => before.some(n => n.midi === p.pitch && Math.abs(n.on - (tickToSec(d, p.onTick) + off)) <= 0.05)), `${tag}: the ${pickup.length} pickup notes are transcribed before bar 1 (${before.map(n => n.midi).join(",")})`);
        check(Math.abs(a.bpm - d.tempos[0].bpm) < 0.05, `${tag}: tempo ${a.bpm}`);
      }
    }
  }
  console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})().catch(e => { console.error("FAIL:", e.stack); process.exit(1); });
