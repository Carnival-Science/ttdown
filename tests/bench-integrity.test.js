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

// continuous beats: holes must be declared as gaps; nothing inside a gap; gaps need a reason
const L = require("../bench/lib/loaders");
const steadyBeats = Array.from({ length: 40 }, (_, i) => (0.5 * i).toFixed(3));
put("cont.beats.txt", steadyBeats.map((t, i) => `${t}\t${i % 4 + 1}`).join("\n") + "\n");
assert.deepEqual(L.validateBeats(L.beats(path.join(tmp, "cont.beats.txt"))), []);
const holed = steadyBeats.filter((_, i) => i < 10 || i >= 18).map((t, i) => `${t}\t1`);
put("hole.beats.txt", holed.join("\n") + "\n");
assert.match(L.validateBeats(L.beats(path.join(tmp, "hole.beats.txt")))[0], /undeclared gap 4\.500-9\.000 s/);
put("gap.beats.txt", holed.join("\n") + "\ngap 4.6 8.9 drumless breakdown, pulse not verifiable\n");
const GB = L.beats(path.join(tmp, "gap.beats.txt"));
assert.deepEqual(GB.gaps, [{ start: 4.6, end: 8.9, reason: "drumless breakdown, pulse not verifiable" }]);
assert.deepEqual(L.validateBeats(GB), []);
put("bad.beats.txt", steadyBeats.join("\n") + "\ngap 2.1 3.9\n");
const bad = L.validateBeats(L.beats(path.join(tmp, "bad.beats.txt")));                                 // no reason + beats 2.5, 3.0, 3.5 inside
assert.match(bad[0], /gap 2\.1-3\.9: give a reason/); assert.deepEqual(bad.slice(1).map(x => x.match(/beat at (\S+) s/)[1]), ["2.5", "3", "3.5"]);
const trackGap = { id: "g", audio, split: "dev", annotations: { beats: "hole.beats.txt" } };
assert.match(checkRequirements({ requirements: { continuousBeats: true } }, [trackGap], tmp).problems[0], /^g: undeclared gap/);
assert.equal(checkRequirements({ requirements: { continuousBeats: true } }, [{ ...trackGap, annotations: { beats: "gap.beats.txt" } }], tmp).ok, true);
// identity required on real manifests
assert.match(checkRequirements({ requirements: { identity: true } }, [trackA], tmp).problems[0], /a: missing leakage identifier\(s\) artists, release, songFamily/);
assert.equal(checkRequirements({ requirements: { identity: true } }, [{ ...trackA, artists: ["X"], release: "R", songFamily: "S" }], tmp).ok, true);

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
