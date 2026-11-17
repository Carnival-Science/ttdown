// Ground-truth integrity and required annotation coverage (bench/lib/requirements.js, bench/run.js preflight).
// No browser needed: run.js stops before starting one when a check fails.
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const { annotationIntegrity, checkRequirements } = require("../bench/lib/requirements");
const RUN = path.join(__dirname, "..", "bench", "run.js"), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-integrity-"));
const put = (name, text) => { fs.writeFileSync(path.join(tmp, name), text); return name; };
const sha = name => crypto.createHash("sha256").update(fs.readFileSync(path.join(tmp, name))).digest("hex");
const audio = path.join(__dirname, "samples", "kick.wav"); // any existing file; nothing is analyzed in these tests

put("a.beats.txt", "0.5 1\n1.0 2\n1.5 3\n2.0 4\n"); put("a.key.txt", "A minor\n"); put("b.beats.txt", "0.5\n1.0\n"); // b: no bar positions
const trackA = { id: "a", audio, split: "dev", annotations: { beats: "a.beats.txt", key: "a.key.txt" } };
trackA.annotationSha256 = { beats: sha("a.beats.txt"), key: sha("a.key.txt") };
const trackB = { id: "b", audio, split: "dev", annotations: { beats: "b.beats.txt" } };

// integrity: unchanged files pass; any edit to an answer file is detected
assert.deepEqual(annotationIntegrity(trackA, tmp).problems, []);
fs.appendFileSync(path.join(tmp, "a.key.txt"), "# second opinion: C major\n");          // even a comment changes the file
assert.match(annotationIntegrity(trackA, tmp).problems[0], /a: key annotation changed/);
put("a.key.txt", "A minor\n");
assert.match(annotationIntegrity({ ...trackA, annotations: { beats: "a.beats.txt" } }, tmp).problems[0], /hash listed for key but no key annotation/);
assert.match(annotationIntegrity({ ...trackA, annotations: { ...trackA.annotations, chords: "nope.lab" } }, tmp).problems[0], /chords annotation missing/);

// coverage: "all" and minimum shares are enforced; downbeats need bar positions; checksums can be required
const M = (requirements, tracks = [trackA, trackB]) => checkRequirements({ requirements }, tracks, tmp);
assert.equal(M({ annotations: { beats: "all" } }).ok, true);
assert.match(M({ annotations: { downbeats: "all" } }).problems[0], /downbeats required on every track; missing on 1: b/);
assert.match(M({ annotations: { key: 0.75 } }).problems[0], /at least 75 % of tracks; have 1\/2/);
assert.equal(M({ annotations: { key: 0.5 } }).ok, true);
assert.match(M({ checksums: true }).problems.join("\n"), /b: no audio sha256[\s\S]*b: no sha256 for beats/);
assert.deepEqual(M({}).coverage.downbeats, { tracks: 1, of: 2, required: null });
assert.match(M({ annotations: { key: "most" } }).problems[0], /use "all" or a number/);

// run.js refuses to start when either check fails
const manifest = (extra, tracks) => { const p = path.join(tmp, `m${crypto.randomBytes(3).toString("hex")}.json`); fs.writeFileSync(p, JSON.stringify({ name: "t", version: 1, ...extra, tracks })); return p; };
let r = spawnSync(process.execPath, [RUN, manifest({ requirements: { annotations: { downbeats: "all" } } }, [trackA, trackB])], { encoding: "utf8" });
assert.equal(r.status, 2); assert.match(r.stderr, /Not starting[\s\S]*downbeats required on every track/);
r = spawnSync(process.execPath, [RUN, manifest({}, [{ ...trackA, annotationSha256: { ...trackA.annotationSha256, beats: "0".repeat(64) } }])], { encoding: "utf8" });
assert.equal(r.status, 2); assert.match(r.stderr, /a: beats annotation changed/);
r = spawnSync(process.execPath, [RUN, manifest({}, [{ ...trackA, sha256: "f".repeat(64) }])], { encoding: "utf8" });
assert.equal(r.status, 2); assert.match(r.stderr, /a: audio changed/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("ground-truth integrity and coverage tests passed");
