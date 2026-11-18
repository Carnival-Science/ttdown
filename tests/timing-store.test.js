// src/timing-store.js: what is saved with a teardown and how it is validated when read. Pure Node, no storage, no browser.
// Uses the pinned Version A predictions (the analyzer's real results, with their tracked grids) for save-and-reload equivalence.
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const TS = require("../src/timing-store"), TM = require("../src/timemap");
let n = 0; const test = (name, fn) => { try { fn(); n++; } catch (e) { console.error("FAIL: " + name + "\n" + (e.stack || e)); process.exitCode = 1; throw e; } };
const ROOT = path.join(__dirname, "..");
const load = f => JSON.parse(fs.readFileSync(path.join(ROOT, "bench", "baselines", "version-a", f), "utf8")).tracks;
// the analyzer's result as the page holds it: enumerable fields + non-enumerable grid and decoded buffer
const result = rec => { const a = JSON.parse(JSON.stringify(rec.full)); Object.defineProperty(a, "grid", { value: rec.grid, enumerable: false, configurable: true }); Object.defineProperty(a, "__buf", { value: { fakeAudioBuffer: new Float32Array(1000) }, enumerable: false, configurable: true }); a.title = rec.id; return a; };
const drift = result(load("arrangement-fixtures/predictions.json").find(t => t.id === "arrangement_drift"));
const roundTrip = r => JSON.parse(JSON.stringify(r));

test("a saved record carries versioned timing and never the audio buffer or runtime objects", () => {
  const rec = TS.forStorage(drift), json = JSON.stringify(rec);
  assert.equal(rec.timing.v, 1); assert.equal(rec.timing.source, "tracker"); assert.deepEqual(rec.timing.beats, drift.grid.beats); assert.deepEqual(rec.timing.downbeats, drift.grid.downbeats);
  assert.deepEqual(rec.timing.meter, { beatsPerBar: 4, status: "assumed", source: "analyzer-assumption" });
  assert.deepEqual(rec.timing.basis, { bpm: drift.bpm, barSec: drift.barSec, firstDown: drift.firstDown, duration: drift.duration });
  assert.ok(!("__buf" in rec) && !("grid" in rec), "no buffer, no live grid object as a top-level field"); assert.ok(!/fakeAudioBuffer|__buf/.test(json), "nothing of the decoded audio in the JSON");
  assert.ok(json.length < 30000, "an 8-minute-scale record stays small (" + json.length + " bytes)");
  assert.equal(Object.keys(drift).includes("grid"), false, "the live result is not modified"); assert.equal(drift.timing, undefined);
});

test("even if the buffer or grid were enumerable fields, they are stripped from what is stored", () => {
  const a = roundTrip(drift); a.__buf = { audio: new Float32Array(10) }; a.grid = drift.grid;
  const rec = TS.forStorage(a); assert.ok(!("__buf" in rec) && !("grid" in rec)); assert.ok(!/audio/.test(JSON.stringify(rec))); assert.deepEqual(rec.timing.beats, drift.grid.beats);
});

test("additive: every field the page saved before is still saved, unchanged", () => {
  const rec = TS.forStorage(drift); for (const k of Object.keys(drift)) assert.deepEqual(rec[k], drift[k], k);
  assert.deepEqual(Object.keys(rec).filter(k => !(k in drift)), ["timing"]);
});

test("save and reload: the grid comes back, and TimeMap built from it is identical (all 22 pinned tracks)", () => {
  const all = [].concat(load("predictions.json"), load("time-fixtures/predictions.json"), load("arrangement-fixtures/predictions.json")); assert.equal(all.length, 22);
  for (const t of all) {
    const live = result(t), reloaded = roundTrip(TS.forStorage(live)), st = TS.attach(reloaded);
    assert.equal(st.status, "tracked", t.id); assert.deepEqual(reloaded.grid, live.grid, t.id + " grid");
    assert.equal(Object.keys(reloaded).includes("grid"), false, "attached grid is non-enumerable, so it cannot be re-serialized by accident");
    const A = TM.forAnalysis(live), B = TM.forAnalysis(reloaded); assert.equal(B.kind, "tracked", t.id);
    for (let b = 0; b < 80; b++) assert.equal(B.barStart(b), A.barStart(b), `${t.id} bar ${b}`);
    assert.equal(B.map.fingerprint(), A.map.fingerprint(), t.id + " TimeMap fingerprint");
  }
});

test("older records (saved before timing existed) stay readable and use the labelled fallback", () => {
  const old = roundTrip(drift); assert.equal(TS.attach(old).status, "none"); assert.equal(old.grid, undefined);
  const G = TM.forAnalysis(old); assert.equal(G.kind, "fallback-grid"); assert.equal(G.reason, "no-tracked-grid");
  assert.equal(TS.forStorage(old).timing, undefined, "re-saving an old record does not invent timing");
  assert.deepEqual(Object.keys(TS.forStorage(old)).sort(), Object.keys(old).sort());
});

test("invalid timing is rejected with a reason, never throws, never attaches a grid, and is passed through (not destroyed) when re-saved", () => {
  const good = TS.forStorage(drift).timing, mut = f => { const t = roundTrip(good); f(t); return t; };
  const cases = {
    "not-an-object": "nope", "no-version": mut(t => delete t.v), "no-version#2": mut(t => { t.v = 0; }), "too-few-beats": mut(t => { t.beats = [1]; t.downbeats = []; }),
    "beats-not-increasing-numbers": mut(t => { t.beats[5] = t.beats[3]; }), "beats-not-increasing-numbers#2": mut(t => { t.beats[2] = "x"; }), "beats-not-increasing-numbers#3": mut(t => { t.beats[2] = null; }),
    "beats-out-of-range": mut(t => { t.beats[0] = -50; }), "downbeats-not-increasing-numbers": mut(t => { t.downbeats = [3, 2]; }), "downbeat-not-a-tracked-beat": mut(t => { t.downbeats[1] += 0.0001; }),
    "bad-meter": mut(t => { t.meter.beatsPerBar = 0; }), "bad-meter#2": mut(t => { delete t.meter; }), "bad-basis": mut(t => { t.basis.duration = -1; }), "bad-basis#2": mut(t => { delete t.basis; }),
    "beats-past-the-end-of-the-audio": mut(t => { t.basis.duration = 10; }), "too-many-beats": mut(t => { t.beats = Array.from({ length: 30001 }, (_, i) => i); t.downbeats = []; t.basis.duration = 40000; })
  };
  for (const [name, bad] of Object.entries(cases)) {
    const want = name.replace(/#\d$/, ""), r = TS.check(bad); assert.equal(r.ok, false, name); assert.equal(r.status, "invalid", name); assert.equal(r.reason, want, name); assert.equal(r.grid, null);
    const rec = roundTrip(drift); rec.timing = bad; assert.equal(TS.attach(rec).status, "invalid"); assert.equal(rec.grid, undefined, name + ": no grid attached");
    assert.equal(TM.forAnalysis(rec).kind, "fallback-grid", name + ": the page falls back, labelled");
    assert.deepEqual(TS.forStorage(rec).timing, bad, name + ": re-saving keeps the unreadable block untouched");
  }
  for (const junk of [null, undefined, 5, [], "x", {}, { v: 1 }]) assert.doesNotThrow(() => TS.check(junk));
  assert.doesNotThrow(() => TS.attach(null)); assert.doesNotThrow(() => TS.attach("x"));
});

test("a record written by a newer version is not used, and not damaged", () => {
  const rec = roundTrip(drift); rec.timing = { v: 2, beats: [1, 2], anything: { the: "future" } };
  const st = TS.attach(rec); assert.equal(st.status, "newer-version"); assert.equal(rec.grid, undefined); assert.deepEqual(TS.forStorage(rec).timing, rec.timing);
});

test("tempo correction: the original measurement is preserved next to the correction", () => {
  const a = result(load("arrangement-fixtures/predictions.json").find(t => t.id === "arrangement_drift")); TS.ensure(a);
  const orig = { bpm: a.bpm, barSec: a.barSec, firstDown: a.firstDown, duration: a.duration };
  a.bpm = 63.5; a.barSec = 3.78; a.bpmConf = 99; a.bpmFixed = true; a.timingCorrections = [{ type: "bpm", from: orig.bpm, to: 63.5, source: "user", at: "2026-11-18T00:00:00Z" }];
  const rec = roundTrip(TS.forStorage(a)); assert.deepEqual(rec.timing.basis, orig, "basis is what the tracker measured, not the corrected tempo"); assert.equal(rec.timing.beats.length, a.grid.beats.length);
  assert.deepEqual(rec.timingCorrections, a.timingCorrections); assert.equal(rec.bpm, 63.5);
  TS.attach(rec); const G = TM.forAnalysis(rec); assert.equal(G.kind, "fallback-grid"); assert.equal(G.reason, "bpm-corrected-by-user", "the corrected tempo wins over the restored grid");
  assert.ok(rec.grid && rec.grid.beats.length === a.grid.beats.length, "but the measured beats are still there");
});

test("ensure() only records a measurement that exists, once", () => {
  const a = roundTrip(drift); assert.equal(TS.ensure(a).timing, undefined);
  const b = result(load("arrangement-fixtures/predictions.json")[0]); TS.ensure(b); const t1 = b.timing; b.bpm = 1; TS.ensure(b); assert.equal(b.timing, t1, "not rebuilt after a correction");
});
console.log(`timing-store tests passed (${n})`);
