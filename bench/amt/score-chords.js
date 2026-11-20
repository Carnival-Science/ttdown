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
const ann = JSON.parse(fs.readFileSync(opt("--annotation"), "utf8")), bar1 = ann.bar1Sec, bpm = ann.bpm, bar = 240 / bpm, OFF = +opt("--offset");
const { prepare, score: scoreWith } = require("./chord-scoring"), P = prepare(ann, opt("--only-range") != null ? +opt("--only-range") : undefined), score = R => scoreWith(P, R), steps = P.steps, segs = P.segs;
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
