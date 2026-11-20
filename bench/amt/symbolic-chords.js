#!/usr/bin/env node
/* Symbolic chord segmentation from NOTES (research prototype for #26; not used by the product, not a gate).
 *
 *   node bench/amt/symbolic-chords.js notes.mid --bar1 SEC --bpm N [--offset SEC] [--from 1 --to 8] [--print]
 *
 * Notes are read as time (SEC), bar lines are bar1 + k * 240/bpm (4/4, constant tempo), --offset is added to every note first.
 * Evidence is built at every 8th note from the notes sounding in a one-beat window around it (so an arpeggio's notes all count for
 * the one chord they outline); each note's weight is its overlap with the window times a bass bonus below C3. Candidate chords:
 * triads (maj, min, dim, aug, sus2, sus4) and sevenths (maj7, m7, 7, m7b5, dim7), plus "N" (no chord). Score = weight on chord
 * tones - 0.5 * weight on other tones + a bonus when the lowest sounding note is the root, a small cost for rare qualities; one Viterbi
 * pass with a cost per change (higher off the beat) picks the sequence; equal neighbours merge into regions {t0, t1, bar, beat, c}.
 * Chord names are written like the engine (C, Cm, ...) for triads and Cmaj7, Cm7, C7, Cm7b5, Cdim7 for the rest. */
"use strict";
const fs = require("node:fs");
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const Q = [["", [0, 4, 7], 0], ["m", [0, 3, 7], 0], ["dim", [0, 3, 6], 0.08], ["aug", [0, 4, 8], 0.12], ["sus2", [0, 2, 7], 0.1], ["sus4", [0, 5, 7], 0.1],
  ["maj7", [0, 4, 7, 11], 0.05], ["m7", [0, 3, 7, 10], 0.03], ["7", [0, 4, 7, 10], 0.04], ["m7b5", [0, 3, 6, 10], 0.1], ["dim7", [0, 3, 6, 9], 0.12]];
const CH = []; for (let r = 0; r < 12; r++) for (const [q, iv, pen] of Q) CH.push({ name: NAMES[r] + q, root: r, tones: iv.map(d => (r + d) % 12), pen, seventh: iv.length === 4 });
const P = { win: 0.5, other: 0.5, rootBass: 0.35, change: 0.9, offbeat: 0.5, nc: 0.25, minW: 0.05, bassW: 1.6 };
function analyse(notes, { bar1, bpm, steps }) {
  const bar = 240 / bpm, st = bar / 8, n = steps.length, feats = [];
  for (const k of steps) {
    const t = bar1 + k * st, lo = t - P.win * 60 / bpm, hi = t + st + P.win * 60 / bpm, w = new Array(12).fill(0); let low = null, tot = 0;
    for (const x of notes) { const o = Math.min(x.off, hi) - Math.max(x.on, lo); if (o <= 0) continue; const wt = o * (x.midi < 48 ? P.bassW : 1); w[x.midi % 12] += wt; tot += wt;
      if (x.on < t + st && x.off > t && (low === null || x.midi < low)) low = x.midi; }
    feats.push({ w, tot, low });
  }
  const K = CH.length + 1, NC = CH.length, emit = feats.map(f => { const e = new Float64Array(K); if (f.tot < P.minW) { e.fill(-2); e[NC] = 0; return e; }
    const s = f.tot; CH.forEach((c, i) => { let on = 0, off = 0; f.w.forEach((v, pc) => { if (c.tones.includes(pc)) on += v; else off += v; }); e[i] = (on - P.other * off) / s + (f.low != null && f.low % 12 === c.root ? P.rootBass : 0) - c.pen; }); e[NC] = P.nc; return e; });
  const back = Array.from({ length: n }, () => new Int16Array(K)); let prev = Float64Array.from(emit[0]);
  for (let s = 1; s < n; s++) { const off = steps[s] % 2 ? P.offbeat : 0, cost = P.change + off, cur = new Float64Array(K); let bk = 0; for (let k = 1; k < K; k++) if (prev[k] > prev[bk]) bk = k;
    for (let k = 0; k < K; k++) { const stay = prev[k], sw = prev[bk] - cost; if (stay >= sw || bk === k) { cur[k] = stay + emit[s][k]; back[s][k] = k; } else { cur[k] = sw + emit[s][k]; back[s][k] = bk; } } prev = cur; }
  let k = 0; for (let j = 1; j < K; j++) if (prev[j] > prev[k]) k = j; const path = new Array(n); for (let s = n - 1; s >= 0; s--) { path[s] = k; k = back[s][k]; }
  const out = []; path.forEach((k, s) => { const c = k === NC ? "N" : CH[k].name, kk = steps[s], l = out[out.length - 1];
    if (l && l.c === c) l.t1 = bar1 + (kk + 1) * st; else out.push({ t0: bar1 + kk * st, t1: bar1 + (kk + 1) * st, bar: Math.floor(kk / 8), beat: (kk % 8) / 2, c }); });
  return { regions: out, perStep: path.map(k => k === NC ? "N" : CH[k].name) };
}
module.exports = { analyse, CH, NAMES, P };
if (require.main === module) {
  const { decodeMidi, tickToSec } = require("../../tests/lib/smf"), a = process.argv.slice(2), opt = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  const d = decodeMidi(fs.readFileSync(a[0])), off = +(opt("--offset") || 0), notes = d.notes.map(x => ({ on: tickToSec(d, x.onTick) + off, off: tickToSec(d, x.offTick) + off, midi: x.pitch }));
  const bar1 = +opt("--bar1"), bpm = +opt("--bpm"), last = Math.max(...notes.map(x => x.off)), nBars = Math.ceil((last - bar1) / (240 / bpm)), steps = []; for (let k = -8; k < nBars * 8; k++) steps.push(k);
  const { regions } = analyse(notes, { bar1, bpm, steps }), from = +(opt("--from") || 1), to = +(opt("--to") || 999);
  console.log(`${regions.length} regions over ${nBars} bars`); if (a.includes("--print")) console.log(regions.filter(r => { const b = (r.t1 - bar1) / (240 / bpm) + 1; return r.bar + 1 <= to && b > from; }).map(r => `${r.bar + 1}.${r.beat + 1}:${r.c}`).join("  "));
}
