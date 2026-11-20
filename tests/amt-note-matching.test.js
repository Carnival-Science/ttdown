#!/usr/bin/env node
/* The research note scorer (bench/amt/note-matching.js, bench/amt/score-notes.js).
 * 1. Maximum-cardinality matching. The counterexample from the audit of PR #21: reference notes at 40 ms and 100 ms, estimates at 0 ms
 *    and 60 ms, same pitch, window +-50 ms. Greedy nearest-first pairs 40 ms with 60 ms and strands both others (1 match); the maximum is 2.
 * 2. Tolerance boundaries as mir_eval: distances rounded to 4 decimals (0.1 ms), then <= the tolerance.
 * 3. Malformed notes, offsets and region arguments are rejected; MIDI files with unmatched note-on/note-off events are rejected.
 * 4. Regional counting rules, TP/FP/FN, the JSON report (outside the repo, never overwritten).
 * 5. mir_eval agrees on every match count (random and boundary cases), when Python has mir_eval (CI's test job does). */
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { spawnSync } = require("node:child_process");
const { match, counts, barRegions, regionCounts } = require("../bench/amt/note-matching");
const ROOT = path.resolve(__dirname, ".."), SCORER = path.join(ROOT, "bench", "amt", "score-notes.js");
let checks = 0; const ok = (fn) => { fn(); checks++; };
const N = (on, midi = 60, len = 0.5) => ({ on, off: on + len, midi });

// 1. maximum-cardinality, exact pitch, onset window, offsets
ok(() => { const m = match([N(0.04), N(0.10)], [N(0.0), N(0.06)], 0.05); assert.equal(m.n, 2, "two matches exist; greedy finds one"); assert.deepEqual([...m.ur].sort(), [0, 1]); assert.deepEqual([...m.ue].sort(), [0, 1]); });
ok(() => assert.equal(match([N(0.04, 60), N(0.10, 62)], [N(0.0, 60), N(0.06, 62)], 0.05).n, 2, "with pitches that allow it"));
ok(() => assert.equal(match([N(0.04, 60), N(0.10, 60)], [N(0.0, 60), N(0.06, 62)], 0.05).n, 1, "exact pitch is required: the 62 cannot match a 60"));
ok(() => assert.equal(match([N(0.0), N(1.0)], [N(0.0), N(1.0)], 0.05).n, 2, "separated notes: an exact match"));
ok(() => assert.equal(match([N(0.0)], [N(0.06)], 0.05).n, 0, "outside the window: no match"));
ok(() => assert.equal(match([N(0.0, 60, 1.0)], [N(0.0, 60, 0.5)], 0.05, true).n, 0, "with offsets: an end 0.5 s off (limit 0.2 x 1.0 s) is not a match"));
ok(() => assert.equal(match([N(0.0, 60, 1.0)], [N(0.0, 60, 0.9)], 0.05, true).n, 1, "an end 0.1 s off (limit 0.2 s) is"));
ok(() => assert.deepEqual(match([], [N(0)], 0.05), { n: 0, ur: new Set(), ue: new Set(), pairs: [] }, "no reference notes: nothing matches"));

// 2. boundaries: rounded to 4 decimals (mir_eval's N_DECIMALS), then <=
ok(() => { assert.ok(1.05 - 1.0 > 0.05, "premise: the binary difference is above 50 ms"); assert.equal(match([N(1.0)], [N(1.05)]).n, 1, "exactly 50 ms in decimal matches (mir_eval rounds)"); });
ok(() => assert.equal(match([N(1.05)], [N(1.0)]).n, 1, "and symmetrically, an estimate 50 ms early"));
ok(() => assert.equal(match([N(1.0)], [N(1.05004)]).n, 1, "50.04 ms rounds to 50.0 ms: a match"));
ok(() => assert.equal(match([N(1.0)], [N(1.05006)]).n, 0, "50.06 ms rounds to 50.1 ms: no match"));
ok(() => { const r = [{ on: 1.0, off: 2.0, midi: 60 }]; assert.equal(match(r, [{ on: 1.0, off: 2.2, midi: 60 }], 0.05, true).n, 1, "offset exactly 20% of a 1 s note matches"); assert.equal(match(r, [{ on: 1.0, off: 2.20006, midi: 60 }], 0.05, true).n, 0, "0.06 ms past it does not"); });
ok(() => { const r = [{ on: 1.0, off: 1.1, midi: 60 }]; assert.equal(match(r, [{ on: 1.0, off: 1.15, midi: 60 }], 0.05, true).n, 1, "a short note gets the 50 ms minimum"); assert.equal(match(r, [{ on: 1.0, off: 1.15006, midi: 60 }], 0.05, true).n, 0); });

// 3a. malformed notes are rejected, not silently unmatched
for (const [bad, why] of [[{ on: NaN, off: 1, midi: 60 }, /finite/], [{ on: 0, off: Infinity, midi: 60 }, /finite/], [{ on: 1, off: 1, midi: 60 }, /end after it starts/], [{ on: 1, off: 0.5, midi: 60 }, /end after it starts/], [{ on: 0, off: 1, midi: 60.5 }, /integer MIDI/], [{ on: 0, off: 1, midi: 128 }, /integer MIDI/]])
  ok(() => { assert.throws(() => match([bad], [N(0)]), why); assert.throws(() => match([N(0)], [bad]), why); });
ok(() => assert.throws(() => match([N(0)], [N(0)], NaN), /tolerance/));

// 3b. region arguments
for (const [args, why] of [[[NaN, 105, [18, 25]], /--bar1/], [[0.5, 0, [18, 25]], /--bpm/], [[0.5, -1, [18, 25]], /--bpm/], [[0.5, Infinity, [18, 25]], /--bpm/], [[0.5, 105, [18]], /--split/], [[0.5, 105, [25, 18]], /--split/], [[0.5, 105, [18, 18]], /--split/], [[0.5, 105, [1, 5]], /--split/], [[0.5, 105, [18.5, 25]], /--split/]])
  ok(() => assert.throws(() => barRegions(...args), why));

// 4a. counts and regions
ok(() => assert.deepEqual(counts(530, 590, 679), { tp: 530, fp: 149, fn: 60, P: 530 / 679, R: 530 / 590, F: 2 * 530 / (590 + 679) }, "TP/FP/FN of the published default row"));
ok(() => { const c = counts(0, 0, 0); assert.deepEqual([c.P, c.R, c.F], [0, 0, 0]); });
ok(() => {
  // 120 BPM: a bar is 2 s; bar 1 at 1.0 s; split 2,3 -> pickup [-inf, 0.98), bars 1-1 [0.98, 2.98), bars 2-2 [2.98, 4.98), bars 3-end [4.98, inf)
  const g = barRegions(1.0, 120, [2, 3]);
  assert.deepEqual(g.map(x => [x.name, +x.start.toFixed(6), +x.end.toFixed(6)]), [["pickup", -Infinity, 0.98], ["bars 1-1", 0.98, 2.98], ["bars 2-2", 2.98, 4.98], ["bars 3-end", 4.98, Infinity]]);
  const ref = [N(0.5), N(0.985), N(2.97), N(5.0)], est = [N(0.5), N(0.975), N(3.0), N(7.0)], m = match(ref, est), r = regionCounts(ref, est, m, g);
  // ref 0.985 (bar 1) matches est 0.975 (pickup); ref 2.97 (bar 1) matches est 3.0 (bar 2): both straddle; ref 5.0 is missed; est 7.0 is extra
  assert.equal(m.n, 3);
  assert.deepEqual(r.map(x => [x.ref, x.refMatched, x.est, x.estMatched, x.straddling]), [[1, 1, 2, 2, 0], [2, 2, 0, 0, 2], [0, 0, 1, 1, 0], [1, 0, 1, 0, 0]]);
});

// 4b. the command line: argument checks, unmatched MIDI events, provenance, the JSON report
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amt-score-"));
function smf(events) { // events: [tick, [bytes...]]; format 0, 480 ticks per quarter, 120 BPM (1 tick = 1/960 s)
  const vlq = v => { const o = [v & 127]; while ((v >>= 7)) o.unshift((v & 127) | 128); return o; };
  const ev = [[0, [0xff, 0x51, 3, 0x07, 0xa1, 0x20]], ...events].sort((a, b) => a[0] - b[0]); let at = 0; const body = [];
  for (const [t, b] of ev) { body.push(...vlq(t - at), ...b); at = t; }
  body.push(0, 0xff, 0x2f, 0);
  const h = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0]), len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  return Buffer.concat([h, Buffer.from("MTrk", "latin1"), len, Buffer.from(body)]);
}
const note = (tick, len, p = 60) => [[tick, [0x90, p, 100]], [tick + len, [0x80, p, 0]]];
const write = (name, events) => { const f = path.join(tmp, name); fs.writeFileSync(f, smf(events)); return f; };
const refMid = write("ref.mid", [...note(960, 480), ...note(1920, 480, 62), ...note(2880, 480, 64)]);          // 1.0, 2.0, 3.0 s
const estMid = write("est.mid", [...note(960, 480), ...note(1930, 200, 62), ...note(3500, 480, 67)]);          // hit, onset-only hit, extra
const run = (...a) => spawnSync(process.execPath, [SCORER, ...a], { encoding: "utf8", cwd: ROOT });
const refuses = (why, ...a) => ok(() => { const r = run(...a); assert.equal(r.status, 2, `${why}: exit 2, got ${r.status}\n${r.stdout}${r.stderr}`); assert.match(r.stderr, why); });
refuses(/--offset must be a finite number/, "--ref", refMid, "--offset", "abc", estMid);
refuses(/--offset must be a finite number/, "--ref", refMid, "--offset", "Infinity", estMid);
refuses(/--offset must be a finite number/, "--ref", refMid, "--offset", "NaN", estMid);
refuses(/--offset must be a finite number/, "--ref", refMid, "--offset", " ", estMid);
refuses(/--offset needs a value/, "--ref", refMid, estMid, "--offset");
refuses(/unknown option --tol/, "--ref", refMid, "--offset", "0", "--tol", "0.1", estMid);
refuses(/all three or none/, "--ref", refMid, "--offset", "0", "--bar1", "1", estMid);
refuses(/--split must be two whole bar numbers/, "--ref", refMid, "--offset", "0", "--bar1", "1", "--bpm", "120", "--split", "18", estMid);
refuses(/--split must be two whole bar numbers/, "--ref", refMid, "--offset", "0", "--bar1", "1", "--bpm", "120", "--split", "2,x", estMid);
refuses(/--bpm must be a finite number > 0/, "--ref", refMid, "--offset", "0", "--bar1", "1", "--bpm", "0", "--split", "2,3", estMid);
refuses(/--bar1 must be a finite number/, "--ref", refMid, "--offset", "0", "--bar1", "x", "--bpm", "120", "--split", "2,3", estMid);
refuses(/1 note-on\(s\) never closed and 0 note-off/, "--ref", refMid, "--offset", "0", write("open.mid", [...note(960, 480), [1920, [0x90, 62, 100]]]));
refuses(/0 note-on\(s\) never closed and 1 note-off/, "--ref", refMid, "--offset", "0", write("stray.mid", [...note(960, 480), [1920, [0x80, 62, 0]]]));
refuses(/never closed/, "--ref", write("ref-open.mid", [[960, [0x90, 60, 100]]]), "--offset", "0", estMid);
refuses(/zero-length note/, "--ref", refMid, "--offset", "0", write("zero.mid", note(960, 0)));
// The PR #54 review (P1): the check must see through links, and a name beginning with ".." is inside the repo, not a step up.
const tag = `${process.pid}-${Date.now()}`, links = [];
const link = (name, target) => { const l = path.join(tmp, name); fs.symlinkSync(target, l, process.platform === "win32" ? "junction" : "dir"); links.push(l); return l; };
const dotName = path.join(ROOT, `..amt-${tag}`), viaLink = path.join(ROOT, "bench", "out", `amt-link-${tag}.json`), missing = path.join(ROOT, "bench", "out", `amt-missing-${tag}`);
const plain = path.join(ROOT, "bench", "out", `amt-${tag}.json`);
try {
  refuses(/outside the repository/, "--ref", refMid, "--offset", "0", "--out", plain, estMid);
  refuses(/outside the repository/, "--ref", refMid, "--offset", "0", "--out", path.join(link("to-repo", ROOT), "bench", "out", path.basename(viaLink)), estMid);
  refuses(/outside the repository/, "--ref", refMid, "--offset", "0", "--out", path.join(dotName, "x.json"), estMid);
  refuses(/outside the repository|cannot resolve/, "--ref", refMid, "--offset", "0", "--out", path.join(link("dangling", missing), "x.json"), estMid);
  ok(() => { for (const f of [plain, viaLink, dotName, missing]) assert.ok(!fs.existsSync(f), `nothing written inside the repo: ${f}`); });
} finally {
  for (const f of [dotName, missing]) fs.rmSync(f, { recursive: true, force: true }); fs.rmSync(viaLink, { force: true }); fs.rmSync(plain, { force: true });
  for (const l of links) { try { fs.unlinkSync(l); } catch { fs.rmdirSync(l); } } // remove the links themselves, never their targets
}
ok(() => {
  const out = path.join(tmp, "report", "scores.json"), r = run("--ref", refMid, "--offset", "0", "--bar1", "1", "--bpm", "120", "--split", "2,3", "--out", out, estMid);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /onset\s+TP 2 FP 1 FN 1 \| P 66\.7 R 66\.7 F 66\.7/);
  assert.match(r.stdout, /onset\+offset\s+TP 1 FP 2 FN 2/);
  assert.match(r.stdout, /not a measured timing error/);
  const j = JSON.parse(fs.readFileSync(out, "utf8")), e = j.estimates[0];
  assert.equal(j.reference.sha256, require("node:crypto").createHash("sha256").update(fs.readFileSync(refMid)).digest("hex"));
  assert.match(e.sha256, /^[0-9a-f]{64}$/); assert.ok("commit" in j.scorer);
  assert.deepEqual([e.onset.tp, e.onset.fp, e.onset.fn, e.withOffset.tp, e.withOffset.fp, e.withOffset.fn], [2, 1, 1, 1, 2, 2]);
  assert.deepEqual(e.regions.map(g => [g.name, g.refMatched, g.ref, g.estMatched, g.est]), [["pickup", 0, 0, 0, 0], ["bars 1-1", 2, 2, 2, 2], ["bars 2-2", 0, 1, 0, 1], ["bars 3-end", 0, 0, 0, 0]]);
  const again = run("--ref", refMid, "--offset", "0", "--out", out, estMid);
  assert.equal(again.status, 2); assert.match(again.stderr, /already exists/);
  assert.equal(fs.readFileSync(out, "utf8"), JSON.stringify(j, (k, v) => (v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity" : v), 2) + "\n", "the first report is untouched");
});

// 5. mir_eval agrees on every count
let seed = 20261119; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)], cases = [];
const add = (name, ref, est) => cases.push({ name, ref: ref.map(n => [n.on, n.off, n.midi]), est: est.map(n => [n.on, n.off, n.midi]), onset: match(ref, est).n, offset: match(ref, est, 0.05, true).n });
add("pr21-counterexample", [N(0.04), N(0.10)], [N(0.0), N(0.06)]);
add("onset-exactly-50ms", [N(1.0)], [N(1.05)]);
add("onset-rounds-down", [N(1.0)], [N(1.05004)]);
add("onset-just-over", [N(1.0)], [N(1.05006)]);
add("offset-just-over", [{ on: 1.0, off: 2.0, midi: 60 }], [{ on: 1.0, off: 2.20006, midi: 60 }]);
add("offset-exactly-20pct", [{ on: 1.0, off: 2.0, midi: 60 }], [{ on: 1.0, off: 2.2, midi: 60 }]);
add("offset-minimum", [{ on: 1.0, off: 1.1, midi: 60 }], [{ on: 1.0, off: 1.15, midi: 60 }]);
add("empty-estimate", [N(1.0)], []);
add("empty-reference", [], [N(1.0)]);
for (let c = 0; c < 300; c++) {
  const ref = [], est = [], k = 1 + Math.floor(rnd() * 12);
  for (let i = 0; i < k; i++) {
    const on = Math.round(10 + rnd() * 300) / 100, len = pick([0.05, 0.1, 0.25, 0.5, 1.0]), midi = pick([60, 60, 61, 62]);
    ref.push({ on, off: +(on + len).toFixed(2), midi });
    const copies = pick([0, 1, 1, 1, 2]);
    for (let q = 0; q < copies; q++) {
      const eon = Math.max(0, on + pick([-6, -5, -5, -4, -2, 0, 2, 4, 5, 5, 6]) / 100), eoff = Math.max(eon + 0.01, on + len + pick([-25, -20, -10, -5, 0, 5, 10, 20, 25]) / 100);
      est.push({ on: eon, off: eoff, midi: rnd() < 0.85 ? midi : midi + 1 });
    }
  }
  add(`random-${c}`, ref, est);
}
const py = process.env.PYTHON || "python";
if (spawnSync(py, ["-c", "import mir_eval"]).status !== 0) console.log(`NOTE: ${py} has no mir_eval; the mir_eval cross-check of the note matcher was skipped (CI runs it)`);
else ok(() => {
  const f = path.join(tmp, "cases.json"); fs.writeFileSync(f, JSON.stringify({ cases }));
  const x = spawnSync(py, [path.join(ROOT, "bench", "amt", "crosscheck_note_matching.py"), f], { encoding: "utf8" });
  assert.equal(x.status, 0, `mir_eval cross-check: ${x.stdout}${x.stderr}`);
  assert.match(x.stdout, new RegExp(`${cases.length} cases, 0 mismatches`));
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`amt note matching tests passed (${checks})`);
