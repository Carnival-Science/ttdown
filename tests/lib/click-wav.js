// A small synthetic WAV (16-bit mono PCM) for smoke tests that must not depend on the Python song generators: a kick-like thump on
// every beat, a click on the off-beats and a held bass note, at a known tempo. Deterministic, a few hundred KB.
"use strict";

function clickTrackWav({ bpm = 120, seconds = 12, sampleRate = 22050 } = {}) {
  const n = Math.round(seconds * sampleRate), x = new Float32Array(n), beat = 60 / bpm;
  for (let k = 0; k * beat < seconds; k++) {
    const i0 = Math.round(k * beat * sampleRate), kick = k % 4 === 0 ? 1 : 0.7;
    for (let i = 0; i < 0.12 * sampleRate && i0 + i < n; i++) { const t = i / sampleRate; x[i0 + i] += kick * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 18); }
    const j0 = Math.round((k + 0.5) * beat * sampleRate);
    for (let i = 0; i < 0.02 * sampleRate && j0 + i < n; i++) x[j0 + i] += 0.25 * Math.sin(2 * Math.PI * 4000 * i / sampleRate) * Math.exp(-i / sampleRate * 200);
  }
  for (let i = 0; i < n; i++) x[i] += 0.15 * Math.sin(2 * Math.PI * 55 * i / sampleRate);
  const data = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-1, Math.min(1, x[i] * 0.8)) * 32767 | 0, i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

module.exports = { clickTrackWav };
