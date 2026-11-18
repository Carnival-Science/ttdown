// Melody scoring end to end through bench/score.js on the real synthetic predictions (run `npm run bench:synthetic` first):
// the analyzer's own hook scored note by note, other models via --candidate (perfect, wrong octave, empty, unlisted, invalid),
// per-kind scopes, annotated silence, provenance, and an independent mir_eval check of every positive scenario.
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const ROOT = path.join(__dirname, ".."), SCORE = path.join(ROOT, "bench", "score.js"), PRED = path.join(ROOT, "bench", "out", "synthetic", "predictions.json"), MAN = path.join(ROOT, "test-songs", "manifest.json");
if (!fs.existsSync(PRED)) { console.error("Run `npm run bench:synthetic` first."); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-melody-")), sha = b => crypto.createHash("sha256").update(b).digest("hex");
const ID = "lead120_Amin", truthNotes = fs.readFileSync(path.join(ROOT, "test-songs", "truth", `${ID}.melody_lead.txt`), "utf8").trim().split("\n").map(l => { const w = l.split(/\s+/).map(Number); return { onset: w[0], offset: w[1], midi: w[2] }; });

function scenario(name, edit = () => {}, { candidate = null } = {}) {
  const dir = path.join(tmp, name); fs.mkdirSync(dir);
  const m = JSON.parse(fs.readFileSync(MAN, "utf8"));
  for (const t of m.tracks) { for (const k of Object.keys(t.annotations)) { const src = path.resolve(path.dirname(MAN), t.annotations[k]), dst = path.join(dir, `${t.id}.${path.basename(src).split(".").slice(1).join(".")}`); fs.copyFileSync(src, dst); t.annotations[k] = path.basename(dst); } t.audio = path.resolve(path.dirname(MAN), t.audio); }
  m.tracks = m.tracks.filter(t => t.id === ID); const T = m.tracks[0];
  const writeAnn = (kind, text) => { const f = path.join(dir, `${ID}.${kind}.txt`); fs.writeFileSync(f, text); T.annotations[kind] = path.basename(f); T.annotationSha256[kind] = sha(fs.readFileSync(f)); };
  edit(T, writeAnn, dir);
  const mp = path.join(dir, "manifest.json"); fs.writeFileSync(mp, JSON.stringify(m));
  const pred = JSON.parse(fs.readFileSync(PRED, "utf8")); pred.tracks = pred.tracks.filter(t => t.id === ID); pred.manifest = { ...pred.manifest, version: m.version, sha256: sha(fs.readFileSync(mp)) };
  fs.writeFileSync(path.join(dir, "predictions.json"), JSON.stringify(pred));
  const args = [SCORE, path.join(dir, "predictions.json"), "--manifest", mp];
  if (candidate) { const cp = path.join(dir, "candidate.json"); fs.writeFileSync(cp, JSON.stringify(candidate)); args.push("--candidate", cp); }
  const r = spawnSync(process.execPath, args, { encoding: "utf8" }), sj = path.join(dir, "scores.json");
  const scores = fs.existsSync(sj) ? JSON.parse(fs.readFileSync(sj, "utf8")) : null;
  return { r, dir, mp, scores, tr: scores && scores.tracks[0], report: fs.existsSync(path.join(dir, "report.md")) ? fs.readFileSync(path.join(dir, "report.md"), "utf8") : "" };
}
const cand = (kinds, name = "test-model") => ({ name, version: "1", tracks: { [ID]: kinds } });
const shift = (l, f) => l.map(n => f(n));

// 1. the analyzer's own hook, scored note by note against the exact lead line
const base = scenario("analyzer");
assert.equal(base.r.status, 0, base.r.stdout + base.r.stderr);
const L = base.tr.metrics.melody_lead;
assert.equal(L.source, "analyzer hook"); assert.equal(L.nRef, 150); assert.ok(L.onset.F > 0.95, "the old hook metric: onsets are found (F " + L.onset.F + ")");
assert.equal(L.pitchOnset.F, L.onset.F, "on this synthetic line the pitches are right too");
assert.ok(L.full.F < L.onset.F - 0.1, `but note durations are not: onset+pitch+offset F ${L.full.F} vs onset-only ${L.onset.F}`);
assert.ok(L.frames.rawPitchAccuracy < 0.9, "frame-level raw pitch accuracy exposes the same gap: " + L.frames.rawPitchAccuracy); assert.deepEqual(L.config, { onsetTol: 0.05, pitchTolCents: 50, offsetRatio: 0.2, offsetMinTol: 0.05 });
assert.equal(base.tr.classes.melody_lead, "timing-or-duration"); assert.match(base.report, /Lead melody note F \(onset \+ pitch/); assert.match(base.report, /melody_lead/);
// the synthetic songs without a lead annotation are unaffected (kind not annotated: skipped, not scored)
const all = JSON.parse(fs.readFileSync(path.join(ROOT, "bench", "out", "synthetic", "scores.json"), "utf8")).tracks; assert.ok(all.filter(t => t.id !== ID).every(t => t.metrics && t.metrics.melody_lead === undefined));

// 2. another model, evaluated identically through --candidate
const perfect = scenario("cand-perfect", () => {}, { candidate: cand({ melody_lead: truthNotes }) });
assert.equal(perfect.r.status, 0, perfect.r.stdout + perfect.r.stderr); assert.equal(perfect.tr.metrics.melody_lead.full.F, 1); assert.equal(perfect.tr.metrics.melody_lead.frames.rawPitchAccuracy, 1); assert.equal(perfect.tr.classes.melody_lead, "ok");
assert.match(perfect.tr.metrics.melody_lead.source, /candidate test-model 1/); assert.deepEqual(perfect.scores.meta.candidate.name, "test-model"); assert.equal(perfect.scores.meta.candidate.sha256.length, 64);
const octave = scenario("cand-octave", () => {}, { candidate: cand({ melody_lead: shift(truthNotes, n => ({ ...n, midi: n.midi + 12 })) }) });
assert.equal(octave.tr.metrics.melody_lead.onset.F, 1); assert.equal(octave.tr.metrics.melody_lead.pitchOnset.F, 0); assert.equal(octave.tr.classes.melody_lead, "octave"); assert.equal(octave.tr.metrics.melody_lead.octave.rate, 1);
assert.equal(octave.tr.metrics.melody_lead.frames.rawChromaAccuracy, 1, "an octave error is a perfect chroma"); assert.equal(octave.tr.metrics.melody_lead.frames.rawPitchAccuracy, 0);
const empty = scenario("cand-empty", () => {}, { candidate: cand({ melody_lead: [] }) });
assert.equal(empty.tr.metrics.melody_lead.pitchOnset.F, 0); assert.equal(empty.tr.metrics.melody_lead.pitchOnset.fn, 150); assert.equal(empty.tr.classes.melody_lead, "missed");
const unlisted = scenario("cand-unlisted", () => {}, { candidate: cand({ melody_vocal: truthNotes }) });
assert.equal(unlisted.tr.metrics.melody_lead, null, "a kind the candidate does not list is NOT evaluated (no output), different from an empty list"); assert.deepEqual(unlisted.tr.melodyNotEvaluated, ["melody_lead"]);
const bad = scenario("cand-invalid", () => {}, { candidate: cand({ melody_lead: [{ onset: 2, offset: 1, midi: 60 }] }) });
assert.equal(bad.r.status, 2); assert.match(bad.r.stderr, /melody_lead must be a list of \{ onset, offset, midi \}/);

// 3. a vocal melody annotation with no vocal prediction anywhere is "not evaluated", never F 0 by default
const vocalOnly = scenario("vocal-no-pred", (T, ann) => { ann("melody_vocal", "1\t2\t60\n2\t3\t62 ambiguous\n3.1\t3.2\t70 unpitched\n"); });
assert.equal(vocalOnly.r.status, 0, vocalOnly.r.stdout + vocalOnly.r.stderr); assert.equal(vocalOnly.tr.metrics.melody_vocal, null); assert.ok(vocalOnly.tr.melodyNotEvaluated.includes("melody_vocal"));
const vocalPred = scenario("vocal-pred", (T, ann) => { ann("melody_vocal", "1\t2\t60\n2\t3\t62 ambiguous\n3.1\t3.2\t70 unpitched\n4\t5\t64\n"); T.scorableByKind = { melody_vocal: [{ start: 0, end: 6 }] }; },
  { candidate: cand({ melody_vocal: [{ onset: 1, offset: 2, midi: 60 }, { onset: 3.12, offset: 3.2, midi: 71 }, { onset: 4, offset: 5, midi: 64 }, { onset: 30, offset: 31, midi: 60 }] }) });
assert.equal(vocalPred.r.status, 0, vocalPred.r.stdout + vocalPred.r.stderr); const V = vocalPred.tr.metrics.melody_vocal;
assert.equal(V.nRef, 3); assert.equal(V.ignoredUnpitched, 1, "the estimate on the unpitched consonant is ignored"); assert.equal(V.nEst, 2, "the note at 30 s is outside the vocal scope [0, 6)");
assert.equal(V.full.F, 0.8, "strict: the ambiguous note counts as a miss (P 1, R 2/3)"); assert.equal(V.lenient.full.R, 1, "lenient: it does not"); assert.equal(V.lenient.ambiguousRef, 1);
assert.equal(vocalPred.tr.metrics.melody_lead, null, "with --candidate the analyzer's hook is not mixed in: the candidate did not list the lead kind, so it is not evaluated");

// 4. per-kind scopes and annotated silence
const scoped = scenario("scoped", (T, ann) => { T.scorableByKind = { melody_lead: [{ start: 0, end: 10, silent: ["melody_lead"] }, { start: 10, end: 20 }] };
  ann("melody_lead", truthNotes.filter(n => n.onset >= 10 && n.onset < 20).map(n => `${n.onset}\t${n.offset}\t${n.midi}`).join("\n") + "\n"); }, { candidate: cand({ melody_lead: truthNotes.filter(n => n.onset < 20) }) });
assert.equal(scoped.r.status, 0, scoped.r.stdout + scoped.r.stderr); const S = scoped.tr.metrics.melody_lead;
const inSilence = truthNotes.filter(n => n.onset < 10).length, inScope = truthNotes.filter(n => n.onset >= 10 && n.onset < 20).length;
assert.equal(S.nRef, inScope); assert.equal(S.nEst, inScope + inSilence); assert.equal(S.pitchOnset.fp, inSilence, "notes sung in the declared-silent half are false positives, not unscored"); assert.equal(S.pitchOnset.R, 1);
assert.ok(scoped.tr.metrics.beats, "the other kinds still use the whole recording");
const undeclared = scenario("scoped-undeclared", (T, ann) => { T.scorableByKind = { melody_lead: [{ start: 0, end: 10 }, { start: 10, end: 20 }] }; ann("melody_lead", truthNotes.filter(n => n.onset >= 10 && n.onset < 20).map(n => `${n.onset}\t${n.offset}\t${n.midi}`).join("\n") + "\n"); });
assert.equal(undeclared.r.status, 1); assert.match(undeclared.r.stdout, /scorableByKind\.melody_lead\[0\] \(0-10 s\) has no annotated melody_lead and does not declare it silent/);
const unknownKind = scenario("scoped-unknown", T => { T.scorableByKind = { sections: [{ start: 0, end: 10 }] }; }); assert.equal(unknownKind.r.status, 1); assert.match(unknownKind.r.stdout, /scorableByKind\.sections: unknown kind/);
const noAnn = scenario("scoped-noann", T => { T.scorableByKind = { melody_vocal: [{ start: 0, end: 10 }] }; }); assert.equal(noAnn.r.status, 1); assert.match(noAnn.r.stdout, /scorableByKind\.melody_vocal given but the track has no melody_vocal annotation/);
const beyond = scenario("scoped-beyond", T => { T.scorableByKind = { melody_lead: [{ start: 60, end: 90 }] }; }); assert.equal(beyond.r.status, 1); assert.equal(beyond.tr.status, "invalid-scorable-region"); assert.match(beyond.r.stdout, /scorableByKind\.melody_lead.*ends at 90 s/);

// 5. annotation errors are named, not guessed
const badTag = scenario("bad-tag", (T, ann) => { ann("melody_vocal", "1\t2\t60 loud\n"); }); assert.notEqual(badTag.r.status, 0); assert.match(badTag.r.stdout + badTag.r.stderr, /unknown tag "loud"/);
const backwards = scenario("backwards", (T, ann) => { ann("melody_vocal", "3\t2\t60\n"); }); assert.notEqual(backwards.r.status, 0); assert.match(backwards.r.stdout + backwards.r.stderr, /note must end after it starts/);

// 6. provenance is carried into the scores (recorded, never scored)
const prov = scenario("provenance", T => { T.annotationProvenance = { melody_lead: { annotators: ["A", "B"], adjudicated: true, source: "original MIDI", agreement: { onsetF: 0.97 } } }; });
assert.deepEqual(prov.tr.melodyProvenance.melody_lead.annotators, ["A", "B"]);

// 7. independent check with mir_eval (own parsing, own note-to-frame rule, own masks; candidate notes and the analyzer's hook rebuilt from the raw files)
const py = process.env.PYTHON || "python";
if (spawnSync(py, ["-c", "import mir_eval"]).status !== 0) console.log(`NOTE: ${py} has no mir_eval; the independent melody cross-check was skipped (CI runs it)`);
else for (const sc of [base, perfect, octave, empty, vocalPred, scoped]) {
  const x = spawnSync(py, [path.join(ROOT, "bench", "crosscheck_mir_eval.py"), path.join(sc.dir, "scores.json"), "--manifest", sc.mp], { encoding: "utf8" });
  assert.equal(x.status, 0, `mir_eval cross-check of ${path.basename(sc.dir)}: ${x.stdout}${x.stderr}`);
}
console.log("bench melody scoring tests passed");
