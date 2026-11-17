// Unit tests for src/timemap.js (the musical time model).  node tests/timemap.test.js
// Pure Node, no browser. Fixtures are built here from known beat positions, so every expectation is exact by construction.
"use strict";
const assert = require("node:assert/strict");
const TM = require("../src/timemap");

let n = 0;
const test = (name, fn) => { try { fn(); n++; } catch (e) { console.error("FAIL: " + name + "\n" + (e.stack || e)); process.exitCode = 1; throw e; } };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} expected ${b} ± ${tol}, got ${a}`);
const rng = (seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)(12345);

// beats at `t0 + k * 60/bpm`, k = 0..count-1
const constBeats = (bpm, count, t0 = 0) => Array.from({ length: count }, (_, k) => t0 + k * 60 / bpm);
// downbeats every `per` beats starting at beat index `first`
const downs = (beats, per, first) => beats.filter((_, k) => k >= first && (k - first) % per === 0);
const meter44 = { beatsPerBar: 4, status: "assumed" };
const build = (beats, firstDown, dur, meter = meter44) => TM.fromGrid({ beats, downbeats: downs(beats, 4, firstDown) }, { duration: dur, meter });

test("constant tempo: beats, bars and positions are exact", () => {
  const b = constBeats(120, 33), m = build(b, 0, 16.5);
  assert.equal(m.measured, true); assert.equal(m.hasBars, true); assert.equal(m.beatsPerBar, 4);
  near(m.timeToBeat(1.25), 2.5, 1e-12); near(m.beatToTime(6), 3, 1e-12);
  const p = m.position(5.25); assert.equal(p.bar, 2); near(p.beatInBar, 3.5, 1e-9); // 5.25 s = beat 10.5 = bar 2 (starts at 4 s), 2.5 beats in
  assert.equal(p.source, "measured"); assert.equal(p.extrapolated, false);
  const bars = m.bars(); assert.equal(bars[0].bar, 0); near(bars[0].start, 0, 1e-12); near(bars[1].start, 2, 1e-12); assert.equal(bars.length, 9);
  near(m.tempo().bpm, 120, 1e-9); assert.equal(m.tempo().isConstant, true); assert.equal(m.tempo().changes.length, 0);
});

test("position(): bar and beat-in-bar are consistent with the beat coordinate", () => {
  const m = build(constBeats(120, 33), 0, 16.5);
  for (const t of [0, 0.3, 1.9, 2, 2.01, 7.77, 15.9]) {
    const p = m.position(t), q = m.timeToBeat(t);
    near(p.bar * 4 + (p.beatInBar - 1), q, 1e-9, "bar*4+beatInBar-1 == beat at " + t); assert.ok(p.beatInBar >= 1 && p.beatInBar < 5);
  }
});

test("round trip: beatToTime(timeToBeat(t)) == t everywhere, including outside the tracked range", () => {
  const m = build(constBeats(128, 80, 1.3), 2, 40);
  for (let i = 0; i < 400; i++) { const t = -3 + rng() * 50; near(m.beatToTime(m.timeToBeat(t)), t, 1e-9, "t=" + t); }
  for (let i = 0; i < 400; i++) { const q = -20 + rng() * 120; near(m.timeToBeat(m.beatToTime(q)), q, 1e-9, "q=" + q); }
});

test("leading silence: first beat at 2 s; time before it is extrapolated and labelled, never measured", () => {
  const b = constBeats(120, 40, 2), m = build(b, 0, 22);
  near(m.timeToBeat(2), 0, 1e-12); near(m.timeToBeat(0), -4, 1e-12);
  const early = m.position(1), inside = m.position(3);
  assert.equal(early.extrapolated, true); assert.equal(early.source, "extrapolated"); assert.equal(inside.source, "measured");
  assert.equal(m.bars()[0].bar, -1); assert.equal(m.bars()[0].extrapolated, true); // the bar covering 0..2 s is a pickup-length extrapolation
});

test("musical pickup: beats before the first downbeat belong to bar -1 with beat-in-bar counting up to the downbeat", () => {
  const b = constBeats(120, 33), m = build(b, 1, 16.5); // downbeat is the 2nd tracked beat (0.5 s)
  const p = m.position(0); assert.equal(p.bar, -1); near(p.beatInBar, 4, 1e-12); near(m.timeToBeat(0), -1, 1e-12);
  near(m.position(0.5).beatInBar, 1, 1e-12); assert.equal(m.position(0.5).bar, 0);
  near(m.barStart(0), 0.5, 1e-12); near(m.barStart(-1), -1.5, 1e-9); assert.equal(m.bars()[0].bar, -1);
});

test("nonzero first downbeat (downbeat is the 3rd tracked beat)", () => {
  const m = build(constBeats(120, 33), 2, 16.5);
  near(m.barStart(0), 1, 1e-12); near(m.timeToBeat(0), -2, 1e-12); assert.equal(m.position(0.5).bar, -1); near(m.position(0.5).beatInBar, 4, 1e-12); near(m.position(0).beatInBar, 3, 1e-12); // a 2-beat pickup: beats 3 and 4 of bar -1
});

test("downbeat unknown or meter ambiguous: no bar layer, no 4/4 forced", () => {
  const b = constBeats(120, 33);
  const none = TM.fromGrid({ beats: b, downbeats: [] }, { duration: 16.5, meter: meter44 });
  assert.equal(none.hasBars, false); assert.equal(none.position(3).bar, null); assert.equal(none.position(3).beatInBar, null); assert.deepEqual(none.bars(), []); assert.equal(none.barStart(2), null);
  assert.equal(none.downbeat.status, "unknown"); near(none.timeToBeat(1), 2, 1e-12); // beats still convert, from the first beat
  assert.deepEqual(none.exportEligibility().reasons, ["downbeat-unknown"]); assert.equal(none.exportEligibility().eligible, false);
  // irregular downbeat spacing (4, 3, 4) => ambiguous
  const irregular = TM.fromGrid({ beats: b, downbeats: [b[0], b[4], b[7], b[11]] }, { duration: 16.5 });
  assert.equal(irregular.meter.status, "ambiguous"); assert.equal(irregular.hasBars, false);
  // stated meter that contradicts the downbeats => ambiguous, with a note
  const clash = TM.fromGrid({ beats: b, downbeats: downs(b, 3, 0) }, { duration: 16.5, meter: meter44 });
  assert.equal(clash.meter.status, "ambiguous"); assert.match(clash.meter.note, /disagrees/);
});

test("3/4 measured from regular downbeats: bars are defined, 4/4 export is refused", () => {
  const b = constBeats(120, 33), m = TM.fromGrid({ beats: b, downbeats: downs(b, 3, 0) }, { duration: 16.5 });
  assert.equal(m.meter.status, "measured"); assert.equal(m.beatsPerBar, 3); near(m.barStart(2), 3, 1e-12);
  const e = m.exportEligibility(); assert.equal(e.eligible, false); assert.ok(e.reasons.includes("meter-not-4/4"));
});

test("unsupported meter declared by the user removes the bar layer but keeps beats", () => {
  const m = build(constBeats(120, 33), 0, 16.5).withMeterUnsupported("5/4 with a 7/8 bridge", { at: "T" });
  assert.equal(m.hasBars, false); assert.equal(m.position(3).bar, null); assert.equal(m.meter.status, "unsupported");
  near(m.timeToBeat(3), 6, 1e-12); assert.ok(m.exportEligibility().reasons.includes("meter-unsupported"));
});

test("half-time / double-time: alternatives are listed and explicitly uncalibrated", () => {
  const m = build(constBeats(128, 65), 0, 30), h = m.tempo().hypotheses;
  assert.deepEqual(h.map(x => x.role), ["selected", "alternative-double", "alternative-half"]);
  near(h[1].bpm, 256, 1e-9); near(h[2].bpm, 64, 1e-9);
  for (const x of h) { assert.equal(x.score, null); assert.equal(x.calibrated, false); } // no invented probabilities
});

test("tempo drift: the map follows it, a fixed grid does not", () => {
  // 120 BPM slowing linearly to 108 over 300 beats (10 %)
  const b = []; let t = 0; for (let k = 0; k < 300; k++) { b.push(t); t += 60 / (120 - 12 * k / 299); }
  const m = build(b, 0, b[299] + 1);
  b.forEach((bt, k) => near(m.timeToBeat(bt), k, 1e-9)); // every tracked beat sits on an integer beat
  const fixed = k => k * 60 / m.tempo().bpm, errLast = Math.abs(fixed(299) - b[299]); // constant-BPM grid built from the median tempo
  assert.ok(errLast > 0.07, "a fixed grid drifts outside the ±70 ms beat tolerance by the end (" + (errLast * 1000).toFixed(0) + " ms)");
  assert.equal(m.tempo().isConstant, false); assert.ok(m.tempo().maxDeviation > 0.03);
  const e = m.exportEligibility(); assert.equal(e.eligible, false); assert.ok(/tempo/.test(e.reasons[0]));
});

test("slight drift within tolerance is still constant (0.5 BPM over 200 beats)", () => {
  const b = []; let t = 0; for (let k = 0; k < 200; k++) { b.push(t); t += 60 / (128 - 0.5 * k / 199); }
  const m = build(b, 0, b[199] + 1); assert.equal(m.tempo().isConstant, true); assert.equal(m.exportEligibility().eligible, true);
});

test("jitter in a constant tempo (±5 ms tracker noise) is still constant", () => {
  const b = constBeats(126, 300).map(x => x + (rng() - 0.5) * 0.01), m = build(b, 0, b[299] + 1);
  assert.equal(m.tempo().isConstant, true); near(m.tempo().bpm, 126, 0.5);
});

test("tracker frame quantization (11.6 ms) does not bias the tempo", () => {
  // beats at a true 127 BPM, rounded to the analyzer's 256-sample / 22.05 kHz frame grid, as the tracker reports them
  const frame = 256 / 22050, b = constBeats(127, 148).map(x => Math.round(x / frame) * frame), m = build(b, 0, b[147] + 1);
  near(m.tempo().bpm, 127, 0.3, "bpm"); assert.equal(m.tempo().isConstant, true);
  const median = a => a.slice().sort((x, y) => x - y)[a.length >> 1], naive = 60 / median(b.slice(1).map((x, i) => x - b[i]));
  assert.ok(Math.abs(naive - 127) > 0.5, "the median beat interval alone is off by " + Math.abs(naive - 127).toFixed(2) + " BPM, which is why the fit is used");
});

test("tempo change (120 -> 150 BPM at beat 64): one change, found near the right time, exports refused", () => {
  const b = []; let t = 0; for (let k = 0; k < 128; k++) { b.push(t); t += k < 64 ? 0.5 : 0.4; }
  const m = build(b, 0, b[127] + 1), tp = m.tempo();
  assert.equal(tp.changes.length, 1); near(tp.changes[0].t, b[64], 2.5, "change position (within ~5 beats)");
  near(tp.segments[0].bpm, 120, 1); near(tp.segments[1].bpm, 150, 1);
  assert.deepEqual(m.exportEligibility().reasons, ["tempo-changes"]);
  // the map still places every tracked beat exactly, across the change
  b.forEach((bt, k) => near(m.timeToBeat(bt), k, 1e-9));
});

test("half-time breakdown (128 -> 64 BPM) is a tempo change, not noise", () => {
  const b = []; let t = 0; for (let k = 0; k < 96; k++) { b.push(t); t += k < 48 ? 60 / 128 : 60 / 64; }
  const tp = build(b, 0, b[95] + 1).tempo(); assert.equal(tp.changes.length, 1); near(tp.changes[0].ratio, 0.5, 0.02);
});

test("long recording (10 minutes at 128 BPM): correct and fast", () => {
  const count = Math.ceil(600 / (60 / 128)) + 1, b = constBeats(128, count), t0 = Date.now();
  const m = build(b, 0, 600);
  for (let i = 0; i < 5000; i++) { const t = rng() * 600; near(m.beatToTime(m.timeToBeat(t)), t, 1e-9); }
  const bars = m.bars(); assert.equal(bars.length, 320); near(bars[319].end, 600, 0.01); assert.equal(m.tempo().isConstant, true);
  assert.ok(Date.now() - t0 < 2000, "built and queried in " + (Date.now() - t0) + " ms");
});

test("fixed-grid fallback is labelled and reproduces the app's current grid formula exactly", () => {
  const bpm = 127, firstDown = -0.1, dur = 228, barSec = 240 / bpm, m = TM.fromConstantGrid({ bpm, firstDownbeat: firstDown, duration: dur });
  assert.equal(m.measured, false); assert.equal(m.source, "fallback-grid"); assert.ok(m.src.every(s => s === "fallback-grid"));
  assert.equal(m.position(50).source, "fallback-grid"); assert.equal(m.downbeat.status, "unknown");
  for (let i = 0; i < 300; i++) { // the app's grid: time = firstDown + bar * barSec + step * barSec / 16
    const bar = Math.floor(rng() * 110), step = Math.floor(rng() * 16);
    near(m.beatToTime(bar * 4 + step / 4), firstDown + bar * barSec + step * barSec / 16, 1e-9);
  }
  const e = m.exportEligibility(); assert.equal(e.eligible, true); assert.equal(e.grade, "legacy-fixed-grid"); assert.equal(e.verified, false);
  assert.ok(e.caveats.some(c => /fallback/.test(c)));
});

test("quantize() is explicit and keeps the deviation (the groove)", () => {
  const m = build(constBeats(120, 33), 0, 16.5), q = m.quantize(1.03); // 16th = 0.125 s
  assert.equal(q.beat, 2); near(q.t, 1, 1e-12); near(q.deviation, 0.03, 1e-12);
  const swung = m.quantize(0.185, 4); near(swung.t, 0.125, 1e-12); near(swung.deviation, 0.06, 1e-12);
});

test("corrections: original kept, labelled as user, dependents detectably stale", () => {
  const m0 = build(constBeats(120, 33), 0, 16.5), fp0 = m0.fingerprint();
  const m1 = m0.withDownbeat(1.0, { at: "2026-11-17T00:00:00Z" });
  near(m1.barStart(0), 1, 1e-12); assert.equal(m1.downbeat.status, "user"); assert.equal(m1.measured, true);
  assert.notEqual(m1.fingerprint(), fp0, "fingerprint changes so stored derived results can be invalidated");
  assert.equal(m0.fingerprint(), fp0); near(m0.barStart(0), 0, 1e-12); // original object untouched
  assert.equal(m1.original().fingerprint(), fp0); assert.equal(m1.original().downbeat.status, "measured");
  assert.deepEqual(m1.corrections, [{ source: "user", at: "2026-11-17T00:00:00Z", type: "downbeat", from: 0, to: 1 }]);
  const m2 = m1.withMeter(3, { at: "T2" }); assert.equal(m2.meter.status, "user"); assert.equal(m2.beatsPerBar, 3); assert.equal(m2.corrections.length, 2); assert.equal(m2.original().fingerprint(), fp0);
  assert.throws(() => m0.withMeter(0), e => e.code === "bad-meter"); assert.throws(() => m0.withMeter(2.5), e => e.code === "bad-meter");
});

test("immutability", () => {
  const m = build(constBeats(120, 33), 0, 16.5);
  assert.throws(() => { m.duration = 1; }, TypeError); assert.throws(() => { m.t.push(99); }, TypeError); assert.throws(() => { m.corrections.push({}); }, TypeError);
});

test("JSON round trip keeps beats, provenance, corrections and the original; tampering is detected", () => {
  const m = build(constBeats(120, 33), 0, 16.5).withDownbeat(1.0, { at: "T" }).withMeter(4, { at: "T2" });
  const r = TM.fromJSON(JSON.parse(JSON.stringify(m)));
  assert.equal(r.fingerprint(), m.fingerprint()); assert.deepEqual(r.corrections, m.corrections); assert.equal(r.original().fingerprint(), m.original().fingerprint());
  const j = JSON.parse(JSON.stringify(m)); j.beats[3].t += 0.01;
  assert.throws(() => TM.fromJSON(j), e => e.code === "fingerprint-mismatch");
  assert.throws(() => TM.fromJSON({ schema: "other" }), e => e.code === "bad-schema");
});

test("invalid input is rejected with a code, never silently repaired", () => {
  const code = c => e => e instanceof TM.TimeMapError && e.code === c;
  assert.throws(() => TM.fromGrid({ beats: [1] }, { duration: 5 }), code("too-few-beats"));
  assert.throws(() => TM.fromGrid({ beats: [0, 1, 0.5] }, { duration: 5 }), code("bad-beats"));
  assert.throws(() => TM.fromGrid({ beats: [0, 1, 1] }, { duration: 5 }), code("bad-beats"));
  assert.throws(() => TM.fromGrid({ beats: [0, NaN, 2] }, { duration: 5 }), code("bad-beats"));
  assert.throws(() => TM.fromGrid({ beats: [0, 1, 2] }, { duration: 0 }), code("bad-duration"));
  assert.throws(() => TM.fromGrid(null, { duration: 5 }), code("too-few-beats"));
  assert.throws(() => TM.fromConstantGrid({ bpm: 0, firstDownbeat: 0, duration: 5 }), code("bad-bpm"));
  const m = build(constBeats(120, 33), 0, 16.5);
  assert.throws(() => m.timeToBeat(NaN), code("bad-time")); assert.throws(() => m.beatToTime(Infinity), code("bad-beat"));
});

test("a downbeat that is not on a tracked beat is ignored with a warning", () => {
  const b = constBeats(120, 33), m = TM.fromGrid({ beats: b, downbeats: [0, 2, 4.2] }, { duration: 16.5, meter: meter44 });
  assert.equal(m.warnings.length, 0); assert.equal(m.meter.status, "assumed"); // 4.2 s snaps to the beat at 4.0 (0.2 s < half an interval)
  const m2 = TM.fromGrid({ beats: b, downbeats: [0, 2.3] }, { duration: 16.5, meter: meter44 });
  assert.equal(m2.warnings.length, 0); assert.equal(m2.meter.status, "ambiguous"); // 2.3 snaps to 2.5: spacing 5 contradicts the stated 4/4
  const m3 = TM.fromGrid({ beats: constBeats(120, 33), downbeats: [0, 2.25] }, { duration: 16.5, meter: { beatsPerBar: 4, status: "assumed" }, settings: { snapFraction: 0.2 } });
  assert.equal(m3.warnings.length, 1); assert.match(m3.warnings[0], /not on a tracked beat/);
});

test("export eligibility: engine-style 4/4 constant tempo is allowed with an explicit 'assumed meter' caveat, not called verified", () => {
  const e = build(constBeats(124, 100), 0, 50).exportEligibility();
  assert.equal(e.eligible, true); assert.equal(e.verified, false); assert.equal(e.grade, "tracked-constant-tempo"); assert.ok(e.caveats.some(c => /assumed/.test(c)));
  const confirmed = build(constBeats(124, 100), 0, 50).withMeter(4).exportEligibility(); assert.equal(confirmed.verified, true); assert.deepEqual(confirmed.caveats, []);
});

console.log(`timemap tests passed (${n})`);
