// Ground-truth integrity (review finding 1) and enforceable annotation coverage (finding 3).
//
// Manifest fields used here:
//   track.annotationSha256: { beats: "<sha256>", key: "...", ... }   expected hash of each annotation file
//   manifest.requirements: {
//     checksums: true,                          every track must list audio sha256 and a hash for every annotation
//     annotations: { beats: "all", downbeats: "all", key: "all", chords: 0.3, drums: 0.5, bass: 0 }
//   }                                           "all" = every track; a number = minimum share of tracks
// "downbeats" means a beats file whose lines carry bar positions.
"use strict";
const fs = require("node:fs"), path = require("node:path");
const { sha256File } = require("./provenance");
const { beats } = require("./loaders");
const KINDS = ["beats", "downbeats", "key", "chords", "drums", "bass"];

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

// What a track actually provides (files that exist; downbeats only if bar positions are present)
function provided(track, manifestDir) {
  const A = track.annotations || {}, ok = k => A[k] && fs.existsSync(path.resolve(manifestDir, A[k])), have = new Set(KINDS.filter(k => k !== "downbeats" && ok(k)));
  if (have.has("beats")) { try { if (beats(path.resolve(manifestDir, A.beats)).downbeats) have.add("downbeats"); } catch (e) {} }
  return have;
}

function checkRequirements(manifest, tracks, manifestDir) {
  const req = manifest.requirements || {}, problems = [], coverage = {};
  if (req.checksums) for (const t of tracks) {
    if (!t.sha256) problems.push(`${t.id}: no audio sha256 (requirements.checksums)`);
    for (const k of Object.keys(t.annotations || {})) if (!(t.annotationSha256 || {})[k]) problems.push(`${t.id}: no sha256 for ${k} annotation (requirements.checksums)`);
  }
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
