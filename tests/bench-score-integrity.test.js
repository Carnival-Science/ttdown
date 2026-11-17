// score.js end to end on the real synthetic predictions (run `npm run bench:synthetic` first):
//  - an answer file edited after prediction is refused (track not scored, run fails, report says why)
//  - a requirement the manifest can't meet fails the run
//  - the truth fingerprint changes when any answer file changes
// Works on copies in a temp folder; the real outputs and annotations are not touched.
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { spawnSync } = require("node:child_process");
const ROOT = path.join(__dirname, ".."), SCORE = path.join(ROOT, "bench", "score.js"), PRED = path.join(ROOT, "bench", "out", "synthetic", "predictions.json");
const MAN = path.join(ROOT, "test-songs", "manifest.json");
if (!fs.existsSync(PRED)) { console.error("Run `npm run bench:synthetic` first."); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-score-"));

function scenario(name, edit, editPred = () => {}) {
  const dir = path.join(tmp, name); fs.mkdirSync(dir);
  const m = JSON.parse(fs.readFileSync(MAN, "utf8"));
  for (const t of m.tracks) for (const k of Object.keys(t.annotations)) {         // copy every answer file
    const src = path.resolve(path.dirname(MAN), t.annotations[k]), dst = path.join(dir, `${t.id}.${path.basename(src).split(".").slice(1).join(".")}`);
    fs.copyFileSync(src, dst); t.annotations[k] = path.basename(dst);
  }
  for (const t of m.tracks) t.audio = path.resolve(path.dirname(MAN), t.audio);
  edit(m, dir);
  const mp = path.join(dir, "manifest.json"); fs.writeFileSync(mp, JSON.stringify(m));
  const pred = JSON.parse(fs.readFileSync(PRED, "utf8")); editPred(pred); fs.writeFileSync(path.join(dir, "predictions.json"), JSON.stringify(pred));
  const r = spawnSync(process.execPath, [SCORE, path.join(dir, "predictions.json"), "--manifest", mp], { encoding: "utf8" });
  return { r, scores: JSON.parse(fs.readFileSync(path.join(dir, "scores.json"), "utf8")), report: fs.readFileSync(path.join(dir, "report.md"), "utf8") };
}

const clean = scenario("clean", () => {});
assert.equal(clean.r.status, 0, clean.r.stdout + clean.r.stderr);
assert.equal(clean.scores.tracks.filter(t => t.metrics).length, 8);
assert.match(clean.report, /every annotation file matches its pinned sha256/);

const edited = scenario("edited", (m, dir) => fs.appendFileSync(path.join(dir, "house124_Cmin.beats.txt"), "70.5\t1\n")); // one extra beat
assert.equal(edited.r.status, 1);
const house = edited.scores.tracks.find(t => t.id === "house124_Cmin");
assert.equal(house.status, "annotation-checksum-mismatch"); assert.equal(house.metrics, undefined);
assert.match(edited.r.stdout, /house124_Cmin: beats annotation changed/);
assert.match(edited.report, /Requirement \/ integrity failures/);
assert.notEqual(edited.scores.meta.truthFingerprint, clean.scores.meta.truthFingerprint);
assert.deepEqual(edited.scores.meta.annotationsChangedSincePrediction, ["house124_Cmin"]);

const uncovered = scenario("uncovered", m => { delete m.tracks[0].annotations.chords; delete m.tracks[0].annotationSha256.chords; });
assert.equal(uncovered.r.status, 1); assert.match(uncovered.r.stdout, /chords required on every track; missing on 1: pop127_Amaj/);
assert.equal(clean.scores.meta.completeness.complete, true);
assert.deepEqual(edited.scores.meta.completeness.unscorableAnnotations, [{ id: "house124_Cmin", status: "annotation-checksum-mismatch" }]); // ground truth, not the analyzer
assert.deepEqual(edited.scores.meta.completeness.analyzerFailures, []);

// required-track failures make the run unsuccessful, keep the reports, and say which kind of failure it was
const missing = scenario("missing", () => {}, p => { p.tracks = p.tracks.filter(t => t.id !== "trap142_Fsmin"); });
assert.equal(missing.r.status, 1);
assert.deepEqual(missing.scores.meta.completeness.missingPredictions, [{ id: "trap142_Fsmin", status: "no-prediction" }]);
assert.equal(missing.scores.meta.completeness.scored, 7); assert.equal(missing.scores.meta.completeness.required, 8);
assert.match(missing.report, /INCOMPLETE: 7 of 8 required tracks scored/); assert.match(missing.r.stdout, /no usable prediction: trap142_Fsmin/);
assert.ok(fs.readFileSync(path.join(tmp, "missing", "tracks.csv"), "utf8").includes("trap142_Fsmin,synthetic,no-prediction"));        // still listed in the CSV
const crashed = scenario("crashed", () => {}, p => { const t = p.tracks.find(x => x.id === "lead120_Amin"); t.status = "analysis-failed"; t.message = "Couldn't read that file"; delete t.full; });
assert.equal(crashed.r.status, 1);
assert.deepEqual(crashed.scores.meta.completeness.analyzerFailures, [{ id: "lead120_Amin", status: "analysis-failed" }]);
assert.deepEqual(crashed.scores.meta.completeness.missingPredictions, []); assert.match(crashed.report, /Analyzer failures \(crash, timeout or page errors\): lead120_Amin/);
const pageErr = scenario("pageerr", () => {}, p => { p.tracks[1].pageErrors = ["TypeError: x is undefined"]; });
assert.equal(pageErr.r.status, 1); assert.match(pageErr.scores.meta.completeness.analyzerFailures[0].status, /page-errors \(1\); metrics kept/);
assert.ok(pageErr.scores.tracks[1].metrics);                                                                                     // diagnostics preserved

// a declared gap: no beats inside, predictions inside are not scored, the continuity requirement is met
const gapped = scenario("gapped", (m, dir) => {
  const f = path.join(dir, "house124_Cmin.beats.txt"), L = fs.readFileSync(f, "utf8").trim().split("\n").filter(l => { const t = +l.split("\t")[0]; return t < 20 || t > 30; });
  fs.writeFileSync(f, L.join("\n") + "\ngap 19.9 30.1 test: pretend the pulse here could not be verified\n");
  m.tracks.find(t => t.id === "house124_Cmin").annotationSha256.beats = require("node:crypto").createHash("sha256").update(fs.readFileSync(f)).digest("hex");
});
assert.equal(gapped.r.status, 0, gapped.r.stdout);
const hg = gapped.scores.tracks.find(t => t.id === "house124_Cmin");
assert.deepEqual(hg.metrics.declaredGaps.count, 1); assert.equal(hg.metrics.drift.segments, 2); assert.equal(hg.metrics.drift.undeclaredGaps, 0);
assert.ok(!hg.inputs.trackedBeats.some(t => t > 19.9 && t < 30.1));
assert.ok(hg.metrics.beats.fp <= clean.scores.tracks.find(t => t.id === "house124_Cmin").metrics.beats.fp);              // no new false positives from the gap

fs.rmSync(tmp, { recursive: true, force: true });
console.log("score integrity tests passed");
