#!/usr/bin/env node
/* The Basic Pitch research runner (bench/amt/run_basic_pitch.py), against a STUB basic_pitch package (no model weights are downloaded or
 * run): it refuses output paths inside the repository and directories that already hold files, never overwrites, and writes a run record
 * with the input, model and output hashes, the full settings (library defaults included), package versions, the repo commit, and the
 * model-load, first-inference and per-setting processing times kept apart. Needs Python 3 (CI's test job has it); skipped with a note if absent. */
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, ".."), SCRIPT = path.join(ROOT, "bench", "amt", "run_basic_pitch.py"), py = process.env.PYTHON || "python";
if (spawnSync(py, ["-c", "import sys; assert sys.version_info >= (3, 9)"]).status !== 0) { console.log(`NOTE: no Python 3.9+ at "${py}"; the Basic Pitch runner tests were skipped (CI runs them)`); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amt-run-")), stub = path.join(tmp, "stub", "basic_pitch"), calls = path.join(tmp, "calls.log");
fs.mkdirSync(path.join(stub, "saved_models", "icassp_2022"), { recursive: true });
fs.writeFileSync(path.join(stub, "saved_models", "icassp_2022", "nmp.onnx"), "fake onnx model bytes");
fs.writeFileSync(path.join(stub, "__init__.py"), `import os\nICASSP_2022_MODEL_PATH = os.path.join(os.path.dirname(__file__), "saved_models", "icassp_2022", "nmp")\n`);
fs.writeFileSync(path.join(stub, "inference.py"), [
  "import json, os",
  "class Model:",
  "    def __init__(self, path): self.path = str(path)",
  "class _Midi:",
  "    def __init__(self, kw): self.kw = kw",
  "    def write(self, p):",
  "        open(p, 'w').write(json.dumps(self.kw, sort_keys=True))",
  "def predict(audio_path, model_or_model_path=None, onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=127.70, melodia_trick=True, midi_tempo=120):",
  "    kw = dict(onset_threshold=onset_threshold, frame_threshold=frame_threshold, minimum_note_length=minimum_note_length)",
  `    open(${JSON.stringify(calls)}, 'a').write(json.dumps(kw) + '\\n')`,
  "    return None, _Midi(kw), [0] * int(100 * onset_threshold)",
  "",
].join("\n"));
const audio = path.join(tmp, "song.wav"); fs.writeFileSync(audio, "not really audio, the stub never reads it");
const run = (...a) => spawnSync(py, [SCRIPT, ...a], { encoding: "utf8", env: { ...process.env, PYTHONPATH: path.dirname(stub) } });
const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
let checks = 0; const refuses = (why, ...a) => { const r = run(...a); assert.equal(r.status, 2, `${why}: ${r.stdout}${r.stderr}`); assert.match(r.stderr, why); checks++; };

refuses(/usage/, audio);
refuses(/no audio file/, path.join(tmp, "missing.wav"), path.join(tmp, "out-missing"));
const inRepo = path.join(ROOT, "bench", "out", `amt-run-test-${process.pid}-${Date.now()}`);
try { refuses(/outside the repository/, audio, inRepo); assert.ok(!fs.existsSync(inRepo), "nothing created inside the repo"); checks++; }
finally { fs.rmSync(inRepo, { recursive: true, force: true }); }
// Through a link into the repo, a name beginning with "..", and a dangling link into the repo: all refused, nothing created.
const tag = `${process.pid}-${Date.now()}`, links = [];
const link = (name, target) => { const l = path.join(tmp, name); fs.symlinkSync(target, l, process.platform === "win32" ? "junction" : "dir"); links.push(l); return l; };
const dotName = path.join(ROOT, `..amt-run-${tag}`), viaLink = path.join(ROOT, "bench", "out", `amt-run-link-${tag}`), missing = path.join(ROOT, "bench", "out", `amt-run-missing-${tag}`);
try {
  refuses(/outside the repository/, audio, path.join(link("to-repo", ROOT), "bench", "out", path.basename(viaLink)));
  refuses(/outside the repository/, audio, dotName);
  refuses(/outside the repository/, audio, path.join(link("dangling", missing), "run"));
  for (const f of [viaLink, dotName, missing]) assert.ok(!fs.existsSync(f), `nothing created inside the repo: ${f}`); checks++;
} finally {
  for (const f of [viaLink, dotName, missing]) fs.rmSync(f, { recursive: true, force: true });
  for (const l of links) { try { fs.unlinkSync(l); } catch { fs.rmdirSync(l); } }
}
const busy = path.join(tmp, "busy"); fs.mkdirSync(busy); fs.writeFileSync(path.join(busy, "bp_default.mid"), "earlier result");
refuses(/already exists and is not an empty directory/, audio, busy); assert.equal(fs.readFileSync(path.join(busy, "bp_default.mid"), "utf8"), "earlier result"); checks++;
refuses(/not an empty directory/, audio, path.join(busy, "bp_default.mid"));

const out = path.join(tmp, "out"), r = run(audio, out);
assert.equal(r.status, 0, r.stdout + r.stderr); checks++;
const rec = JSON.parse(fs.readFileSync(path.join(out, "run.json"), "utf8"));
assert.equal(rec.input.sha256, sha(audio)); assert.equal(rec.model.sha256, sha(path.join(stub, "saved_models", "icassp_2022", "nmp.onnx"))); checks++;
assert.ok("commit" in rec.repo && /^[0-9a-f]{64}$/.test(rec.repo.script_sha256)); assert.ok("basic-pitch" in rec.packages && "onnxruntime" in rec.packages); checks++;
assert.deepEqual(rec.library_defaults, { onset_threshold: 0.5, frame_threshold: 0.3, minimum_note_length: 127.7, melodia_trick: true, midi_tempo: 120 }, "defaults read from predict()"); checks++;
assert.deepEqual(rec.outputs.tight.settings, { onset_threshold: 0.6, frame_threshold: 0.4, minimum_note_length: 80, melodia_trick: true, midi_tempo: 120 }); checks++;
for (const s of ["default", "tight", "loose"]) { assert.equal(rec.outputs[s].sha256, sha(path.join(out, `bp_${s}.mid`))); assert.equal(typeof rec.timing.processing_s[s], "number"); }
assert.deepEqual([rec.outputs.default.notes, rec.outputs.tight.notes, rec.outputs.loose.notes], [50, 60, 40]); checks++;
assert.equal(typeof rec.timing.model_load_s, "number"); assert.equal(typeof rec.timing.first_inference_s, "number"); checks++;
const log = fs.readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse);
assert.equal(log.length, 4, "one discarded warm-up run, then the three settings"); assert.deepEqual(log[0], log[1], "the warm-up uses the default settings"); checks++;
const before = fs.readFileSync(path.join(out, "run.json"), "utf8");
refuses(/not an empty directory/, audio, out); assert.equal(fs.readFileSync(path.join(out, "run.json"), "utf8"), before, "the earlier record is untouched"); checks++;
const empty = path.join(tmp, "empty"); fs.mkdirSync(empty); assert.equal(run(audio, empty).status, 0, "an existing EMPTY directory is accepted"); checks++;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`amt Basic Pitch runner tests passed (${checks})`);
