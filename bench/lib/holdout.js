// Holdout safeguards (review finding 4). Pure decision logic, so every rule is unit-tested; bench/run.js gathers
// the facts (git state, paths, log) and refuses to start when a rule fails.
//
// Rules:
//  1. Holdout tracks live in their own manifest: a dev run refuses a manifest containing holdout tracks, and a
//     holdout run refuses one containing anything else.
//  2. Holdout output goes outside the repository.
//  3. A holdout run names its operator (--operator) for the custody log.
//  4. The engine must be committed (clean tree), so the result maps to exactly one reviewable commit.
//  5. One run per engine build: if the custody log already has a run for this page (index.html sha256), a new run
//     needs --reason explaining why (e.g. "crashed on track 7, rerun after fixing harness bug #12").
//  6. Dev and holdout manifests must not share tracks, audio, or release/artist groups (bench/check-splits.js).
"use strict";

function holdoutGuard(f) { // f: { holdout, splits:Set, outsideRepo, operator, gitDirty, pageSha256, log:[{pageSha256}], reason }
  const no = msg => ({ ok: false, msg });
  if (!f.holdout) return f.splits.has("holdout") ? no("This manifest contains holdout tracks. Keep holdout tracks in a separate manifest (held by the holdout custodian) and run them only with --holdout.") : { ok: true };
  if ([...f.splits].some(s => s !== "holdout")) return no("A holdout manifest must contain only holdout tracks.");
  if (!f.outsideRepo) return no("Holdout results must be written outside the repository (--out).");
  if (!f.operator) return no("A holdout run must name its operator for the custody log (--operator NAME).");
  const prior = (f.log || []).filter(e => e.pageSha256 === f.pageSha256);
  if (prior.length && !(f.reason && f.reason.trim().length >= 10)) return no(`The holdout set was already run on this engine build (${prior.length}x, last ${prior[prior.length - 1].date}). Re-running needs --reason "<why>" (10+ characters); it is recorded in the custody log.`);
  if (f.gitDirty) return no("Commit your changes first: a holdout result must map to one committed engine version.");
  return { ok: true, priorRuns: prior.length };
}

// ---- leakage identifiers (review: one exact-match `group` misses same artist / different release) ----
// Each track carries:  artists: ["Artist A", "Artist B"]  (everyone credited: main, featured, remixer)
//                      release: "label catalog number or release title"
//                      songFamily: "the underlying song: originals, remixes, edits, VIPs, stems share it"
// Dev and holdout may share NONE of these. Names are compared after normalization (case, accents, punctuation,
// spacing), so "Bicep", "BICEP" and "Bícep." collide. A false alarm is cheap; a missed leak is not.
const norm = s => String(s == null ? "" : s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const list = v => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(norm).filter(Boolean);
// Stable internal artist IDs (preferred) and an optional alias registry, so one artist under different names collides:
//   track.artistIds: ["art-0007"]
//   registry (JSON): { "artists": { "art-0007": { "name": "Bicep", "aliases": ["BICEP", "Bicep (live)"],
//                                                 "external": { "musicbrainz": "…" } } } }     external IDs optional
// Each track's artist keys = its artistIds + every credited name resolved through the registry (name or alias ->
// ID); names the registry doesn't know are compared as normalized names.
function loadRegistry(reg) {
  const byAlias = new Map(), problems = [];
  for (const [id, a] of Object.entries((reg && reg.artists) || {})) for (const n of [a.name, ...(a.aliases || [])].map(norm).filter(Boolean)) {
    if (byAlias.has(n) && byAlias.get(n) !== id) problems.push(`alias "${n}" maps to both ${byAlias.get(n)} and ${id}`); else byAlias.set(n, id);
  }
  return { ids: new Set(Object.keys((reg && reg.artists) || {})), byAlias, problems };
}
const artistKeys = (t, R) => {
  const ids = (t.artistIds || []).map(String), names = list(t.artists != null ? t.artists : t.artist);
  return [...new Set([...ids.map(i => `id:${i}`), ...names.map(n => R && R.byAlias.has(n) ? `id:${R.byAlias.get(n)}` : `name:${n}`)])];
};
const IDENTITY = { artists: t => [...(t.artistIds || []), ...list(t.artists != null ? t.artists : t.artist)], release: t => list(t.release), songFamily: t => list(t.songFamily) };

function identityProblems(tracks, R) {
  const out = [];
  for (const t of tracks) {
    const miss = Object.keys(IDENTITY).filter(k => !IDENTITY[k](t).length); if (miss.length) out.push(`${t.id}: missing leakage identifier(s) ${miss.join(", ")}`);
    if (R) for (const i of t.artistIds || []) if (!R.ids.has(String(i))) out.push(`${t.id}: artist id ${i} is not in the artist registry`);
  }
  return out;
}

// Overlap between dev and holdout manifests on any identifier: id, audio, artist, release, song family, legacy group
function splitOverlap(dev, hold, R = null) {
  const keys = { "id": t => [t.id], "audio sha256": t => t.sha256 ? [t.sha256] : [], "artist": t => artistKeys(t, R), "release": IDENTITY.release, "song family": IDENTITY.songFamily, "group": t => list(t.group) };
  const out = [];
  for (const [what, f] of Object.entries(keys)) {
    const H = new Map(); for (const t of hold) for (const v of f(t)) if (!H.has(v)) H.set(v, t.id);
    for (const t of dev) for (const v of f(t)) if (H.has(v)) out.push(`${what} "${String(v).slice(0, 40)}": dev ${t.id} / holdout ${H.get(v)}`);
  }
  return out;
}

module.exports = { holdoutGuard, splitOverlap, identityProblems, loadRegistry, normalizeName: norm };
