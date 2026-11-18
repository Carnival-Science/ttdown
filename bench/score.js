#!/usr/bin/env node
// Scores saved predictions against the manifest's annotations: per-track metrics, failure classes, bootstrap
// confidence intervals, a failure atlas by condition tag, and a confidence reliability table.
//
//   node bench/score.js <predictions.json> [--manifest manifest.json] [--rescore]
//
// Writes scores.json, tracks.csv and report.md next to the predictions. For a holdout run the console shows
// aggregates only.
//
// The manifest must be byte-identical to the one the predictions were made with (sha256 recorded by run.js);
// otherwise scoring stops (exit 1) and writes nothing. To score against an intentional ground-truth revision:
//   1. bump manifest.version above the version recorded in the predictions,
//   2. add  revisions: [{ "version": <new>, "date": "YYYY-MM-DD", "reason": "<what changed and why>", "tracks": [...] }],
//   3. run with --rescore. Results go to <predictions dir>/rescore-v<new>/ so the original scores are kept.
"use strict";
const path = require("node:path"), fs = require("node:fs");
const M = require("./lib/metrics"), C = require("./lib/classify"), { loadTruth } = require("./lib/loaders"), { summarize } = require("./lib/stats"), { sha256File } = require("./lib/provenance");
const { annotationIntegrity, checkRequirements } = require("./lib/requirements"), crypto = require("node:crypto");
const Reg = require("./lib/regions");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const predPath = path.resolve(args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--manifest") || "");
if (!fs.existsSync(predPath)) { console.error("usage: node bench/score.js <predictions.json> [--manifest manifest.json] [--rescore]"); process.exit(2); }
const P = JSON.parse(fs.readFileSync(predPath, "utf8")), HOLDOUT = P.split === "holdout";
const manifestPath = path.resolve(opt("--manifest", path.join(ROOT, P.manifest.path)));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")), mdir = path.dirname(manifestPath);
const manifestSha = sha256File(manifestPath), manifestChanged = manifestSha !== P.manifest.sha256;
// Reproducibility: same manifest, or an explicit, versioned revision. Never a silent mix.
let rescore = null;
if (manifestChanged) {
  const fail = msg => { console.error(`Not scoring: the manifest differs from the one these predictions were made with (predictions: v${P.manifest.version} ${String(P.manifest.sha256).slice(0, 12)}…, now: v${manifest.version} ${manifestSha.slice(0, 12)}…).\n${msg}`); process.exit(1); };
  if (!args.includes("--rescore")) fail("If the ground truth was revised on purpose, follow the re-scoring procedure (bench/README.md) and pass --rescore.");
  if (!(Number(manifest.version) > Number(P.manifest.version))) fail(`--rescore needs manifest.version above v${P.manifest.version}.`);
  const rev = (manifest.revisions || []).find(r => Number(r.version) === Number(manifest.version));
  if (!rev || !rev.reason || String(rev.reason).trim().length < 10 || !rev.date) fail(`--rescore needs a revisions entry for v${manifest.version} with a date and a reason (10+ characters).`);
  rescore = { fromManifestVersion: P.manifest.version, fromManifestSha256: P.manifest.sha256, toManifestVersion: manifest.version, toManifestSha256: manifestSha, revision: rev };
}
const OUT = rescore ? path.join(path.dirname(predPath), `rescore-v${manifest.version}`) : path.dirname(predPath);
// a revision result is a record: never overwrite it (re-scoring again needs a new manifest version)
if (rescore && fs.existsSync(OUT)) { console.error(`Not scoring: ${path.relative(process.cwd(), OUT)} already exists. A revision result is never overwritten; for another revision, bump manifest.version and add its revisions entry.`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const byId = Object.fromEntries(manifest.tracks.map(t => [t.id, t]));
const r4 = M.r4;

// true 16-step pattern per true bar, from drum events and the annotated downbeats (G0 continuity metric)
function truthSteps(T, cls) {
  if (!T.downbeats || !T.drums) return null;
  const D = T.downbeats, lens = D.slice(1).map((t, i) => t - D[i]), medLen = lens.slice().sort((a, b) => a - b)[Math.floor(lens.length / 2)] || 2;
  return D.map((d, i) => { const len = lens[i] || medLen, s16 = len / 16;
    return new Set(T.drums[cls].filter(t => t >= d - s16 / 2 && t < d + len - s16 / 2).map(t => Math.round((t - d) / s16))); });
}

// Mask the truth to the scorable regions (the same masks are applied to the predictions below). A kind with nothing left is dropped,
// i.e. "not annotated", rather than scored against an empty reference.
function maskTruth(T, R) {
  const X = { ...T };
  if (T.beats) {
    const keep = T.beats.map(b => Reg.inside(R, b));
    X.beats = T.beats.filter((_, i) => keep[i]); X.positions = T.positions ? T.positions.filter((_, i) => keep[i]) : null;
    X.downbeats = X.positions ? X.beats.filter((_, i) => X.positions[i] === 1) : T.downbeats ? Reg.filterTimes(T.downbeats, R) : T.downbeats;
    if (!X.beats.length) { delete X.beats; delete X.positions; delete X.downbeats; }
  }
  if (T.drums) { X.drums = { ...T.drums, kick: Reg.filterTimes(T.drums.kick, R), snare: Reg.filterTimes(T.drums.snare, R), hihat: Reg.filterTimes(T.drums.hihat, R) }; if (!X.drums.kick.length && !X.drums.snare.length && !X.drums.hihat.length) delete X.drums; }
  if (T.bass) { X.bass = Reg.filterNotes(T.bass, R); if (!X.bass.length) delete X.bass; }
  if (T.chords) { X.chords = Reg.clipIntervals(T.chords, R); if (!X.chords.length) delete X.chords; }
  return X;
}
// chord accuracy over several regions: each region scored on its own clipped intervals, then weighted by reference seconds
function chordsByRegion(est, ref, R) {
  let wr = 0, wm = 0, sr = 0, sm = 0, sec = 0;
  for (const r of R) {
    const f = Reg.clipIntervals(ref, [r]); if (!f.length) continue;
    const c = M.chordScores(Reg.clipIntervals(est, [r]), f); if (!c) continue;
    if (c.root != null) { wr += c.root * c.refSeconds; sr += c.refSeconds; } if (c.majmin != null) { wm += c.majmin * c.refSeconds; sm += c.refSeconds; } sec += c.refSeconds;
  }
  return sec ? { root: sr ? r4(wr / sr) : null, majmin: sm ? r4(wm / sm) : null, refSeconds: r4(sec) } : null;
}

function scoreTrack(rec) {
  const t = byId[rec.id], out = { id: rec.id, split: rec.split, status: rec.status, tags: (t && t.tags) || {}, runtimeSec: rec.runtimeMs ? r4(rec.runtimeMs / 1000) : null, pageErrors: (rec.pageErrors || []).length,
    pageErrorSamples: (rec.pageErrors || []).slice(0, 3).map(s => String(s).slice(0, 200)), console: rec.console || null };
  if (!t) { out.status = "not-in-manifest"; return out; }
  // the audio must be the audio the prediction was made from: a revision may change answers, never the recording
  const audioNow = t.sha256 || (fs.existsSync(path.resolve(mdir, t.audio)) ? sha256File(path.resolve(mdir, t.audio)) : null);
  if (rec.sha256 && audioNow && audioNow !== rec.sha256) { out.status = "audio-changed-since-prediction"; out.problems = [`${t.id}: audio sha256 ${audioNow.slice(0, 12)}… differs from the prediction's ${rec.sha256.slice(0, 12)}…; run the analyzer again`]; return out; }
  // ground truth integrity: score only against the exact annotation files the manifest pins
  const ai = annotationIntegrity(t, mdir); out.annotationSha256 = ai.hashes;
  out.annotationsChangedSincePrediction = !!rec.annotationSha256 && JSON.stringify(rec.annotationSha256) !== JSON.stringify(ai.hashes);
  if (ai.problems.length) { out.status = "annotation-checksum-mismatch"; out.problems = ai.problems; return out; }
  if (rec.status !== "ok") return out;
  const T0 = loadTruth(t, mdir), R = t.scorable ? Reg.normalize(t.scorable) : null, T = R ? maskTruth(T0, R) : T0, p = rec.full, g = rec.grid, m = {}, cls = {}, inputs = {};
  if (R) out.scorable = { regions: R.length, seconds: r4(Reg.seconds(R)), fractionOfTrack: p && p.duration ? r4(Math.min(1, Reg.seconds(R) / p.duration)) : null };
  const maskT = a => R ? Reg.filterTimes(a, R) : a;
  // tempo and grid
  m.tempo = T.tempo != null ? M.tempo(p.bpm, T.tempo) : null; cls.tempo = C.tempoClass(m.tempo);
  if (T.beats) {
    // predictions inside declared gaps have no verified truth to be scored against: drop them before matching
    const G = T.gaps || [], cut = a => M.outsideGaps(maskT(a || []), G), eg0 = M.exportGrid(p);
    const driftGaps = R ? G.concat(Reg.complement(R, p.duration)).sort((a, b) => a.start - b.start) : G; // drift restarts at every region edge, as at a declared gap
    const tb = g ? cut(g.beats) : null, td = g ? cut(g.downbeats) : null, eg = { beats: cut(eg0.beats), downbeats: cut(eg0.downbeats) };
    m.beats = g ? M.events(tb, T.beats) : null; cls.beats = C.beatClass(tb, T.beats, cls.tempo);
    inputs.exportBeats = eg.beats; inputs.exportDownbeats = eg.downbeats; inputs.trackedBeats = tb || []; inputs.trackedDownbeats = td || [];
    // drift: phase-locked within each continuous annotated segment; nearest-beat kept alongside for comparison
    m.exportBeats = M.events(eg.beats, T.beats); m.drift = M.phaseDrift(p, T.beats, driftGaps, T.tempoChanges || []); m.driftNearest = M.drift(eg0.beats, T.beats); cls.exportGrid = C.driftClass(m.drift);
    if (T.downbeats) { m.downbeats = g ? M.events(td, T.downbeats) : null; m.exportDownbeats = M.events(eg.downbeats, T.downbeats); cls.downbeats = C.downbeatClass(td, T); }
    if (G.length) m.declaredGaps = { count: G.length, seconds: r4(G.reduce((s, x) => s + x.end - x.start, 0)) };
    if ((T.tempoChanges || []).length) m.declaredTempoChanges = T.tempoChanges.length;
  }
  // key
  if (T.key) { m.key = M.keyScore(p.key, T.key); m.key.confidence = p.keyConf; cls.key = C.keyClass(m.key); inputs.key = p.key; }
  // chords: one per exported bar on the app's fixed grid
  if (T.chords) {
    const est = (p.chords && p.chords.bars || []).map((c, i) => ({ start: p.firstDown + i * p.barSec, end: p.firstDown + (i + 1) * p.barSec, label: M.appChordToHarte(c) }));
    m.chords = R ? chordsByRegion(est, T.chords, R) : M.chordScores(est, T.chords); cls.chords = C.chordClass(m.chords); inputs.chords = R ? Reg.clipIntervals(est, R) : est;
  }
  // drums: exported MIDI notes in seconds, per class; plus G0's 16-step pattern score
  const ex = rec.exported, sec = steps => steps.map(s => p.firstDown + s * ex.stepSec);
  if (T.drums && ex) {
    m.drums = {}; m.drumSteps = {}; cls.drums = {}; inputs.drums = {};
    for (const [app, k] of [["kick", "kick"], ["snare", "snare"], ["hats", "hihat"]]) {
      const est = maskT(sec(ex[app])); inputs.drums[k] = est;
      m.drums[k] = { w30: M.events(est, T.drums[k], 0.03), w50: M.events(est, T.drums[k], 0.05), w100: M.events(est, T.drums[k], 0.1) };
      cls.drums[k] = C.drumClass(m.drums[k]);
      const TS = truthSteps(T0, k);
      if (TS) { let tp = 0, fp = 0, fn = 0;
        for (let bar = 1; bar < p.nBars - 1; bar++) {
          const start = p.firstDown + bar * p.barSec, tb = T0.downbeats.findIndex(d => Math.abs(d - start) < p.barSec / 2); if (tb < 0) continue;
          if (R && !Reg.containsInterval(R, start - p.barSec / 32, start + p.barSec)) continue; // only bars wholly inside one scorable region
          const got = new Set(ex[app].filter(s => Math.floor(s / 16) === bar).map(s => s % 16)), truth = TS[tb];
          got.forEach(s => truth.has(s) ? tp++ : fp++); truth.forEach(s => { if (!got.has(s)) fn++; }); }
        m.drumSteps[app] = { tp, fp, fn }; }
    }
  }
  // bass: exported 808/bass notes in seconds
  if (T.bass && ex) {
    const est = ex.bass.map(n => ({ onset: p.firstDown + n.t * ex.stepSec, offset: p.firstDown + (n.t + n.dur) * ex.stepSec, midi: n.midi })).filter(n => !R || Reg.inside(R, n.onset));
    m.bass = M.noteScores(est, T.bass); cls.bass = C.bassClass(m.bass); inputs.bass = est;
  }
  out.prediction = { bpm: p.bpm, bpmConf: p.bpmConf, key: p.key, keyConf: p.keyConf, firstDown: p.firstDown, barSec: p.barSec };
  out.metrics = m; out.classes = cls; out.inputs = inputs;
  return out;
}

// Every manifest track of this split is required. A track with no prediction is listed (not silently dropped).
const required = manifest.tracks.filter(t => HOLDOUT ? t.split === "holdout" : t.split !== "holdout"), predicted = new Set(P.tracks.map(r => r.id));
const tracks = [...P.tracks.map(scoreTrack), ...required.filter(t => !predicted.has(t.id)).map(t => ({ id: t.id, split: t.split, status: "no-prediction", tags: t.tags || {} }))];
const ok = tracks.filter(t => t.metrics);
// required coverage, checked on the manifest tracks of this split (holdout tracks only for a holdout run)
const reqCheck = checkRequirements(manifest, required, mdir);
const integrityProblems = tracks.filter(t => t.status === "annotation-checksum-mismatch").flatMap(t => t.problems);
// Run completeness: the benchmark only succeeds if every required track was analyzed and scored. Three kinds of
// failure are kept apart because they need different owners: the analyzer, the run, or the ground truth.
const ANALYZER = new Set(["analysis-failed", "timeout"]), INPUT = new Set(["missing-audio", "checksum-mismatch", "audio-changed-since-prediction"]);
const completeness = { required: required.length, scored: ok.length,
  analyzerFailures: tracks.filter(t => ANALYZER.has(t.status) || (t.pageErrors > 0)).map(t => ({ id: t.id, status: t.pageErrors > 0 && !ANALYZER.has(t.status) ? `page-errors (${t.pageErrors}); metrics kept for diagnosis` : t.status })),
  missingPredictions: tracks.filter(t => t.status === "no-prediction" || INPUT.has(t.status)).map(t => ({ id: t.id, status: t.status })),
  unscorableAnnotations: tracks.filter(t => t.status === "annotation-checksum-mismatch").map(t => ({ id: t.id, status: t.status })),
  unknownTracks: tracks.filter(t => t.status === "not-in-manifest").map(t => ({ id: t.id, status: t.status })) };
completeness.complete = !completeness.analyzerFailures.length && !completeness.missingPredictions.length && !completeness.unscorableAnnotations.length && !completeness.unknownTracks.length && ok.length === required.length;
// one fingerprint for the whole answer set: any changed annotation file changes it
const truthFingerprint = crypto.createHash("sha256").update(JSON.stringify(tracks.map(t => [t.id, t.annotationSha256 || null]).sort())).digest("hex");
const get = (t, p) => p.split(".").reduce((o, k) => o == null ? null : o[k], t.metrics);
const num = v => typeof v === "boolean" ? (v ? 1 : 0) : v;
const METRICS = [
  ["tempo.acc1", "Tempo within ±4 % (Acc1)"], ["tempo.acc2", "Tempo allowing ×2/×½/×3/×⅓ (Acc2)"], ["tempo.absErr", "Tempo |error| (BPM)"],
  ["beats.f", "Tracked beats F (±70 ms)"], ["downbeats.f", "Tracked downbeats F"], ["exportBeats.f", "Exported grid beats F"], ["exportDownbeats.f", "Exported grid downbeats F"],
  ["drift.maxAbsMs", "Exported grid max drift, phase-locked (ms)"], ["drift.maxAbsBeats", "Exported grid max drift, phase-locked (beats)"],
  ["drift.beatsWithin", "Share of true beats with export within ±70 ms"], ["driftNearest.maxAbsMs", "Exported grid max drift, nearest beat (ms; capped at ½ beat)"],
  ["key.exact", "Key exact"], ["key.weighted", "Key MIREX weighted"], ["chords.root", "Chords root (time-weighted)"], ["chords.majmin", "Chords maj/min (time-weighted)"],
  ["drums.kick.w50.f", "Kick F (±50 ms, exported MIDI)"], ["drums.snare.w50.f", "Snare/clap F (±50 ms)"], ["drums.hihat.w50.f", "Hi-hat F (±50 ms)"],
  ["drums.kick.w30.f", "Kick F (±30 ms)"], ["drums.snare.w30.f", "Snare/clap F (±30 ms)"], ["drums.hihat.w30.f", "Hi-hat F (±30 ms)"],
  ["bass.onset.f", "Bass onset F (±50 ms)"], ["bass.noteF", "Bass note F (onset + pitch)"], ["bass.octaveErrorRate", "Bass octave errors (of matched)"],
];
const summary = { metrics: {}, failureClasses: {}, drumStepTotals: {}, runtime: summarize(ok.map(t => t.runtimeSec)), tracks: tracks.length, scored: ok.length,
  notScored: tracks.filter(t => !t.metrics).map(t => ({ id: t.id, status: t.status })) };
for (const [k, label] of METRICS) summary.metrics[k] = { label, ...summarize(ok.map(t => num(get(t, k)))) };
const CAPS = ["tempo", "beats", "downbeats", "exportGrid", "key", "chords", "drums.kick", "drums.snare", "drums.hihat", "bass"];
const clsOf = (t, c) => c.split(".").reduce((o, k) => o == null ? null : o[k], t.classes);
for (const c of CAPS) { const counts = {}; ok.forEach(t => { const v = clsOf(t, c); if (v && v !== "n/a") counts[v] = (counts[v] || 0) + 1; }); summary.failureClasses[c] = counts; }
for (const k of ["kick", "snare", "hats"]) { const s = ok.reduce((a, t) => { const d = t.metrics.drumSteps && t.metrics.drumSteps[k]; if (d) { a.tp += d.tp; a.fp += d.fp; a.fn += d.fn; } return a; }, { tp: 0, fp: 0, fn: 0 });
  summary.drumStepTotals[k] = { ...s, P: r4(s.tp / (s.tp + s.fp || 1)), R: r4(s.tp / (s.tp + s.fn || 1)) }; }
// failure atlas: failure rate per capability for each condition tag value
const atlas = {};
for (const t of ok) for (const [tag, val] of Object.entries(t.tags || {})) for (const c of CAPS) {
  const v = clsOf(t, c); if (!v || v === "n/a") continue; const key = `${tag}=${val}`;
  atlas[key] = atlas[key] || {}; const a = atlas[key][c] = atlas[key][c] || { n: 0, failed: 0 }; a.n++; if (v !== "ok") a.failed++;
}
summary.atlas = atlas;
// reliability: does the shown confidence track correctness? (terciles of the confidence value)
function reliability(conf, correct) {
  const rows = ok.map(t => [conf(t), correct(t)]).filter(([c, y]) => c != null && y != null).sort((a, b) => a[0] - b[0]); if (rows.length < 3) return null;
  const bins = [rows.slice(0, Math.floor(rows.length / 3)), rows.slice(Math.floor(rows.length / 3), Math.floor(2 * rows.length / 3)), rows.slice(Math.floor(2 * rows.length / 3))];
  return bins.map(b => ({ n: b.length, confRange: [b[0][0], b[b.length - 1][0]], accuracy: r4(b.filter(r => r[1]).length / b.length) }));
}
summary.reliability = { key: reliability(t => t.prediction.keyConf, t => t.metrics.key && t.metrics.key.scorable ? t.metrics.key.exact : null),
  tempo: reliability(t => t.prediction.bpmConf, t => t.metrics.tempo ? t.metrics.tempo.acc1 : null) };

const meta = { kind: "track-teardown-scores", version: 3, scoredAt: new Date().toISOString(), classifierVersion: C.CLASSIFIER_VERSION, predictions: path.relative(OUT, predPath).replace(/\\/g, "/"),
  manifest: { path: P.manifest.path, name: manifest.name, version: manifest.version, annotationProtocol: manifest.annotationProtocol || null, sha256: manifestSha }, predictionManifest: P.manifest, rescore, completeness, truthFingerprint, coverage: reqCheck.coverage, requirementProblems: reqCheck.problems, integrityProblems,
  annotationsChangedSincePrediction: tracks.filter(t => t.annotationsChangedSincePrediction).map(t => t.id), split: P.split, page: P.page, pageSha256: P.pageSha256, headSha: P.headSha, gitCommit: P.gitCommit,
  testedMergeCommit: P.testedMergeCommit, gitDirty: P.gitDirty, node: P.node, browser: P.browser, os: P.os, config: { beatWindowSec: M.WINDOW, drumWindowsSec: [0.03, 0.05, 0.1], bassOnsetWindowSec: 0.05, tempoTolerance: 0.04, bootstrap: { B: 2000, seed: 20261117 } } };
fs.writeFileSync(path.join(OUT, "scores.json"), JSON.stringify({ meta, summary, tracks }, null, 1));

// ---- tracks.csv ----
const q = v => v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const COLS = [["id", t => t.id], ["split", t => t.split], ["status", t => t.status], ["tempo_est", t => t.prediction && t.prediction.bpm], ["tempo_ref", t => get(t, "tempo.ref")], ["tempo_class", t => clsOf(t, "tempo")],
  ["beat_f", t => get(t, "beats.f")], ["beat_class", t => clsOf(t, "beats")], ["downbeat_f", t => get(t, "downbeats.f")], ["downbeat_class", t => clsOf(t, "downbeats")],
  ["export_beat_f", t => get(t, "exportBeats.f")], ["export_downbeat_f", t => get(t, "exportDownbeats.f")], ["drift_max_ms", t => get(t, "drift.maxAbsMs")], ["drift_max_beats", t => get(t, "drift.maxAbsBeats")], ["drift_class", t => clsOf(t, "exportGrid")],
  ["key_est", t => get(t, "key.est")], ["key_ref", t => get(t, "key.ref")], ["key_weighted", t => get(t, "key.weighted")], ["key_class", t => clsOf(t, "key")], ["key_conf", t => t.prediction && t.prediction.keyConf],
  ["chord_root", t => get(t, "chords.root")], ["chord_majmin", t => get(t, "chords.majmin")], ["chord_class", t => clsOf(t, "chords")],
  ["kick_f50", t => get(t, "drums.kick.w50.f")], ["snare_f50", t => get(t, "drums.snare.w50.f")], ["hihat_f50", t => get(t, "drums.hihat.w50.f")],
  ["kick_class", t => clsOf(t, "drums.kick")], ["snare_class", t => clsOf(t, "drums.snare")], ["hihat_class", t => clsOf(t, "drums.hihat")],
  ["bass_onset_f", t => get(t, "bass.onset.f")], ["bass_note_f", t => get(t, "bass.noteF")], ["bass_class", t => clsOf(t, "bass")], ["runtime_s", t => t.runtimeSec], ["page_errors", t => t.pageErrors], ["tags", t => JSON.stringify(t.tags)]];
fs.writeFileSync(path.join(OUT, "tracks.csv"), [COLS.map(c => c[0]).join(","), ...tracks.map(t => COLS.map(c => q(t.metrics || c[0].match(/^(id|split|status|runtime_s|page_errors|tags)$/) ? c[1](t) : null)).join(","))].join("\n") + "\n");

// ---- report.md ----
const fmt = s => s.mean == null ? "–" : `${s.mean}${s.ci95 ? ` [${s.ci95[0]}, ${s.ci95[1]}]` : ""}`;
const L = [`# Benchmark report: ${P.manifest.name} (${P.split})`, "",
  `Head \`${P.headSha}\`${P.testedMergeCommit ? ` (tested as merge commit \`${P.testedMergeCommit}\`)` : ""}${P.gitDirty ? " **(uncommitted changes)**" : ""} · page \`${P.page}\` sha256 \`${String(P.pageSha256).slice(0, 12)}\` · ${P.browser} · ${P.os} · manifest v${manifest.version} sha256 \`${manifestSha.slice(0, 12)}\` · classifier v${C.CLASSIFIER_VERSION}`, "",
  rescore ? `> **Re-scored** against manifest v${rescore.toManifestVersion} (revision ${rescore.revision.date}: ${rescore.revision.reason}). The predictions were made with manifest v${rescore.fromManifestVersion} (\`${String(rescore.fromManifestSha256).slice(0, 12)}\`). The original scores are unchanged in the parent folder.` : "", "",
  manifest.note ? `> ${manifest.note}` : "", "",
  `${ok.length} of ${tracks.length} tracks scored.${summary.notScored.length ? " Not scored: " + summary.notScored.map(x => `${x.id} (${x.status})`).join(", ") + "." : ""} Mean over tracks, [bootstrap 95 % CI], n.`, "",
  "| Metric | Mean [95 % CI] | n |", "|---|---|---|", ...METRICS.map(([k, label]) => `| ${label} | ${fmt(summary.metrics[k])} | ${summary.metrics[k].n} |`), "",
  "## Run completeness", "",
  completeness.complete ? `Complete: all ${completeness.required} required tracks were analyzed and scored.` : `**INCOMPLETE: ${completeness.scored} of ${completeness.required} required tracks scored. The benchmark run is unsuccessful; the metrics above cover only the scored tracks.**`, "",
  ...[["Analyzer failures (crash, timeout or page errors)", completeness.analyzerFailures], ["No usable prediction (not run, missing or changed audio)", completeness.missingPredictions],
      ["Unscorable ground truth (answer files changed)", completeness.unscorableAnnotations], ["Predictions for tracks not in the manifest", completeness.unknownTracks]]
    .filter(([, l]) => l.length).flatMap(([h, l]) => [`- ${h}: ` + (HOLDOUT ? `${l.length} track(s)` : l.map(x => `${x.id} (${x.status})`).join(", "))]), "",
  "### Browser console (diagnostic only; does not fail the run)", "",
  (() => { const w = tracks.filter(t => t.console && (t.console.warning || t.console.error));
    return !w.length ? "No console warnings or errors." : HOLDOUT ? `${w.length} track(s) logged console warnings/errors.` :
      w.map(t => `- ${t.id}: ${t.console.warning} warning(s), ${t.console.error} console error(s)${t.console.samples.length ? ` · e.g. \`${t.console.samples[0].replace(/`/g, "'")}\`` : ""}`).join("\n"); })(), "",
  "## Ground truth", "", `Annotation protocol: ${manifest.annotationProtocol || "not stated"} · truth fingerprint \`${truthFingerprint.slice(0, 16)}\` (sha256 over every track's annotation-file hashes; any changed answer file changes it)`, "",
  ...(tracks.some(x => x.scorable) ? ["**Scorable regions:** predictions and references are both masked to the annotated regions (half-open, [start, end)); nothing outside them counts.", "", "| Track | Regions | Seconds | Share of track |", "|---|---|---|---|", ...tracks.filter(x => x.scorable).map(x => `| ${x.id} | ${x.scorable.regions} | ${x.scorable.seconds} | ${x.scorable.fractionOfTrack == null ? "–" : Math.round(x.scorable.fractionOfTrack * 100) + " %"} |`), ""] : []),
  "| Annotation | Tracks | Required |", "|---|---|---|", ...Object.entries(reqCheck.coverage).map(([k, c]) => `| ${k} | ${c.tracks}/${c.of} | ${c.required == null ? "–" : c.required === "all" ? "every track" : `≥ ${Math.round(c.required * 100)} %`} |`), "",
  ...(reqCheck.problems.length || integrityProblems.length ? ["**Requirement / integrity failures (run fails):**", "", ...[...reqCheck.problems, ...integrityProblems].map(x => `- ${x}`), ""] : ["All annotation requirements met; every annotation file matches its pinned sha256.", ""]),
  ...(meta.annotationsChangedSincePrediction.length ? [`**Annotation files changed after these predictions were made:** ${meta.annotationsChangedSincePrediction.join(", ")}`, ""] : []),
  "## Failure classes", "", "| Capability | Classes (count) |", "|---|---|", ...CAPS.map(c => `| ${c} | ${Object.entries(summary.failureClasses[c]).map(([k, v]) => `${k} ${v}`).join(", ") || "–"} |`), "",
  "## Failure atlas", "", "Failed / scored tracks per condition. Read with the n: small groups prove nothing.", "",
  `| Condition | ${CAPS.join(" | ")} |`, `|---|${CAPS.map(() => "---").join("|")}|`,
  ...Object.keys(atlas).sort().map(k => `| ${k} | ${CAPS.map(c => atlas[k][c] ? `${atlas[k][c].failed}/${atlas[k][c].n}` : "–").join(" | ")} |`), "",
  "## Confidence reliability", "", "Accuracy within each third of the app's own confidence value. Confidence is useful only if accuracy rises with it.", "",
  ...["key", "tempo"].map(k => summary.reliability[k] ? `- ${k}: ` + summary.reliability[k].map(b => `conf ${b.confRange[0]}–${b.confRange[1]}: ${b.accuracy} (n ${b.n})`).join(" · ") : `- ${k}: too few tracks`), "",
  "## G0 continuity (16-step drum pattern score)", "", ...Object.entries(summary.drumStepTotals).map(([k, s]) => `- ${k}: P ${s.P} R ${s.R} (tp ${s.tp}, fp ${s.fp}, fn ${s.fn})`), ""];
fs.writeFileSync(path.join(OUT, "report.md"), L.join("\n"));

// ---- console ----
if (!HOLDOUT) for (const t of tracks) {
  if (!t.metrics) { console.log(`${t.id} | ${t.status}`); continue; }
  const f = v => v == null ? "–" : (+v).toFixed(2), c = t.classes;
  console.log(`${t.id} | tempo ${t.prediction.bpm} ${c.tempo} | beatF ${f(get(t, "beats.f"))} downF ${f(get(t, "downbeats.f"))} | export drift ${get(t, "drift.maxAbsMs")}ms ${c.exportGrid} | key ${c.key} | chords ${f(get(t, "chords.majmin"))} | drums K${f(get(t, "drums.kick.w50.f"))} S${f(get(t, "drums.snare.w50.f"))} H${f(get(t, "drums.hihat.w50.f"))} | bass ${f(get(t, "bass.noteF"))} ${c.bass || ""}`);
}
console.log(METRICS.filter(([k]) => summary.metrics[k].n).map(([k]) => `${k} ${fmt(summary.metrics[k])}`).join(" | "));
console.log(`report: ${path.relative(process.cwd(), path.join(OUT, "report.md"))}`);
if (rescore) console.log(`RE-SCORED against manifest v${rescore.toManifestVersion} (predictions from v${rescore.fromManifestVersion}): ${rescore.revision.reason}`);
if (meta.annotationsChangedSincePrediction.length) console.log(`NOTE: annotations changed after prediction for ${meta.annotationsChangedSincePrediction.length} track(s); scored against the current, pinned files.`);
const failures = [...reqCheck.problems, ...integrityProblems,
  ...completeness.analyzerFailures.map(x => `analyzer failure: ${x.id} (${x.status})`),
  ...completeness.missingPredictions.map(x => `no usable prediction: ${x.id} (${x.status})`),
  ...completeness.unknownTracks.map(x => `prediction for a track not in the manifest: ${x.id}`)];
console.log(`completeness: ${completeness.scored}/${completeness.required} required tracks scored${completeness.complete ? "" : " (INCOMPLETE: the metrics above cover only the scored tracks)"}`);
if (failures.length) { console.log(`FAILED: ${failures.length} problem(s); reports were still written for diagnosis.` + (HOLDOUT ? " Details in report.md." : "\n  " + failures.join("\n  "))); process.exitCode = 1; }
