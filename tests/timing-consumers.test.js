// Phase 2c, consumers moved so far (ruler bar ticks, metronome clicks): measured against the PINNED Version A predictions and the
// annotated truth, legacy fixed grid versus TimeMap. Needs the generated songs: npm run songs && npm run songs:time.
// Rule: no consumer may get worse on any track unless the regression is listed below WITH its cause; the drift tracks must improve.
"use strict";
const assert = require("node:assert/strict");
const { run, verdict } = require("../bench/timing-consumers");
const fs = require("node:fs"), path = require("node:path");
for (const f of ["test-songs/truth/pop127_Amaj.beats.txt", "test-songs/time-fixtures/truth/drift_fast.beats.txt"]) if (!fs.existsSync(path.join(__dirname, "..", f))) { console.error("Run `npm run songs` and `npm run songs:time` first."); process.exit(2); }

// Known, explained regressions. Anything else that gets worse fails the test; listing one here needs a written cause.
const KNOWN = {
  "tempo_change_step:ruler": "the tracker does not follow a 120 to 150 BPM step (beat F 0.70), so after the change its bar lines are wrong too; the constant grid happened to hit 2 more of 28 downbeats"
};
const rows = run(), by = id => rows.find(r => r.id === id);
assert.equal(rows.length, 20, "8 regression songs + 12 time fixtures");
const verdicts = []; for (const r of rows) for (const c of ["ruler", "metronome"]) verdicts.push({ id: r.id, c, v: verdict(r[c].old, r[c].new), key: `${r.id}:${c}` });
const regressed = verdicts.filter(x => x.v === "regressed"), unexplained = regressed.filter(x => !KNOWN[x.key]);
assert.deepEqual(unexplained.map(x => x.key), [], "regressions with no recorded cause: " + unexplained.map(x => x.key));
for (const k of Object.keys(KNOWN)) assert.ok(regressed.some(x => x.key === k), `${k} is listed as a known regression but no longer regresses: remove it from KNOWN`);

// the point of the migration: the drift tracks
const df = by("drift_fast"), ds = by("drift_slow");
assert.ok(df.ruler.old.within70 < 0.2 && df.ruler.new.within70 >= 0.95, `drift_fast ruler: ${df.ruler.old.within70} -> ${df.ruler.new.within70} of true downbeats within 70 ms`);
assert.ok(df.metronome.old.within70 < 0.4 && df.metronome.new.within70 >= 0.95, `drift_fast metronome: ${df.metronome.old.within70} -> ${df.metronome.new.within70}`);
assert.ok(ds.ruler.old.within20 < 0.4 && ds.ruler.new.within20 >= 0.95, `drift_slow ruler within 20 ms: ${ds.ruler.old.within20} -> ${ds.ruler.new.within20}`);
assert.ok(ds.metronome.new.maxMs < 15, "drift_slow metronome max error " + ds.metronome.new.maxMs + " ms");
// constant-tempo tracks: the tracked grid is as good as the fixed one (within a few ms), never worse than 70 ms coverage
for (const id of ["pop127_Amaj", "trap142_Fsmin", "house124_Cmin", "swing100_Dmin", "fast808_142", "pop127_pad300", "pop127_pad1200", "leading_silence_2s", "pickup_1beat", "pickup_2beats_late", "halftime_140", "halftime_breakdown", "long_7min"])
  for (const c of ["ruler", "metronome"]) assert.ok(by(id)[c].new.within70 >= by(id)[c].old.within70 - 1e-9 && by(id)[c].new.maxMs <= 15, `${id} ${c}: new ${JSON.stringify(by(id)[c].new)}`);
// cases the time model cannot fix are reported as unchanged, not hidden: wrong tempo octave and non-4/4 meter stay wrong in both
for (const id of ["dnb_174", "meter_3_4", "meter_5_4"]) assert.ok(by(id).ruler.new.within70 <= 0.3, `${id}: forced 4/4 bars or the wrong octave remain wrong (${by(id).ruler.new.within70})`);
// every track used its tracked grid (this is Version A's own grid, so this checks the adapter, not the engine)
assert.ok(rows.every(r => r.kind === "tracked"), "unexpected fallback: " + rows.filter(r => r.kind !== "tracked").map(r => r.id + " " + r.reason));
const tally = {}; verdicts.forEach(x => tally[x.v] = (tally[x.v] || 0) + 1); console.log("timing consumers (ruler, metronome) vs Version A:", JSON.stringify(tally), "known regressions:", Object.keys(KNOWN).join(", "));
console.log("timing consumer tests passed");
