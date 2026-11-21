#!/usr/bin/env node
"use strict";
/* Run the tempo candidates on a recording that has no answer file (a local copy of real music; the audio is never committed).
 *   node bench/tempo/real.js <audio file> [--cands dp,ctf,tempogram,const] [--engine-beats beats.json]
 * Decodes with ffmpeg (mono, 44.1 kHz), prints each candidate's stretches (time range, BPM or ramp, z, beat-hit rate, unknown) and its latency. There is no
 * score: the verdict on real music is by ear / DAW annotation, and the output here is only a set of hypotheses to check. */
const cp = require("node:child_process"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { readWav } = require("./wav"), { evidence } = require("./evidence"), S = require("./segment");
const args = process.argv.slice(2), file = args.find(a => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--")); if (!file || !fs.existsSync(file)) { console.error("usage: node bench/tempo/real.js <audio file>"); process.exit(2); }
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; }, cands = opt("--cands", "dp,ctf,tempogram,const").split(",");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-real-")), wav = path.join(tmp, "a.wav");
cp.execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", wav]);
const ab = readWav(wav); fs.rmSync(tmp, { recursive: true, force: true });
const P = { lambda: +opt("--lambda", 12), gamma: +opt("--gamma", 0.35), minSec: +opt("--min", 8), kappa: 0.6, stepSec: 2, windowSec: 12, zmin: 5, hmin: 0.5 };
const t0 = Date.now(), ev = evidence(ab), comb = new S.Comb(ev, { gamma: P.gamma }), tEv = Date.now() - t0;
console.log(`duration ${ab.duration.toFixed(1)} s, evidence + table ${tEv} ms`);
for (const name of cands) { const t1 = Date.now(), res = name === "const" ? S.constant(comb) : name === "dp" ? S.dp(comb, P) : name === "ctf" ? S.ctf(comb, P) : S.tempogram(comb, P);
  if (name !== "const") { Object.assign(res, S.coalesce(comb, res)); Object.assign(res, S.withRamps(comb, res, P)); }
  console.log(`\n${name} (${Date.now() - t1 + tEv} ms)`);
  for (const f of res.segs) { const hit = comb.hitRate(f), unk = f.z < P.zmin; console.log(`  ${(f.a / comb.fps).toFixed(1).padStart(6)}-${(f.b / comb.fps).toFixed(1).padStart(6)} s  ${f.ramp ? `ramp ${f.bpm0.toFixed(1)} -> ${f.bpm1.toFixed(1)}` : f.bpm.toFixed(2)} BPM  z ${f.z.toFixed(1)}  hit ${hit.toFixed(2)}${unk ? "  UNKNOWN (z < " + P.zmin + ")" : ""}`); } }
