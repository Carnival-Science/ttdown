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

function scenario(name, edit, editPred = () => {}, { afterWrite = () => {}, extraArgs = [], outSub = "." } = {}) {
  const dir = path.join(tmp, name); fs.mkdirSync(dir);
  const m = JSON.parse(fs.readFileSync(MAN, "utf8"));
  for (const t of m.tracks) for (const k of Object.keys(t.annotations)) {         // copy every answer file
    const src = path.resolve(path.dirname(MAN), t.annotations[k]), dst = path.join(dir, `${t.id}.${path.basename(src).split(".").slice(1).join(".")}`);
    fs.copyFileSync(src, dst); t.annotations[k] = path.basename(dst);
  }
  for (const t of m.tracks) t.audio = path.resolve(path.dirname(MAN), t.audio);
  edit(m, dir);
  const mp = path.join(dir, "manifest.json"); fs.writeFileSync(mp, JSON.stringify(m));
  // by default the copied manifest is the one "used for prediction"; editPred/afterWrite can break that on purpose
  const pred = JSON.parse(fs.readFileSync(PRED, "utf8"));
  pred.manifest = { ...pred.manifest, version: m.version, sha256: require("node:crypto").createHash("sha256").update(fs.readFileSync(mp)).digest("hex") };
  editPred(pred); fs.writeFileSync(path.join(dir, "predictions.json"), JSON.stringify(pred));
  afterWrite(mp, dir);
  const r = spawnSync(process.execPath, [SCORE, path.join(dir, "predictions.json"), "--manifest", mp, ...extraArgs], { encoding: "utf8" });
  const out = fs.existsSync(path.join(dir, outSub, "scores.json")) ? path.join(dir, outSub) : null;
  return { r, dir, scores: out && JSON.parse(fs.readFileSync(path.join(out, "scores.json"), "utf8")), report: out && fs.readFileSync(path.join(out, "report.md"), "utf8") };
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

// uncaught page errors fail (above); ordinary console warnings/errors are reported but don't fail the run
const noisy = scenario("console", () => {}, p => { p.tracks[2].console = { warning: 2, error: 1, samples: ["warning: AudioContext was not allowed to start", "error: Failed to load resource: net::ERR_INTERNET_DISCONNECTED"] }; });
assert.equal(noisy.r.status, 0, noisy.r.stdout);
assert.equal(noisy.scores.meta.completeness.complete, true);
assert.match(noisy.report, /Browser console \(diagnostic only; does not fail the run\)[\s\S]*house124_Cmin: 2 warning\(s\), 1 console error\(s\)/);
assert.match(pageErr.report, /Analyzer failures \(crash, timeout or page errors\): trap142_Fsmin \(page-errors \(1\)/);
assert.deepEqual(pageErr.scores.tracks[1].pageErrorSamples, ["TypeError: x is undefined"]);

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

// manifest reproducibility: scoring against a manifest other than the one used for prediction fails and writes nothing
const changeAfter = mp => { const m = JSON.parse(fs.readFileSync(mp, "utf8")); m.tracks[0].tags.style = "edited after prediction"; fs.writeFileSync(mp, JSON.stringify(m)); };
const drifted = scenario("drifted", () => {}, () => {}, { afterWrite: changeAfter });
assert.equal(drifted.r.status, 1); assert.match(drifted.r.stderr, /Not scoring: the manifest differs/); assert.equal(drifted.scores, null);
// --rescore alone is not enough: the version must go up and the revision must be recorded
const noBump = scenario("nobump", () => {}, () => {}, { afterWrite: changeAfter, extraArgs: ["--rescore"] });
assert.equal(noBump.r.status, 1); assert.match(noBump.r.stderr, /needs manifest.version above v3/);
const bumpNoReason = scenario("noreason", () => {}, () => {}, { extraArgs: ["--rescore"], afterWrite: mp => { const m = JSON.parse(fs.readFileSync(mp, "utf8")); m.version = 4; fs.writeFileSync(mp, JSON.stringify(m)); } });
assert.equal(bumpNoReason.r.status, 1); assert.match(bumpNoReason.r.stderr, /needs a revisions entry for v4/);
// the intended path: corrected answer file + new hash + version bump + revision note + --rescore
const revised = scenario("revised", () => {}, () => {}, { extraArgs: ["--rescore"], outSub: "rescore-v4", afterWrite: (mp, dir) => {
  const m = JSON.parse(fs.readFileSync(mp, "utf8")), f = path.join(dir, "house124_Cmin.key.txt");
  fs.writeFileSync(f, "C minor\n# reviewed by second annotator 2026-12-02\n");
  m.tracks.find(t => t.id === "house124_Cmin").annotationSha256.key = require("node:crypto").createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  m.version = 4; m.revisions = [{ version: 4, date: "2026-12-02", reason: "house124 key file re-reviewed; added reviewer note", tracks: ["house124_Cmin"] }];
  fs.writeFileSync(mp, JSON.stringify(m)); } });
assert.equal(revised.r.status, 0, revised.r.stdout + revised.r.stderr);
assert.equal(revised.scores.meta.rescore.fromManifestVersion, 3); assert.equal(revised.scores.meta.rescore.toManifestVersion, 4);
assert.match(revised.report, /Re-scored\*\* against manifest v4 \(revision 2026-12-02: house124 key file re-reviewed/);
assert.ok(!fs.existsSync(path.join(revised.dir, "scores.json")));                 // original location untouched; results are versioned
assert.match(revised.r.stdout, /RE-SCORED against manifest v4 \(predictions from v3\)/);

// a repeat re-score must not silently overwrite an existing revision result
const before = fs.readFileSync(path.join(revised.dir, "rescore-v4", "scores.json"));
const again = spawnSync(process.execPath, [SCORE, path.join(revised.dir, "predictions.json"), "--manifest", path.join(revised.dir, "manifest.json"), "--rescore"], { encoding: "utf8" });
assert.equal(again.status, 1, again.stdout + again.stderr); assert.match(again.stderr, /rescore-v4 already exists/);
assert.ok(before.equals(fs.readFileSync(path.join(revised.dir, "rescore-v4", "scores.json"))));          // byte-identical: untouched

// a revision may change answers, never the audio: old predictions can't be scored as if they came from other audio
const swapped = scenario("swapped", () => {}, () => {}, { extraArgs: ["--rescore"], outSub: "rescore-v4", afterWrite: mp => {
  const m = JSON.parse(fs.readFileSync(mp, "utf8")); m.tracks.find(t => t.id === "swing100_Dmin").sha256 = "e".repeat(64); // "new master" in the manifest
  m.version = 4; m.revisions = [{ version: 4, date: "2026-12-03", reason: "replaced swing100 with the label's final master", tracks: ["swing100_Dmin"] }];
  fs.writeFileSync(mp, JSON.stringify(m)); } });
assert.equal(swapped.r.status, 1, swapped.r.stdout + swapped.r.stderr);
const sw = swapped.scores.tracks.find(t => t.id === "swing100_Dmin");
assert.equal(sw.status, "audio-changed-since-prediction"); assert.equal(sw.metrics, undefined);
assert.deepEqual(swapped.scores.meta.completeness.missingPredictions, [{ id: "swing100_Dmin", status: "audio-changed-since-prediction" }]);
assert.match(swapped.r.stdout, /no usable prediction: swing100_Dmin \(audio-changed-since-prediction\)/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("score integrity tests passed");
