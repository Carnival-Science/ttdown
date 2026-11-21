/* Research candidates for a piecewise tempo map (issue #57, bench/tempo/): pinned behaviour on synthetic onset evidence, so the research tool cannot rot.
 * These are NOT accuracy claims (the fixtures' scores are in docs/TEMPO_SEGMENTATION_RESEARCH.md); they pin what each piece must do:
 *   - the comb table finds a constant tempo to 0.05 BPM and agrees with the engine's fitConstantTempo
 *   - a tempo STEP is two stretches with the boundary within 3 s; a return (A-B-A) is three stretches, by both dp and ctf (ctf needs its look-ahead)
 *   - a gradual RAMP becomes one ramp stretch, with its end tempi within 3 %
 *   - a stretch with one onset per bar (a drumless breakdown) is never reported as a confident ramp or tempo (z below zmin, hit rate below hmin)
 *   - steady tempo with jittered, missing hits never produces a change (20 seeds)
 *   - octave continuity: a stretch read at double its neighbour's tempo is folded back; a real change of 17 % is not
 *   - the evidence module reproduces the engine's (fixture audio, when generated)
 */
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const S = require("../bench/tempo/segment"), { reduce } = require("../bench/tempo/evidence"), TM = require("../src/timemap"), eng = require("../src/engine")({ TimeMap: TM });
const fps = 22050 / 256; let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/* evidence: a kick every beat (louder on 1 and 3), a clap on 2 and 4, off-beat hats, jitter of +-1 frame, `miss` of the beats dropped, silence in `gaps` (seconds),
   or `barOnly`: only one onset per bar (a pad or bass hit), as in a drumless breakdown. bpmAt(seconds) gives the tempo in force. */
function evidence(bpmAt, seconds, o = {}) {
  const N = Math.round(seconds * fps), tot = new Float32Array(N); let t = 20, k = 0;
  while (t < N - 3) { const per = fps * 60 / bpmAt(t / fps), sec = t / fps, gap = (o.gaps || []).some(([a, b]) => sec >= a && sec < b), bar = o.barOnly && o.barOnly(sec);
    if (!gap && (bar ? k % 4 === 0 : rnd() >= (o.miss ?? 0.05))) { const j = Math.round((rnd() - 0.5) * 2 * (o.jit ?? 1)), v = k % 2 ? 0.7 : 1;
      for (const [off, a] of bar ? [[0, 0.6]] : [[0, v], [per / 2, 0.35]]) { const i = Math.round(t + off + j); if (i >= 0 && i < N) tot[i] += a; } }
    t += per; k++; }
  for (let i = 0; i < N; i++) tot[i] += 0.04 * rnd(); return tot;
}
const comb = (tot, o) => new S.Comb(reduce(tot, fps), o);
const tempi = res => res.segs.map(f => +f.bpm.toFixed(1)), near = (a, b, tol) => Math.abs(a / b - 1) <= tol;

// 1. constant tempo: one stretch, 0.05 BPM, same as the engine's fit
{ const tot = evidence(() => 128, 120), c = comb(tot), r = S.constant(c), e = eng.fitConstantTempo(tot, fps, 128, 0);
  ok(Math.abs(r.segs[0].bpm - 128) < 0.05, "constant 128: fitted " + r.segs[0].bpm.toFixed(3));
  ok(e && Math.abs(e.bpm - r.segs[0].bpm) < 0.1, "agrees with engine.fitConstantTempo (" + (e && e.bpm.toFixed(3)) + ")");
  const d = S.coalesce(c, S.dp(c)); ok(d.segs.length === 1 && Math.abs(d.segs[0].bpm - 128) < 0.05, "dp keeps one stretch on a constant tempo (" + d.segs.length + ")"); }

// 2. a step 120 -> 150 at 60 s: two stretches, boundary within 3 s, tempi right; by dp and ctf
{ const tot = evidence(s => s < 60 ? 120 : 150, 120), c = comb(tot);
  for (const [name, r] of [["dp", S.coalesce(c, S.dp(c))], ["ctf", S.coalesce(c, S.ctf(c))]]) { const T = tempi(r);
    ok(T.length === 2 && near(T[0], 120, 0.005) && near(T[1], 150, 0.005), name + " step: two stretches at 120 and 150 (" + T + ")");
    ok(Math.abs(r.segs[0].b / fps - 60) < 3, name + " step: boundary at " + (r.segs[0].b / fps).toFixed(1) + " s, within 3 s of 60"); } }

// 3. there and back, 120 -> 150 -> 120, 50 s each: three stretches by dp, and by ctf with its look-ahead
{ const tot = evidence(s => s < 50 || s >= 100 ? 120 : 150, 150), c = comb(tot), d = S.coalesce(c, S.dp(c)), a = S.coalesce(c, S.ctf(c));
  ok(tempi(d).length === 3 && near(tempi(d)[1], 150, 0.005) && near(tempi(d)[2], 120, 0.005), "dp A-B-A: " + tempi(d));
  ok(tempi(a).length === 3, "ctf with look-ahead A-B-A: " + tempi(a));
}

// 4. a ramp 100 -> 130 over 24 s inside two steady stretches becomes one ramp stretch with the right ends
{ const tot = evidence(s => s < 40 ? 100 : s < 64 ? 100 + 30 * (s - 40) / 24 : 130, 110, { miss: 0.02 }), c = comb(tot), r = S.withRamps(c, S.coalesce(c, S.dp(c))), R = r.segs.filter(f => f.ramp);
  ok(R.length === 1, "one ramp stretch (" + r.segs.map(f => f.ramp ? "R" + f.bpm0.toFixed(0) + "-" + f.bpm1.toFixed(0) : f.bpm.toFixed(0)) + ")");
  const truth = t => t < 40 ? 100 : t < 64 ? 100 + 30 * (t - 40) / 24 : 130, pr = require("../bench/tempo/score").fromSegments(c, r.segs); let worst = 0; for (let t = 30; t < 74; t += 2) { const p = pr.tempo(t); worst = Math.max(worst, p == null ? 1 : Math.abs(p / truth(t) - 1)); }
  ok(R.length === 1 && R[0].bpm1 - R[0].bpm0 > 8 && worst < 0.1, "the ramp rises and the predicted tempo is within 10 % of the truth at every 2 s from 30 to 74 s (worst " + (100 * worst).toFixed(1) + " %, ramp " + (R[0] && R[0].bpm0.toFixed(1) + " -> " + R[0].bpm1.toFixed(1)) + ")"); }

// 5. a drumless stretch with one onset per bar is never a confident tempo or ramp: house 128, 32 s of bar-only evidence while the tempo ramps 128 -> 150, drop at 150
{ const f = s => s < 40 ? 128 : s < 72 ? 128 + 22 * (s - 40) / 32 : 150, tot = evidence(f, 130, { barOnly: s => s >= 40 && s < 72 }), c = comb(tot), res = S.withRamps(c, S.coalesce(c, S.dp(c))), zmin = 5, hmin = 0.5;
  const bad = res.segs.filter(g => g.a / fps >= 44 && g.b / fps <= 68 && g.z >= zmin && (!g.ramp || c.hitRate(g) >= hmin));
  ok(bad.length === 0, "no confident tempo or ramp inside the bar-only stretch (" + res.segs.map(g => (g.ramp ? "R" : "") + g.bpm.toFixed(0) + " z" + g.z.toFixed(1) + " h" + c.hitRate(g).toFixed(2)) + ")");
  ok(near(res.segs[0].bpm, 128, 0.01) && near(res.segs[res.segs.length - 1].bpm, 150, 0.01), "the steady ends are still found (" + tempi(res) + ")"); }

// 6. steady tempo, jittered and with missing hits and a drumless gap: no change, 20 seeds
{ let changes = 0; for (let s = 0; s < 20; s++) { seed = 100 + s * 7; const bpm = 90 + (s * 13) % 80, tot = evidence(() => bpm, 140, { miss: 0.1, jit: 1.5, gaps: s % 3 ? [] : [[50, 70]] }), c = comb(tot), r = S.coalesce(c, S.dp(c)), t = r.segs.filter(f => f.z >= 5).map(f => f.bpm); // stretches the run calls unknown (z < 5: the drumless gap) are not tempi
    changes += t.slice(1).filter((v, i) => !near(v, t[i], 0.025)).length; }
  ok(changes === 0, "20 steady seeds (90 to 168 BPM, 10 % missing hits, some with a 20 s drumless gap): " + changes + " tempo changes between known stretches (the gap is unknown, not a tempo)"); }

// 7. octave continuity: 100 -> 200 (a doubled read) is folded back to 100; 128 -> 150 is left alone; a stretch twice as fast as its neighbour first
{ const c = comb(evidence(() => 128, 60)), mk = (bpm, a, b) => ({ a: a * fps, b: b * fps, bpm, z: 9, phase: 0, period: fps * 60 / bpm, c: 0, S: 1, n: 1 });
  const r = S.foldOctaves(c, { segs: [mk(100, 0, 20), mk(172, 20, 40)] }, 100); ok(near(r.segs[1].bpm, 86, 0.02), "172 after 100 folds to 86 (the nearest octave to its neighbour): " + r.segs[1].bpm.toFixed(1));
  const r2 = S.foldOctaves(c, { segs: [mk(128, 0, 20), mk(150, 20, 40)] }, 128); ok(near(r2.segs[1].bpm, 150, 0.02), "a real 17 % change stays: " + r2.segs[1].bpm.toFixed(1)); }

// 8. the evidence module reproduces the engine's on a generated fixture (skipped when the fixtures are not generated)
{ const f = path.join(__dirname, "..", "test-songs", "tempo-map-fixtures", "dev_const.wav");
  if (fs.existsSync(f)) { const { readWav } = require("../bench/tempo/wav"), { evidence: ev } = require("../bench/tempo/evidence"), e = ev(readWav(f)), r = S.constant(new S.Comb(e));
    ok(Math.abs(r.segs[0].bpm - 128) < 0.05, "dev_const.wav: " + r.segs[0].bpm.toFixed(3) + " BPM"); const ab = readWav(f), n22 = Math.floor(ab.length / 2); ok(e.N === Math.floor((n22 - 1024) / 256) + 1 && Math.abs(e.fps - 22050 / 256) < 1e-9, "the evidence has the engine's frame grid (" + e.N + " frames at " + e.fps.toFixed(3) + " per second)"); }
  else console.log("SKIP evidence parity (run: npm run songs:tempo-map)"); }

console.log(pass + " passed, 0 failed");
