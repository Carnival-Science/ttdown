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

// Overlap between dev and holdout manifests: same id, same audio, or same group (artist/release/song family)
function splitOverlap(dev, hold) {
  const key = (ts, f) => new Map(ts.filter(t => f(t)).map(t => [f(t), t.id]));
  const out = [];
  for (const [what, f] of [["id", t => t.id], ["audio sha256", t => t.sha256], ["group", t => t.group]]) {
    const H = key(hold, f); for (const t of dev) { const v = f(t); if (v && H.has(v)) out.push(`${what} ${String(v).slice(0, 40)}: dev ${t.id} / holdout ${H.get(v)}`); }
  }
  return out;
}

module.exports = { holdoutGuard, splitOverlap };
