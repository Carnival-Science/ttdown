// Ground-truth integrity (review finding 1) and enforceable annotation coverage (finding 3).
//
// Manifest fields used here:
//   track.annotationSha256: { beats: "<sha256>", key: "...", ... }   expected hash of each annotation file
//   manifest.requirements: {
//     checksums: true,                          every track must list audio sha256 and a hash for every annotation
//     annotations: { beats: "all", downbeats: "all", key: "all", chords: 0.3, drums: 0.5, bass: 0 },
//     continuousBeats: true,                    beats continuous; uncertain spans declared as "gap" lines
//     identity: true                            every track has artists, release, songFamily (leakage checks)
//   }                                           "all" = every track; a number = minimum share of tracks
// "downbeats" means a beats file whose lines carry bar positions.
// Real benchmark manifests must set checksums, continuousBeats and identity (bench/README.md).
"use strict";
const fs = require("node:fs"), path = require("node:path");
const { sha256File } = require("./provenance");
const { beats, validateBeats, drums: loadDrums, notes: loadNotes, chords: loadChords, melodyNotes: loadMelody } = require("./loaders");
const { identityProblems } = require("./holdout");
const Regions = require("./regions");
const KINDS = ["beats", "downbeats", "key", "chords", "drums", "bass", "sections", "melody_vocal", "melody_lead"];

// Hash every annotation file a track lists; compare with the manifest's expected hashes.
function annotationIntegrity(track, manifestDir) {
  const files = track.annotations || {}, expected = track.annotationSha256 || {}, hashes = {}, problems = [];
  for (const [k, rel] of Object.entries(files)) {
    const p = path.resolve(manifestDir, rel);
    if (!fs.existsSync(p)) { problems.push(`${track.id}: ${k} annotation missing (${rel})`); continue; }
    hashes[k] = sha256File(p);
    if (expected[k] && expected[k] !== hashes[k]) problems.push(`${track.id}: ${k} annotation changed (expected ${expected[k].slice(0, 12)}…, file ${hashes[k].slice(0, 12)}…)`);
  }
  for (const k of Object.keys(expected)) if (!files[k]) problems.push(`${track.id}: hash listed for ${k} but no ${k} annotation`);
  return { hashes, problems };
}

// How many annotated events of `kind` fall inside [lo, hi): the evidence that a region really was annotated.
function eventsIn(track, manifestDir, kind, lo, hi) {
  const f = path.resolve(manifestDir, track.annotations[kind]), inside = t => t >= lo && t < hi;
  if (kind === "beats") return beats(f).beats.filter(inside).length;
  if (kind === "drums") { const d = loadDrums(f); return [...d.kick, ...d.snare, ...d.hihat].filter(inside).length; }
  if (kind === "bass") return loadNotes(f).filter(n => inside(n.onset)).length;
  if (kind === "melody_vocal" || kind === "melody_lead") return loadMelody(f).filter(n => n.offset > lo && n.onset < hi).length; // a note overlapping the scope is evidence it was annotated
  if (kind === "chords") return loadChords(f).filter(c => c.end > lo && c.start < hi).length; // any interval, "N" included, is annotation
  return 1;
}
const EVENT_KINDS = ["beats", "drums", "bass", "chords", "melody_vocal", "melody_lead"];
// Scored coverage, not just a file: with scorable regions, every annotated event kind must have events in each region OR that region must
// declare the kind silent. Otherwise "no events" cannot be told apart from "nobody annotated this region".
function regionCoverageProblems(track, manifestDir) {
  const A = track.annotations || {}, out = [];
  for (const kind of EVENT_KINDS) {
    const list = Regions.scopeList(track, kind);
    if (!list || !A[kind] || !fs.existsSync(path.resolve(manifestDir, A[kind])) || Regions.problems(list, track.id).length) continue;
    const label = track.scorableByKind && track.scorableByKind[kind] ? `scorableByKind.${kind}` : "scorable";
    list.forEach((r, i) => {
      let n; try { n = eventsIn(track, manifestDir, kind, r.start, r.end); } catch (e) { out.push(`${track.id}: ${kind} annotation unreadable (${e.message})`); return; }
      if (n === 0 && !(r.silent || []).includes(kind))
        out.push(`${track.id}: ${label}[${i}] (${r.start}-${r.end} s) has no annotated ${kind} and does not declare it silent: annotate the region, or add "silent": ["${kind}"] if it is genuinely absent there` + (kind === "beats" ? " (beats cannot be silent: declare a gap)" : ""));
    });
  }
  return out;
}
// Per-kind scopes ("scorableByKind": { "melody_vocal": [...] }): validated like `scorable`, and only for kinds the track annotates.
function scopeShapeProblems(track) {
  const out = [], by = track.scorableByKind;
  if (by === undefined) return out;
  if (!by || typeof by !== "object" || Array.isArray(by)) return [`${track.id}: scorableByKind must be an object keyed by annotation kind`];
  for (const k of Object.keys(by)) {
    if (!EVENT_KINDS.includes(k)) out.push(`${track.id}: scorableByKind.${k}: unknown kind (use ${EVENT_KINDS.join(", ")})`);
    else if (!(track.annotations || {})[k]) out.push(`${track.id}: scorableByKind.${k} given but the track has no ${k} annotation`);
    else out.push(...Regions.problems(by[k], `${track.id} scorableByKind.${k}`));
  }
  return out;
}

// What a track actually provides. A kind counts only if it is USABLE: an annotation file that exists and, for a track with scorable
// regions, has events inside them or declares silence there. Downbeats only if bar positions are present.
function provided(track, manifestDir) {
  const A = track.annotations || {}, ok = k => A[k] && fs.existsSync(path.resolve(manifestDir, A[k])), have = new Set(KINDS.filter(k => k !== "downbeats" && ok(k)));
  for (const k of EVENT_KINDS) {
    const list = Regions.scopeList(track, k); if (!have.has(k) || !list || Regions.problems(list, track.id).length) continue;
    try { if (!list.some(r => (r.silent || []).includes(k) || eventsIn(track, manifestDir, k, r.start, r.end) > 0)) have.delete(k); } catch (e) { have.delete(k); }
  }
  if (have.has("beats")) { try { if (beats(path.resolve(manifestDir, A.beats)).downbeats) have.add("downbeats"); } catch (e) {} }
  return have;
}

function checkRequirements(manifest, tracks, manifestDir) {
  const req = manifest.requirements || {}, problems = [], coverage = {};
  if (req.checksums) for (const t of tracks) {
    if (!t.sha256) problems.push(`${t.id}: no audio sha256 (requirements.checksums)`);
    for (const k of Object.keys(t.annotations || {})) if (!(t.annotationSha256 || {})[k]) problems.push(`${t.id}: no sha256 for ${k} annotation (requirements.checksums)`);
  }
  if (req.identity) problems.push(...identityProblems(tracks));
  if (req.continuousBeats) for (const t of tracks) {
    const f = t.annotations && t.annotations.beats && path.resolve(manifestDir, t.annotations.beats);
    if (f && fs.existsSync(f)) { try { problems.push(...validateBeats(beats(f)).map(x => `${t.id}: ${x}`)); } catch (e) { problems.push(`${t.id}: beats file unreadable (${e.message})`); } }
  }
  for (const t of tracks) { if (t.scorable !== undefined) problems.push(...Regions.problems(t.scorable, t.id)); problems.push(...scopeShapeProblems(t), ...regionCoverageProblems(t, manifestDir)); }  // ordered, disjoint, half-open, and really annotated
  const have = new Map(tracks.map(t => [t.id, provided(t, manifestDir)]));
  for (const k of KINDS) {
    const n = tracks.filter(t => have.get(t.id).has(k)).length, need = (req.annotations || {})[k];
    coverage[k] = { tracks: n, of: tracks.length, required: need == null ? null : need };
    if (need === "all") { const miss = tracks.filter(t => !have.get(t.id).has(k)).map(t => t.id); if (miss.length) problems.push(`${k} required on every track; missing on ${miss.length}: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ", …" : ""}`); }
    else if (typeof need === "number" && tracks.length && n / tracks.length < need - 1e-9) problems.push(`${k} required on at least ${Math.round(need * 100)} % of tracks; have ${n}/${tracks.length}`);
    else if (need != null && need !== "all" && typeof need !== "number") problems.push(`requirements.annotations.${k}: use "all" or a number between 0 and 1`);
  }
  return { ok: problems.length === 0, problems, coverage };
}

module.exports = { annotationIntegrity, checkRequirements, provided, KINDS };
