// Track-level aggregation with bootstrap 95 % confidence intervals (resampling tracks, seeded, so reruns match).
"use strict";

function mulberry32(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function summarize(values, { B = 2000, seed = 20261117 } = {}) {
  const v = values.filter(x => x != null && Number.isFinite(x)), n = v.length;
  if (!n) return { n: 0, mean: null, ci95: null };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, mean: +mean.toFixed(4), ci95: null };
  const rnd = mulberry32(seed), means = new Float64Array(B);
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += v[Math.floor(rnd() * n)]; means[b] = s / n; }
  means.sort();
  return { n, mean: +mean.toFixed(4), ci95: [+means[Math.floor(0.025 * B)].toFixed(4), +means[Math.min(B - 1, Math.ceil(0.975 * B) - 1)].toFixed(4)] };
}

module.exports = { summarize, mulberry32 };
