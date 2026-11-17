#!/usr/bin/env node
// Runs the analyzer on every track in a manifest and saves its raw predictions. No scoring here (see score.js).
//
//   node bench/run.js <manifest.json> [--out DIR] [--page index.html] [--holdout]
//
// Without --holdout, holdout tracks are skipped. With --holdout, ONLY holdout tracks run, the output folder must
// be outside this repository, and the console shows no per-track detail, so holdout results can't leak into tuning.
"use strict";
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const { chromium } = require("playwright");
const { provenance, sha256File } = require("./lib/provenance");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2), flag = n => args.includes(n), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const manifestPath = path.resolve(args.find(a => !a.startsWith("--") && !["--out", "--page"].includes(args[args.indexOf(a) - 1])) || "");
if (!fs.existsSync(manifestPath) || !manifestPath.endsWith(".json")) { console.error("usage: node bench/run.js <manifest.json> [--out DIR] [--page index.html] [--holdout]"); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")), mdir = path.dirname(manifestPath), HOLDOUT = flag("--holdout");
const PAGE = opt("--page", "index.html"), OUT = path.resolve(opt("--out", path.join(ROOT, "bench", "out", `${manifest.name || "run"}-${HOLDOUT ? "holdout" : "dev"}`)));
const insideRepo = !path.relative(ROOT, OUT).startsWith("..") && !path.isAbsolute(path.relative(ROOT, OUT));
if (HOLDOUT && insideRepo) { console.error(`Holdout results must be written outside the repository (got ${OUT}).`); process.exit(2); }

const tracks = manifest.tracks.filter(t => HOLDOUT ? t.split === "holdout" : t.split !== "holdout");
const skipped = manifest.tracks.length - tracks.length;
if (!tracks.length) { console.error("No tracks to run."); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const say = (...a) => { if (!HOLDOUT) console.log(...a); };

(async () => {
  const b = await chromium.launch(), records = [];
  for (const t of tracks) {
    const audio = path.resolve(mdir, t.audio), rec = { id: t.id, split: t.split, status: "ok", pageErrors: [] };
    if (!fs.existsSync(audio)) { rec.status = "missing-audio"; records.push(rec); say(`${t.id} | MISSING ${audio}`); continue; }
    rec.sha256 = sha256File(audio);
    if (t.sha256 && t.sha256 !== rec.sha256) { rec.status = "checksum-mismatch"; records.push(rec); say(`${t.id} | CHECKSUM MISMATCH (manifest ${t.sha256.slice(0, 12)}…, file ${rec.sha256.slice(0, 12)}…)`); continue; }
    const p = await b.newPage(); p.on("pageerror", e => rec.pageErrors.push(String(e)));
    await p.goto(`file://${ROOT}/${PAGE}#teardown`); await p.waitForTimeout(300);
    const t0 = Date.now();
    await p.setInputFiles("#file", audio);
    try { await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 600000 }); }
    catch (e) { rec.status = "timeout"; }
    rec.runtimeMs = Date.now() - t0;
    if (rec.status === "ok") {
      const r = await p.evaluate(() => {
        const st = document.querySelector("#status").textContent; if (/Couldn/.test(st)) return { failed: st };
        const a = window.__td, N = window.__sn(a);
        return { full: JSON.parse(JSON.stringify(a)), grid: a.grid || null,
          exported: { stepSec: N.stepSec, kick: N.D.kick.map(n => n.t), snare: N.D.snare.map(n => n.t), hats: N.D.hats.map(n => n.t), bass: N.bass.map(n => ({ t: n.t, dur: n.dur, midi: n.midi })) } };
      });
      if (r.failed) { rec.status = "analysis-failed"; rec.message = r.failed.slice(0, 200); }
      else Object.assign(rec, r);
    }
    records.push(rec); await p.close();
    say(`${t.id} | ${rec.status}${rec.full ? ` | ${rec.full.bpm} BPM, ${rec.full.key}` : ""} | ${(rec.runtimeMs / 1000).toFixed(1)}s${rec.pageErrors.length ? ` | PAGE ERRORS ${rec.pageErrors.length}` : ""}`);
  }
  const out = { kind: "track-teardown-predictions", version: 1, date: new Date().toISOString(), manifest: { path: path.relative(ROOT, manifestPath).replace(/\\/g, "/"), name: manifest.name, version: manifest.version, sha256: sha256File(manifestPath) },
    split: HOLDOUT ? "holdout" : "dev", page: PAGE, pageSha256: sha256File(path.join(ROOT, PAGE)), ...provenance(ROOT), node: process.version, browser: b.version(), os: `${os.platform()} ${os.release()}`, skippedHoldoutTracks: HOLDOUT ? 0 : skipped, tracks: records };
  fs.writeFileSync(path.join(OUT, "predictions.json"), JSON.stringify(out));
  await b.close();
  const bad = records.filter(r => r.status !== "ok" || r.pageErrors.length).length;
  console.log(`${records.length} tracks run, ${bad} with problems${skipped && !HOLDOUT ? `, ${skipped} holdout tracks skipped` : ""}. Predictions: ${path.relative(process.cwd(), path.join(OUT, "predictions.json"))}`);
  if (bad) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
