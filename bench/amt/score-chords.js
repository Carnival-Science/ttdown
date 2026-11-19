#!/usr/bin/env node
/* Score chord readings against a hand-checked annotation (research for #26; the annotation lives OUTSIDE the repo, it is someone's music).
 *
 *   node bench/amt/score-chords.js --annotation ann.json --ref-midi ref.mid --offset SEC --engine-audio audio.mp3 [--est a.mid ...]
 *
 * Readings scored: the symbolic reader (bench/amt/symbolic-chords.js) on the original MIDI and on each --est MIDI (audio time), and the
 * engine's own audio-based chordRegions. Scored at every 8th note whose middle lies in an annotated range, cumulatively:
 *   root           the root matches
 *   root + triad   ... and the triad class (maj/min/dim/aug/sus) matches
 *   + seventh      ... and the seventh (none/min7/maj7/dim7) matches; a reading that says "no seventh" where the annotation has one is wrong
 * Quality columns skip steps the annotation marks qualityUncertain or gives no third (triad null). Bass, extensions and alternatives are in
 * the annotation but not scored here. Region boundaries: a reading's chord changes against the annotation's, within +-150 ms (F1). The
 * audio detector only has major/minor triads, so its triad and seventh columns are limited by vocabulary, not only by errors. */
"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), { execFileSync } = require("node:child_process");
const { decodeMidi, tickToSec } = require("../../tests/lib/smf"), { analyse, P: SP } = require("./symbolic-chords");
const a = process.argv.slice(2), opt = (n, all) => { const r = []; a.forEach((x, i) => { if (x === n) r.push(a[i + 1]); }); return all ? r : r[0]; };
opt("--param", true).forEach(kv => { const [k, v] = kv.split("="); if (!(k in SP)) throw new Error("unknown symbolic parameter " + k); SP[k] = +v; }); // research sweeps: e.g. --param change=0.7 --param rootBass=0.6
const ann = JSON.parse(fs.readFileSync(opt("--annotation"), "utf8")), bar1 = ann.bar1Sec, bpm = ann.bpm, bar = 240 / bpm, beat = 60 / bpm, OFF = +opt("--offset");
if (opt("--only-range") != null) ann.ranges = [ann.ranges[+opt("--only-range")]]; // 0-based: score one range only (dev / held-out halves of one track)
const tAt = ([b, be]) => bar1 + (b - 1) * bar + (be - 1) * beat;
const segs0 = ann.segments.map(s => ({ ...s, t0: tAt(s.at) })), inRange = t => ann.ranges.some(([b0, be0, b1, be1]) => t >= tAt([b0, be0]) - 1e-6 && t < tAt([b1, be1]) - 1e-6), segs = segs0.filter(s => inRange(s.t0 + 1e-6)); // a segment ends where the next one starts, or at the end of its range
const rangeOf = t => ann.ranges.find(([b0, be0, b1, be1]) => t >= tAt([b0, be0]) - 1e-6 && t < tAt([b1, be1]) - 1e-6);
segs.forEach((s, i) => { const r = rangeOf(s.t0 + 1e-6), nx = segs[i + 1]; s.t1 = nx && nx.t0 < tAt([r[2], r[3]]) - 1e-6 ? nx.t0 : tAt([r[2], r[3]]); });
const parse = n => { if (!n || n === "N" || n === "–") return null; const m = n.match(/^([A-G]#?)(.*)$/); if (!m) return null; const q = m[2];
  const triad = /^(dim|m7b5)/.test(q) ? "dim" : /^aug/.test(q) ? "aug" : /^sus/.test(q) ? "sus" : /^m(?!aj)/.test(q) ? "min" : "maj";
  const seventh = /^dim7/.test(q) ? "dim7" : /^maj7/.test(q) ? "maj7" : /^(m7|7|m7b5)/.test(q) ? "min7" : "none"; return { root: m[1], triad, seventh }; };
const labelAt = (R, t) => { const r = R.find(x => t >= x.t0 && t < x.t1); return r ? parse(r.c) : null; };
const steps = []; for (let k = -8; k < 8 * 45; k++) { const t = bar1 + (k + 0.5) * bar / 8, s = segs.find(x => t >= x.t0 && t < x.t1); if (s) steps.push({ t, s }); }
function score(R) {
  let n = 0, root = 0, nq = 0, tri = 0, sev = 0, byRegion = {};
  for (const { t, s } of steps) { const L = labelAt(R, t); n++; const okRoot = !!L && L.root === s.root; if (okRoot) root++;
    if (s.triad && !s.qualityUncertain) { nq++; const okT = okRoot && L.triad === s.triad; if (okT) tri++; if (okT && L.seventh === s.seventh) sev++; } }
  const ref = segs.map(s => s.t0).filter(t => { const r = rangeOf(t + 1e-6); return Math.abs(t - tAt([r[0], r[1]])) > 1e-6; }); // changes, not each range's first chord
  const est = R.slice(1).map(r => r.t0).filter(t => !!rangeOf(t)), used = new Set(); let hit = 0;
  ref.forEach(t => { const j = est.findIndex((e, k) => !used.has(k) && Math.abs(e - t) <= 0.15); if (j >= 0) { used.add(j); hit++; } });
  const P = est.length ? hit / est.length : 0, Rc = ref.length ? hit / ref.length : 0, rangeBars = ann.ranges.reduce((x, [b0, , b1]) => x + b1 - b0, 0);
  return { root: root / n, tri: tri / nq, sev: sev / nq, P, R: Rc, F: P + Rc ? 2 * P * Rc / (P + Rc) : 0, perBar: est.length / rangeBars, nEst: est.length, nRef: ref.length, n, nq };
}
const load = (f, off = 0) => { const d = decodeMidi(fs.readFileSync(f)); return d.notes.map(x => ({ on: tickToSec(d, x.onTick) + off, off: tickToSec(d, x.offTick) + off, midi: x.pitch })); };
const sym = f => { const notes = load(f, f === opt("--ref-midi") ? OFF : 0), last = Math.max(...notes.map(x => x.off)), st = []; for (let k = -8; k < Math.ceil((last - bar1) / bar) * 8; k++) st.push(k); return analyse(notes, { bar1, bpm, steps: st }).regions; };
const sets = { "symbolic reader on the original MIDI": sym(opt("--ref-midi")) }; for (const f of opt("--est", true)) sets["symbolic reader on " + path.basename(f)] = sym(f);
const out = () => { const pc = x => (100 * x).toFixed(0).padStart(3) + "%";
  console.log(`annotation: ${segs.length} segments in ${ann.ranges.length} ranges; ${steps.length} steps scored (${steps.filter(x => x.s.triad && !x.s.qualityUncertain).length} for quality); ${Object.values(sets)[0] && score(Object.values(sets)[0]).nRef} chord changes\n`);
  console.log("reading".padEnd(46) + "root  +triad +seventh | change F1 (P / R) | regions per bar");
  for (const [k, R] of Object.entries(sets)) { const s = score(R); console.log(k.padEnd(46) + `${pc(s.root)}  ${pc(s.tri)}  ${pc(s.sev)}   | ${pc(s.F)} (${pc(s.P)} / ${pc(s.R)})    | ${s.perBar.toFixed(1)}`); } };
if (opt("--engine-audio")) {
  const TM = require("../../src/timemap"), eng = require("../../src/engine")({ TimeMap: TM }), tmp = path.join(os.tmpdir(), "sc.wav");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", opt("--engine-audio"), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", tmp]);
  const b = fs.readFileSync(tmp); let p = 12, fmt, data; while (p < b.length) { const id = b.toString("latin1", p, p + 4), n = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12) }; if (id === "data") data = b.subarray(p + 8, p + 8 + n); p += 8 + n + (n & 1); }
  const N = Math.floor(data.length / 2 / fmt.ch), ch = []; for (let c = 0; c < fmt.ch; c++) { const f = new Float32Array(N); for (let i = 0; i < N; i++) f[i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768; ch.push(f); }
  eng.analyzeDecoded({ sampleRate: fmt.sr, length: N, duration: N / fmt.sr, numberOfChannels: fmt.ch, getChannelData: c => ch[c] }, () => {}, false).then(r => { sets["Teardown audio detector (chord regions)"] = r.chordRegions.regions.filter(x => x.c !== "–"); out(); });
} else out();
