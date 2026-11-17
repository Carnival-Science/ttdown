#!/usr/bin/env node
// G1-H acceptance check: the manifest-driven harness must reproduce G0's benchmark exactly wherever both compute
// the same thing (tempo, tracked and exported beat/downbeat matching, exact key, 16-step drum pattern counts).
//
//   node bench/parity.js [g0-record.json] [scores.json]
//   defaults: newest tests/out/benchmark-*.json and bench/out/synthetic/scores.json
"use strict";
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const newest = dir => { const f = fs.readdirSync(dir).filter(n => /^benchmark-.*\.json$/.test(n)).sort().pop(); return f ? path.join(dir, f) : null; };
const g0Path = process.argv[2] || newest(path.join(ROOT, "tests", "out")), g1Path = process.argv[3] || path.join(ROOT, "bench", "out", "synthetic", "scores.json");
if (!g0Path || !fs.existsSync(g0Path) || !fs.existsSync(g1Path)) { console.error("Need a G0 record (npm run benchmark) and G1 scores (npm run bench:synthetic)."); process.exit(2); }
const G0 = JSON.parse(fs.readFileSync(g0Path, "utf8")), G1 = JSON.parse(fs.readFileSync(g1Path, "utf8"));
const g1 = Object.fromEntries(G1.tracks.map(t => [t.id, t]));

let checks = 0, fails = 0;
const eq = (what, a, b) => { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log(`MISMATCH ${what}: G0 ${JSON.stringify(a)} vs G1 ${JSON.stringify(b)}`); } };
const near = (what, a, b, tol) => { checks++; if (a == null && b == null) return; if (a == null || b == null || Math.abs(a - b) > tol) { fails++; console.log(`MISMATCH ${what}: G0 ${a} vs G1 ${b} (tolerance ${tol})`); } };
const pick = e => e && { tp: e.tp, fp: e.fp, fn: e.fn, f: e.f };

for (const t of G0.tracks) {
  const u = g1[t.id]; if (!u || !u.metrics) { checks++; fails++; console.log(`MISSING ${t.id} in G1 scores`); continue; }
  const a = t.metrics, b = u.metrics;
  eq(`${t.id} sha256`, t.sha256, (JSON.parse(fs.readFileSync(path.join(path.dirname(g1Path), "predictions.json"), "utf8")).tracks.find(x => x.id === t.id) || {}).sha256);
  eq(`${t.id} tempo`, { acc1: a.tempo.acc1, acc2: a.tempo.acc2, absErr: a.tempo.absErr }, { acc1: b.tempo.acc1, acc2: b.tempo.acc2, absErr: b.tempo.absErr });
  for (const [k0, k1] of [["trackedBeats", "beats"], ["trackedDownbeats", "downbeats"], ["exportBeats", "exportBeats"], ["exportDownbeats", "exportDownbeats"]]) {
    eq(`${t.id} ${k1}`, pick(a[k0]), pick(b[k1]));
    // G0 placed true beats at exact times, G1 at the sample where the sound starts (< 23 µs apart): timing may differ by rounding
    if (a[k0] && b[k1]) near(`${t.id} ${k1} meanErrMs`, a[k0].meanErrMs, b[k1].meanErrMs, 0.15);
  }
  if (a.key) eq(`${t.id} key exact`, a.key.exact, b.key.exact);
  for (const k of ["kick", "snare", "hats"]) if (a[k]) eq(`${t.id} ${k} 16-step counts`, a[k], b.drumSteps && b.drumSteps[k]);
}
console.log(`parity: ${checks - fails}/${checks} checks match (G0 ${path.relative(ROOT, g0Path)} vs G1 ${path.relative(ROOT, g1Path)})`);
process.exitCode = fails ? 1 : 0;
