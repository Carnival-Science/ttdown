/* The detected key as a PRIOR on pitch (engine.transcribeTrack's `prior`): an out-of-key pitch keeps 0.8 of its salience.
 *   - two near-equal candidates (F# 66 and G 67, amplitudes 1.0 and 0.9) in C major: the in-key G is chosen; without a prior the stronger F# is
 *   - clearly stronger chromatic evidence (F# 1.0 against G 0.5) keeps F#: the prior never overrides what is heard
 *   - a repeated chromatic note alone (B-flat 70) is kept
 *   - a wrong key does not erase a strong in-key-of-the-music note, and the result records the key it used
 */
"use strict";
const TM = require("../src/timemap"), eng = require("../src/engine")({ TimeMap: TM });
let pass = 0, fail = 0; const check = (ok, msg) => { if (ok) pass++; else { fail++; console.error("FAIL: " + msg); } };
const SR = 22050, dur = 34, x = (amps) => { const o = new Float32Array(Math.round(SR * dur)); for (const [m, a] of amps) { const f = 440 * Math.pow(2, (m - 69) / 12); for (let i = 0; i < o.length; i++) o[i] += a * 0.2 * (Math.sin(2 * Math.PI * f * i / SR) + 0.5 * Math.sin(4 * Math.PI * f * i / SR)); } return o; };
const grid = TM.forAnalysis({ duration: dur, bpm: 120, barSec: 2, firstDown: 0 }), major = r => new Set([0, 2, 4, 5, 7, 9, 11].map(d => (d + r) % 12));
const run = (amps, prior) => eng.transcribeTrack(x(amps), SR, grid, 0, 2, 16, dur, [], 0, prior), cMaj = { out: 0.8, key: "C major", scale: major(0) };
const lead = (t) => t && t.lead.length ? t.lead[0].midi : null;
check(lead(run([[66, 1], [67, 0.9]])) === 66, "no prior: the stronger F# wins (" + lead(run([[66, 1], [67, 0.9]])) + ")");
const t = run([[66, 1], [67, 0.9]], cMaj); check(lead(t) === 67, "C major prior: near-equal F# and G go to G (" + lead(t) + ")"); check(t.keyPrior && t.keyPrior.key === "C major" && t.keyPrior.out === 0.8, "the transcription records the key prior it used");
check(lead(run([[66, 1], [67, 0.5]], cMaj)) === 66, "C major prior: clearly stronger F# stays F# (" + lead(run([[66, 1], [67, 0.5]], cMaj)) + ")");
check(lead(run([[70, 1]], cMaj)) === 70, "C major prior: a lone repeated B-flat is kept");
check(lead(run([[67, 1], [66, 0.6]], { out: 0.8, key: "F# major", scale: major(6) })) === 67, "a wrong key (F# major): a clearly stronger G still wins over a weak in-key F#");
check(run([[66, 1]]).keyPrior === undefined, "no prior given: no keyPrior field (transcribeTrack called as before behaves as before)");
console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
