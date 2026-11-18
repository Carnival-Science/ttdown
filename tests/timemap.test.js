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
  const en = none.exportEligibility(); assert.equal(en.state, "needs-confirmation"); assert.ok(en.needs.includes("downbeat")); assert.equal(en.eligible, false); assert.equal(en.exportRange, null);
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
  const e = m.exportEligibility(); assert.equal(e.state, "refused"); assert.ok(e.reasons.includes("meter-not-4/4"));
});

test("unsupported meter declared by the user removes the bar layer but keeps beats", () => {
  const m = build(constBeats(120, 33), 0, 16.5).withMeterUnsupported("5/4 with a 7/8 bridge", { at: "T" });
  assert.equal(m.hasBars, false); assert.equal(m.position(3).bar, null); assert.equal(m.meter.status, "unsupported");
  near(m.timeToBeat(3), 6, 1e-12); assert.equal(m.exportEligibility().state, "refused"); assert.ok(m.exportEligibility().reasons.includes("meter-unsupported"));
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
  const e = m.exportEligibility(); assert.equal(e.state, "refused"); assert.ok(/tempo/.test(e.reasons[0]));
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
  assert.equal(m.exportEligibility().state, "refused"); assert.deepEqual(m.exportEligibility().reasons, ["tempo-changes"]);
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
  const e = m.exportEligibility(); assert.equal(e.state, "needs-confirmation"); assert.deepEqual(e.needs, ["downbeat", "meter"]);
  assert.ok(e.caveats.some(c => /fallback/.test(c)));
  const ok = m.confirmDownbeat().confirmMeter().exportEligibility(); assert.equal(ok.state, "allowed", "legacy fixed grids keep working once the user has confirmed"); assert.ok(ok.caveats.some(c => /fallback/.test(c)), "and are still labelled");
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

test("export eligibility: the engine's assumed 4/4 needs confirmation; only a confirmed meter AND downbeat is allowed", () => {
  const m = build(constBeats(124, 100), 0, 50), e = m.exportEligibility();
  assert.equal(e.state, "needs-confirmation"); assert.equal(e.eligible, false); assert.deepEqual(e.needs, ["downbeat", "meter"]); assert.deepEqual(e.reasons, []);
  assert.equal(m.confirmMeter().exportEligibility().state, "needs-confirmation", "meter alone is not enough"); assert.deepEqual(m.confirmMeter().exportEligibility().needs, ["downbeat"]);
  assert.equal(m.confirmDownbeat().exportEligibility().state, "needs-confirmation"); assert.deepEqual(m.confirmDownbeat().exportEligibility().needs, ["meter"]);
  const ok = m.confirmMeter().confirmDownbeat().exportEligibility(); assert.equal(ok.state, "allowed"); assert.equal(ok.eligible, true); assert.deepEqual(ok.needs, []); assert.deepEqual(ok.caveats, []);
  assert.deepEqual(m.confirmMeter().confirmDownbeat().corrections.map(c => c.type), ["meter-confirm", "downbeat-confirm"]);
  assert.equal(m.withMeter(4).withDownbeat(0).exportEligibility().state, "allowed", "setting meter and downbeat also confirms them");
  assert.throws(() => build(constBeats(124, 100), 0, 50).withMeterUnsupported("x").confirmMeter(), e2 => e2.code === "no-meter");
  assert.throws(() => TM.fromGrid({ beats: constBeats(124, 20), downbeats: [] }, { duration: 10 }).confirmDownbeat(), e2 => e2.code === "no-downbeat");
  // a confirmation never overrides a refusal: confirmed meter on a drifting track is still refused
  const drift = []; let t = 0; for (let k = 0; k < 300; k++) { drift.push(t); t += 60 / (120 - 12 * k / 299); }
  assert.equal(build(drift, 0, drift[299] + 1).confirmMeter().confirmDownbeat().exportEligibility().state, "refused");
});

test("export grid: pinned at the bar-one anchor, with max and RMS error against the tracked beats, and the cost of pinning", () => {
  const b = constBeats(128, 200).map((x, i) => x + (i === 0 ? 0.012 : 0)); // the anchor beat itself is 12 ms late
  const m = build(b, 0, b[199] + 1), g = m.exportGrid();
  near(g.anchorTime, b[0], 0, "bar one sits exactly on the tracked downbeat"); assert.equal(g.anchorBeatIndex, 0); assert.equal(m.exportGridTime(0), b[0]);
  near(g.bpm, 128, 0.2); assert.ok(g.maxDeviationMs > 0 && g.rmsDeviationMs > 0 && g.rmsDeviationMs <= g.maxDeviationMs);
  assert.ok(g.interceptShiftMs > 8 && g.interceptShiftMs < 14, "pinning to a late anchor shifts the grid " + g.interceptShiftMs.toFixed(1) + " ms from the free fit");
  assert.equal(g.within, g.maxDeviationMs <= 20); assert.equal(g.toleranceMs, 20);
  assert.equal(TM.fromGrid({ beats: constBeats(128, 20), downbeats: [] }, { duration: 10 }).exportGrid(), null, "no grid while the downbeat is unknown");
  // configurable: a tighter tolerance refuses what the default accepts
  const tight = TM.fromGrid({ beats: b, downbeats: [b[0]] }, { duration: b[199] + 1, meter: meter44, settings: { gridTolerance: 0.001 } });
  assert.equal(tight.exportEligibility().state, "refused"); assert.deepEqual(tight.exportEligibility().reasons, ["tempo-drift"]);
});

test("steady-looking drift: local tempo is 'constant', but export is refused when one pinned tempo misses beats by > 20 ms", () => {
  const drift = bpmEnd => { const b = []; let t = 0; for (let k = 0; k < 200; k++) { b.push(t); t += 60 / (128 + (bpmEnd - 128) * k / 199); } return build(b, 0, b[199] + 1); };
  const big = drift(127.5), e = big.exportEligibility(); // 0.4 % over ~94 s
  assert.equal(big.tempo().isConstant, true, "local tempo varies by well under 3 %");
  assert.ok(e.exportGrid.maxDeviationMs > 20 && e.exportGrid.maxDeviationMs < 60, "pinned grid is " + e.exportGrid.maxDeviationMs.toFixed(1) + " ms off");
  assert.equal(e.state, "refused"); assert.deepEqual(e.reasons, ["tempo-drift"]);
  const small = drift(127.9).exportEligibility(); // 0.08 %
  assert.ok(small.exportGrid.maxDeviationMs < 15); assert.equal(small.state, "needs-confirmation");
});

test("coverage: measured span versus extrapolated seconds; exports never include extrapolated audio", () => {
  const b = constBeats(128, 1024), m = build(b, 0, 600).confirmMeter().confirmDownbeat(); // beats cover 0..479.5 s of 600 s
  const c = m.coverage(); near(c.measuredStart, 0, 1e-12); near(c.measuredEnd, b[1023], 1e-9); near(c.extrapolatedAfter, 600 - b[1023], 1e-9); assert.equal(c.extrapolatedBefore, 0);
  near(c.fractionMeasured, b[1023] / 600, 1e-9);
  const e = m.exportEligibility(); assert.equal(e.state, "allowed"); assert.ok(e.caveats.some(x => /120 s of the audio lie outside the tracked beats/.test(x)), e.caveats.join("|"));
  assert.ok(e.exportRange.end <= b[1023] + 1e-9 && e.exportRange.end > b[1023] - 2, "the export range ends at the last whole tracked bar (" + e.exportRange.end + " s), not at 600 s");
  assert.equal(e.exportRange.startBar, 0); assert.equal(e.exportRange.endBar, 254);
  // leading silence: the audio before the first beat is extrapolated and reported as such
  const lead = build(constBeats(120, 40, 2), 0, 22).coverage(); near(lead.extrapolatedBefore, 2, 1e-12); near(lead.extrapolatedAfter, 0.5, 1e-9);
  // short untracked edges are not called out
  assert.deepEqual(build(constBeats(128, 100), 0, 48.5).confirmMeter().confirmDownbeat().exportEligibility().caveats, []);
  // a fallback grid has no measured span at all
  const fb = TM.fromConstantGrid({ bpm: 120, firstDownbeat: 0.1, duration: 30 }).coverage(); assert.equal(fb.measuredStart, null); assert.equal(fb.measuredSeconds, 0); near(fb.extrapolatedSeconds, 30, 1e-12);
});

test("position(): only times strictly outside the tracked span are extrapolated; the exact first and last beats are not", () => {
  const b = constBeats(120, 33), m = build(b, 0, 17);
  assert.equal(m.position(b[0]).extrapolated, false); assert.equal(m.position(b[32]).extrapolated, false); assert.equal(m.position(b[32]).source, "measured");
  assert.equal(m.position(b[32] + 0.001).extrapolated, true); assert.equal(m.position(-0.001).extrapolated, true);
});

test("meter representation: pulses per bar is not a time signature; stated signatures are kept and non-4 ones are refused for bar export", () => {
  const m = build(constBeats(120, 100), 0, 48);
  assert.deepEqual([m.meter.beatsPerBar, m.meter.numerator, m.meter.denominator, m.meter.beatUnit], [4, null, null, null], "the analyzer states only 4 pulses per bar");
  const c = m.withMeter({ beatsPerBar: 4, numerator: 12, denominator: 8, beatUnit: "dotted-quarter" }, { at: "T" });
  assert.deepEqual([c.meter.numerator, c.meter.denominator, c.meter.beatUnit, c.meter.status], [12, 8, "dotted-quarter", "user"]);
  assert.deepEqual(c.confirmDownbeat().exportEligibility().reasons, ["meter-not-4/4"], "12/8 tracked as 4 pulses is not a 4/4 grid");
  assert.equal(m.withMeter({ beatsPerBar: 4, numerator: 4, denominator: 4 }).confirmDownbeat().exportEligibility().state, "allowed");
  assert.equal(TM.fromJSON(JSON.parse(JSON.stringify(c))).meter.denominator, 8, "survives a JSON round trip");
});

test("deep immutability: nothing reachable from a TimeMap can be changed, including nested objects and memoised results", () => {
  const m = build(constBeats(120, 100), 0, 48).withMeter(4, { at: "T" });
  const frozen = o => Object.isFrozen(o) && Object.values(o).every(v => v === null || typeof v !== "object" || frozen(v));
  for (const k of ["t", "src", "downbeat", "meter", "tempoHypotheses", "corrections", "settings", "warnings"]) assert.ok(frozen(m[k]), k + " is deeply frozen");
  assert.throws(() => { m.meter.status = "measured"; }, TypeError); assert.throws(() => { m.settings.gridTolerance = 1; }, TypeError);
  assert.throws(() => { m.corrections[0].source = "machine"; }, TypeError); assert.throws(() => { m.tempoHypotheses[0].bpm = 1; }, TypeError);
  assert.throws(() => { m.downbeat.status = "user"; }, TypeError);
  const tp = m.tempo(), e = m.exportEligibility(), g = m.exportGrid(), cv = m.coverage();
  for (const x of [tp, tp.segments, e, e.needs, e.caveats, g, cv, m.tempoCurve()]) assert.ok(Object.isFrozen(x), "memoised result is frozen");
  assert.throws(() => { tp.isConstant = false; }, TypeError); assert.throws(() => { e.state = "allowed"; }, TypeError);
  assert.equal(m.tempo(), tp, "memoised"); assert.deepEqual(Object.keys(m).filter(k => k.startsWith("_")), [], "no private mutable cache on the instance");
  // inputs are copied, not shared: freezing the map does not freeze (or alias) what the caller passed in
  const beats = constBeats(120, 33), grid = { beats, downbeats: [0] }, settings = { gridTolerance: 0.01 }, hyp = [{ bpm: 120, role: "selected", score: null, calibrated: false }];
  const m2 = TM.fromGrid(grid, { duration: 17, meter: meter44, settings, tempoHypotheses: hyp });
  assert.equal(Object.isFrozen(beats), false); assert.equal(Object.isFrozen(settings), false); assert.equal(Object.isFrozen(hyp), false);
  beats[3] = 99; settings.gridTolerance = 5; hyp[0].bpm = 1; assert.notEqual(m2.t[3], 99); assert.equal(m2.settings.gridTolerance, 0.01); assert.equal(m2.tempoHypotheses[0].bpm, 120);
  // toJSON hands out copies
  const j = m.toJSON(); j.meter.status = "x"; j.beats[0].t = 5; assert.equal(m.meter.status, "user"); assert.equal(m.t[0], 0);
});

test("fingerprint covers everything a derived result depends on, including settings, statuses and sources", () => {
  const b = constBeats(120, 33), mk = (extra = {}) => TM.fromGrid({ beats: b, downbeats: downs(b, 4, 0) }, Object.assign({ duration: 17, meter: meter44 }, extra));
  const base = mk().fingerprint(); assert.match(base, /^tm1-[0-9a-f]{16}$/); assert.equal(mk().fingerprint(), base, "deterministic");
  assert.notEqual(mk({ settings: { gridTolerance: 0.05 } }).fingerprint(), base, "a setting that changes eligibility changes the fingerprint");
  assert.notEqual(mk({ settings: { constantTolerance: 0.1 } }).fingerprint(), base);
  assert.notEqual(mk({ source: "restored" }).fingerprint(), base, "source");
  assert.notEqual(mk({ duration: 18 }).fingerprint(), base, "duration");
  const m = mk(); assert.notEqual(m.confirmMeter().fingerprint(), base, "confirming the meter (a status change) changes it");
  assert.notEqual(m.confirmDownbeat().fingerprint(), base, "confirming the downbeat changes it");
  assert.notEqual(m.withMeter({ beatsPerBar: 4, numerator: 4, denominator: 4 }).fingerprint(), m.withMeter(4).fingerprint(), "a stated denominator changes it");
  assert.equal(m.withMeter(4, { at: "A" }).fingerprint(), m.withMeter(4, { at: "B" }).fingerprint(), "correction timestamps do not");
  assert.notEqual(TM.fromConstantGrid({ bpm: 120, firstDownbeat: 0, duration: 17 }).fingerprint(), base, "fallback grids differ from tracked ones");
});

test("forAnalysis: a result with no tracked grid gets a labelled fallback that reproduces the legacy firstDown + bar * barSec exactly", () => {
  const a = { duration: 228, bpm: 127, barSec: 1.89, firstDown: -0.1, nBars: 120 }, G = TM.forAnalysis(a);
  assert.equal(G.kind, "fallback-grid"); assert.equal(G.reason, "no-tracked-grid"); assert.equal(G.tracked, false); assert.match(G.label, /constant tempo/); assert.equal(G.barOffset, 0);
  for (let b = 0; b <= 125; b++) near(G.barStart(b), -0.1 + b * 1.89, 1e-9, "bar " + b);
  assert.equal(G.barOf(-0.1 + 7 * 1.89 + 0.5), 7); assert.equal(G.barOf(0.5), 0);
  const bt = G.beats(10, 14); bt.forEach((x, i) => near(x.t, -0.1 + Math.round((x.t + 0.1) / (1.89 / 4)) * (1.89 / 4), 1e-9)); assert.ok(bt.length >= 8 && bt.length <= 10);
  assert.equal(bt.filter(x => x.downbeat).length, 2); assert.ok(bt.every(x => x.beat >= 1 && x.beat <= 4)); assert.equal(G.isExtrapolated(50), true, "a fallback grid is never 'tracked'");
});

test("forAnalysis: tracked beats are used, in the analysis's own bar numbering, and follow drift", () => {
  const b = []; let t = 0.3; for (let k = 0; k < 120; k++) { b.push(t); t += 60 / (120 - 12 * k / 119); } // 120 -> 108 BPM
  const fd = b[8], a = { duration: b[119] + 1, bpm: 114, barSec: 240 / 114, firstDown: fd, nBars: 30, grid: { beats: b, downbeats: downs(b, 4, 0) } }, G = TM.forAnalysis(a);
  assert.equal(G.kind, "tracked"); assert.equal(G.reason, null); assert.equal(G.tracked, true); assert.match(G.label, /tracked beats/);
  near(G.barStart(0), fd, 1e-9); near(G.barStart(1), b[12], 1e-9); near(G.barStart(10), b[48], 1e-9, "bar 10 sits on its tracked downbeat");
  assert.ok(Math.abs(G.barStart(15) - (fd + 15 * a.barSec)) > 0.4, "a constant grid at the average tempo is about 0.6 s off by bar 15");
  assert.equal(G.barOf(b[48] + 0.1), 10); assert.equal(G.barOf(fd - 0.1), -1);
  const bt = G.beats(b[8], b[16]); assert.deepEqual(bt.map(x => x.downbeat), [true, false, false, false, true, false, false, false]); near(bt[1].t, b[9], 1e-9); assert.equal(bt[4].bar, 1);
  assert.equal(G.isExtrapolated(b[40]), false); assert.equal(G.isExtrapolated(b[119] + 3), true);
});

test("forAnalysis: a corrected BPM, a short grid or a phase disagreement fall back, labelled; it never throws", () => {
  const b = constBeats(120, 80), base = { duration: 40, bpm: 120, barSec: 2, firstDown: 0, grid: { beats: b, downbeats: downs(b, 4, 0) } };
  assert.equal(TM.forAnalysis(base).kind, "tracked");
  const fixed = TM.forAnalysis(Object.assign({}, base, { bpm: 60, barSec: 4, bpmConf: 99 })); assert.equal(fixed.kind, "fallback-grid"); assert.equal(fixed.reason, "bpm-corrected-by-user"); near(fixed.barStart(3), 12, 1e-9, "uses the corrected tempo, not the stale tracked grid");
  assert.equal(TM.forAnalysis(Object.assign({}, base, { grid: { beats: b.slice(0, 10), downbeats: [0] } })).reason, "tracked-grid-too-short");
  assert.equal(TM.forAnalysis(Object.assign({}, base, { grid: { beats: b, downbeats: [] } })).reason, "tracked-grid-too-short");
  assert.equal(TM.forAnalysis(Object.assign({}, base, { firstDown: 0.5 })).reason, "first-downbeat-disagrees-with-tracked-grid", "engine and tracker disagree by a beat");
  for (const bad of [{ beats: ["x", 1, 2], downbeats: [0] }, { beats: b.concat([0]), downbeats: [0] }, { beats: [], downbeats: [] }, "nonsense"]) { const g = TM.forAnalysis(Object.assign({}, base, { grid: bad })); assert.equal(g.kind, "fallback-grid"); assert.ok(g.reason); }
});

test("forAnalysis: a first beat a few ms before the start point is not lost (slack), and callers can see which it was", () => {
  const b = constBeats(120, 80, -0.01), G = TM.forAnalysis({ duration: 40, bpm: 120, barSec: 2, firstDown: -0.01, grid: { beats: b, downbeats: downs(b, 4, 0) } });
  const bt = G.beats(0, 2); near(bt[0].t, -0.01, 1e-12); assert.equal(bt[0].downbeat, true); assert.equal(G.beats(0, 2, 0)[0].t > 0, true, "slack 0 restores the strict window");
});

console.log(`timemap tests passed (${n})`);
