#!/usr/bin/env node
/* The APP's chord reading from Basic Pitch's notes (src/domain.js chordRegionsFromNotes), compared with chord truth and between two
 * checkouts on identical input. Research only: not a gate, not in CI. bench/amt/score-chords.js scores the research reader
 * (bench/amt/symbolic-chords.js); this scores the reader the app ships.
 *
 *   node bench/amt/app-chord-check.js capture --audio "song.mp3" --out capture.json
 *     Runs the app's bench build (npm run app:build first) in Chromium on one audio file, with the note model on, and writes what the reading
 *     needs: the analysis' bar grid (tracked beats and downbeats, bar 1, tempo, duration), Basic Pitch's notes exactly as the app's worker
 *     returned them, the audio detector's chord regions, the chord regions the app showed, the audio's SHA-256 and the build that served
 *     them. It refuses a bench build that is not of this checkout as it stands (another commit, uncommitted changes, or different
 *     src/timemap, timing-store, engine or domain), checks the page's own identity against the build manifest, and records both. --out must
 *     be OUTSIDE the repository once links are resolved (a capture of real music is private material) and must not exist yet.
 *
 *   node bench/amt/app-chord-check.js score --capture capture.json (--lab truth.lab | --annotation ann.json) [--baseline-repo DIR]
 *     Reads the chords from the capture's notes and grid with THIS checkout's reader and, with --baseline-repo, with the reader of another
 *     checkout (say a worktree of main), so both see identical input; scores each, and the captured audio-detector and app regions.
 *     --lab: tab-separated "start end label" lines (test-songs/truth/*.chords.lab, labels like A:maj, F#:min): the share of 10 ms frames,
 *       up to the end of the last labelled chord, whose major/minor chord (and whose root) is the labelled one.
 *     --annotation: a chord annotation scored by bench/amt/chord-scoring.js (root, root + triad, chord-change F1, regions per bar).
 */
"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const fail = m => { console.error(`app-chord-check: ${m}`); process.exit(2); };
const opts = (argv, valued) => { const o = {}; for (let k = 0; k < argv.length; k++) { const a = argv[k]; if (!valued.has(a)) fail(`unknown option ${a}`); if (a in o) fail(`${a} given twice`);
  const v = argv[++k]; if (v === undefined || v.startsWith("--")) fail(`${a} needs a value`); o[a] = v; } return o; };
const sha256 = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const git = (dir, args) => { const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : null; };

/** The real location of a path that may not exist yet (deepest existing part resolved through links, the rest appended). */
function canonical(p) { let cur = path.resolve(p); const rest = [];
  for (;;) { try { fs.lstatSync(cur); break; } catch (e) { if (e.code !== "ENOENT") throw e; } const up = path.dirname(cur); if (up === cur) break; rest.unshift(path.basename(cur)); cur = up; }
  return path.join(fs.realpathSync.native(cur), ...rest); }
function isInside(child, parent) { const norm = x => (process.platform === "win32" ? x.toLowerCase() : x), rel = path.relative(norm(parent), norm(child));
  return rel === "" || (!path.isAbsolute(rel) && rel.split(path.sep)[0] !== ".."); }

/** Why a build manifest is NOT a build of this checkout as it stands ([] when it is): built from another commit, from uncommitted changes,
 *  not the bench build, or with different shared sources (src/timemap.js, timing-store.js, engine.js, domain.js: the analysis and the chord
 *  reader). A capture made from such a build would be credited to code that did not make it, so `capture` refuses it. */
function buildProblems(manifest, root = ROOT) {
  const out = [], head = git(root, ["rev-parse", "HEAD"]);
  if (!manifest || typeof manifest !== "object") return ["no build manifest"];
  if (manifest.mode !== "bench") out.push(`it is the ${manifest.mode} build, not the bench build`);
  if (!head || manifest.gitSha !== head) out.push(`it was built from commit ${String(manifest.gitSha).slice(0, 7)}, and this checkout is at ${String(head).slice(0, 7)}`);
  if (manifest.gitDirty !== false) out.push("it was built from uncommitted changes");
  for (const [file, key] of [["timemap.js", "timemapSha256"], ["timing-store.js", "timingStoreSha256"], ["engine.js", "engineSha256"], ["domain.js", "domainSha256"]])
    if (sha256(path.join(root, "src", file)) !== manifest[key]) out.push(`src/${file} differs from the one it was built with`);
  return out;
}

async function capture(o) {
  if (!o["--audio"] || !o["--out"]) fail('usage: capture --audio "song.mp3" --out capture.json');
  const audio = path.resolve(o["--audio"]), out = path.resolve(o["--out"]);
  if (!fs.existsSync(audio)) fail(`no audio file at ${audio}`);
  let real; try { real = canonical(out); } catch (e) { fail(`cannot resolve --out ${out} (${e.message})`); }
  if (isInside(real, fs.realpathSync.native(ROOT))) fail(`--out must be outside the repository (${ROOT}): a capture of real music is private material`);
  if (fs.existsSync(out)) fail(`--out ${out} already exists; choose a new path (nothing is overwritten)`);
  if (!fs.existsSync(path.join(ROOT, "app", "dist", "bench", "index.html"))) fail("no bench build: run npm run app:build first");
  const pw = require("playwright"), { createTarget } = require("../lib/target");
  const target = createTarget({ kind: "svelte", root: ROOT, build: "bench" }), stale = buildProblems(target.manifest);
  if (stale.length) fail(`app/dist/bench is not a build of this checkout: ${stale.join("; ")}. Commit (or stash) your changes and rebuild with npm run app:build.`);
  await target.start();
  const b = await pw.chromium.launch(); let rec;
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage(), errors = []; p.on("pageerror", e => errors.push(e.message));
    await p.addInitScript(() => { const w = window; w.__ttBasicPitch = true; const W = w.Worker; w.Worker = class extends W { constructor(...a) { super(...a); this.addEventListener("message", e => { if (e.data && ((e.data.type === "done" && Array.isArray(e.data.notes)) || e.data.type === "error")) w.__bpDone = e.data; }); } }; });
    await p.goto(target.url()); await p.waitForTimeout(400);
    const served = await target.verifyIdentity(p); // the page's own window.__build must be the build in the manifest checked above
    const t0 = Date.now(); await p.setInputFiles("#file", audio);
    await p.waitForFunction(() => /Transcribing|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 300000 });
    if (/Couldn/.test(await p.locator("#status").innerText())) throw new Error("the app could not analyse the file: " + await p.locator("#status").innerText());
    const pick = () => p.evaluate(() => { const a = window.__td, g = a.grid; return JSON.parse(JSON.stringify({ duration: a.duration, bpm: a.bpm, barSec: a.barSec, firstDown: a.firstDown, nBars: a.nBars, bpmConf: a.bpmConf, key: a.key,
      grid: g ? { beats: g.beats, downbeats: g.downbeats } : null, chordRegions: a.chordRegions || null })); });
    const before = await pick(), tAnalysis = (Date.now() - t0) / 1000;
    await p.waitForFunction(() => !!window.__bpDone, null, { timeout: 3600000, polling: 2000 });
    const done = await p.evaluate(() => window.__bpDone); if (done.type !== "done") throw new Error("the note model failed: " + done.message);
    await p.waitForTimeout(500); const after = await pick();
    rec = { kind: "app-chord-capture", version: 2, date: new Date().toISOString(),
      app: { served: { ...target.describe(), pageGitSha: served.gitSha, pageDomainSha256: served.domainSha256, identityVerified: true }, browser: "chromium " + b.version() },
      audio: { file: path.basename(audio), sha256: sha256(audio), bytes: fs.statSync(audio).size },
      analysis: { ...before, chordRegions: undefined }, notesModel: { backend: done.backend, notes: done.notes.length }, notes: done.notes,
      audioChordRegions: before.chordRegions, appChordRegions: after.chordRegions, seconds: { analysis: tAnalysis, total: (Date.now() - t0) / 1000 }, pageErrors: errors };
  } finally { await b.close(); await target.stop(); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (isInside(canonical(out), fs.realpathSync.native(ROOT))) fail(`${out} resolves inside the repository; stopping`);
  fs.writeFileSync(out, JSON.stringify(rec) + "\n", { flag: "wx" });
  console.log(`${rec.audio.file}: ${rec.notes.length} notes (${rec.notesModel.backend}), ${rec.seconds.total.toFixed(0)} s; served build ${rec.app.served.buildGitSha.slice(0, 7)} (domain ${rec.app.served.domainSha256.slice(0, 8)}, identity verified); grid ${rec.analysis.grid ? rec.analysis.grid.beats.length + " tracked beats" : "none"}; wrote ${out}`);
}

const PC = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
/** A chord name ("F#m", "G#", "–") or a lab label ("F#:min", "A:maj", "N") as root and major/minor ("9", "6m"; "N" for no chord). */
const mm = l => { if (!l || l === "–" || l === "N") return "N"; let m = String(l).match(/^([A-G][#b]?):(maj|min)$/); if (m) return PC[m[1]] + (m[2] === "min" ? "m" : "");
  m = String(l).match(/^([A-G][#b]?)(m?)$/); return m ? PC[m[1]] + m[2] : "?" + l; };
function scoreLab(regions, lab) {
  const at = t => { const r = regions.find(x => t >= x.t0 && t < x.t1); return r ? mm(r.c) : "N"; }; let n = 0, ok = 0, root = 0;
  for (let t = lab[0].t0 + 0.005; t < lab[lab.length - 1].t1; t += 0.01) { const T = lab.find(x => t >= x.t0 && t < x.t1); if (!T) continue; const P = at(t); n++; if (P === T.c) ok++; if (P.replace("m", "") === T.c.replace("m", "")) root++; }
  return { chord: ok / n, root: root / n, regions: regions.filter(x => x.c !== "–").length };
}
function reader(dir) {
  const r = p => require(path.join(dir, "src", p)), TM = r("timemap"), TS = r("timing-store"), eng = r("engine")({ TimeMap: TM });
  return { TM, D: r("domain")({ TimingStore: TS, engine: eng }), commit: git(dir, ["rev-parse", "--short", "HEAD"]) || "unknown", modified: (git(dir, ["status", "--porcelain", "--", "src"]) || "").length > 0 };
}
function score(o) {
  if (!o["--capture"] || !!o["--lab"] === !!o["--annotation"]) fail("usage: score --capture capture.json (--lab truth.lab | --annotation ann.json) [--baseline-repo DIR]");
  const cap = JSON.parse(fs.readFileSync(o["--capture"], "utf8")); if (cap.kind !== "app-chord-capture") fail(`${o["--capture"]} is not a capture from this script`);
  const readers = [["this checkout", reader(ROOT)]];
  if (o["--baseline-repo"]) { const dir = path.resolve(o["--baseline-repo"]); if (!fs.existsSync(path.join(dir, "src", "domain.js"))) fail(`no src/domain.js in ${dir}`); readers.push(["baseline", reader(dir)]); }
  const sets = [["audio detector (captured)", cap.audioChordRegions && cap.audioChordRegions.regions], ["app as captured", cap.appChordRegions && cap.appChordRegions.regions]], readOut = [];
  for (const [name, R] of readers) { const a = { ...cap.analysis }, G = R.TM.forAnalysis(a); if (!G.tracked) fail(`the capture's grid is not tracked (${G.reason}); the app reads chords from notes only on a tracked grid`);
    const res = R.D.chordRegionsFromNotes(a, G, cap.notes); if (!res) fail(`${name}: the reader returned nothing`); readOut.push(JSON.stringify(res)); sets.push([`app reader, ${name} (${R.commit}${R.modified ? ", src modified" : ""})`, res.regions]); }
  const sv = cap.app && cap.app.served, from = sv ? `served by build ${String(sv.buildGitSha).slice(0, 7)} (domain ${String(sv.domainSha256).slice(0, 8)}${sv.identityVerified ? ", identity verified" : ""})` : "served build not recorded (version 1 capture)";
  console.log(`capture ${cap.audio.file} (sha256 ${cap.audio.sha256.slice(0, 16)}…), ${cap.notes.length} notes, ${from}`);
  const pct = x => (100 * x).toFixed(1).padStart(6);
  if (o["--lab"]) {
    const lab = fs.readFileSync(o["--lab"], "utf8").trim().split(/\r?\n/).map(r => { const [a, b, l] = r.split("\t"); return { t0: +a, t1: +b, c: mm(l) }; });
    console.log(`${"reading".padEnd(60)} chord   root  regions (truth: ${lab.length} chords)`);
    for (const [name, regs] of sets) { if (!regs) continue; const s = scoreLab(regs, lab); console.log(`${name.padEnd(60)}${pct(s.chord)} ${pct(s.root)} ${String(s.regions).padStart(8)}`); }
  } else {
    const { prepare, score: scoreWith } = require("./chord-scoring"), P = prepare(JSON.parse(fs.readFileSync(o["--annotation"], "utf8")));
    console.log(`${"reading".padEnd(60)}  root  +triad  change F1 (P / R)  regions/bar  (${P.n || P.steps.length} steps)`);
    for (const [name, regs] of sets) { if (!regs) continue; const s = scoreWith(P, regs); console.log(`${name.padEnd(60)}${pct(s.root)} ${pct(s.tri)}   ${pct(s.F)} (${(100 * s.P).toFixed(0)} / ${(100 * s.R).toFixed(0)})   ${s.perBar.toFixed(1).padStart(6)}`); }
  }
  if (readOut.length === 2) console.log(readOut[0] === readOut[1] ? "this checkout and the baseline read identical regions" : "this checkout and the baseline read DIFFERENT regions");
}

module.exports = { buildProblems };
if (require.main !== module) return;
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "capture") capture(opts(rest, new Set(["--audio", "--out"]))).catch(e => fail(e.message));
else if (cmd === "score") score(opts(rest, new Set(["--capture", "--lab", "--annotation", "--baseline-repo"])));
else fail("usage: app-chord-check.js capture --audio FILE --out FILE | score --capture FILE (--lab FILE | --annotation FILE) [--baseline-repo DIR]");
