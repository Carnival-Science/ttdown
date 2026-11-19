#!/usr/bin/env node
/* Note-level comparison of transcribed MIDI files against a reference MIDI, for research runs (not a gate, not in CI).
 *
 *   node bench/amt/score-notes.js --ref ref.mid --offset SECONDS [--bar1 SEC --bpm N --split 18,25] est1.mid [est2.mid ...]
 *
 * --offset = audio time minus reference-MIDI time (bench/paired-renders.js prints it as alignment.offsetSec); the estimates are read
 * as AUDIO time (Basic Pitch writes audio time). Matching is one-to-one, EXACT pitch, onset within 50 ms (closest pairs first), the
 * same as bench/paired-renders.js. "+offset" additionally needs the end within max(50 ms, 20% of the reference duration) (the
 * mir_eval convention). The shift column is the best constant shift within +-80 ms, reported only to show systematic latency.
 * With --bar1 (audio time of bar 1), --bpm (4/4) and --split a,b (1-based bars) it also reports recall/precision per region:
 * pickup, bars 1..a-1, a..b-1, b..end. The comparison is MIDI-vs-MIDI: the reference is the file that was rendered to audio. */
"use strict";
const fs = require("node:fs"), path = require("node:path");
const { decodeMidi, tickToSec } = require("../../tests/lib/smf");
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flags = new Set(["--ref", "--offset", "--bar1", "--bpm", "--split"]), files = args.filter((a, i) => !a.startsWith("--") && !flags.has(args[i - 1]));
if (!opt("--ref") || opt("--offset") == null || !files.length) { console.error("usage: node bench/amt/score-notes.js --ref ref.mid --offset SEC [--bar1 SEC --bpm N --split A,B] est.mid ..."); process.exit(2); }
const load = f => { const d = decodeMidi(fs.readFileSync(f)); return d.notes.map(n => ({ on: tickToSec(d, n.onTick), off: tickToSec(d, n.offTick), midi: n.pitch })); };
function match(ref, est, tol = 0.05, dur = false) {
  const pairs = []; ref.forEach((r, i) => est.forEach((e, j) => { const d = Math.abs(e.on - r.on); if (e.midi !== r.midi || d > tol) return; if (dur && Math.abs(e.off - r.off) > Math.max(0.05, 0.2 * (r.off - r.on))) return; pairs.push([d, i, j]); }));
  pairs.sort((p, q) => p[0] - q[0]); const ur = new Set(), ue = new Set(); for (const [, i, j] of pairs) if (!ur.has(i) && !ue.has(j)) { ur.add(i); ue.add(j); } return { n: ur.size, ur, ue };
}
const f1 = (n, nr, ne) => { const p = ne ? n / ne : 0, r = nr ? n / nr : 0; return { P: +(100 * p).toFixed(1), R: +(100 * r).toFixed(1), F: +(100 * (p + r ? 2 * p * r / (p + r) : 0)).toFixed(1) }; };
const OFF = +opt("--offset"), ref = load(opt("--ref")).map(n => ({ ...n, on: n.on + OFF, off: n.off + OFF }));
console.log(`reference ${path.basename(opt("--ref"))}: ${ref.length} notes, offset ${OFF} s`);
for (const f of files) {
  const est = load(f), m = match(ref, est), md = match(ref, est, 0.05, true); let best = { n: -1, o: 0 };
  for (let o = -0.08; o <= 0.0801; o += 0.002) { const k = match(ref, est.map(e => ({ ...e, on: e.on + o }))).n; if (k > best.n) best = { n: k, o }; }
  const a = f1(m.n, ref.length, est.length), b = f1(md.n, ref.length, est.length);
  console.log(`${path.basename(f)}: ${est.length} notes | onset P ${a.P} R ${a.R} F ${a.F} | +offset P ${b.P} R ${b.R} F ${b.F} | best shift ${Math.round(best.o * 1000)} ms F ${f1(best.n, ref.length, est.length).F}`);
  if (opt("--bar1") && opt("--bpm") && opt("--split")) {
    const bar = 240 / +opt("--bpm"), b1 = +opt("--bar1"), [s1, s2] = opt("--split").split(",").map(Number), at = k => b1 + (k - 1) * bar;
    const R = { "pickup": [-1e9, b1 - 0.02], [`bars 1-${s1 - 1}`]: [b1 - 0.02, at(s1)], [`bars ${s1}-${s2 - 1}`]: [at(s1), at(s2)], [`bars ${s2}-end`]: [at(s2), 1e9] };
    console.log("  " + Object.entries(R).map(([k, [x, y]]) => { const rr = ref.map((r, i) => [r, i]).filter(([r]) => r.on >= x && r.on < y), ee = est.map((e, j) => [e, j]).filter(([e]) => e.on >= x && e.on < y);
      return `${k}: R ${rr.length ? Math.round(100 * rr.filter(([, i]) => m.ur.has(i)).length / rr.length) : "-"}% P ${ee.length ? Math.round(100 * ee.filter(([, j]) => m.ue.has(j)).length / ee.length) : "-"}%`; }).join(" | "));
  }
}
