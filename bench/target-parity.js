#!/usr/bin/env node
// Analyzer parity between two builds: runs bench/run.js on the same manifest for the legacy page (file://) and for the Svelte
// app's bench build (localhost), then requires every track's prediction to be identical (the full result, the tracked grid and
// the exported note times), ignoring only the runtime. Exit 1 on any difference.
//   node bench/target-parity.js <manifest.json> [--out DIR]
// Needs app/dist/bench (npm run app:build). This is the migration's parity gate: no Svelte accuracy claim beyond it.
"use strict";
const path = require("node:path"), fs = require("node:fs"), os = require("node:os"), { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, ".."), args = process.argv.slice(2), manifest = args.find(a => a.endsWith(".json"));
const oi = args.indexOf("--out"), OUT = oi >= 0 ? path.resolve(args[oi + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), "tt-parity-"));
if (!manifest) { console.error("usage: node bench/target-parity.js <manifest.json> [--out DIR]"); process.exit(2); }
const run = (target, dir) => { const r = spawnSync(process.execPath, [path.join(__dirname, "run.js"), manifest, "--target", target, "--out", dir], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) { console.error(`${target} run failed (exit ${r.status}):\n${(r.stdout + r.stderr).slice(-1500)}`); process.exit(1); }
  return JSON.parse(fs.readFileSync(path.join(dir, "predictions.json"), "utf8")); };
const L = run("legacy", path.join(OUT, "legacy")), S = run("svelte", path.join(OUT, "svelte"));
// Ignored: the runtime, and three fields the legacy page's panels add while rendering (checklist ticks, stem names, chord checks). They
// are interface bookkeeping, not analysis, and the v1 app has none of those panels. Everything else must be identical.
const UI_ONLY = ["checks", "stems", "chordChecks"];
const strip = t => { const { runtimeMs, ...r } = t; if (r.full) { r.full = { ...r.full }; UI_ONLY.forEach(k => delete r.full[k]); } return JSON.stringify(r); };
let diff = 0;
if (L.tracks.length !== S.tracks.length) { console.error(`track count differs: legacy ${L.tracks.length}, svelte ${S.tracks.length}`); process.exit(1); }
L.tracks.forEach((t, i) => { const s = S.tracks[i]; if (strip(t) !== strip(s)) { diff++; const a = JSON.parse(strip(t)), b = JSON.parse(strip(s)); const keys = Object.keys({ ...a, ...b }).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])); console.log(`DIFF ${t.id}: ${keys.join(", ")}`); } });
const bad = [...L.tracks, ...S.tracks].filter(t => t.status !== "ok" || t.pageErrors.length).length;
console.log(`${path.basename(path.dirname(path.resolve(manifest)))}: ${L.tracks.length} tracks, ${diff} differ, ${bad} with problems (legacy engine ${String(L.target.engineSha256).slice(0, 12)}, svelte engine ${String(S.target.engineSha256).slice(0, 12)}, bundle ${String(S.target.bundleSha256).slice(0, 12)})`);
process.exit(diff || bad || L.target.engineSha256 !== S.target.engineSha256 ? 1 : 0);
