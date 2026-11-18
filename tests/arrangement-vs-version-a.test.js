// Phase 2c step 2: section boundaries on the arrangement fixtures, current page versus the pinned Version A
// (bench/baselines/version-a/arrangement-fixtures). Run `npm run bench:arrangement` first.
// The arrangement pass is unchanged; only the mapping of section bars to time moved onto TimeMap. So: the same sections (labels,
// bar numbers) as Version A, never a worse boundary score, and the drifting fixture must improve.
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const ROOT = path.join(__dirname, ".."), NOW = path.join(ROOT, "bench", "out", "arrangement-fixtures"), A = path.join(ROOT, "bench", "baselines", "version-a", "arrangement-fixtures");
if (!fs.existsSync(path.join(NOW, "scores.json"))) { console.error("Run `npm run bench:arrangement` first."); process.exit(2); }
const load = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
const sa = load(A, "scores.json"), sb = load(NOW, "scores.json"), pa = load(A, "predictions.json"), pb = load(NOW, "predictions.json");
assert.equal(pb.manifest.sha256, pa.manifest.sha256, "same fixture set (manifest hash) as the stored Version A run");
for (const ta of sa.tracks) {
  const tb = sb.tracks.find(t => t.id === ta.id); assert.ok(tb && tb.metrics && tb.metrics.sections, ta.id + " scored");
  const secA = pa.tracks.find(t => t.id === ta.id).full.sections, secB = pb.tracks.find(t => t.id === ta.id).full.sections;
  assert.deepEqual(secB.map(s => [s.label, s.startBar, s.bars]), secA.map(s => [s.label, s.startBar, s.bars]), ta.id + ": same sections (labels and bars) as Version A: only their times moved");
  for (const w of ["w05", "w3"]) assert.ok(tb.metrics.sections[w].f >= ta.metrics.sections[w].f, `${ta.id} ${w}: ${ta.metrics.sections[w].f} -> ${tb.metrics.sections[w].f}`);
  assert.ok(secB.every(s => s.timing === "tracked"), ta.id + ": times come from the tracked bars");
  console.log(`${ta.id}: boundary F ±0.5 s ${ta.metrics.sections.w05.f} -> ${tb.metrics.sections.w05.f}, mean |error| ${ta.metrics.sections.w05.meanAbsErrMs} -> ${tb.metrics.sections.w05.meanAbsErrMs} ms`);
}
const drift = id => [sa, sb].map(s => s.tracks.find(t => t.id === id).metrics.sections.w05);
const [dA, dB] = drift("arrangement_drift"); assert.ok(dA.f < 0.5 && dB.f === 1, `drifting tempo: Version A ${dA.f}, now ${dB.f}`);
const [cA, cB] = drift("arrangement_constant"); assert.ok(cB.f === 1 && cB.meanAbsErrMs <= cA.meanAbsErrMs, "constant tempo stays exact and no less precise");
console.log("arrangement vs Version A tests passed");
