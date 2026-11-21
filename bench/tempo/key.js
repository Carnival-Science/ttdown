"use strict";
/* Local key estimation and modulation detection: a feasibility experiment for the "related investigation" in issue #57 (not part of the app).
 * Observation model: chroma from the audio (65-2000 Hz, 4096-point FFT, hop 2048 at 22050 Hz) averaged over a sliding window, correlated with the 24 Krumhansl-Kessler
 * key profiles. Decoding: Viterbi over the 24 keys with a flat change penalty, so a key holds until the evidence for another is stronger than the penalty.
 * Output: stretches { t0, t1, key, margin } where margin is the mean gap between the best and second-best key correlation (a small margin = ambiguous).
 * It is evaluated apart from tempo (bench/tempo/key-run.js) because the two need not change together. */
const path = require("node:path"), TM = require(path.join(__dirname, "..", "..", "src", "timemap")), eng = require(path.join(__dirname, "..", "..", "src", "engine"))({ TimeMap: TM }), { downmix } = require("./evidence");
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KMAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], KMIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const corr = (a, b) => { const n = 12, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let u = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { u += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return u / (Math.sqrt(da * db) || 1); };
const keyName = k => NAMES[k % 12] + (k >= 12 ? " minor" : " major");
function chromaFrames(ab) {
  const x = downmix(ab), SR = 22050, n = 4096, hop = 2048, nb = n / 2, mag = new Float32Array(nb), frames = [], lo = Math.ceil(65 * n / SR), hi = Math.floor(2000 * n / SR);
  const pc = new Int32Array(nb).fill(-1); for (let k = lo; k <= hi; k++) pc[k] = ((Math.round(12 * Math.log2(k * SR / n / 440)) + 69) % 12 + 12) % 12;
  for (let off = 0; off + n <= x.length; off += hop) { eng.mag(x, off, n, mag); const c = new Float64Array(12); for (let k = lo; k <= hi; k++) c[pc[k]] += Math.sqrt(mag[k]); const s = c.reduce((p, q) => p + q, 0) || 1; frames.push(Array.from(c, v => v / s)); }
  return { frames, sec: hop / SR };
}
function localKeys(ab, o = {}) {
  const { frames, sec } = chromaFrames(ab), win = Math.round((o.windowSec ?? 8) / sec), hopW = Math.round((o.hopSec ?? 2) / sec), penalty = o.penalty ?? 0.6, T = [];
  for (let t = 0; t < frames.length; t += hopW) { const a = Math.max(0, t - (win >> 1)), b = Math.min(frames.length, t + (win >> 1)), c = new Array(12).fill(0); for (let i = a; i < b; i++) for (let p = 0; p < 12; p++) c[p] += frames[i][p];
    const sc = []; for (let k = 0; k < 24; k++) { const prof = (k >= 12 ? KMIN : KMAJ), rot = Array.from({ length: 12 }, (_, i) => prof[((i - k % 12) % 12 + 12) % 12]); sc.push(corr(c, rot)); } T.push({ t: t * sec, sc }); }
  // Viterbi: maximise sum(correlation) - penalty * changes
  let prev = T[0].sc.slice(); const back = T.map(() => new Int32Array(24));
  for (let i = 1; i < T.length; i++) { const top = prev.indexOf(Math.max(...prev)), cur = new Array(24); for (let k = 0; k < 24; k++) { const stay = prev[k], jump = prev[top] - penalty; if (stay >= jump) { cur[k] = stay + T[i].sc[k]; back[i][k] = k; } else { cur[k] = jump + T[i].sc[k]; back[i][k] = top; } } prev = cur; }
  const path = new Int32Array(T.length); let k = prev.indexOf(Math.max(...prev)); for (let i = T.length - 1; i >= 0; i--) { path[i] = k; k = back[i][k]; }
  const out = []; let a = 0; for (let i = 1; i <= T.length; i++) if (i === T.length || path[i] !== path[a]) { const margin = T.slice(a, i).reduce((s, x) => { const v = [...x.sc].sort((p, q) => q - p); return s + v[0] - v[1]; }, 0) / (i - a); out.push({ t0: T[a].t, t1: i === T.length ? T[T.length - 1].t + (o.hopSec ?? 2) : T[i].t, key: keyName(path[a]), margin: +margin.toFixed(3) }); a = i; }
  return { stretches: out, durationSec: frames.length * sec };
}
module.exports = { localKeys, keyName };
