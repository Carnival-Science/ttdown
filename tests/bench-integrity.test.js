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
// A real tempo change is not a gap. A lasting change (e.g. 128 BPM for the rest of the track at 64 BPM) isn't flagged
// at all: the local median adapts. The false positive is a SHORT passage at another tempo: here 4 beats of a 64 BPM
// halftime fill inside a 128 BPM track. Its doubled intervals look like missing beats until declared.
const tcTimes = []; for (let i = 0; i < 24; i++) tcTimes.push(i * 60 / 128);
for (let i = 1; i <= 4; i++) tcTimes.push(tcTimes[23] + i * 60 / 64);
const back = tcTimes[27]; for (let i = 1; i <= 16; i++) tcTimes.push(back + i * 60 / 128);
const tcLines = tcTimes.map(t => t.toFixed(4)).join("\n"), decl = `tempo-change ${tcTimes[23].toFixed(4)} 128 -> 64 BPM, halftime fill\ntempo-change ${back.toFixed(4)} back to 128 BPM\n`;
put("tc-undeclared.beats.txt", tcLines + "\n");
const flagged = L.validateBeats(L.beats(path.join(tmp, "tc-undeclared.beats.txt")));
assert.equal(flagged.length, 4); assert.match(flagged[0], /2\.0x the local beat interval.*or, if the tempo really changes here, declare "tempo-change/); // the false positive to record
put("tc-declared.beats.txt", tcLines + "\n" + decl);
const TCB = L.beats(path.join(tmp, "tc-declared.beats.txt"));
assert.deepEqual(TCB.tempoChanges.map(c => c.note), ["128 -> 64 BPM, halftime fill", "back to 128 BPM"]);
assert.deepEqual(L.validateBeats(TCB), []);
assert.equal(TCB.beats.length, 44);                                                  // tempo-change lines are not beats
// declarations can't hide a real missing beat at the (unchanged) tempo after the fill
put("tc-hole.beats.txt", tcTimes.filter((_, i) => i !== 36).map(t => t.toFixed(4)).join("\n") + "\n" + decl);
assert.match(L.validateBeats(L.beats(path.join(tmp, "tc-hole.beats.txt")))[0], /undeclared gap/);
put("tc-nonote.beats.txt", tcLines + `\ntempo-change ${tcTimes[23].toFixed(4)}\ntempo-change ${back.toFixed(4)} back\n`);
assert.match(L.validateBeats(L.beats(path.join(tmp, "tc-nonote.beats.txt")))[0], /tempo-change .*: give a note/);
// drift keeps counting through declared tempo changes (no restart), so the real slip shows: 4 halftime beats = 8 grid beats
const Mx = require("../bench/lib/metrics"), P128 = { firstDown: 0, barSec: 240 / 128, duration: 30 };
const pd = Mx.phaseDrift(P128, TCB.beats, [], TCB.tempoChanges);
assert.deepEqual([pd.segments, pd.undeclaredGaps, pd.maxSlipBeats], [1, 0, 4]);
const pdNo = Mx.phaseDrift(P128, TCB.beats);
assert.equal(pdNo.undeclaredGaps, 4);                                               // undeclared, they'd be treated as holes and the slip hidden by restarts

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
