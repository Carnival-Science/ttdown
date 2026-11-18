#!/usr/bin/env node
// Evaluates the melody-transcription fixtures (and optionally N seeded random cases) with bench/lib/transcription.js and prints JSON, so an
// independent implementation (bench/crosscheck_transcription.py, mir_eval) can recompute every case from the same inputs.
//   node bench/lib/transcription-cli.js [--random N] [--seed S]
"use strict";
const T = require("./transcription"), { cases, frameCases } = require("../../tests/fixtures/transcription-cases");
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? Number(args[i + 1]) : d; };
let seed = opt("--seed", 20261118); const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const all = cases.concat(frameCases).map(c => ({ ...c, source: "fixture" }));
for (let k = 0; k < opt("--random", 0); k++) { // random reference phrase; estimate = jittered copy with misses, extras, octave and pitch errors, and notes near the tolerance edges
  const nRef = 1 + Math.floor(rnd() * 12), ref = []; let t = 0.5 + rnd();
  for (let i = 0; i < nRef; i++) { const d = 0.08 + rnd() * 0.9; ref.push({ onset: +t.toFixed(4), offset: +(t + d).toFixed(4), midi: 55 + Math.floor(rnd() * 20) + (rnd() < 0.3 ? 0.5 * Math.floor(rnd() * 3) : 0) }); t += d + (rnd() < 0.4 ? rnd() * 0.3 : 0); }
  const est = [];
  for (const n of ref) {
    if (rnd() < 0.15) continue; const j = () => (rnd() - 0.5) * 0.12, on = n.onset + j();
    est.push({ onset: +on.toFixed(4), offset: +(Math.max(on + 0.04, n.offset + j() * 2)).toFixed(4), midi: n.midi + (rnd() < 0.2 ? 12 * (rnd() < 0.5 ? 1 : -1) : rnd() < 0.2 ? [0.4, 0.5, 0.6, 1][Math.floor(rnd() * 4)] : 0) });
    if (rnd() < 0.15) est.push({ onset: +(on + 0.03).toFixed(4), offset: +(on + 0.2).toFixed(4), midi: n.midi });
  }
  if (rnd() < 0.3) est.push({ onset: +(t + rnd()).toFixed(4), offset: +(t + 1.5).toFixed(4), midi: 60 });
  all.push({ name: `random ${k}`, source: "random", dur: +(t + 3).toFixed(2), ref, est });
}
const out = all.map(c => {
  const inside = x => !c.regions || c.regions.some(r => x >= r.start && x < r.end), keep = l => l.filter(x => inside(x.onset));
  return { name: c.name, source: c.source, dur: c.dur, regions: c.regions || null, ref: c.ref, est: c.est,
    ns: c.ref.series ? null : T.noteScores(keep(c.est), keep(c.ref)),
    fr: T.frameScores(c.est, c.ref.series ? c.ref : { notes: c.ref }, { duration: c.dur, regions: c.regions || null }) };
});
console.log(JSON.stringify(out));
