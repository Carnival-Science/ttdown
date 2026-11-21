/* Bar 1 when the drum evidence measures no drums (issue #50, docs/BAR1_NO_DRUMS.md; engine.js Version B, B2 and B3).
 *   1. synthetic syncopated piano loop that starts on bar 1 (chords anticipate the bar line): the tracked beats sit on the beats, not the
 *      off-beats, and bar 1 is the first sound (method first-sound-v1)
 *   2. synthetic long piece with a two-note pickup and a long chord and bass on every bar line: the note vote decides (note-onsets-v1), the first sound is NOT bar 1
 *   3. the same loop with drums: drums decide, neither rule changes bar 1 (no downbeatFit)
 *   4. real paired renders, ONLY when TT_PAIRED_MANIFEST points at a bench/paired-renders manifest (never searched for): reported, not asserted
 * Synthetic music and tuned thresholds (BAR1 in engine.js): a regression guard, not a measurement of accuracy. */
"use strict";
const TM = require("../src/timemap"), eng = require("../src/engine")({ TimeMap: TM });
let pass = 0, fail = 0; const check = (ok, msg) => { if (ok) pass++; else { fail++; console.error("FAIL: " + msg); } };
const SR = 44100;
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
const ab = x => ({ sampleRate: SR, length: x.length, duration: x.length / SR, numberOfChannels: 1, getChannelData: () => x });
function render(events, bpm, sec, drums) { // events: [beat, durBeats, [Hz...]]
  const x = new Float32Array(Math.floor(sec * SR)), beat = 60 / bpm;
  for (const [b, d, fs] of events) { const s0 = Math.floor(b * beat * SR), len = Math.min(x.length - s0, Math.floor(Math.max(0.3, d * beat) * SR));
    for (const f of fs) for (let h = 1; h <= 5; h++) for (let i = 0; i < len; i++) x[s0 + i] += 0.16 / h * Math.min(1, i / (0.004 * SR)) * Math.exp(-i / SR * (1.2 + h * 1.5)) * Math.sin(2 * Math.PI * f * h * i / SR); }
  if (drums) for (let k = 0; k * beat < sec - 0.5; k++) { const s0 = Math.floor(k * beat * SR);
    for (let i = 0; i < 0.16 * SR; i++) x[s0 + i] += (k % 2 === 0 ? 0.8 * Math.exp(-i / SR * 25) * Math.sin(2 * Math.PI * (45 + 90 * Math.exp(-i / SR * 30)) * i / SR) : 0.6 * Math.exp(-i / SR * 28) * rnd());
    for (let i = 0; i < 0.05 * SR; i++) x[s0 + Math.floor(beat * SR / 2) + i] += 0.25 * Math.exp(-i / SR * 90) * (rnd() - 0.7 * rnd()); }
  return x;
}
const CH = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 293.7]], BASS = [110, 98, 87.3, 98];
function syncopated(bars, pickup) { const ev = [], o = pickup ? 1.5 : 0;
  for (let b = 0; b < bars; b++) { const c = CH[b % 4], w = b * 4 + o, n = (i) => c[i % 3];
    ev.push([w, 1.5, [c[0], c[1], c[2], BASS[b % 4]]], [w + 1.5, 0.5, [n(1) * 2]], [w + 2.5, 0.5, [n(2) * 2]], [w + 3.5, 1, CH[(b + 1) % 4]]); }
  if (pickup) ev.unshift([0, 0.5, [330]], [0.5, 1, [392]]); return ev; }
function plain(bars, pickup) { const ev = [], o = pickup ? 1.5 : 0; // a long chord and bass on every bar line, two short notes after it
  for (let b = 0; b < bars; b++) { const c = CH[b % 4], w = b * 4 + o; ev.push([w, 3, [c[0], c[1], c[2], BASS[b % 4]]], [w + 3, 0.5, [c[1] * 2]], [w + 3.5, 0.5, [c[2] * 2]]); }
  if (pickup) ev.unshift([0, 0.5, [330]], [0.5, 1, [392]]); return ev; }
const run = async (x) => eng.analyzeDecoded(ab(x), () => {}, false);
const beatErr = (a, bpm) => { const beat = 60 / bpm, g = a.grid && a.grid.beats || []; return g.length ? Math.max(...g.map(t => { const d = ((t % beat) + beat) % beat; return Math.min(d, beat - d); })) : null; };
(async () => {
  { const bpm = 130, a = await run(render(syncopated(12, false), bpm, 12 * 4 * 60 / bpm + 1, false)), db = a.grid && a.grid.downbeats && a.grid.downbeats[0];
    check(a.drumEvidence && a.drumEvidence.found === false, `1: reads as no drums (${JSON.stringify(a.drumEvidence)})`);
    check(a.downbeatFit && a.downbeatFit.method === "first-sound-v1", `1: bar 1 from the first sound (${JSON.stringify(a.downbeatFit)})`);
    check(db != null && Math.abs(db) < 0.06, `1: first downbeat at the top of the file (${db})`);
    const be = beatErr(a, bpm); check(be != null && be < 0.04, `1: every tracked beat on the 130 BPM grid, none half a beat late (worst ${be})`); }
  { const bpm = 105, a = await run(render(plain(48, true), bpm, (48 * 4 + 1.5) * 60 / bpm + 1, false)), db = a.grid && a.grid.downbeats && a.grid.downbeats[0], want = 1.5 * 60 / bpm;
    check(a.drumEvidence && a.drumEvidence.found === false, `2: reads as no drums (${JSON.stringify(a.drumEvidence)})`);
    check(!(a.downbeatFit && a.downbeatFit.method === "first-sound-v1"), `2: a pickup piece with enough notes is not anchored to its first sound (${JSON.stringify(a.downbeatFit)})`);
    check(db != null && Math.abs(db - want) < 0.07, `2: first downbeat after the two-note pickup (want ${want.toFixed(3)}, got ${db}; bpm ${a.bpm}, grid ${a.grid && a.grid.source}, first beats ${a.grid && a.grid.beats.slice(0, 3).join(",")}, ${JSON.stringify(a.downbeatFit)})`); }
  { const bpm = 130, a = await run(render(syncopated(12, false), bpm, 12 * 4 * 60 / bpm + 1, true));
    check(a.drumEvidence && a.drumEvidence.found === true && !a.downbeatFit, `3: with drums, neither no-drums rule runs (${JSON.stringify(a.downbeatFit)})`); }
  const mf = process.env.TT_PAIRED_MANIFEST;
  if (mf) console.log("4: paired renders: run  node bench/paired-renders.js " + mf + "  (not asserted here)"); else console.log("SKIP paired renders (set TT_PAIRED_MANIFEST to report them)");
  console.log(`bar-1 no-drums tests: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
