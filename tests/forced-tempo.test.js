/* A tempo the person types is the tempo of the re-analysis. Regression: the beat tracker's own measured tempo (when within 3 BPM of the
 * working tempo) used to overwrite it, so typing 161 on a track the tracker read as 161.5 came back as 161.5. Without a forced tempo
 * nothing changes (Version A parity is checked separately). */
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const TM = require("../src/timemap"), eng = require("../src/engine")({ TimeMap: TM });
const b = fs.readFileSync(path.join(__dirname, "..", "test-songs", "pop127_Amaj.wav")); let p = 12, fmt, data;
while (p < b.length) { const id = b.toString("latin1", p, p + 4), n = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12) }; if (id === "data") { data = b.subarray(p + 8, p + 8 + n); break; } p += 8 + n + (n & 1); }
const N = data.length / 2 / fmt.ch, ch = []; for (let c = 0; c < fmt.ch; c++) { const f = new Float32Array(N); for (let i = 0; i < N; i++) f[i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768; ch.push(f); }
const ab = { sampleRate: fmt.sr, length: N, duration: N / fmt.sr, numberOfChannels: fmt.ch, getChannelData: c => ch[c] };
(async () => {
  const det = await eng.analyzeDecoded(ab, () => {}, false, undefined, undefined); assert.equal(det.bpm, 127);
  for (const t of [125, 126, 127.4, 128]) { const a = await eng.analyzeDecoded(ab, () => {}, false, undefined, { bpm: t }); assert.equal(a.bpm, t, `forced ${t} BPM must be the result's tempo, got ${a.bpm}`); assert.equal(a.nBars, Math.floor(a.duration / (240 / t))); }
  console.log("5 passed, 0 failed");
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
