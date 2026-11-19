#!/usr/bin/env node
/* Melody fixtures: synthetic songs whose lead line and bass CHANGE between sections, with exact note-level answers. They exist to test
 * the full-track transcription (engine transcribeTrack): a representative 4-bar pattern repeated over the song cannot follow a melody
 * that changes, a silent passage, or tempo drift; notes at their real positions can. Dependency-free (no numpy), deterministic.
 *   node test-songs/make_melody_fixtures.js        writes test-songs/melody-fixtures/{*.wav, truth/, manifest.json}
 * Sections (24 bars, A minor):  bars 1-8  melody M1 + bass B1  |  bars 9-16  melody M2 + bass B2 (different notes and rhythm)
 *                               bars 17-20 no lead (silent passage), bass B1  |  bars 21-24 M1 a fourth up + bass B2
 *   melody_change_120  constant 120 BPM          melody_drift_116_124  tempo glides from 116 to 124 BPM across the song
 * Reported, not gated: a stress set for transcription, not a measure of real-world accuracy. */
"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const DIR = path.join(__dirname, "melody-fixtures"), TRUTH = path.join(DIR, "truth"), SR = 44100;
fs.mkdirSync(TRUTH, { recursive: true });
const M1 = [[0, 76, 3], [3, 74, 3], [6, 72, 2], [8, 69, 4], [12, 72, 4], [16, 76, 3], [19, 77, 3], [22, 76, 2], [24, 72, 8], [32, 76, 3], [35, 74, 3], [38, 72, 2], [40, 69, 4], [44, 67, 4], [48, 69, 6], [54, 72, 2], [56, 69, 8]];
const M2 = [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 76, 4], [12, 74, 4], [16, 72, 2], [18, 74, 2], [20, 76, 4], [24, 77, 8], [32, 81, 2], [34, 79, 2], [36, 77, 4], [40, 76, 8], [48, 74, 4], [52, 72, 4], [56, 71, 8]];
const M3 = M1.map(([s, m, l]) => [s, m + 5, l]);
const B1 = [[0, 33, 6], [6, 33, 2], [10, 33, 6], [16, 29, 6], [26, 29, 6], [32, 36, 6], [42, 36, 6], [48, 31, 6], [58, 31, 4], [62, 35, 2]];
const B2 = [[0, 29, 4], [4, 29, 4], [8, 31, 8], [16, 28, 4], [20, 28, 4], [24, 33, 8], [32, 26, 6], [38, 26, 2], [40, 28, 8], [48, 33, 4], [52, 33, 4], [56, 28, 8]];
const PLAN = b => b < 8 ? [M1, B1] : b < 16 ? [M2, B2] : b < 20 ? [null, B1] : [M3, B2]; // [lead, bass] per bar (b 0-based)
const BARS = 24;

let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function make(id, bpmAt) {
  // beat times: beat k lasts 60 / bpm(k); bpm(k) from the tempo function of the beat's position in the song (0..1)
  const K = BARS * 4 + 1, beatT = [0]; for (let k = 0; k < K; k++) beatT.push(beatT[k] + 60 / bpmAt(k / (K - 1)));
  const stepT = s => { const k = Math.floor(s / 4), f = (s % 4) / 4; return beatT[k] + f * (beatT[k + 1] - beatT[k]); }; // 16th step -> seconds
  const dur = beatT[BARS * 4] + 2, n = Math.ceil(dur * SR), x = new Float32Array(n);
  const add = (t, len, fn) => { const i0 = Math.floor(t * SR), i1 = Math.min(n, i0 + Math.floor(len * SR)); for (let i = i0; i < i1; i++) x[i] += fn((i - i0) / SR); };
  const T = { beats: [], lead: [], bass: [] }, at = t => Math.floor(t * SR) / SR;
  for (let b = 0; b < BARS; b++) {
    for (let q = 0; q < 4; q++) T.beats.push([at(beatT[b * 4 + q]), q + 1]);
    for (const s of [0, 8]) add(stepT(b * 16 + s), 0.3, t => Math.sin(2 * Math.PI * (45 * t + (65 / 25) * (1 - Math.exp(-25 * t)))) * Math.exp(-t * 10) * 0.7);
    for (let s = 0; s < 16; s += 2) add(stepT(b * 16 + s), 0.04, t => rnd() * Math.exp(-t * 90) * (s % 4 ? 0.05 : 0.09));
    const [lead, bass] = PLAN(b), ph = b % 4;
    if (lead) for (const [s, m, l] of lead) { if (Math.floor(s / 16) !== ph) continue; const t0 = stepT(b * 16 + s % 16), t1 = stepT(b * 16 + s % 16 + l), f = hz(m);
      add(t0, t1 - t0, t => { let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * t) / h; return v * Math.min(1, t / 0.01) * Math.exp(-t * 2) * 0.16; }); T.lead.push([at(t0), at(t1), m]); }
    for (const [s, m, l] of bass) { if (Math.floor(s / 16) !== ph) continue; const t0 = stepT(b * 16 + s % 16), t1 = stepT(b * 16 + s % 16 + l), f = hz(m);
      add(t0, t1 - t0, t => (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * Math.min(1, t / 0.005) * Math.exp(-t * 1.5) * 0.4); T.bass.push([at(t0), at(t1), m]); }
  }
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  const buf = Buffer.alloc(44 + n * 2); buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(x[i] / pk * 0.9 * 32767), 44 + i * 2);
  fs.writeFileSync(path.join(DIR, `${id}.wav`), buf);
  const f6 = v => v.toFixed(6), W = (k, lines) => { const p = path.join(TRUTH, `${id}.${k}`); fs.writeFileSync(p, lines.join("")); return p; };
  const files = { beats: W("beats.txt", T.beats.map(([t, q]) => `${f6(t)}\t${q}\n`)), key: W("key.txt", ["A minor\n"]),
    bass: W("bass.txt", T.bass.sort((p, q) => p[0] - q[0]).map(([a, c, m]) => `${f6(a)}\t${f6(c)}\t${m}\n`)),
    melody_lead: W("melody_lead.txt", T.lead.sort((p, q) => p[0] - q[0]).map(([a, c, m]) => `${f6(a)}\t${f6(c)}\t${m}\n`)) };
  const sha = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  return { id, audio: `${id}.wav`, sha256: sha(path.join(DIR, `${id}.wav`)), split: "synthetic", artists: ["Teardown melody fixtures"], release: "synthetic melody fixtures v1", songFamily: "melody_change",
    rights: { source: "generated by test-songs/make_melody_fixtures.js", licence: "project-owned synthetic audio" }, tempo: Math.round(bpmAt(0)),
    tags: { style: "melodic", melody: "changes between sections, with a 4-bar silent passage", tempo_behaviour: bpmAt(0) === bpmAt(1) ? "constant" : `glide ${bpmAt(0)} to ${bpmAt(1)} BPM`, meter: "4/4" },
    annotations: Object.fromEntries(Object.entries(files).map(([k, p]) => [k, path.relative(DIR, p)])), annotationSha256: Object.fromEntries(Object.entries(files).map(([k, p]) => [k, sha(p)])) };
}
const tracks = [make("melody_change_120", () => 120), make("melody_drift_116_124", u => 116 + 8 * u)];
fs.writeFileSync(path.join(DIR, "manifest.json"), JSON.stringify({ name: "melody-fixtures", version: 1, annotationProtocol: "synthetic-exact",
  note: "Generated answers, exact by construction. Melody and bass change between sections; one fixture drifts in tempo. Reported, not gated. Not real-world accuracy.",
  requirements: { checksums: true, continuousBeats: true, identity: true, annotations: { beats: "all", downbeats: "all", key: "all", bass: "all", melody_lead: "all" } }, tracks }, null, 1));
console.log("melody fixtures:", tracks.map(t => t.id).join(", "));
