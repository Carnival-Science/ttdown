// Scorable regions end to end through bench/score.js, on the real synthetic predictions (run `npm run bench:synthetic` first).
// Proves: whole-track regions change nothing; an excerpt-annotated track is wrongly punished WITHOUT regions and fairly scored WITH them;
// disjoint regions and half-open boundaries count exactly the right events; bad regions fail the run; empty regions don't crash.
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const ROOT = path.join(__dirname, ".."), SCORE = path.join(ROOT, "bench", "score.js"), PRED = path.join(ROOT, "bench", "out", "synthetic", "predictions.json"), MAN = path.join(ROOT, "test-songs", "manifest.json");
if (!fs.existsSync(PRED)) { console.error("Run `npm run bench:synthetic` first."); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-regions-")), sha = b => crypto.createHash("sha256").update(b).digest("hex");
const ID = "pop127_Amaj";
const lines = f => fs.readFileSync(f, "utf8").split("\n").filter(Boolean);

function scenario(name, edit) {
  const dir = path.join(tmp, name); fs.mkdirSync(dir);
  const m = JSON.parse(fs.readFileSync(MAN, "utf8"));
  for (const t of m.tracks) { for (const k of Object.keys(t.annotations)) { const src = path.resolve(path.dirname(MAN), t.annotations[k]), dst = path.join(dir, `${t.id}.${path.basename(src).split(".").slice(1).join(".")}`); fs.copyFileSync(src, dst); t.annotations[k] = path.basename(dst); } t.audio = path.resolve(path.dirname(MAN), t.audio); }
  m.tracks = m.tracks.filter(t => t.id === ID);                                  // one track keeps every number checkable by hand
  const T = m.tracks[0];
  const rewrite = (kind, fn) => { const f = path.join(dir, T.annotations[kind]); fs.writeFileSync(f, fn(lines(f)).join("\n") + "\n"); T.annotationSha256[kind] = sha(fs.readFileSync(f)); };
  edit(T, rewrite, dir);
  const mp = path.join(dir, "manifest.json"); fs.writeFileSync(mp, JSON.stringify(m));
  const pred = JSON.parse(fs.readFileSync(PRED, "utf8")); pred.tracks = pred.tracks.filter(t => t.id === ID);
  pred.manifest = { ...pred.manifest, version: m.version, sha256: sha(fs.readFileSync(mp)) };
  fs.writeFileSync(path.join(dir, "predictions.json"), JSON.stringify(pred));
  const r = spawnSync(process.execPath, [SCORE, path.join(dir, "predictions.json"), "--manifest", mp], { encoding: "utf8" });
  const sj = path.join(dir, "scores.json");
  return { r, dir, mp, scores: fs.existsSync(sj) ? JSON.parse(fs.readFileSync(sj, "utf8")) : null, tr: fs.existsSync(sj) ? JSON.parse(fs.readFileSync(sj, "utf8")).tracks[0] : null, report: fs.existsSync(path.join(dir, "report.md")) ? fs.readFileSync(path.join(dir, "report.md"), "utf8") : "" };
}
const truthBeats = lines(path.join(ROOT, "test-songs", "truth", `${ID}.beats.txt`)).map(l => Number(l.split(/\s+/)[0]));
const inBeats = (a, b) => truthBeats.filter(t => t >= a && t < b).length;

// 0. baseline: no regions
const base = scenario("base", () => {});
assert.equal(base.r.status, 0, base.r.stdout + base.r.stderr); assert.equal(base.tr.scorable, undefined);
const B = base.tr.metrics;

// 1. a region covering the whole track changes nothing (full-track behaviour preserved)
const whole = scenario("whole", T => { T.scorable = [{ start: 0, end: 70.4 }]; });
assert.equal(whole.r.status, 0, whole.r.stdout + whole.r.stderr);
assert.deepEqual(whole.tr.metrics, B, "a whole-track region gives identical metrics");
assert.deepEqual(whole.tr.classes, base.tr.classes);
assert.equal(whole.tr.scorable.regions, 1);

// 2/3. an excerpt-annotated track: first 20 s only
const excerpt = (T, rewrite) => {
  rewrite("beats", L => L.filter(l => Number(l.split(/\s+/)[0]) < 20));
  rewrite("drums", L => L.filter(l => Number(l.split(/\s+/)[0]) < 20));
  rewrite("bass", L => L.filter(l => Number(l.split(/\s+/)[0]) < 20));
  rewrite("chords", L => L.filter(l => Number(l.split(/\s+/)[0]) < 20).map(l => { const [a, b, c] = l.split(/\s+/); return [a, Math.min(Number(b), 20).toFixed(6), c].join("\t"); }));
};
const naive = scenario("excerpt-no-regions", excerpt);
assert.equal(naive.r.status, 0, naive.r.stdout);
assert.ok(naive.tr.metrics.beats.P < 0.5, "WITHOUT regions the 50 s of predictions beyond the annotated 20 s count as false positives: beat precision " + naive.tr.metrics.beats.P);
assert.ok(naive.tr.metrics.drums.kick.w50.P < 0.5, "same for drums: kick precision " + naive.tr.metrics.drums.kick.w50.P);
const fair = scenario("excerpt-regions", (T, rewrite, dir) => { excerpt(T, rewrite, dir); T.scorable = [{ start: 0, end: 20 }]; });
assert.equal(fair.r.status, 0, fair.r.stdout);
assert.ok(fair.tr.metrics.beats.P >= 0.95 && fair.tr.metrics.beats.R >= 0.95, `WITH regions beats are scored fairly (P ${fair.tr.metrics.beats.P}, R ${fair.tr.metrics.beats.R})`);
assert.ok(fair.tr.metrics.drums.kick.w50.P >= 0.9 && fair.tr.metrics.drums.kick.w50.R >= 0.9, "kick " + JSON.stringify(fair.tr.metrics.drums.kick.w50));
assert.ok(naive.tr.metrics.bass.onset.P < 0.3, "bass precision without regions: " + naive.tr.metrics.bass.onset.P);
assert.ok(fair.tr.metrics.bass.onset.R >= 0.95 && Math.abs(fair.tr.metrics.bass.onset.P - B.bass.onset.P) < 0.15, `with regions bass matches the full-track level (P ${fair.tr.metrics.bass.onset.P} vs ${B.bass.onset.P}, R ${fair.tr.metrics.bass.onset.R})`);
assert.ok(Math.abs(fair.tr.metrics.chords.refSeconds - 20) < 1e-3, "chords are scored over the 20 s region only: " + fair.tr.metrics.chords.refSeconds); assert.ok(fair.tr.metrics.chords.majmin >= 0.95);
assert.equal(fair.tr.scorable.seconds, 20); assert.ok(fair.tr.scorable.fractionOfTrack > 0.28 && fair.tr.scorable.fractionOfTrack < 0.29);
assert.match(fair.report, /Scorable regions/); assert.match(fair.report, new RegExp(ID + " \\| 1 \\| 20 \\|"));
assert.equal(fair.tr.metrics.drift.firstExceedSec, null, "drift is judged inside the region only");

// 4. disjoint regions: counts are exactly the truth beats inside them (nothing from the gap)
const disj = scenario("disjoint", T => { T.scorable = [{ start: 0, end: 10 }, { start: 30, end: 40 }]; });
assert.equal(disj.r.status, 0, disj.r.stdout);
const expectBeats = inBeats(0, 10) + inBeats(30, 40);
assert.equal(disj.tr.metrics.beats.tp + disj.tr.metrics.beats.fn, expectBeats, "scored reference beats = beats inside the regions");
assert.ok(disj.tr.metrics.beats.tp + disj.tr.metrics.beats.fp <= expectBeats + 4, "predictions in the gap and outside are not counted");
assert.ok(disj.tr.metrics.beats.P >= 0.9); assert.equal(disj.tr.scorable.regions, 2); assert.equal(disj.tr.scorable.seconds, 20);

// 5. half-open boundaries on exact beat times: [beat 10, beat 30) holds exactly 20 reference beats
const bnd = scenario("boundary", T => { T.scorable = [{ start: truthBeats[10], end: truthBeats[30] }]; });
assert.equal(bnd.r.status, 0, bnd.r.stdout);
assert.equal(bnd.tr.metrics.beats.tp + bnd.tr.metrics.beats.fn, 20, "start included, end excluded");
// the same boundaries shifted by one sample-ish keep the count, and adjacent regions give the same total as one region
const split = scenario("split", T => { T.scorable = [{ start: truthBeats[10], end: truthBeats[20] }, { start: truthBeats[20], end: truthBeats[30] }]; });
assert.equal(split.r.status, 0, split.r.stdout); assert.equal(split.tr.metrics.beats.tp + split.tr.metrics.beats.fn, 20, "an event on a shared edge is counted once");

// 6. invalid regions fail the run with a clear message
for (const [name, regions, msg] of [["overlap", [{ start: 0, end: 10 }, { start: 5, end: 20 }], /overlaps or precedes/], ["backwards", [{ start: 9, end: 3 }], /must end after it starts/], ["empty", [], /non-empty/], ["negative", [{ start: -2, end: 4 }], /before 0/]]) {
  const bad = scenario("bad-" + name, T => { T.scorable = regions; }); assert.equal(bad.r.status, 1, name); assert.match(bad.r.stdout + bad.r.stderr, msg, name);
}

// 7. AUDIT follow-up: a region outside the recording is rejected (it used to "complete" with only tempo and key scored)
for (const [name, regions, msg] of [["beyond-end", [{ start: 500, end: 600 }], /starts at 500 s, after the recording ends/], ["overhang", [{ start: 60, end: 80 }], /ends at 80 s, 10.00 s after the recording ends/]]) {
  const out = scenario(name, T => { T.scorable = regions; });
  assert.equal(out.r.status, 1, name); assert.match(out.r.stdout, msg, name); assert.equal(out.tr.status, "invalid-scorable-region", name); assert.equal(out.tr.metrics, undefined, name + ": nothing was scored");
  assert.match(out.report, /Unscorable ground truth/, name); assert.equal(out.scores.meta.completeness.complete, false);
}
assert.equal(scenario("end-slack", T => { T.scorable = [{ start: 60, end: 70.4 }]; }).r.status, 0, "up to 0.5 s of slack past the end is allowed");

// 7b. AUDIT follow-up: "no events" must be told apart from "nobody annotated this region". Undeclared emptiness is a validation failure.
const undeclared = scenario("undeclared-silence", (T, rewrite) => {
  const inGap = l => { const t = Number(l.split(/\s+/)[0]); return t >= 20 && t < 40; };
  rewrite("drums", L => L.filter(l => !inGap(l))); T.scorable = [{ start: 20, end: 40 }];
});
assert.equal(undeclared.r.status, 1); assert.match(undeclared.r.stdout, /scorable\[0\] \(20-40 s\) has no annotated drums and does not declare it silent/);
assert.equal(scenario("silent-beats", T => { T.scorable = [{ start: 20, end: 40, silent: ["beats"] }]; }).r.status, 1, "beats cannot be declared silent");
const noBeats = scenario("no-beats-in-region", (T, rewrite) => { rewrite("beats", L => L.filter(l => Number(l.split(/\s+/)[0]) < 20)); T.scorable = [{ start: 20, end: 40 }]; });
assert.equal(noBeats.r.status, 1); assert.match(noBeats.r.stdout, /no annotated beats/);

// 8. AUDIT: a fully annotated drumless, bassless breakdown. The annotation exists and says "nothing here", so hits and notes the analyzer
//    invents there are false positives. They used to disappear (the whole kind was dropped from scoring when no events were left in the region).
const breakdown = scenario("annotated-silence", (T, rewrite) => {
  const inGap = l => { const t = Number(l.split(/\s+/)[0]); return t >= 20 && t < 40; };
  rewrite("drums", L => L.filter(l => !inGap(l))); rewrite("bass", L => L.filter(l => !inGap(l)));
  T.scorable = [{ start: 20, end: 40, silent: ["drums", "bass"] }];   // declared: annotated as absent, not a missing annotation
});
assert.equal(breakdown.r.status, 0, breakdown.r.stdout + breakdown.r.stderr);
const bk = breakdown.tr.metrics.drums.kick.w50;
assert.ok(bk.fp > 0 && bk.tp === 0 && bk.fn === 0 && bk.f === 0 && !bk.vacuous, "kicks invented in an annotated drumless region are false positives: " + JSON.stringify(bk));
assert.equal(breakdown.tr.classes.drums.kick, "extra", "and classified as extra hits, not n/a");
assert.ok(breakdown.tr.metrics.drums.hihat.w50.fp > 0 && breakdown.tr.metrics.drums.hihat.w50.f === 0);
assert.ok(breakdown.tr.metrics.bass.onset.fp > 0 && breakdown.tr.metrics.bass.onset.tp === 0 && breakdown.tr.metrics.bass.onset.f === 0, "bass notes invented in an annotated bassless region: " + JSON.stringify(breakdown.tr.metrics.bass.onset));
assert.equal(breakdown.tr.classes.bass, "extra"); assert.equal(breakdown.tr.metrics.bass.noteF, 0);
assert.ok(breakdown.tr.metrics.beats.tp > 0, "beats in the same region are still scored normally");
// the same excerpt with the drums and bass annotation NOT removed is scored as before (sanity: the fix did not change real regions)
const kept = scenario("annotated-present", T => { T.scorable = [{ start: 20, end: 40 }]; });
assert.ok(kept.tr.metrics.drums.kick.w50.f > 0.9);

// 8b. AUDIT follow-up: declared beat gaps. Predictions strictly inside a gap are not scored; the cross-check applies its own gap filter.
const gapped = scenario("gap", (T, rewrite) => {
  const bt = lines(path.join(path.dirname(MAN), "truth", `${ID}.beats.txt`)).map(l => Number(l.split(/\s+/)[0])), before = bt.filter(x => x < 20).pop(), after = bt.find(x => x >= 30);
  rewrite("beats", L => L.filter(l => { const t = Number(l.split(/\s+/)[0]); return t < 20 || t >= 30; }).concat([`gap ${before} ${after} free-time passage`]));
});
assert.equal(gapped.r.status, 0, gapped.r.stdout + gapped.r.stderr); assert.equal(gapped.tr.metrics.declaredGaps.count, 1);
assert.ok(gapped.tr.metrics.beats.fp <= base.tr.metrics.beats.fp, "no false positives are charged inside the gap");

// 9. independent check against mir_eval with its OWN masks (references and raw predictions): fair excerpt, disjoint, boundary, annotated silence
const py = process.env.PYTHON || "python";
if (spawnSync(py, ["-c", "import mir_eval"]).status !== 0) console.log(`NOTE: ${py} has no mir_eval; the independent region cross-check was skipped (CI runs it)`);
else for (const sc of [fair, disj, bnd, split, breakdown, kept, gapped, base]) {
  const x = spawnSync(py, [path.join(ROOT, "bench", "crosscheck_mir_eval.py"), path.join(sc.dir, "scores.json"), "--manifest", sc.mp], { encoding: "utf8" });
  assert.equal(x.status, 0, `mir_eval cross-check of ${path.basename(sc.dir)}: ${x.stdout}${x.stderr}`);
}
// 10. the cross-check has teeth for bass, chords and beats: a scorer that silently dropped events (and recorded the dropped copy in `inputs`) is caught,
//     because the checker rebuilds every evaluated event from predictions.json instead of trusting scores.json
if (spawnSync(py, ["-c", "import mir_eval"]).status === 0) {
  const tamper = (sc, name, edit) => { const d = path.join(tmp, "tamper-" + name); fs.mkdirSync(d, { recursive: true }); for (const f of ["predictions.json", "scores.json"]) fs.copyFileSync(path.join(sc.dir, f), path.join(d, f));
    const sj = JSON.parse(fs.readFileSync(path.join(d, "scores.json"), "utf8")); edit(sj.tracks[0]); fs.writeFileSync(path.join(d, "scores.json"), JSON.stringify(sj));
    return spawnSync(py, [path.join(ROOT, "bench", "crosscheck_mir_eval.py"), path.join(d, "scores.json"), "--manifest", sc.mp], { encoding: "utf8" }); };
  const dropBass = tamper(kept, "bass", t => { t.inputs.bass = t.inputs.bass.slice(0, 3); t.metrics.bass.onset = { ...t.metrics.bass.onset, tp: 3, fp: 0, fn: 0, P: 1, R: 1, f: 1 }; });
  assert.equal(dropBass.status, 1); assert.match(dropBass.stdout, /bass onset F/, "a scorer that dropped bass notes disagrees with the notes rebuilt from predictions.json");
  const dropChords = tamper(kept, "chords", t => { t.inputs.chords = t.inputs.chords.slice(0, 2); t.metrics.chords = { ...t.metrics.chords, root: 1, majmin: 1 }; });
  assert.equal(dropChords.status, 1); assert.match(dropChords.stdout, /chords (root|majmin)/);
  const badGap = tamper(gapped, "gap", t => { t.metrics.beats = { ...t.metrics.beats, f: 0.123 }; });
  assert.equal(badGap.status, 1); assert.match(badGap.stdout, /beats F/);
}
console.log("bench regions scoring tests passed");
