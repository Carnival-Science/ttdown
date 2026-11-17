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

function scenario(name, edit) {
  const dir = path.join(tmp, name); fs.mkdirSync(dir);
  const m = JSON.parse(fs.readFileSync(MAN, "utf8"));
  for (const t of m.tracks) for (const k of Object.keys(t.annotations)) {         // copy every answer file
    const src = path.resolve(path.dirname(MAN), t.annotations[k]), dst = path.join(dir, `${t.id}.${path.basename(src).split(".").slice(1).join(".")}`);
    fs.copyFileSync(src, dst); t.annotations[k] = path.basename(dst);
  }
  for (const t of m.tracks) t.audio = path.resolve(path.dirname(MAN), t.audio);
  edit(m, dir);
  const mp = path.join(dir, "manifest.json"); fs.writeFileSync(mp, JSON.stringify(m));
  fs.copyFileSync(PRED, path.join(dir, "predictions.json"));
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

fs.rmSync(tmp, { recursive: true, force: true });
console.log("score integrity tests passed");
