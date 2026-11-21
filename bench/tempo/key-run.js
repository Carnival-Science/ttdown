#!/usr/bin/env node
"use strict";
/* Key-modulation feasibility run: node bench/tempo/key-run.js test-songs/tempo-map-fixtures/manifest-key.json [--penalty 0.6] [--window 8] [--split dev|holdout]
 * Scores per fixture against truth/<id>.keymap.json (bars at 128 BPM, 4/4, 1.875 s each): time-weighted exact key accuracy, accuracy counting the relative major/minor
 * as right, modulation boundary error, false modulations on constant-key fixtures, and ambiguity (mean best-vs-second correlation margin). Synthetic; n is tiny. */
const fs = require("node:fs"), path = require("node:path"), { readWav } = require("./wav"), { localKeys } = require("./key");
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const mp = path.resolve(args.find(a => a.endsWith(".json"))), man = JSON.parse(fs.readFileSync(mp, "utf8")), dir = path.dirname(mp), split = opt("--split", null), BAR = 4 * 60 / 128;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], idx = k => { const [n, m] = k.split(" "); return NAMES.indexOf(n) + (m === "minor" ? 12 : 0); };
const rel = k => { const i = idx(k); return i >= 12 ? (i - 12 + 3) % 12 : ((i + 9) % 12) + 12; };
const rows = [];
for (const tr of man.tracks) { if (split && tr.tags.tempo_map_split !== split) continue;
  const truth = JSON.parse(fs.readFileSync(path.join(dir, tr.annotations.keymap), "utf8")).segments, ab = readWav(path.join(dir, tr.audio)), t0 = Date.now(), res = localKeys(ab, { penalty: +opt("--penalty", 0.6), windowSec: +opt("--window", 8) }), ms = Date.now() - t0;
  const at = t => res.stretches.find(s => t >= s.t0 && t < s.t1) || res.stretches[res.stretches.length - 1], tk = t => { const b = t / BAR; return truth.find(s => b >= s.startBar && b < s.endBar) || truth[truth.length - 1]; };
  let n = 0, ex = 0, rl = 0; const end = Math.min(ab.duration, 32 * BAR) - 2; for (let t = 2; t < end; t += 0.5) { n++; const p = at(t).key, q = tk(t).key; if (p === q) ex++; if (p === q || idx(p) === rel(q)) rl++; }
  const mods = truth.slice(1).map(s => s.startBar * BAR), found = res.stretches.slice(1).map(s => s.t0), hit = mods.map(m => found.find(f => Math.abs(f - m) <= 8)), extra = found.filter(f => !mods.some(m => Math.abs(f - m) <= 8)).length;
  rows.push({ id: tr.id, split: tr.tags.tempo_map_split, truth: truth.map(s => s.key).join(" > "), found: res.stretches.map(s => s.key).join(" > "), exact: +(ex / n).toFixed(3), relativeOk: +(rl / n).toFixed(3), modulations: mods.length, found_: hit.filter(Boolean).length, boundaryErrS: hit.filter(Boolean).length ? +(hit.filter(Boolean).reduce((s, f, i) => s + Math.abs(f - mods[mods.findIndex((_, j) => hit[j] === f)]), 0) / hit.filter(Boolean).length).toFixed(1) : null, falseMods: extra, margin: +(res.stretches.reduce((s, x) => s + x.margin * (x.t1 - x.t0), 0) / res.durationSec).toFixed(3), ms }); }
console.log("| Fixture | split | truth | found | exact | relative-tolerant | modulations found / truth | boundary err s | false modulations | mean margin | ms |\n|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.id} | ${r.split} | ${r.truth} | ${r.found} | ${r.exact} | ${r.relativeOk} | ${r.found_} / ${r.modulations} | ${r.boundaryErrS ?? "-"} | ${r.falseMods} | ${r.margin} | ${r.ms} |`);
if (args.includes("--json")) fs.writeFileSync(opt("--json"), JSON.stringify({ penalty: +opt("--penalty", 0.6), window: +opt("--window", 8), rows }, null, 1));
