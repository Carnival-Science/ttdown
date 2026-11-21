#!/usr/bin/env node
"use strict";
/* Tempo-map research runner (issue #57).
 *   node bench/tempo/run.js <manifest.json> [--engine predictions.json] [--only dev_step,dev_aba] [--cands const,dp,ctf,tempogram]
 *        [--lambda 12] [--gamma 0.35] [--min 8] [--kappa 0.6] [--zmin 5] [--hmin 0.5] [--anchor] [--no-ramps] [--no-coalesce] [--out DIR] [--json|--summary]
 * For each fixture: onset evidence (bench/tempo/evidence.js) -> each candidate (bench/tempo/segment.js) -> scored against the exact answer
 * (bench/tempo/score.js). --engine adds the engine's own tracked beats from a bench/run.js predictions file as the "engine" row (the baseline).
 * Candidates are NOT part of the app. Tune only on the dev manifest; look at the holdout manifest once per frozen setting. */
const fs = require("node:fs"), path = require("node:path");
const { readWav } = require("./wav"), { evidence } = require("./evidence"), S = require("./segment"), SC = require("./score");
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const manifestPath = path.resolve(args.find(a => a.endsWith(".json") && !args[args.indexOf(a) - 1]?.startsWith("--")) || ""); if (!fs.existsSync(manifestPath)) { console.error("usage: node bench/tempo/run.js <manifest.json> [--engine predictions.json] ..."); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")), mdir = path.dirname(manifestPath), only = opt("--only") ? opt("--only").split(",") : null;
const cands = (opt("--cands", "const,dp,ctf,tempogram")).split(",");
const P = { lambda: +opt("--lambda", 12), gamma: +opt("--gamma", 0.35), minSec: +opt("--min", 8), kappa: +opt("--kappa", 0.6), stepSec: +opt("--step", 2), prior: +opt("--prior", 0), windowSec: +opt("--window", 12), zmin: +opt("--zmin", 5), hmin: +opt("--hmin", 0.5) };
const engPred = opt("--engine") ? Object.fromEntries(JSON.parse(fs.readFileSync(opt("--engine"), "utf8")).tracks.map(t => [t.id, t])) : null;
const rows = [];
for (const tr of manifest.tracks) {
  if (only && !only.includes(tr.id)) continue;
  const T = SC.loadTruth(mdir, tr), ab = readWav(path.join(mdir, tr.audio)), t0 = Date.now(), ev = evidence(ab), comb = new S.Comb(ev, { gamma: P.gamma, prior: P.prior }), tEv = Date.now() - t0;
  const row = { id: tr.id, kind: tr.tags.tempo_behaviour, dur: +ab.duration.toFixed(1), evidenceMs: tEv, results: {} };
  if (engPred && engPred[tr.id] && engPred[tr.id].grid) { const e = SC.fromBeats(engPred[tr.id].grid.beats); row.results.engine = { ...SC.score(T, e, engPred[tr.id].runtimeMs), variable: e.variable, source: engPred[tr.id].grid.source }; }
  for (const name of cands) {
    const t1 = Date.now(); const res = name === "const" ? S.constant(comb) : name === "dp" ? S.dp(comb, P) : name === "ctf" ? S.ctf(comb, P) : S.tempogram(comb, P);
    if (name !== "const" && !args.includes("--no-coalesce")) Object.assign(res, S.coalesce(comb, res));
    if (!args.includes("--no-ramps") && name !== "const") Object.assign(res, S.withRamps(comb, res, P));
    res.segs.forEach(f => { f.unknown = f.z < P.zmin; });
    const anchor = args.includes("--anchor") && engPred && engPred[tr.id] && engPred[tr.id].full ? engPred[tr.id].full.bpm : 0; // --anchor: fold octaves to the engine's own tempo (needs --engine)
    if (anchor) Object.assign(res, S.foldOctaves(comb, res, anchor));
    // a stretch whose best grid does not stand out from the tempo scan (z below zmin) is reported as unknown, not as a tempo
    res.segs.forEach(f => { f.hit = comb.hitRate(f); f.unknown = f.z < P.zmin; }); // hit rate only gates ramps (withRamps): a half-time or partly drumless stretch hits few beats and is still a tempo
    const ms = Date.now() - t1 + tEv, pred = SC.fromSegments(comb, res.segs);
    row.results[name] = { ...SC.score(T, pred, ms), segs: res.segs.map(f => ({ ramp: f.ramp || undefined, unknown: f.unknown || undefined, t0: +(f.a / comb.fps).toFixed(1), t1: +(f.b / comb.fps).toFixed(1), bpm: f.ramp ? `${f.bpm0.toFixed(1)}->${f.bpm1.toFixed(1)}` : +f.bpm.toFixed(2), z: +f.z.toFixed(1), hit: +f.hit.toFixed(2) })) };
  }
  rows.push(row); process.stderr.write(`${tr.id} ${Object.entries(row.results).map(([k, v]) => k + " F" + v.beatF + " n" + v.nChanges).join("  ")}\n`);
}
const outFile = opt("--out-file"); if (outFile) { fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify({ manifest: path.relative(process.cwd(), manifestPath), params: P, flags: args.filter(a => a.startsWith("--") && !a.startsWith("--out")), rows }, null, 1)); }
const outDir = opt("--out"); if (outDir) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, "tempo-map-results.json"), JSON.stringify({ manifest: path.relative(process.cwd(), manifestPath), params: P, rows }, null, 1)); }
const R = require("./report"), names = [...(engPred ? ["engine"] : []), ...cands];
if (args.includes("--json")) console.log(JSON.stringify({ params: P, rows }, null, 1)); else if (args.includes("--summary")) console.log(R.summary(rows, names)); else console.log(R.table(rows, cands, !!engPred, P));
