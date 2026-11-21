"use strict";
// Minimal 16-bit PCM WAV reader (the fixtures are mono 44.1 kHz) returning an AudioBuffer-like object the engine accepts.
const fs = require("node:fs");
function readWav(file) {
  const b = fs.readFileSync(file); if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV: " + file);
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) { const id = b.toString("ascii", o, o + 4), n = b.readUInt32LE(o + 4);
    if (id === "fmt ") fmt = { ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    else if (id === "data") { data = b.subarray(o + 8, o + 8 + n); break; }
    o += 8 + n + (n & 1); }
  if (!fmt || !data || fmt.bits !== 16) throw new Error("need 16-bit PCM: " + file);
  const frames = Math.floor(data.length / (2 * fmt.ch)), chans = Array.from({ length: fmt.ch }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.ch; c++) chans[c][i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768;
  return { sampleRate: fmt.sr, numberOfChannels: fmt.ch, length: frames, duration: frames / fmt.sr, getChannelData: c => chans[c] };
}
module.exports = { readWav };
