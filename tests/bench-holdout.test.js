// Holdout safeguards (bench/lib/holdout.js, bench/run.js, bench/check-splits.js). All checks happen before any
// browser starts, so these tests are fast and need no audio.
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const { holdoutGuard, splitOverlap, identityProblems } = require("../bench/lib/holdout");
const ROOT = path.join(__dirname, ".."), RUN = path.join(ROOT, "bench", "run.js"), SPLITS = path.join(ROOT, "bench", "check-splits.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-holdout-"));
const manifest = (tracks, dir = tmp) => { fs.mkdirSync(dir, { recursive: true }); const p = path.join(dir, `m${crypto.randomBytes(4).toString("hex")}.json`); fs.writeFileSync(p, JSON.stringify({ name: "t", version: 1, tracks })); return p; };
const node = (script, ...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8" });
const H = { id: "h1", audio: "missing.wav", split: "holdout" }, D = { id: "d1", audio: "missing.wav", split: "dev" };

// ---- the decision rules themselves ----
const base = { holdout: true, splits: new Set(["holdout"]), outsideRepo: true, operator: "custodian", gitDirty: false, pageSha256: "abc", log: [], reason: null };
assert.equal(holdoutGuard(base).ok, true);
assert.match(holdoutGuard({ ...base, holdout: false }).msg, /separate manifest/);                       // dev run never sees holdout tracks
assert.equal(holdoutGuard({ ...base, holdout: false, splits: new Set(["dev"]) }).ok, true);
assert.match(holdoutGuard({ ...base, splits: new Set(["holdout", "dev"]) }).msg, /only holdout/);
assert.match(holdoutGuard({ ...base, outsideRepo: false }).msg, /outside the repository/);
assert.match(holdoutGuard({ ...base, operator: undefined }).msg, /operator/);
assert.match(holdoutGuard({ ...base, gitDirty: true }).msg, /Commit your changes/);                    // result must map to one commit
const ran = [{ pageSha256: "abc", date: "2026-12-01T00:00:00Z" }];
assert.match(holdoutGuard({ ...base, log: ran }).msg, /already run on this engine build/);              // one run per engine build
assert.match(holdoutGuard({ ...base, log: ran, reason: "oops" }).msg, /already run/);                  // a real reason is required
assert.equal(holdoutGuard({ ...base, log: ran, reason: "crashed on track 7; harness bug #12 fixed" }).ok, true);
assert.equal(holdoutGuard({ ...base, log: [{ pageSha256: "older-engine", date: "x" }] }).ok, true);    // a new engine build may run

// ---- the same rules through the command line ----
let r = node(RUN, manifest([D, H]));
assert.equal(r.status, 2); assert.match(r.stderr, /separate manifest/);
r = node(RUN, manifest([H]), "--holdout", "--out", path.join(ROOT, "bench", "out", "leak"), "--operator", "x");
assert.equal(r.status, 2); assert.match(r.stderr, /outside the repository/);
assert.ok(!fs.existsSync(path.join(ROOT, "bench", "out", "leak")));
r = node(RUN, manifest([H]), "--holdout", "--out", path.join(tmp, "out"));
assert.equal(r.status, 2); assert.match(r.stderr, /operator/);
r = node(RUN, manifest([D]), "--holdout", "--out", path.join(tmp, "out"), "--operator", "x");
assert.equal(r.status, 2); assert.match(r.stderr, /only holdout/);
const hdir = path.join(tmp, "holdout-set"), hm = manifest([H], hdir);                                  // custody log already has this engine
const page = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, "index.html"))).digest("hex");
fs.writeFileSync(path.join(hdir, "holdout-runs.jsonl"), JSON.stringify({ date: "2026-12-01T00:00:00Z", pageSha256: page }) + "\n");
r = node(RUN, hm, "--holdout", "--out", path.join(tmp, "out"), "--operator", "x");
assert.equal(r.status, 2); assert.match(r.stderr, /already run on this engine build/);

// ---- leakage between dev and holdout manifests: artist, release and song family are checked separately ----
const T = (id, artists, release, songFamily, extra) => ({ id, sha256: `sha-${id}`, artists, release, songFamily, ...extra });
const leak = (d, h) => splitOverlap([d], [h]);
assert.deepEqual(leak(T("a", ["Artist X"], "CAT001", "Song A"), T("b", ["Artist Y"], "CAT002", "Song B")), []);
// the case the review raised: same artist, different release and song -> was missed by one exact `group`
assert.match(leak(T("a", ["Artist X"], "CAT001", "Song A", { group: "artist-x/ep1" }), T("b", ["Artist X"], "CAT009", "Song Z", { group: "artist-x/lp2" })).join(), /^artist "artist x"/);
assert.match(leak(T("a", ["Artist A", "Artist B"], "R1", "S1"), T("b", ["Artist B"], "R2", "S2")).join(), /artist "artist b"/);          // collaboration / feature
assert.equal(leak(T("a", ["Bicep"], "R1", "S1"), T("b", ["BICEP."], "R2", "S2")).length, 1);                                         // case and punctuation
assert.equal(leak(T("a", ["Bícep"], "R1", "S1"), T("b", ["bicep"], "R2", "S2")).length, 1);                                          // accents
assert.match(leak(T("a", ["Original Artist"], "R1", "Opus"), T("b", ["Remixer"], "R2", "opus")).join(), /song family "opus"/);        // remix of the same song
assert.match(leak(T("a", ["X"], "LBL-042", "S1"), T("b", ["Y"], "lbl 042", "S2")).join(), /release "lbl 042"/);                       // same release, other artist
assert.equal(leak(T("a", ["X"], "R1", "S1"), T("a", ["Y"], "R2", "S2", { sha256: "other-audio" })).length, 1);                        // same id only
assert.equal(splitOverlap([{ id: "a", artist: "Solo Name" }], [{ id: "b", artists: ["solo name"] }]).length, 1);                      // single `artist` field accepted
assert.deepEqual(identityProblems([T("a", ["X"], "R", "S"), { id: "b", artists: [], release: "R" }]), ["b: missing leakage identifier(s) artists, songFamily"]);
// command line: missing identifiers can't be ruled safe; overlaps fail; clean splits pass
r = node(SPLITS, manifest([{ ...D, sha256: "s1" }]), manifest([{ ...H, ...T("h1", ["Y"], "R2", "S2") }]));
assert.equal(r.status, 1); assert.match(r.stdout, /INCOMPLETE: 1 track\(s\) lack leakage identifiers/);
r = node(SPLITS, manifest([{ ...D, ...T("d1", ["Same Artist"], "R1", "S1") }]), manifest([{ ...H, ...T("h1", ["same artist"], "R2", "S2") }]));
assert.equal(r.status, 1); assert.match(r.stdout, /LEAKAGE: 1 overlap[\s\S]*artist "same artist": dev d1 \/ holdout h1/);
r = node(SPLITS, manifest([{ ...D, ...T("d1", ["A"], "R1", "S1") }]), manifest([{ ...H, ...T("h1", ["B"], "R2", "S2") }]));
assert.equal(r.status, 0, r.stdout);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("holdout safeguard tests passed");
