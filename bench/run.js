#!/usr/bin/env node
// Runs the analyzer on every track in a manifest and saves its raw predictions. No scoring here (see score.js).
//
//   node bench/run.js <manifest.json> [--out DIR] [--page index.html] [--target legacy|svelte] [--build bench]
//   --target picks the build that is measured (lib/target.js): the legacy page from file:// (default), or the compiled
//   Svelte app over localhost (refuses until that app runs the analysis engine, migration M3).
//   node bench/run.js <holdout-manifest.json> --holdout --out <DIR outside repo> --operator NAME [--reason TEXT]
//
// Everything is checked BEFORE the browser starts, and any failure stops the run (exit 2):
//   holdout rules (lib/holdout.js), the manifest's annotation requirements (lib/requirements.js), audio sha256,
//   and annotation sha256 (so a changed answer file can't silently change results).
// A holdout run appends to the custody log `holdout-runs.jsonl` next to the holdout manifest.
"use strict";
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const { provenance, sha256File } = require("./lib/provenance");
const { holdoutGuard } = require("./lib/holdout");
const { checkRequirements, annotationIntegrity } = require("./lib/requirements");
const { createTarget } = require("./lib/target");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2), VALUED = ["--out", "--page", "--operator", "--reason", "--target", "--build"];
const flag = n => args.includes(n), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const manifestArg = args.find((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1]));
const stop = msg => { console.error(msg); process.exit(2); };
if (!manifestArg || !manifestArg.endsWith(".json") || !fs.existsSync(manifestArg)) stop("usage: node bench/run.js <manifest.json> [--out DIR] [--page index.html] [--holdout --operator NAME [--reason TEXT]]");
const manifestPath = path.resolve(manifestArg), manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")), mdir = path.dirname(manifestPath), HOLDOUT = flag("--holdout");
const PAGE = opt("--page", "index.html"), OUT = path.resolve(opt("--out", path.join(ROOT, "bench", "out", `${manifest.name || "run"}-${HOLDOUT ? "holdout" : "dev"}`)));
const rel = path.relative(ROOT, OUT), outsideRepo = rel.startsWith("..") || path.isAbsolute(rel);
const prov = provenance(ROOT), pageSha256 = sha256File(path.join(ROOT, PAGE));
let target; try { target = createTarget({ kind: opt("--target", "legacy"), root: ROOT, page: PAGE, build: opt("--build", "bench") }); } catch (e) { stop(e.message); }
if (!target.canAnalyze) stop(`Not starting: target "${target.kind}" cannot analyse: the Svelte app does not run the analysis engine yet (migration M3). No predictions are produced for it.`);
const LOG = path.join(mdir, "holdout-runs.jsonl");
const log = HOLDOUT && fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];

// 1. holdout rules
const g = holdoutGuard({ holdout: HOLDOUT, splits: new Set(manifest.tracks.map(t => t.split)), outsideRepo, operator: opt("--operator"), gitDirty: prov.gitDirty, pageSha256, log, reason: opt("--reason") });
if (!g.ok) stop(g.msg);
const tracks = manifest.tracks;
if (!tracks.length) stop("No tracks to run.");
// 2. required annotation coverage and checksums
const req = checkRequirements(manifest, tracks, mdir);
// 3. audio and annotation integrity
const pre = [];
for (const t of tracks) {
  const audio = path.resolve(mdir, t.audio);
  if (!fs.existsSync(audio)) { pre.push(`${t.id}: audio missing (${t.audio})`); continue; }
  const sha = sha256File(audio); t.__audioSha = sha;
  if (t.sha256 && t.sha256 !== sha) pre.push(`${t.id}: audio changed (manifest ${t.sha256.slice(0, 12)}…, file ${sha.slice(0, 12)}…)`);
  const ai = annotationIntegrity(t, mdir); t.__annotationSha = ai.hashes; pre.push(...ai.problems);
}
const problems = [...req.problems, ...pre];
if (problems.length) stop(`Not starting: ${problems.length} problem(s) found before running.\n  ` + (HOLDOUT ? `${problems.length} holdout problem(s); details withheld from the console. Check the holdout files.` : problems.join("\n  ")));

const say = (...a) => { if (!HOLDOUT) console.log(...a); };
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const { chromium } = require("playwright");
  const b = await chromium.launch(), records = [];
  if (HOLDOUT) fs.appendFileSync(LOG, JSON.stringify({ date: new Date().toISOString(), operator: opt("--operator"), reason: opt("--reason") || null, headSha: prov.headSha, pageSha256, manifestSha256: sha256File(manifestPath), tracks: tracks.length, out: OUT }) + "\n");
  for (const t of tracks) {
    // pageErrors = uncaught exceptions in the app: they fail the benchmark (metrics kept for diagnosis).
    // console warnings / console.error lines (e.g. a font that can't load offline) are recorded separately and don't.
    const rec = { id: t.id, split: t.split, status: "ok", pageErrors: [], console: { warning: 0, error: 0, samples: [] }, sha256: t.__audioSha, annotationSha256: t.__annotationSha };
    const p = await b.newPage(); p.on("pageerror", e => rec.pageErrors.push(String(e)));
    p.on("console", m => { const ty = m.type(); if (ty === "warning" || ty === "error") { rec.console[ty]++; if (rec.console.samples.length < 5) rec.console.samples.push(`${ty}: ${m.text().slice(0, 200)}`); } });
    await target.analyzeTrack(p, path.resolve(mdir, t.audio), rec);
    records.push(rec); await p.close();
    say(`${t.id} | ${rec.status}${rec.full ? ` | ${rec.full.bpm} BPM, ${rec.full.key}` : ""} | ${(rec.runtimeMs / 1000).toFixed(1)}s${rec.pageErrors.length ? ` | PAGE ERRORS ${rec.pageErrors.length}` : ""}`);
  }
  const out = { kind: "track-teardown-predictions", version: 2, date: new Date().toISOString(),
    manifest: { path: path.relative(ROOT, manifestPath).replace(/\\/g, "/"), name: manifest.name, version: manifest.version, annotationProtocol: manifest.annotationProtocol || null, sha256: sha256File(manifestPath) },
    split: HOLDOUT ? "holdout" : "dev", page: PAGE, pageSha256, ...prov, node: process.version, browser: b.version(), os: `${os.platform()} ${os.release()}`, coverage: req.coverage, tracks: records, target: target.describe() };
  fs.writeFileSync(path.join(OUT, "predictions.json"), JSON.stringify(out));
  await b.close();
  const bad = records.filter(r => r.status !== "ok" || r.pageErrors.length).length;
  console.log(`${records.length} tracks run, ${bad} with problems. Predictions: ${path.relative(process.cwd(), path.join(OUT, "predictions.json"))}`);
  if (bad) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
