#!/usr/bin/env node
// One table for a time-model fixture run: what the analyzer got wrong, and what TimeMap (built from the analyzer's own tracked
// grid) can and cannot see. Reporting only; nothing here gates anything.
//   node bench/time-fixtures-summary.js <run-dir>        (a dir holding predictions.json and scores.json from bench/run.js + score.js)
"use strict";
const fs = require("node:fs"), path = require("node:path");
const TM = require("../src/timemap");
const dir = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(dir, "scores.json"))) { console.error("usage: node bench/time-fixtures-summary.js <run-dir with predictions.json and scores.json>"); process.exit(2); }
const P = JSON.parse(fs.readFileSync(path.join(dir, "predictions.json"), "utf8")), S = JSON.parse(fs.readFileSync(path.join(dir, "scores.json"), "utf8"));
const rec = Object.fromEntries(P.tracks.map(t => [t.id, t])), f2 = v => v == null ? "–" : Number(v).toFixed(2);

const rows = S.tracks.map(s => {
  const m = s.metrics || {}, c = s.classes || {}, r = rec[s.id];
  let view = { constant: "–", changes: "–", elig: "–", grid: "–" };
  try {
    const tm = TM.fromGrid(r.grid, { duration: r.full.duration, meter: { beatsPerBar: 4, status: "assumed" } }), tp = tm.tempo(), e = tm.exportEligibility();
    view = { constant: tp.isConstant ? "yes" : `no (±${(tp.maxDeviation * 100).toFixed(1)} %)`, changes: String(tp.changes.length), grid: tp.constantGrid.maxDeviationMs.toFixed(0) + " ms", elig: e.eligible ? "allowed" + (e.caveats.filter(c => !/assumed/.test(c)).length ? " (" + e.caveats.filter(c => !/assumed/.test(c)).join("; ") + ")" : "") : "refused: " + e.reasons.join(", ") };
  } catch (e) { view.elig = "no map: " + (e.code || e.message); }
  const d = m.drift, drift = d ? (d.maxAbsMs >= 1000 ? (d.maxAbsMs / 1000).toFixed(1) + " s" : Math.round(d.maxAbsMs) + " ms") : "–";
  return `| ${s.id} | ${m.tempo ? +m.tempo.ref.toFixed(1) + " → " + +m.tempo.est.toFixed(1) + " (" + c.tempo + ")" : "–"} | ${f2(m.beats && m.beats.f)} | ${f2(m.downbeats && m.downbeats.f)} | ${f2(m.exportBeats && m.exportBeats.f)} | ${drift} (${c.exportGrid}) | ${f2(m.drums && m.drums.kick.w50.f)} / ${f2(m.drums && m.drums.snare.w50.f)} | ${f2(m.chords && m.chords.majmin)} | ${view.constant} | ${view.changes} | ${view.grid} | ${view.elig} |`;
});
console.log("| Fixture | Tempo truth → est (class) | Tracked beat F | Tracked downbeat F | Exported-grid beat F | Exported-grid max drift (class) | Kick / snare F (exported MIDI, ±50 ms) | Chords maj/min | TimeMap: local tempo steady? | TimeMap: tempo changes | TimeMap: best constant grid vs tracked beats (max) | TimeMap: export |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
rows.forEach(r => console.log(r));
