#!/usr/bin/env node
/* bench/amt/app-chord-check.js (research tool, not a gate): `score` reads the chords from a capture with this checkout's reader and a
 * baseline checkout's and scores them against a .lab truth; `capture` refuses an --out inside the repository or one that exists, before
 * starting anything. The capture here is built from tests/fixtures/pop127-basic-pitch-notes.json on pop127_Amaj's grid (no browser, no
 * model); the browser capture itself is not run in CI (it takes minutes per track), but its refusal of a bench build that is not of this
 * checkout (another commit, uncommitted changes, other shared sources) is checked through buildProblems. */
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, ".."), TOOL = path.join(ROOT, "bench", "amt", "app-chord-check.js");
const run = (...a) => spawnSync(process.execPath, [TOOL, ...a], { encoding: "utf8" });
let checks = 0; const refuses = (why, ...a) => { const r = run(...a); assert.equal(r.status, 2, `${why}: ${r.stdout}${r.stderr}`); assert.match(r.stderr, why); checks++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "app-chords-"));
try {
  // pop127_Amaj: 127 BPM, bar 1 at 0 s, A F#m D E one chord per bar; the grid as the app's tracked grid has it
  const bar = 240 / 127, beats = [], downbeats = []; for (let i = 0; i < 40; i++) beats.push(+(i * bar / 4).toFixed(6)); for (let b = 0; b <= 9; b++) downbeats.push(+(b * bar).toFixed(6));
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "pop127-basic-pitch-notes.json"), "utf8"));
  const cap = { kind: "app-chord-capture", version: 1, app: { commit: "test" }, audio: { file: "pop127_Amaj.wav", sha256: "0".repeat(64), bytes: 0 },
    analysis: { duration: +(8 * bar + 0.2).toFixed(3), bpm: 127, barSec: bar, firstDown: 0, nBars: 8, key: "A major", grid: { beats, downbeats } }, notes: fx.notes,
    audioChordRegions: null, appChordRegions: null };
  const capFile = path.join(tmp, "capture.json"), lab = path.join(tmp, "truth.lab");
  fs.writeFileSync(capFile, JSON.stringify(cap)); fs.writeFileSync(lab, ["A:maj", "F#:min", "D:maj", "E:maj", "A:maj", "F#:min", "D:maj", "E:maj"].map((c, b) => `${(b * bar).toFixed(6)}\t${((b + 1) * bar).toFixed(6)}\t${c}`).join("\n") + "\n");
  const r = run("score", "--capture", capFile, "--lab", lab, "--baseline-repo", ROOT);
  assert.equal(r.status, 0, r.stdout + r.stderr); checks++;
  const line = r.stdout.split("\n").find(l => l.startsWith("app reader, this checkout")), cols = (line.match(/(\d+\.\d)\s+(\d+\.\d)\s+\d+\s*$/) || []).slice(1).map(Number); // chord %, root %, regions
  assert.ok(cols[0] >= 95 && cols[1] >= 95, `this checkout reads pop127's A F#m D E from Basic Pitch's notes (${line})`); checks++;
  assert.match(r.stdout, /identical regions/, "the same checkout as baseline reads identical regions"); checks++;
  refuses(/both|usage/, "score", "--capture", capFile);                                     // neither --lab nor --annotation
  refuses(/usage/, "score", "--capture", capFile, "--lab", lab, "--annotation", lab);        // both
  fs.writeFileSync(path.join(tmp, "other.json"), "{}"); refuses(/not a capture/, "score", "--capture", path.join(tmp, "other.json"), "--lab", lab);
  refuses(/no src\/domain\.js/, "score", "--capture", capFile, "--lab", lab, "--baseline-repo", tmp);
  refuses(/unknown option/, "score", "--capture", capFile, "--lab", lab, "--bogus", "1");
  // capture: refused before anything starts when --out is inside the repository (also via a "..name"), or already exists
  const tag = `${process.pid}-${Date.now()}`, inRepo = path.join(ROOT, "bench", "out", `app-chords-${tag}.json`), dotName = path.join(ROOT, `..app-chords-${tag}.json`);
  try {
    refuses(/outside the repository/, "capture", "--audio", capFile, "--out", inRepo);
    refuses(/outside the repository/, "capture", "--audio", capFile, "--out", dotName);
    assert.ok(!fs.existsSync(inRepo) && !fs.existsSync(dotName), "nothing created inside the repo"); checks++;
  } finally { fs.rmSync(inRepo, { force: true }); fs.rmSync(dotName, { force: true }); }
  const labText = fs.readFileSync(lab, "utf8");
  refuses(/already exists/, "capture", "--audio", capFile, "--out", lab);
  assert.equal(fs.readFileSync(lab, "utf8"), labText, "the existing file is untouched"); checks++;
  refuses(/no audio file/, "capture", "--audio", path.join(tmp, "missing.wav"), "--out", path.join(tmp, "new.json"));
  // capture serves app/dist/bench: it must be a build of THIS checkout as it stands, or the capture would be credited to code that did
  // not make it (Codex review of 23831c9). buildProblems is the check capture runs before it starts anything.
  const { buildProblems } = require(TOOL), sha = f => require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(ROOT, "src", f))).digest("hex");
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const good = { mode: "bench", gitSha: head, gitDirty: false, timemapSha256: sha("timemap.js"), timingStoreSha256: sha("timing-store.js"), engineSha256: sha("engine.js"), domainSha256: sha("domain.js") };
  assert.deepEqual(buildProblems(good), [], "a clean bench build of this commit with the same sources is accepted"); checks++;
  for (const [change, why] of [[{ gitSha: "0".repeat(40) }, /built from commit 0000000/], [{ gitDirty: true }, /uncommitted/], [{ mode: "production" }, /not the bench build/],
    [{ domainSha256: "f".repeat(64) }, /src\/domain\.js differs/], [{ engineSha256: "f".repeat(64) }, /src\/engine\.js differs/], [{ timemapSha256: "f".repeat(64) }, /src\/timemap\.js differs/], [{ timingStoreSha256: "f".repeat(64) }, /src\/timing-store\.js differs/]]) {
    const p = buildProblems({ ...good, ...change }); assert.ok(p.length === 1 && why.test(p[0]), `a build with ${JSON.stringify(change)} is refused (${p.join("; ")})`); checks++;
  }
  assert.deepEqual(buildProblems(null), ["no build manifest"]); checks++;
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`amt app chord check tests passed (${checks})`);
