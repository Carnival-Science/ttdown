#!/usr/bin/env node
/* Consistency of chord labels derived from different inputs, on a paired render (research for #26). There is NO chord ground truth here:
 * the reference sequence is what bench/amt/symbolic-chords.js reads from the ORIGINAL MIDI, which tests how much transcription
 * error changes the harmonic reading, not whether the reading is right.
 *
 *   node bench/amt/compare-chords.js --ref ref.mid --offset SEC --bar1 SEC --bpm N --engine-audio "audio.mp3" [--est a.mid --est b.mid]
 *
 * Inputs: the original MIDI (reference), each --est MIDI (in audio time), and Teardown's own audio-based chord regions (chordRegions)
 * from the engine on the audio. Compared at every 8th note of bars 1.. where the original has notes: same ROOT, same TRIAD CLASS (root +
 * maj / min / dim / aug / sus, sevenths reduced to their triad), and regions per bar (overall and in the --arp A,B bars). */
"use strict";
const fs = require("node:fs"), path = require("node:path"), { execFileSync } = require("node:child_process"), os = require("node:os");
const { decodeMidi, tickToSec } = require("../../tests/lib/smf"), { analyse, NAMES } = require("./symbolic-chords");
const a = process.argv.slice(2), opt = (n, all) => { const r = []; a.forEach((x, i) => { if (x === n) r.push(a[i + 1]); }); return all ? r : r[0]; };
const OFF = +opt("--offset"), bar1 = +opt("--bar1"), bpm = +opt("--bpm"), bar = 240 / bpm, [A0, A1] = (opt("--arp") || "18,25").split(",").map(Number);
const load = (f, off = 0) => { const d = decodeMidi(fs.readFileSync(f)); return d.notes.map(x => ({ on: tickToSec(d, x.onTick) + off, off: tickToSec(d, x.offTick) + off, midi: x.pitch })); };
const refNotes = load(opt("--ref"), OFF), nBars = Math.ceil((Math.max(...refNotes.map(x => x.off)) - bar1) / bar), steps = []; for (let k = -8; k < nBars * 8; k++) steps.push(k);
const triadOf = c => { if (!c || c === "N") return "N"; const m = c.match(/^([A-G]#?)(.*)$/), q = m[2]; const cls = /^(dim|m7b5)/.test(q) ? "dim" : /^aug/.test(q) ? "aug" : /^sus/.test(q) ? "sus" : /^m(?!aj)/.test(q) ? "m" : "M"; return m[1] + ":" + cls; };
const rootOf = c => !c || c === "N" ? "N" : c.match(/^([A-G]#?)/)[1];
const labelsOf = regions => steps.map(k => { const t = bar1 + (k + 0.5) * bar / 8, r = regions.find(x => t >= x.t0 && t < x.t1); return r ? r.c : "N"; });
const sets = { "original MIDI (reference)": analyse(refNotes, { bar1, bpm, steps }).regions };
for (const f of opt("--est", true)) sets[path.basename(f)] = analyse(load(f), { bar1, bpm, steps }).regions;
if (opt("--engine-audio")) {
  const TM = require("../../src/timemap"), eng = require("../../src/engine")({ TimeMap: TM }), tmp = path.join(os.tmpdir(), "cc.wav");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", opt("--engine-audio"), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", tmp]);
  const b = fs.readFileSync(tmp); let p = 12, fmt, data; while (p < b.length) { const id = b.toString("latin1", p, p + 4), n = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12) }; if (id === "data") data = b.subarray(p + 8, p + 8 + n); p += 8 + n + (n & 1); }
  const N = Math.floor(data.length / 2 / fmt.ch), ch = []; for (let c = 0; c < fmt.ch; c++) { const f = new Float32Array(N); for (let i = 0; i < N; i++) f[i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768; ch.push(f); }
  eng.analyzeDecoded({ sampleRate: fmt.sr, length: N, duration: N / fmt.sr, numberOfChannels: fmt.ch, getChannelData: c => ch[c] }, () => {}, false).then(res => { sets["Teardown audio detector (chord regions)"] = res.chordRegions.regions.filter(r => r.c !== "–"); report(); });
} else report();
function report() {
  const ref = labelsOf(sets["original MIDI (reference)"]), has = steps.map(k => refNotes.some(n => n.on < bar1 + (k + 1) * bar / 8 && n.off > bar1 + k * bar / 8) && k >= 0);
  const regionsIn = (R, b0, b1) => R.filter(r => r.bar + 1 >= b0 && r.bar + 1 < b1).length / Math.max(1, b1 - b0);
  console.log(`steps with reference notes: ${has.filter(Boolean).length}; regions per bar (all bars | bars ${A0}-${A1 - 1}):`);
  for (const [name, R] of Object.entries(sets)) {
    const L = labelsOf(R); let n = 0, root = 0, tri = 0, nArp = 0, rootArp = 0, triArp = 0;
    steps.forEach((k, i) => { if (!has[i]) return; n++; const r1 = rootOf(L[i]) === rootOf(ref[i]), t1 = triadOf(L[i]) === triadOf(ref[i]), inArp = k >= (A0 - 1) * 8 && k < (A1 - 1) * 8; if (r1) root++; if (t1) tri++; if (inArp) { nArp++; if (r1) rootArp++; if (t1) triArp++; } });
    const pc = (x, y) => (100 * x / y).toFixed(0) + "%";
    console.log(`${name.padEnd(42)} regions/bar ${regionsIn(R, 1, nBars + 1).toFixed(1)} | ${regionsIn(R, A0, A1).toFixed(1)}   same root ${pc(root, n)} (arp bars ${pc(rootArp, nArp)})   same triad ${pc(tri, n)} (arp bars ${pc(triArp, nArp)})`);
  }
}
