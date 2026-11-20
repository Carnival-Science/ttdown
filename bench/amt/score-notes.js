#!/usr/bin/env node
/* Note-level comparison of transcribed MIDI files against a reference MIDI, for research runs (not a gate, not in CI).
 *
 *   node bench/amt/score-notes.js --ref ref.mid --offset SECONDS [--bar1 SEC --bpm N --split A,B] [--out report.json] est1.mid [est2.mid ...]
 *
 * --offset = audio time minus reference-MIDI time (bench/paired-renders.js prints it as alignment.offsetSec); the estimates are read as
 * AUDIO time (Basic Pitch writes audio time). Matching (bench/amt/note-matching.js) follows mir_eval.transcription: maximum-cardinality
 * one-to-one, exact pitch, onset within 50 ms; "+offset" also needs the end within max(50 ms, 20% of the reference duration). Each row
 * reports TP, FP and FN with precision, recall and F1.
 *
 * "Alignment sensitivity" is the constant shift of the estimates, in 2 ms steps within +-80 ms, that gives the most onset matches. It shows
 * how much the score depends on the alignment. It is NOT a measured timing error of the model: the alignment itself is an estimate.
 *
 * Regions (--bar1 = audio time of bar 1, --bpm for 4/4, --split A,B = 1-based bars; all three or none): pickup, bars 1..A-1, A..B-1,
 * B..end. The matching is global; each note is counted in the region holding its own onset (bench/amt/note-matching.js `regionCounts`).
 *
 * Inputs are checked: a MIDI file with a note-on that never ends or a note-off that ends nothing is REJECTED (its notes cannot be scored
 * as written), as are zero-length notes. Every input file is listed with its SHA-256, and the scorer's commit is recorded. --out writes the
 * same results as JSON; the path must be OUTSIDE the repository (private material stays out of it) and must not exist yet. */
"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const { decodeMidi, tickToSec } = require("../../tests/lib/smf");
const { match, counts, barRegions, regionCounts, ONSET_TOL, OFFSET_RATIO, OFFSET_MIN } = require("./note-matching");

const ROOT = path.resolve(__dirname, "..", "..");
const USAGE = "usage: node bench/amt/score-notes.js --ref ref.mid --offset SEC [--bar1 SEC --bpm N --split A,B] [--out report.json] est.mid ...";
const VALUED = new Set(["--ref", "--offset", "--bar1", "--bpm", "--split", "--out"]);
const fail = msg => { console.error(`score-notes: ${msg}`); process.exit(2); };

function parseArgs(argv) {
  const o = {}, files = [];
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (!a.startsWith("--")) { files.push(a); continue; }
    if (!VALUED.has(a)) fail(`unknown option ${a}\n${USAGE}`);
    if (a in o) fail(`${a} given twice`);
    const v = argv[++k]; if (v === undefined || (v.startsWith("--") && VALUED.has(v))) fail(`${a} needs a value`);
    o[a] = v;
  }
  if (!o["--ref"] || o["--offset"] === undefined || !files.length) fail(USAGE);
  const num = (flag, s) => { const x = /^\s*$/.test(s) ? NaN : Number(s); if (!Number.isFinite(x)) fail(`${flag} must be a finite number (got "${s}")`); return x; };
  const offset = num("--offset", o["--offset"]);
  const regionFlags = ["--bar1", "--bpm", "--split"].filter(f => f in o);
  if (regionFlags.length && regionFlags.length !== 3) fail("--bar1, --bpm and --split go together (all three or none)");
  let regions = null;
  if (regionFlags.length) {
    const parts = o["--split"].split(",");
    if (parts.length !== 2 || !parts.every(p => /^\d+$/.test(p.trim()))) fail(`--split must be two whole bar numbers A,B (got "${o["--split"]}")`);
    try { regions = barRegions(num("--bar1", o["--bar1"]), num("--bpm", o["--bpm"]), parts.map(Number)); } catch (e) { fail(e.message); }
  }
  let out = null;
  if (o["--out"]) {
    out = path.resolve(o["--out"]);
    const rel = path.relative(process.platform === "win32" ? ROOT.toLowerCase() : ROOT, process.platform === "win32" ? out.toLowerCase() : out);
    if (!rel || (!rel.startsWith("..") && !path.isAbsolute(rel))) fail(`--out must be outside the repository (${ROOT}): results describe private material`);
    if (fs.existsSync(out)) fail(`--out ${out} already exists; choose a new path (nothing is overwritten)`);
  }
  return { ref: o["--ref"], offset, regions, out, files };
}

const sha256 = buf => crypto.createHash("sha256").update(buf).digest("hex");
function loadMidi(file) {
  let bytes; try { bytes = fs.readFileSync(file); } catch (e) { fail(`cannot read ${file}: ${e.message}`); }
  let d; try { d = decodeMidi(bytes); } catch (e) { fail(`${file} is not a readable MIDI file: ${e.message}`); }
  if (d.unmatched.length) {
    const on = d.unmatched.filter(u => u.kind === "on-never-closed").length, off = d.unmatched.length - on;
    fail(`${file}: ${on} note-on(s) never closed and ${off} note-off(s) with no open note; refusing to score a file whose notes are ambiguous`);
  }
  const notes = d.notes.map(n => ({ on: tickToSec(d, n.onTick), off: tickToSec(d, n.offTick), midi: n.pitch }));
  const zero = notes.filter(n => !(n.off > n.on)).length;
  if (zero) fail(`${file}: ${zero} zero-length note(s); refusing (mir_eval rejects them too)`);
  return { file, sha256: sha256(bytes), notes };
}

function gitState() {
  const git = args => { const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : null; };
  const commit = git(["rev-parse", "HEAD"]), status = git(["status", "--porcelain", "--", "bench/amt", "tests/metrics.js", "tests/lib/smf.js"]);
  return { commit, scorerFilesModified: status === null ? null : status.length > 0 };
}

const pct = x => (100 * x).toFixed(1);
const row = c => `TP ${c.tp} FP ${c.fp} FN ${c.fn} | P ${pct(c.P)} R ${pct(c.R)} F ${pct(c.F)}`;

function main() {
  const opt = parseArgs(process.argv.slice(2));
  const refIn = loadMidi(opt.ref), ref = refIn.notes.map(n => ({ ...n, on: n.on + opt.offset, off: n.off + opt.offset }));
  const report = {
    kind: "amt-note-scores", version: 2, date: new Date().toISOString(), scorer: { ...gitState(), node: process.version },
    rules: { onsetTolerance: ONSET_TOL, offsetRatio: OFFSET_RATIO, offsetMinTolerance: OFFSET_MIN, pitch: "exact MIDI", matching: "maximum-cardinality one-to-one", rounding: "distances rounded to 4 decimals, half to even (mir_eval N_DECIMALS)" },
    reference: { file: path.basename(opt.ref), sha256: refIn.sha256, notes: ref.length }, offsetSec: opt.offset, regions: opt.regions && opt.regions.map(g => ({ name: g.name, start: g.start, end: g.end })), estimates: [],
  };
  console.log(`reference ${path.basename(opt.ref)}: ${ref.length} notes, offset ${opt.offset} s, sha256 ${refIn.sha256}`);
  console.log(`scorer commit ${report.scorer.commit || "unknown"}${report.scorer.scorerFilesModified ? " (scorer files modified)" : ""}`);
  for (const f of opt.files) {
    const e = loadMidi(f), est = e.notes, m = match(ref, est), md = match(ref, est, ONSET_TOL, true);
    let best = { n: -1, ms: 0 };
    for (let k = -40; k <= 40; k++) { const s = k * 0.002, n = match(ref, est.map(x => ({ ...x, on: x.on + s, off: x.off + s }))).n; if (n > best.n) best = { n, ms: 2 * k }; }
    const onset = counts(m.n, ref.length, est.length), withOffset = counts(md.n, ref.length, est.length), shifted = counts(best.n, ref.length, est.length);
    const entry = { file: path.basename(f), sha256: e.sha256, notes: est.length, onset, withOffset, alignmentSensitivity: { bestShiftMs: best.ms, onsetAtBestShift: shifted } };
    console.log(`${path.basename(f)}: ${est.length} notes, sha256 ${e.sha256}`);
    console.log(`  onset         ${row(onset)}`);
    console.log(`  onset+offset  ${row(withOffset)}`);
    console.log(`  alignment sensitivity: shifting all estimates by ${best.ms} ms gives onset F ${pct(shifted.F)} (not a measured timing error)`);
    if (opt.regions) {
      entry.regions = regionCounts(ref, est, m, opt.regions);
      for (const g of entry.regions) console.log(`  ${g.name}: recall ${g.refMatched}/${g.ref}, precision ${g.estMatched}/${g.est}${g.straddling ? `, ${g.straddling} matched across a region boundary` : ""}`);
    }
    report.estimates.push(entry);
  }
  if (opt.out) {
    fs.mkdirSync(path.dirname(opt.out), { recursive: true });
    fs.writeFileSync(opt.out, JSON.stringify(report, (k, v) => (v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity" : v), 2) + "\n", { flag: "wx" });
    console.log(`wrote ${opt.out}`);
  }
}
main();
