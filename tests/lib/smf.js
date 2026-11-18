/* An INDEPENDENT Standard MIDI File reader and stored-zip reader for the export tests. It shares no code with src/domain.js (midiBytes,
 * zipStore): what the app writes is checked against this reading of the bytes, not against the writer's own idea of them.
 *
 *   decodeMidi(bytes) -> { format, ntrks, division, tracks:[{ name, events:[{tick, type, ...}] }], tempos:[{tick, usPerQuarter, bpm}],
 *                          timeSignatures:[{tick, num, den}], notes:[{pitch, vel, onTick, offTick, track}], onsets, unmatched }
 *   Notes are paired per (track, channel, pitch) in FIFO order (the first note-off closes the earliest open note-on), which is what the SMF
 *   spec's ambiguity resolves to in most readers; `unmatched` lists note-ons that never closed and note-offs that closed nothing.
 *   tickToSec(decoded, tick) honours every tempo change. readZip(bytes) -> [{ name, data }] (stored entries only, CRC-32 verified).
 */
"use strict";
function crc32(buf) { let c, crc = ~0; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }

function decodeMidi(bytes) {
  const b = Buffer.from(bytes); let p = 0;
  const u32 = () => { const v = b.readUInt32BE(p); p += 4; return v; }, u16 = () => { const v = b.readUInt16BE(p); p += 2; return v; }, tag = () => { const s = b.toString("latin1", p, p + 4); p += 4; return s; };
  if (tag() !== "MThd") throw new Error("not a MIDI file (no MThd)");
  if (u32() !== 6) throw new Error("bad header length");
  const format = u16(), ntrks = u16(), division = u16();
  if (division & 0x8000) throw new Error("SMPTE division is not supported by this reader");
  const out = { format, ntrks, division, tracks: [], tempos: [], timeSignatures: [], notes: [], unmatched: [], onsets: 0 };
  for (let t = 0; t < ntrks; t++) {
    if (tag() !== "MTrk") throw new Error("expected MTrk"); const len = u32(), end = p + len; if (end > b.length) throw new Error("track runs past the end of the file");
    const trk = { name: null, events: [], text: [], ended: false }; let tick = 0, status = 0; const open = new Map();
    const vlq = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 127); } while (c & 128); return v; };
    while (p < end) {
      tick += vlq(); let s = b[p]; if (s & 128) { p++; if (s < 0xf0) status = s; } else { s = status; if (!s) throw new Error("running status with no status"); }
      if (s === 0xff) {
        const type = b[p++], n = vlq(), d = b.subarray(p, p + n); p += n;
        if (type === 0x2f) { trk.ended = true; trk.endTick = tick; }
        else if (type === 0x51) { const us = (d[0] << 16) | (d[1] << 8) | d[2]; out.tempos.push({ tick, usPerQuarter: us, bpm: 60e6 / us }); }
        else if (type === 0x58) out.timeSignatures.push({ tick, num: d[0], den: 2 ** d[1], clocks: d[2], thirtySeconds: d[3] });
        else if (type === 0x03) trk.name = d.toString("latin1");
        else if (type === 0x01 || type === 0x02 || type === 0x04 || type === 0x05) trk.text.push({ tick, type, text: d.toString("latin1") });
        trk.events.push({ tick, type: "meta", meta: type });
      } else if (s === 0xf0 || s === 0xf7) { const n = vlq(); p += n; }
      else {
        const hi = s & 0xf0, ch = s & 15, n = hi === 0xc0 || hi === 0xd0 ? 1 : 2, d1 = b[p], d2 = n === 2 ? b[p + 1] : 0; p += n;
        const key = ch + ":" + d1;
        if (hi === 0x90 && d2 > 0) { out.onsets++; (open.get(key) || open.set(key, []).get(key)).push({ pitch: d1, vel: d2, onTick: tick, channel: ch, track: t }); trk.events.push({ tick, type: "on", pitch: d1, vel: d2, channel: ch }); }
        else if (hi === 0x80 || hi === 0x90) {
          const q = open.get(key); if (q && q.length) { const nt = q.shift(); nt.offTick = tick; out.notes.push(nt); } else out.unmatched.push({ kind: "off-without-on", pitch: d1, tick });
          trk.events.push({ tick, type: "off", pitch: d1, channel: ch });
        } else trk.events.push({ tick, type: "other", status: s });
      }
    }
    if (p !== end) throw new Error("track length mismatch");
    open.forEach(q => q.forEach(nt => out.unmatched.push({ kind: "on-never-closed", pitch: nt.pitch, tick: nt.onTick })));
    out.tracks.push(trk);
  }
  out.notes.sort((x, y) => x.onTick - y.onTick || x.pitch - y.pitch);
  return out;
}
/* tick -> seconds, summing every tempo segment (a file with one tempo is the simple case) */
function tickToSec(d, tick) {
  const T = d.tempos.length ? d.tempos.slice().sort((a, b) => a.tick - b.tick) : [{ tick: 0, usPerQuarter: 500000 }];
  let sec = 0, at = 0, us = T[0].tick === 0 ? T[0].usPerQuarter : 500000;
  for (const t of T) { if (t.tick >= tick) break; sec += (t.tick - at) * us / d.division / 1e6; at = t.tick; us = t.usPerQuarter; }
  return sec + (tick - at) * us / d.division / 1e6;
}
function readZip(bytes) {
  const b = Buffer.from(bytes), out = []; let p = 0;
  while (p + 4 <= b.length && b.readUInt32LE(p) === 0x04034b50) {
    const method = b.readUInt16LE(p + 8), crc = b.readUInt32LE(p + 14), csize = b.readUInt32LE(p + 18), usize = b.readUInt32LE(p + 22), nl = b.readUInt16LE(p + 26), el = b.readUInt16LE(p + 28);
    if (method !== 0) throw new Error("only stored zip entries are supported"); const name = b.toString("utf8", p + 30, p + 30 + nl), data = b.subarray(p + 30 + nl + el, p + 30 + nl + el + csize);
    if (csize !== usize || crc32(data) !== crc) throw new Error(`zip entry "${name}" fails its size/CRC check`);
    out.push({ name, data: Buffer.from(data) }); p += 30 + nl + el + csize;
  }
  if (b.readUInt32LE(p) !== 0x02014b50 && !(out.length === 0)) { /* central directory follows the local entries */ }
  return out;
}
module.exports = { decodeMidi, tickToSec, readZip, crc32 };
