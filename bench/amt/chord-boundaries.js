#!/usr/bin/env node
/* WHERE the app's chord regions start, against an annotation's chord changes (research for #26; not a gate, not in CI). For every annotated
 * change inside the annotated ranges it takes the reading's region boundary nearest in time, and reports the signed error (positive =
 * the reading starts the chord LATE, negative = EARLY) in milliseconds, with how many of the reading's boundaries have no annotated
 * change near them. The audio and the capture stay outside the repository (bench/amt/app-chord-check.js writes the capture).
 *
 *   node bench/amt/chord-boundaries.js --capture capture.json --annotation ann.json [--baseline-repo DIR] [--window 0.3] [--list]
 * A boundary is matched to a change only within --window seconds (default 0.3 = about one 8th note at 105 BPM); changes with no boundary
 * that close count as missed, and the median / mean absolute error is over the matched ones. Chord names are not compared here: this
 * measures timing alone, so it cannot reward a reading for a wrong chord. */
"use strict";
const fs = require("node:fs"), path = require("node:path");
const a = process.argv.slice(2), opt = n => { const i = a.indexOf(n); return i < 0 ? undefined : a[i + 1]; }, ROOT = path.resolve(__dirname, "..", "..");
if (!opt("--capture") || !opt("--annotation")) { console.error("usage: chord-boundaries.js --capture capture.json --annotation ann.json [--baseline-repo DIR] [--window S] [--list]"); process.exit(2); }
const W = +(opt("--window") || 0.3), cap = JSON.parse(fs.readFileSync(opt("--capture"), "utf8")), ann = JSON.parse(fs.readFileSync(opt("--annotation"), "utf8"));
const { prepare } = require("./chord-scoring"), P = prepare(ann);
const reader = dir => { const r = p => require(path.join(dir, "src", p)), TM = r("timemap"), TS = r("timing-store"), eng = r("engine")({ TimeMap: TM }); return { TM, D: r("domain")({ TimingStore: TS, engine: eng }) }; };
const med = v => { const s = v.slice().sort((x, y) => x - y); return s.length ? (s[s.length >> 1] + s[(s.length - 1) >> 1]) / 2 : NaN; };
function run(label, R) {
  const an = { ...cap.analysis }, G = R.TM.forAnalysis(an), res = R.D.chordRegionsFromNotes(an, G, cap.notes); if (!res) throw new Error(label + ": no reading");
  const reg = res.regions.filter(x => x.c !== "–"), starts = reg.map(x => x.t0);
  const ref = P.segs.map(s => s.t0).filter(t => !P.ranges.some(r => Math.abs(t - r.t0) < 0.05));   // each range's first chord has nothing before it
  const rows = ref.map(t => { let best = null; for (const s of starts) if (Math.abs(s - t) <= W && (best === null || Math.abs(s - t) < Math.abs(best - t))) best = s; return { t, err: best === null ? null : (best - t) * 1000 }; });
  const got = rows.filter(r => r.err !== null).map(r => r.err), near = s => ref.some(t => Math.abs(s - t) <= W), inR = P.ranges, extra = starts.filter(s => inR.some(r => s >= r.t0 && s < r.t1) && !near(s));
  console.log(`${label}: ${got.length}/${ref.length} annotated changes have a boundary within ${W * 1000} ms; signed error median ${med(got).toFixed(0)} ms, mean abs ${(got.reduce((x, y) => x + Math.abs(y), 0) / (got.length || 1)).toFixed(0)} ms; ${got.filter(e => e < -20).length} early (> 20 ms), ${got.filter(e => e > 20).length} late, ${got.filter(e => Math.abs(e) <= 20).length} within 20 ms; ${extra.length} boundaries with no annotated change near them`);
  if (a.includes("--list")) rows.forEach(r => console.log(`  annotated ${r.t.toFixed(3)} s  ${r.err === null ? "no boundary" : (r.err >= 0 ? "+" : "") + r.err.toFixed(0) + " ms"}`));
  return got;
}
run("this checkout", reader(ROOT)); if (opt("--baseline-repo")) run("baseline     ", reader(path.resolve(opt("--baseline-repo"))));
