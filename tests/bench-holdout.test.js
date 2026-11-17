// Holdout isolation rules in bench/run.js (checked before any browser starts):
//  - a normal run never includes holdout tracks
//  - a --holdout run refuses to write inside the repository
//  - a --holdout run only takes holdout tracks
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { spawnSync } = require("node:child_process");
const RUN = path.join(__dirname, "..", "bench", "run.js"), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-holdout-"));
const manifest = tracks => { const p = path.join(tmp, `m${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(p, JSON.stringify({ name: "t", version: 1, tracks })); return p; };
const run = (...a) => spawnSync(process.execPath, [RUN, ...a], { encoding: "utf8" });

const onlyHoldout = manifest([{ id: "h1", audio: "missing.wav", split: "holdout" }]);
let r = run(onlyHoldout);
assert.equal(r.status, 2); assert.match(r.stderr, /No tracks to run/);                      // dev run skips holdout tracks
r = run(onlyHoldout, "--holdout", "--out", path.join(__dirname, "..", "bench", "out", "leak"));
assert.equal(r.status, 2); assert.match(r.stderr, /outside the repository/);                 // holdout output must leave the repo
const onlyDev = manifest([{ id: "d1", audio: "missing.wav", split: "dev" }]);
r = run(onlyDev, "--holdout", "--out", path.join(tmp, "out"));
assert.equal(r.status, 2); assert.match(r.stderr, /No tracks to run/);                      // holdout run ignores dev tracks
assert.ok(!fs.existsSync(path.join(__dirname, "..", "bench", "out", "leak")));

fs.rmSync(tmp, { recursive: true, force: true });
console.log("holdout isolation tests passed");
