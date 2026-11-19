#!/usr/bin/env node
/* The chord scorer used by the research scripts (bench/amt/chord-scoring.js), on synthetic annotations whose answers are known by
 * construction: perfect readings score 100%, a wrong quality still gets root credit, a shifted reading is judged by the tolerance, a
 * reading is not penalised for a region that starts where an annotated range opens, a long track is scored to its end, and
 * steps the annotation marks uncertain or without a third are left out of the quality columns. */
"use strict";
const { parse, prepare, score } = require("../bench/amt/chord-scoring");
let pass = 0, fail = 0; const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL: " + msg); } };
const bpm = 120, bar = 2, ann = (ranges, segments) => ({ bar1Sec: 0, bpm, ranges, segments });
const seg = (bar, beat, root, triad, seventh, extra = {}) => ({ at: [bar, beat], root, triad, seventh, ...extra });
const reg = (t0, t1, c) => ({ t0, t1, c });
const near = (x, y) => Math.abs(x - y) < 1e-9;

// two ranges: bars 1-3 (C | Am | G7 split at beat 3) and bars 5-6 (Fmaj7 | Dm7)
const A = ann([[1, 1, 4, 1], [5, 1, 7, 1]], [seg(1, 1, "C", "maj", "none"), seg(2, 1, "A", "min", "none"), seg(3, 1, "G", "maj", "min7"), seg(3, 3, "D", "min", "min7"), seg(5, 1, "F", "maj", "maj7"), seg(6, 1, "D", "min", "min7")]);
const P = prepare(A), perfect = [reg(0, 2, "C"), reg(2, 4, "Am"), reg(4, 5, "G7"), reg(5, 6, "Dm7"), reg(8, 10, "Fmaj7"), reg(10, 12, "Dm7")];
let s = score(P, perfect);
check(P.steps.length === 40 && s.n === 40, `steps: 3 + 2 bars of 8 eighths... = 40 (${P.steps.length})`);
check(near(s.root, 1) && near(s.tri, 1) && near(s.sev, 1), `a perfect reading scores 100% on root, triad and seventh (${s.root}, ${s.tri}, ${s.sev})`);
check(s.nRef === 4 && s.nEst === 4 && near(s.F, 1), `its 4 changes (the 2 range starts excluded) are all found, none extra (${s.nRef} ref, ${s.nEst} est, F ${s.F})`);

// wrong quality keeps root credit; wrong root gets none
s = score(P, perfect.map(r => r.c === "Am" ? reg(r.t0, r.t1, "A") : r));
check(s.root === 1 && Math.abs(s.tri - 32 / 40) < 1e-9, `"A" for "Am": root credit, no triad credit (root ${s.root}, triad ${s.tri.toFixed(2)})`);
s = score(P, perfect.map(r => r.c === "G7" ? reg(r.t0, r.t1, "G") : r));
check(s.root === 1 && s.tri === 1 && s.sev < 1, `"G" for "G7": root and triad right, seventh wrong (seventh ${s.sev.toFixed(2)})`);
s = score(P, perfect.map(r => reg(r.t0, r.t1, "F#")));
check(s.root < 0.2 && s.tri === 0 && s.sev === 0, `an unrelated chord everywhere scores about nothing (root ${s.root.toFixed(2)})`);
s = score(P, []);
check(s.root === 0 && s.F === 0 && s.nEst === 0, "no reading scores zero without error");

// change timing: within the 150 ms tolerance counts, outside does not
const shift = d => perfect.map((r, i) => i === 0 ? reg(r.t0, r.t1 + d, r.c) : i === 1 ? reg(r.t0 + d, r.t1 + (perfect[2] ? d : 0), r.c) : reg(r.t0 + d, r.t1 + d, r.c));
check(near(score(P, shift(0.1)).F, 1), "changes 100 ms late still match (tolerance 150 ms)");
check(score(P, shift(0.3)).F === 0, "changes 300 ms late do not");

// a boundary exactly where the second range opens (t = 8 s) is not an extra change
s = score(P, [...perfect.slice(0, 4), reg(8, 10, "Fmaj7"), reg(10, 12, "Dm7")]);
check(s.nEst === 4, `the region that starts where range 2 opens is not counted as a change (${s.nEst})`);
s = score(P, [...perfect.slice(0, 4), reg(8, 9, "Fmaj7"), reg(9, 10, "F6"), reg(10, 12, "Dm7")]);
check(s.nEst === 5 && s.P < 1, "but a real extra change inside the range is a false positive");

// a long track is scored to its end (no bar cap)
const L = ann([[1, 1, 61, 1]], Array.from({ length: 60 }, (_, i) => seg(i + 1, 1, i % 2 ? "G" : "C", "maj", "none")));
const PL = prepare(L), sl = score(PL, Array.from({ length: 60 }, (_, i) => reg(i * bar, (i + 1) * bar, i % 2 ? "G" : "C")));
check(PL.steps.length === 480 && near(sl.root, 1) && sl.nRef === 59, `a 60-bar track has all 480 steps scored (${PL.steps.length}) and 59 changes (${sl.nRef})`);
const slHalf = score(PL, Array.from({ length: 60 }, (_, i) => reg(i * bar, (i + 1) * bar, i < 50 ? (i % 2 ? "G" : "C") : "F#")));
check(near(slHalf.root, 50 / 60), `errors after bar 45 are counted (root ${slHalf.root.toFixed(3)} for 10 wrong bars of 60)`);

// quality is not scored where the annotation has no third or marks it uncertain
const U = ann([[1, 1, 3, 1]], [seg(1, 1, "C", null, "none"), seg(2, 1, "G", "maj", "none", { qualityUncertain: true })]);
const su = score(prepare(U), [reg(0, 2, "Cm"), reg(2, 4, "Gm")]);
check(su.nq === 0 && su.root === 1 && su.tri === 0, `no third / uncertain: root scored, quality skipped (nq ${su.nq})`);

// names
check(JSON.stringify([parse("F#dim7"), parse("D#maj7"), parse("Cm7b5"), parse("Gsus4"), parse("A#m"), parse("N")]) === JSON.stringify([{ root: "F#", triad: "dim", seventh: "dim7" }, { root: "D#", triad: "maj", seventh: "maj7" }, { root: "C", triad: "dim", seventh: "min7" }, { root: "G", triad: "sus", seventh: "none" }, { root: "A#", triad: "min", seventh: "none" }, null]), "chord names parse to root, triad class and seventh");
console.log(`amt chord scoring tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
