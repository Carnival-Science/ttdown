#!/usr/bin/env node
// Phase 2c measurement: for each timeline consumer that has moved onto TimeMap, how far its musical times are from the annotated truth,
// before (the legacy fixed grid: firstDown + bar * barSec, 60 / bpm beats) and after (TimeMap.forAnalysis), computed from the PINNED
// Version A predictions (bench/baselines/version-a), so the engine is held constant and only the consumer changes.
//   node bench/timing-consumers.js            prints the tables
//   node bench/timing-consumers.js --json     machine-readable (used by tests/timing-consumers.test.js)
// Consumers measured: ruler (bar starts) and metronome (beat clicks). Needs the generated songs and annotations (npm run songs, songs:time).
"use strict";
const fs = require("node:fs"), path = require("node:path");
const TM = require("../src/timemap"), { loadTruth } = require("./lib/loaders");
const ROOT = path.resolve(__dirname, ".."), WIN = 0.07;
const SETS = [
  { name: "regression", manifest: "test-songs/manifest.json", preds: "bench/baselines/version-a/predictions.json" },
  { name: "time-fixtures", manifest: "test-songs/time-fixtures/manifest.json", preds: "bench/baselines/version-a/time-fixtures/predictions.json" }
];
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

// how well a set of predicted times covers the true times: share of true times with a prediction within `tol`, and the error among those
function cover(pred, truth, tol) {
  const P = pred.slice().sort((a, b) => a - b); let j = 0; const errs = [];
  for (const t of truth) { while (j + 1 < P.length && Math.abs(P[j + 1] - t) <= Math.abs(P[j] - t)) j++; errs.push(P.length ? Math.abs(P[j] - t) : Infinity); }
  const within = errs.filter(e => e <= tol).length;
  return { n: truth.length, within70: +(within / (truth.length || 1)).toFixed(4), within20: +(errs.filter(e => e <= 0.02).length / (truth.length || 1)).toFixed(4), medianMs: errs.length ? +(1000 * median(errs)).toFixed(1) : null, maxMs: errs.length ? +(1000 * Math.max(...errs)).toFixed(1) : null };
}
function run() {
  const rows = [];
  for (const S of SETS) {
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, S.manifest), "utf8")), mdir = path.dirname(path.join(ROOT, S.manifest)), P = JSON.parse(fs.readFileSync(path.join(ROOT, S.preds), "utf8"));
    for (const rec of P.tracks) {
      const t = man.tracks.find(x => x.id === rec.id); if (!t || rec.status !== "ok") continue;
      const T = loadTruth(t, mdir), a = Object.assign({}, rec.full); a.grid = rec.grid; // the analyzer's result as the page holds it
      const G = TM.forAnalysis(a), dur = a.duration, fd = a.firstDown || 0;
      const oldBars = [], newBars = [];
      for (let b = 0; fd + b * a.barSec <= dur; b++) if (fd + b * a.barSec >= 0) oldBars.push(fd + b * a.barSec); // legacy ruler: only ticks at t >= 0
      for (let b = 0; G.barStart(b) <= dur; b++) if (G.barStart(b) >= -0.05) newBars.push(Math.max(0, G.barStart(b))); // the ruler draws a bar up to 50 ms before 0:00 at 0
      const oldBeats = []; for (let k = Math.ceil(-fd / (60 / a.bpm)); fd + k * (60 / a.bpm) <= dur; k++) oldBeats.push(fd + k * (60 / a.bpm)); const newBeats = G.beats(0, dur).map(x => Math.max(0, x.t)); // played from 0, a beat up to 20 ms before it is clicked at 0
      rows.push({ set: S.name, id: rec.id, kind: G.kind, reason: G.reason,
        ruler: { old: cover(oldBars, T.downbeats || [], WIN), new: cover(newBars, T.downbeats || [], WIN) },
        metronome: { old: cover(oldBeats, T.beats || [], WIN), new: cover(newBeats, T.beats || [], WIN) } });
    }
  }
  return rows;
}
// verdict per track and consumer: "improved" / "regressed" / "unchanged" by share of true times within 70 ms (2 percentage points of slack), then by max error
function verdict(o, n) {
  const d = n.within70 - o.within70; if (d > 0.02) return "improved"; if (d < -0.02) return "regressed";
  if (n.within20 - o.within20 > 0.05) return "improved"; if (n.within20 - o.within20 < -0.05) return "regressed"; return "unchanged";
}
if (require.main === module) {
  const rows = run(); if (process.argv.includes("--json")) { console.log(JSON.stringify(rows)); process.exit(0); }
  for (const c of ["ruler", "metronome"]) {
    console.log(`\n### ${c}: share of TRUE ${c === "ruler" ? "downbeats" : "beats"} with a drawn/clicked time within 70 ms (and 20 ms), median / max error; legacy grid -> TimeMap\n`);
    console.log("| Set | Track | Grid used | Within 70 ms | Within 20 ms | Median / max error (ms) | Verdict |"); console.log("|---|---|---|---|---|---|---|");
    for (const r of rows) { const o = r[c].old, n = r[c].new; console.log(`| ${r.set} | ${r.id} | ${r.kind}${r.reason ? " (" + r.reason + ")" : ""} | ${o.within70.toFixed(2)} → ${n.within70.toFixed(2)} | ${o.within20.toFixed(2)} → ${n.within20.toFixed(2)} | ${o.medianMs} / ${o.maxMs} → ${n.medianMs} / ${n.maxMs} | ${verdict(o, n)} |`); }
  }
}
module.exports = { run, verdict, cover };
