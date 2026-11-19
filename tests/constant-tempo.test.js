/* Version B: the whole-track constant-tempo fit (engine.fitConstantTempo). Synthetic evidence first (always runs), then the real-music
 * regression cases when their audio is on this machine (it is never in the repo): set TT_REAL_AUDIO to a folder or list the files below.
 *   - a steady tempo with jittered, syncopated hits is accepted at its BPM (within 0.03) even though adjacent hits are noisy
 *   - a stepping or drifting tempo is NOT accepted (the tracker's beats stand)
 *   - a typed tempo is locked: only the phase is fitted
 *   - real tracks: Jane Remover "it's a vicious cycle" (constant 161.4, was "Variable 149-175") and Porter Robinson "Mother" (98.0, was "Variable 94.7-105.6")
 */
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), cp = require("node:child_process");
const TM = require("../src/timemap"), eng = require("../src/engine")({ TimeMap: TM });
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const fps = 172.265625;
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/* evidence: kicks on every beat, snare on 2 and 4, offbeat hats, hits jittered by +-2 frames (12 ms), 10 % of beats missing, a drumless middle */
function evidence(bpmAt, seconds, drumlessFrom, drumlessTo) {
  const N = Math.round(seconds * fps), tot = new Float32Array(N); let t = 20, k = 0;
  while (t < N - 3) { const per = fps * 60 / bpmAt(t / fps), inGap = t / fps >= drumlessFrom && t / fps < drumlessTo;
    if (!inGap && rnd() > 0.1) { const j = Math.round((rnd() - 0.5) * 4), v = k % 2 ? 0.7 : 1; for (const [o, a] of [[0, v], [per / 2, 0.35]]) { const i = Math.round(t + o + j); if (i < N) tot[i] += a; } }
    t += per; k++; }
  for (let i = 0; i < N; i++) tot[i] += 0.04 * rnd(); return tot;
}
{ const f = eng.fitConstantTempo(evidence(() => 161.4, 178), fps, 161.5, 0); ok(f && Math.abs(f.bpm - 161.4) < 0.03, "steady 161.4 BPM, noisy hits: accepted near 161.4 (" + (f && f.bpm.toFixed(3)) + ")"); ok(f.quarters.every(q => q == null || Math.abs(q - f.bpm) < 0.17), "every quarter agrees"); }
{ const f = eng.fitConstantTempo(evidence(() => 98, 226), fps, 98.5, 0); ok(f && Math.abs(f.bpm - 98) < 0.03, "steady 98 BPM: accepted (" + (f && f.bpm.toFixed(3)) + ")"); }
{ const f = eng.fitConstantTempo(evidence(() => 128, 200, 80, 110), fps, 128, 0); ok(f && Math.abs(f.bpm - 128) < 0.03, "steady 128 with a 30 s drumless breakdown: still accepted (" + (f && f.bpm.toFixed(3)) + ")"); }
ok(eng.fitConstantTempo(evidence(s => s < 90 ? 120 : 126, 180), fps, 123, 0) === null, "a tempo that steps from 120 to 126 halfway is not accepted");
ok(eng.fitConstantTempo(evidence(s => 114 + 6 * s / 180, 180), fps, 117, 0) === null, "a tempo that drifts 114 to 120 is not accepted");
ok(eng.fitConstantTempo(evidence(() => 120, 10), fps, 120, 0) === null, "a 10 s clip is too short to claim a constant tempo");
{ const e = evidence(() => 161.4, 178), f = eng.fitConstantTempo(e, fps, 161, 161); ok(f && f.locked && f.bpm === 161, "a typed tempo is locked exactly (161), phase fitted"); }

const FILES = { vc: ["nerdpersonthing/Jane Remover/Jane Remover - it's a vicious cycle.mp3", 161.4, 0.1], mother: ["malaises/[2021] Nurture/07 Porter Robinson - Mother.mp3", 98, 0.05] };
const root = process.env.TT_REAL_AUDIO || "/Users/keina/Soulseek Downloads/complete";
(async () => {
  for (const [id, [rel, bpm, tol]] of Object.entries(FILES)) {
    const f = root + "/" + rel; if (!fs.existsSync(f)) { console.log("SKIP real-music " + id + " (audio not on this machine)"); continue; }
    let raw; try { raw = cp.execFileSync("ffmpeg", ["-v", "error", "-i", f, "-ac", "1", "-ar", "44100", "-f", "f32le", "-"], { maxBuffer: 1 << 30 }); } catch (e) { console.log("SKIP real-music " + id + " (no ffmpeg)"); continue; }
    const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), ab = { sampleRate: 44100, length: x.length, duration: x.length / 44100, numberOfChannels: 1, getChannelData: () => x };
    const a = await eng.analyzeDecoded(ab, () => {}, false, undefined, undefined), m = TM.forAnalysis(a).map, tp = m.tempo(), el = m.exportEligibility();
    ok(a.tempoFit && Math.abs(a.tempoFit.bpm - bpm) <= tol, `${id}: tempo ${a.tempoFit && a.tempoFit.bpm} within ${tol} of ${bpm}`);
    ok(tp.isConstant && !el.reasons.length, `${id}: called constant, export not refused (${el.state})`);
    ok(m.exportGrid().maxDeviationMs < 5, `${id}: one tempo reproduces every beat within 5 ms`);
    const l = await eng.analyzeDecoded(ab, () => {}, false, undefined, { bpm: Math.round(bpm) }); ok(l.bpm === Math.round(bpm) && TM.forAnalysis(l).map.tempo().isConstant, `${id}: locked at ${Math.round(bpm)} stays ${Math.round(bpm)} and constant`);
  }
  console.log(pass + " passed, 0 failed");
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
