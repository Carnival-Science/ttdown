/* Is there percussion in the track? (engine.drumEvidence, docs/DRUM_EVIDENCE.md)
 *   1. synthetic: sustained pitched notes with piano-like attacks read as "no drums" (found false); the same music with kick, snare and
 *      hi-hat hits reads as drums (found true); noise on its own reads as drums; audio shorter than 5 s says nothing (null)
 *   2. the generated test songs (when generated, never committed): every song with drums reads found true; the bass stem reads false
 *   3. real paired renders on this machine (TT_PAIRED_DIR or the usual folders; skipped when absent): piano pieces read found false or unclear, never true
 *   4. domain.noDrumsFound / drumsAbsence: measured evidence of no drums wins over a pattern that has a kick; no evidence leaves the old rule
 * Thresholds were set on a handful of files, so this is a regression test, not a measurement of accuracy. */
"use strict";
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
const TM = require("../src/timemap"), TS = require("../src/timing-store"), eng = require("../src/engine")({ TimeMap: TM }), D = require("../src/domain")({ TimingStore: TS, engine: eng });
let pass = 0, fail = 0; const check = (ok, msg) => { if (ok) pass++; else { fail++; console.error("FAIL: " + msg); } };
const SR = 22050;
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
function piano(sec, bpm, drums) {
  const x = new Float32Array(Math.floor(sec * SR)), beat = 60 / bpm, chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 293.7]];
  for (let n = 0, t = 0; t < sec - 1; n++, t += beat / 2) { const f0 = chords[Math.floor(t / (4 * beat)) % 4][n % 3] * (n % 7 === 0 ? 0.5 : 1);
    for (let h = 1; h <= 6; h++) for (let i = 0, s0 = Math.floor(t * SR); i < 1.2 * SR && s0 + i < x.length; i++) x[s0 + i] += 0.18 / h * Math.exp(-i / SR * (2 + h)) * Math.sin(2 * Math.PI * f0 * h * i / SR); }
  if (drums) for (let t = 0; t < sec - 1; t += beat / 2) { const q = Math.round(t / (beat / 2)), s0 = Math.floor(t * SR);
    if (q % 4 === 0 || q % 8 === 6) for (let i = 0; i < 0.18 * SR && s0 + i < x.length; i++) x[s0 + i] += 0.8 * Math.exp(-i / SR * 25) * Math.sin(2 * Math.PI * (45 + 90 * Math.exp(-i / SR * 30)) * i / SR); // kick
    if (q % 4 === 2) for (let i = 0; i < 0.15 * SR && s0 + i < x.length; i++) x[s0 + i] += 0.6 * Math.exp(-i / SR * 28) * rnd(); // snare
    for (let i = 0; i < 0.05 * SR && s0 + i < x.length; i++) x[s0 + i] += 0.25 * Math.exp(-i / SR * 90) * (rnd() - 0.7 * rnd()); } // hat
  return x;
}
{ const a = eng.drumEvidence(piano(40, 120, false), SR), b = eng.drumEvidence(piano(40, 120, true), SR), c = eng.drumEvidence(Float32Array.from({ length: 20 * SR }, () => 0.3 * rnd()), SR);
  check(a && a.found === false && a.pAll < 0.16, `1: synthetic piano-like notes: no drums (${JSON.stringify(a)})`);
  check(b && b.found === true && b.pAll >= 0.35, `1: the same notes with kick, snare and hats: drums (${JSON.stringify(b)})`);
  check(c && c.found === true, `1: noise reads as percussive (${JSON.stringify(c)})`);
  check(eng.drumEvidence(piano(4, 120, true), SR) === null && eng.drumEvidence(new Float32Array(0), SR) === null, "1: under 5 s of audio: no verdict"); }

const ffmpeg = f => { try { const raw = cp.execFileSync("ffmpeg", ["-v", "error", "-i", f, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 30 }); return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)); } catch (e) { return null; } };
const ROOT = path.resolve(__dirname, ".."), T = f => path.join(ROOT, "test-songs", f);
if (fs.existsSync(T("pop127_Amaj.wav")) && ffmpeg(T("pop127_Amaj.wav"))) {
  const withDrums = ["pop127_Amaj.wav", "trap142_Fsmin.wav", "house124_Cmin.wav", "swing100_Dmin.wav", "lead120_Amin.wav", "fast808_142.wav", "time-fixtures/dnb_174.wav", "time-fixtures/halftime_140.wav"].filter(f => fs.existsSync(T(f)));
  const bad = withDrums.filter(f => { const r = eng.drumEvidence(ffmpeg(T(f)), SR); return !(r && r.found === true); });
  check(withDrums.length >= 6 && !bad.length, `2: every generated song with drums reads as drums (${withDrums.length} checked${bad.length ? ", not: " + bad.join(", ") : ""})`);
  if (fs.existsSync(T("stem_bass.mp3"))) { const r = eng.drumEvidence(ffmpeg(T("stem_bass.mp3")), SR); check(r && r.found === false, `2: the bass stem has no drums (${JSON.stringify(r)})`); }
} else console.log("SKIP generated songs (run npm run songs; ffmpeg needed)");
{ const dirs = (process.env.TT_PAIRED_DIR || `${process.env.HOME}/Downloads/midi-audio-5/midi+audio|${process.env.HOME}/Downloads`).split("|"), files = [];
  for (const d of dirs) try { for (const f of fs.readdirSync(d)) if (/^(more please\.mp3|big mac.*\.wav|an angel orchestrated.*\.wav|bliss.*\.wav)$/.test(f)) files.push(path.join(d, f)); } catch (e) {}
  if (!files.length) console.log("SKIP paired piano renders (not on this machine)");
  else { const res = files.map(f => [path.basename(f), eng.drumEvidence(ffmpeg(f), SR)]); check(res.every(([, r]) => r && r.found !== true), `3: piano renders are never read as drums (${res.map(([n, r]) => n + ": " + (r && r.found)).join(", ")})`); } }

{ const base = { pattern: { kick: [true, false, false, false], snare: [false, false, true, false] }, drumParts: [] };
  check(D.noDrumsFound(base) === false && D.drumsAbsence(base) === null, "4: a pattern with a kick and snare and no evidence: drums");
  const m = Object.assign({}, base, { drumEvidence: { found: false } }); check(D.noDrumsFound(m) === true && D.drumsAbsence(m) === "measured", "4: measured evidence of none wins over a pattern that has a kick");
  const t = Object.assign({}, base, { drumEvidence: { found: true } }); check(D.noDrumsFound(t) === false, "4: evidence of drums keeps them");
  const u = Object.assign({}, base, { drumEvidence: { found: null } }); check(D.noDrumsFound(u) === false, "4: unclear evidence leaves the old rule");
  const e = { pattern: { kick: [false], snare: [false] }, drumParts: [], drumEvidence: { found: true } }; check(D.noDrumsFound(e) === true && D.drumsAbsence(e) === "pattern", "4: no kick or snare step anywhere is still 'none' (pattern)"); }
console.log(`drum evidence tests: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
