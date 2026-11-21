"use strict";
/* The onset evidence the tempo candidates are fitted to.
 *
 * It is the SAME evidence src/engine.js hands to fitConstantTempo (low band + the mid band's raw onsets + half the high band, each divided by its
 * own 98th percentile; the engine builds it inside analyzeDecoded, so this copy re-derives it from the same primitives: engine.mag and
 * engine.detrend are exported). Frames: 1024-sample FFT, hop 256 at 22050 Hz, so 86.13 frames per second. The audio is the file's first channel
 * (fixtures are mono), averaged in pairs down to 22050 Hz exactly as the engine does. It is a research copy: when the engine's recipe changes this must
 * be re-checked (tests/tempo-segmentation.test.js compares the two on a fixture).
 *
 * Returns { tot, s, fps, N }:
 *   tot  the engine's evidence per frame (non-negative)
 *   s    tot reduced to "above what a grid placed at random would see": s[i] = max(tot[i-1..i+1]) - mean of that max over the whole track,
 *        then divided by the standard deviation of the result. A beat grid's score is the sum of s at its beats: 0 on average for a random grid,
 *        large and positive for a grid on the pulse.
 */
const path = require("node:path");
const TM = require(path.join(__dirname, "..", "..", "src", "timemap"));
const eng = require(path.join(__dirname, "..", "..", "src", "engine"))({ TimeMap: TM });

/* 22050 Hz mono, as the engine makes it from 44.1 kHz: the average of four samples (two stereo frames) */
function downmix(ab) {
  const L = ab.getChannelData(0), R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L, n22 = Math.floor(L.length / 2), x = new Float32Array(n22);
  for (let i = 0; i < n22; i++) { const a = (L[2 * i] + R[2 * i]) * 0.5, b = (L[2 * i + 1] + R[2 * i + 1]) * 0.5; x[i] = (a + b) * 0.5; }
  return x;
}
function evidence(ab) {
  const SR = 22050, n = 1024, hop = 256, nb = n / 2, fps = SR / hop, x = downmix(ab), n22 = x.length;
  const cur = new Float32Array(nb), prev = new Float32Array(nb), eLow = [], eMid = [], eHigh = [];
  const bLow = Math.round(150 * n / SR), bMid = Math.round(2000 * n / SR), bHigh = Math.round(5000 * n / SR);
  for (let off = 0; off + n <= n22; off += hop) {
    eng.mag(x, off, n, cur); let fl = 0, fm = 0, fh = 0;
    for (let i = 1; i < nb; i++) { const v = Math.log1p(100 * cur[i]), d = v - prev[i]; prev[i] = v; if (d > 0) { if (i <= bLow) fl += d; else if (i <= bMid) fm += d; else if (i >= bHigh) fh += d; } }
    eLow.push(fl); eMid.push(fm); eHigh.push(fh);
  }
  eLow[0] = eMid[0] = eHigh[0] = 0;
  const w = Math.round(fps * 0.4), el = eng.detrend(eLow, w), em = eng.detrend(eMid, w), eh = eng.detrend(eHigh, w);
  const q98 = e => { const f = Array.from(e).filter(v => v > 0).sort((p, q) => p - q); return f[Math.floor(f.length * 0.98)] || 1; }, qL = q98(el), qM = q98(em), qH = q98(eh);
  const N = el.length, tot = new Float32Array(N); for (let i = 0; i < N; i++) tot[i] = el[i] / qL + em[i] / qM + 0.5 * eh[i] / qH;
  return reduce(tot, fps);
}

/* From the engine-shaped evidence `tot` (also used by the unit tests on synthetic evidence) to the grid-scoring signal `s`. */
function reduce(tot, fps) {
  const N = tot.length, m3 = new Float32Array(N); let mean = 0;
  for (let i = 0; i < N; i++) { m3[i] = Math.max(tot[i - 1] || 0, tot[i], tot[i + 1] || 0); mean += m3[i]; }
  mean /= N || 1; let v = 0; for (let i = 0; i < N; i++) v += (m3[i] - mean) ** 2; const sd = Math.sqrt(v / (N || 1)) || 1;
  const s = new Float32Array(N); for (let i = 0; i < N; i++) s[i] = (m3[i] - mean) / sd;
  return { tot, s, fps, N };
}
module.exports = { evidence, reduce, downmix };
