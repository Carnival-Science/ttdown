// Ported from tests/test28.js for the v1 interface (no tabs, no example teardown). The assertions are the legacy ones; see docs/SVELTE_MIGRATION.md §14.
// Input limits and clear errors: oversize, empty, too short, too long (refused before decoding), and a refused file leaves the teardown on screen alone.
// Processing limits and clear errors: oversize, empty, too short, too long (refused from the header BEFORE decoding, and again
// after decoding when the header is unusable), silent input; failures leave the previous teardown intact; very long tracks disclose
// that tempo/drums were read from the first 8 minutes only. All inputs are generated here; nothing is a real recording.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), SONGS = path.join(ROOT, 'test-songs'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

function writeWav(file, sec, sr, sample) { // 16-bit mono
  const n = Math.floor(sec * sr), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample(i / sr, i) * 12000))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}
function repeatedSong(file, srcWav, times, decimate) { // channel 0 of a synthetic song, decimated, repeated
  const b = fs.readFileSync(srcWav); let o = 12, fmt, data;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) }; if (id === 'data') data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
  if (fmt.bits !== 16) throw new Error('expected 16-bit source');
  const frames = data.length / (2 * fmt.ch), one = []; for (let i = 0; i < frames; i += decimate) one.push(data.readInt16LE(i * 2 * fmt.ch));
  const sr = Math.round(fmt.sr / decimate), n = one.length * times, out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  for (let k = 0; k < times; k++) one.forEach((v, i) => out.writeInt16LE(v, 44 + (k * one.length + i) * 2));
  fs.writeFileSync(file, out); return n / sr;
}

(async () => {
  const b = await chromium.launch(); const errs = []; let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  const open = async () => {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(String(e)));
    await p.addInitScript(() => { // count the expensive steps a refused file must never reach
      window.__calls = { decode: 0, read: 0 };
      const d = OfflineAudioContext.prototype.decodeAudioData; OfflineAudioContext.prototype.decodeAudioData = function (...a) { window.__calls.decode++; return d.apply(this, a); };
      const r = File.prototype.arrayBuffer; File.prototype.arrayBuffer = function () { window.__calls.read++; return r.call(this); };
    });
    await p.goto(`${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`); await p.waitForTimeout(300); return p;
  };
  const outcome = async (p, file) => { await p.setInputFiles('#file', file); await p.waitForFunction(() => /Teardown ready|Couldn|That file|limit/i.test(document.querySelector('#status').textContent), null, { timeout: 180000 });
    return p.evaluate(() => ({ status: document.querySelector('#status').textContent, err: document.querySelector('#status').classList.contains('err'), calls: { ...window.__calls }, td: window.__td && window.__td.title })); };

  const big = path.join(OUT, 'oversize.wav'); const fd = fs.openSync(big, 'w'); fs.ftruncateSync(fd, 201 * 1024 * 1024); fs.closeSync(fd); // sparse: 201 MB without using the disk
  const empty = path.join(OUT, 'empty.wav'); fs.writeFileSync(empty, '');
  const tooShort = path.join(OUT, 'short3s.wav'); writeWav(tooShort, 3, 22050, t => Math.sin(2 * Math.PI * 220 * t));
  const tooLong = path.join(OUT, 'long16min.wav'); writeWav(tooLong, 16 * 60, 8000, t => Math.sin(2 * Math.PI * 220 * t)); // 15 MB: long but small
  const silent = path.join(OUT, 'silent30s.wav'); writeWav(silent, 30, 22050, () => 0);

  // 1-4: each refused up front, with a specific message, without reading or decoding where the limit can be known earlier
  { const p = await open(), o = await outcome(p, big);
    check(o.err && /201 MB/.test(o.status) && /200 MB/.test(o.status) && o.calls.read === 0 && o.calls.decode === 0, `oversize: refused before the file is read (${o.status}; reads ${o.calls.read}, decodes ${o.calls.decode})`); await p.close(); }
  { const p = await open(), o = await outcome(p, empty); check(o.err && /empty/.test(o.status) && o.calls.decode === 0, `empty file: ${o.status}`); await p.close(); }
  { const p = await open(), o = await outcome(p, tooShort); check(o.err && /3\.0 s/.test(o.status) && /8 s/.test(o.status) && /Sample Lab/.test(o.status) && o.calls.decode === 1, `too short: ${o.status}`); await p.close(); }
  { const p = await open(), o = await outcome(p, tooLong);
    check(o.err && /16:00/.test(o.status) && /8:00/.test(o.status) && o.calls.decode === 0 && o.calls.read === 0, `too long (limit = analysis coverage): refused from its header before decoding (${o.status}; reads ${o.calls.read}, decodes ${o.calls.decode})`); await p.close(); }
  // 5. header unusable (duration unknown) => the post-decode check still refuses it
  { const p = await open(); await p.addInitScript(() => { Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get: () => NaN }); }); await p.reload(); await p.waitForTimeout(300);
    const o = await outcome(p, tooLong); check(o.err && /16:00/.test(o.status) && o.calls.decode === 1, `too long, no usable header: refused after decoding (${o.status}; decodes ${o.calls.decode})`); await p.close(); }
  // 6. silence
  { const p = await open(), o = await outcome(p, silent); check(o.err && /silent/.test(o.status), `silent file: ${o.status}`); await p.close(); }

  // 7. a refused file leaves the previous teardown and its audio alone
  { const p = await open(); await p.setInputFiles('#file', path.join(SONGS, 'pop127_Amaj.wav'));
    await p.waitForFunction(() => /Teardown ready for “pop127_Amaj”/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
    const src = await p.evaluate(() => document.querySelector('#out audio').src); const o = await outcome(p, tooLong);
    const after = await p.evaluate(async u => ({ same: document.querySelector('#out audio') && document.querySelector('#out audio').src === u, ok: await fetch(u).then(r => r.ok).catch(() => false), title: window.__td.title, hist: document.querySelectorAll('#hist button').length }), src);
    check(o.err && after.same && after.ok && after.title === 'pop127_Amaj' && after.hist === 1, `refused file: previous teardown, audio and history untouched (${JSON.stringify(after)})`); await p.close(); }

  // 8. the limit equals the analysis coverage: a 7:00 track is accepted and tracked to its end; 8:10 is refused, not partly analysed
  { const ok = path.join(OUT, 'song420s.wav'), secOk = repeatedSong(ok, path.join(SONGS, 'pop127_Amaj.wav'), 6, 4);
    const p = await open(), t0 = Date.now(), o = await outcome(p, ok), took = (Date.now() - t0) / 1000;
    const info = await p.evaluate(() => ({ stats: (document.querySelector('[data-finding="meter"]') || {}).textContent || '', lastBeat: Math.max(...window.__td.grid.beats), dur: window.__td.duration }));
    check(!o.err && !/read from the first/.test(info.stats) && info.dur - info.lastBeat < 3, `${secOk.toFixed(0)} s track accepted in ${took.toFixed(1)} s and tracked to its end (last beat ${info.lastBeat.toFixed(1)} s of ${info.dur} s, no partial-analysis note)`); await p.close();
    const over = path.join(OUT, 'song490s.wav'), secOver = repeatedSong(over, path.join(SONGS, 'pop127_Amaj.wav'), 7, 4);
    const q = await open(), o2 = await outcome(q, over);
    check(o2.err && /8:10/.test(o2.status) && /8:00/.test(o2.status) && o2.calls.decode <= 1 && !o2.td, `${secOver.toFixed(0)} s track refused, not partly analysed (${o2.status})`); await q.close(); }

  console.log('errors', errs); if (errs.length || failed) process.exitCode = 1; await b.close();
})();
