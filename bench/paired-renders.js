#!/usr/bin/env node
// Paired-render benchmark: audio rendered from a MIDI file you wrote, scored against that MIDI file.
// The analyzer only ever sees the audio. The MIDI is the answer key: tempo, beats, bar lines (so the first downbeat and any pickup) and
// every note. Real renders stay outside the repo (they are someone's music); only this script and an example manifest are committed.
//
//   node bench/paired-renders.js <manifest.json> [--out DIR] [--only id,id]
//
// manifest: { "name": "...", "tracks": [ { "id", "audio", "midi", "split": "dev"|"holdout", "offsetSec"?: number } ] }
//   paths are relative to the manifest. offsetSec = audio time minus MIDI time; when absent it is measured: the first note-on in the MIDI
//   is put at the first sound in the audio (renders usually trim the leading empty bars). The alignment used is printed and saved.
// Needs ffmpeg on PATH (MP3 and other formats are decoded to 44.1 kHz stereo WAV first). The engine is the same src/engine.js the page
// inlines (npm run sync:timemap --check keeps them identical), run in Node.
//
// Scores (tolerances in brackets):
//   tempo          the MIDI's tempo vs the reported BPM (constant-tempo, 4/4 MIDI only; anything else is refused, not guessed)
//   beats          beat F-measure [70 ms]; how many tracked beats sit on the MIDI's off-beats instead
//   bar 1          does a reported downbeat sit on the MIDI's first downbeat that has a note at or after it [70 ms], and its error
//   downbeats      downbeat F-measure [70 ms] over the whole track
//   pickup         notes before that first downbeat: how many the transcription found (pitch and onset) and whether they sit before bar 1
//   notes          one-to-one note matching, exact pitch, onset [50 ms]: precision, recall, F1 over the transcription's lead + bass
//                  against every MIDI note (a polyphonic answer key against a melody + bass transcription, so recall is capped by design)
"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), { execFileSync } = require("node:child_process");
const { decodeMidi, tickToSec } = require("../tests/lib/smf");
const TM = require("../src/timemap"), TS = require("../src/timing-store"), eng = require("../src/engine")({ TimeMap: TM }), D = require("../src/domain")({ TimingStore: TS, engine: eng });

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const manifestArg = args.find((a, i) => !a.startsWith("--") && !["--out", "--only"].includes(args[i - 1]));
if (!manifestArg || !fs.existsSync(manifestArg)) { console.error("usage: node bench/paired-renders.js <manifest.json> [--out DIR] [--only id,id]"); process.exit(2); }
const mpath = path.resolve(manifestArg), mdir = path.dirname(mpath), manifest = JSON.parse(fs.readFileSync(mpath, "utf8"));
const OUT = path.resolve(opt("--out", path.join(__dirname, "out", "paired-renders"))), only = opt("--only") ? new Set(opt("--only").split(",")) : null;
const TOL_BEAT = 0.07, TOL_NOTE = 0.05;

function decodeAudio(file) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "paired-")), wav = path.join(tmp, "a.wav");
  try { execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", wav]); }
  catch (e) { throw new Error("ffmpeg could not decode " + file + (e.code === "ENOENT" ? " (ffmpeg is not on PATH)" : "")); }
  const b = fs.readFileSync(wav); fs.rmSync(tmp, { recursive: true, force: true });
  let p = 12, fmt, data; while (p < b.length) { const id = b.toString("latin1", p, p + 4), n = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12) }; if (id === "data") { data = b.subarray(p + 8, Math.min(b.length, p + 8 + n)); break; } p += 8 + n + (n & 1); }
  const N = Math.floor(data.length / 2 / fmt.ch), ch = []; for (let c = 0; c < fmt.ch; c++) { const f = new Float32Array(N); for (let i = 0; i < N; i++) f[i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768; ch.push(f); }
  return { sampleRate: fmt.sr, length: N, duration: N / fmt.sr, numberOfChannels: fmt.ch, getChannelData: c => ch[c] };
}
// first sound: the first 10 ms frame louder than 2% of the track's loud level (99th percentile frame RMS)
function firstSound(ab) {
  const L = ab.getChannelData(0), R = ab.getChannelData(ab.numberOfChannels > 1 ? 1 : 0), hop = Math.round(ab.sampleRate / 100), rms = [];
  for (let i = 0; i + hop <= L.length; i += hop) { let s = 0; for (let k = i; k < i + hop; k++) { const v = (L[k] + R[k]) / 2; s += v * v; } rms.push(Math.sqrt(s / hop)); }
  const ref = rms.slice().sort((p, q) => p - q)[Math.floor(rms.length * 0.99)] || 0, k = rms.findIndex(v => v > 0.02 * ref);
  return k < 0 ? 0 : k / 100;
}
function reference(midiFile) {
  const d = decodeMidi(fs.readFileSync(midiFile));
  const tempos = [...new Map(d.tempos.map(t => [t.tick, t])).values()], ts = d.timeSignatures;
  if (new Set(tempos.map(t => t.usPerQuarter)).size > 1) return { refused: "the MIDI changes tempo (this benchmark scores constant-tempo renders only)" };
  if (ts.some(t => t.num !== 4 || t.den !== 4)) return { refused: "the MIDI is not 4/4 throughout" };
  const notes = d.notes.map(n => ({ on: tickToSec(d, n.onTick), off: tickToSec(d, n.offTick), midi: n.pitch, tick: n.onTick })).sort((p, q) => p.on - q.on || p.midi - q.midi);
  if (!notes.length) return { refused: "the MIDI has no notes" };
  const bpm = tempos.length ? tempos[0].bpm : 120, beat = 60 / bpm, end = Math.max(...notes.map(n => n.off));
  const firstBeat = Math.floor(notes[0].tick / d.division), beats = [];
  for (let k = firstBeat; k * beat <= end + 600; k++) // the constant tempo goes on after the last note (renders have a tail); the caller keeps what is inside the audio
    beats.push({ t: k * beat, down: k % 4 === 0 });
  const firstDown = beats.find(b => b.down && b.t >= notes[0].on - 1e-6);
  return { bpm, beat, notes, beats, firstDown: firstDown ? firstDown.t : null, firstDownBeat: firstDown ? Math.round(firstDown.t / beat) : 0, division: d.division };
}
// one-to-one matching of sorted times within tol: greedy on the closest pairs (exact for well-separated events)
function matchTimes(ref, est, tol) {
  const pairs = []; let j0 = 0;
  ref.forEach((r, i) => { while (j0 < est.length && est[j0] < r - tol) j0++; for (let j = j0; j < est.length && est[j] <= r + tol; j++) pairs.push([Math.abs(est[j] - r), i, j]); });
  pairs.sort((p, q) => p[0] - q[0]); const ur = new Set(), ue = new Set(); let n = 0;
  for (const [, i, j] of pairs) if (!ur.has(i) && !ue.has(j)) { ur.add(i); ue.add(j); n++; }
  return { n, ur, ue };
}
const fm = (n, nr, ne) => { const p = ne ? n / ne : 0, r = nr ? n / nr : 0; return { precision: +p.toFixed(3), recall: +r.toFixed(3), f: p + r ? +(2 * p * r / (p + r)).toFixed(3) : 0 }; };
function matchNotes(ref, est) {
  const pairs = [];
  ref.forEach((r, i) => est.forEach((e, j) => { const d = Math.abs(e.on - r.on); if (e.midi === r.midi && d <= TOL_NOTE) pairs.push([d, i, j]); }));
  pairs.sort((p, q) => p[0] - q[0]); const ur = new Set(), ue = new Set();
  for (const [, i, j] of pairs) if (!ur.has(i) && !ue.has(j)) { ur.add(i); ue.add(j); }
  return { n: ur.size, ur, ue };
}

(async () => {
  const rows = []; fs.mkdirSync(OUT, { recursive: true });
  for (const t of manifest.tracks) {
    if (only && !only.has(t.id)) continue;
    const ref = reference(path.resolve(mdir, t.midi));
    if (ref.refused) { rows.push({ id: t.id, split: t.split, refused: ref.refused }); continue; }
    const ab = decodeAudio(path.resolve(mdir, t.audio)), t0 = Date.now();
    const a = await eng.analyzeDecoded(ab, () => {}, false, undefined, undefined), ms = Date.now() - t0;
    const sound = firstSound(ab), offset = typeof t.offsetSec === "number" ? t.offsetSec : sound - ref.notes[0].on;
    const R = { beats: ref.beats.map(b => ({ t: b.t + offset, down: b.down })).filter(b => b.t >= 0 && b.t <= ab.duration), notes: ref.notes.map(n => ({ ...n, on: n.on + offset, off: n.off + offset })), firstDown: ref.firstDown + offset };
    const g = a.grid || { beats: [], downbeats: [] }, G = TM.forAnalysis(a);
    // beats and the off-beat lock
    const rb = R.beats.map(b => b.t), mb = matchTimes(rb, g.beats, TOL_BEAT), offs = R.beats.slice(0, -1).map((b, i) => (b.t + R.beats[i + 1].t) / 2);
    const onOff = matchTimes(offs, g.beats, TOL_BEAT).n;
    // downbeats and bar 1
    const rd = R.beats.filter(b => b.down).map(b => b.t), md = matchTimes(rd, g.downbeats, TOL_BEAT);
    const near = g.downbeats.length ? g.downbeats.reduce((p, q) => Math.abs(q - R.firstDown) < Math.abs(p - R.firstDown) ? q : p) : null;
    const bar1Err = near == null ? null : near - R.firstDown;
    // notes
    const tr = a.transcription || { lead: [], bass: [] }, est = [...tr.lead, ...tr.bass].sort((p, q) => p.on - q.on);
    const mn = matchNotes(R.notes, est), pick = R.notes.map((n, i) => [n, i]).filter(([n]) => n.on < R.firstDown - TOL_NOTE);
    const pickFound = pick.filter(([, i]) => mn.ur.has(i)).length;
    const pickEst = est.filter(e => e.on < R.firstDown - TOL_NOTE), pickBefore = pickEst.filter(e => e.bar < 0).length;
    const row = {
      id: t.id, split: t.split || "dev", ms, alignment: { offsetSec: +offset.toFixed(3), from: typeof t.offsetSec === "number" ? "manifest" : "first sound", firstSoundSec: +sound.toFixed(3) },
      tempo: { ref: +ref.bpm.toFixed(3), reported: a.bpm, fit: a.tempoFit ? a.tempoFit.bpm : null, grid: g.source, errPct: +(100 * (a.bpm - ref.bpm) / ref.bpm).toFixed(3) },
      beats: { ...fm(mb.n, rb.length, g.beats.length), onOffbeats: onOff, n: g.beats.length },
      bar1: { refSec: +R.firstDown.toFixed(3), reportedSec: near == null ? null : +near.toFixed(3), errSec: bar1Err == null ? null : +bar1Err.toFixed(3), ok: bar1Err != null && Math.abs(bar1Err) <= TOL_BEAT, source: a.downbeatFit ? a.downbeatFit.method : "drums", gridKind: G.kind },
      downbeats: fm(md.n, rd.length, g.downbeats.length),
      pickup: { refNotes: pick.length, found: pickFound, transcribedBeforeBar1: pickBefore, transcribedInPickupTime: pickEst.length },
      notes: { ref: R.notes.length, est: est.length, matched: mn.n, ...fm(mn.n, R.notes.length, est.length) }
    };
    // ---- the grid accuracy targets (research targets, not performance claims; fixed-tempo renders) ----
    const near1 = (arr, t) => arr.length ? arr.reduce((p, q) => Math.abs(q - t) < Math.abs(p - t) ? q : p) : null;
    const errs = R.beats.map(b => { const e = near1(g.beats, b.t); return e == null ? null : e - b.t; }).filter(e => e != null && Math.abs(e) <= TOL_BEAT);
    const within20 = errs.filter(e => Math.abs(e) <= 0.02).length / (R.beats.length || 1);
    // cumulative drift: how far the error moves from the first fifth of the track to the last fifth (a constant offset is not drift)
    const fifth = Math.max(1, Math.floor(errs.length / 5)), mean = A => A.reduce((p, q) => p + q, 0) / (A.length || 1), drift = errs.length >= 10 ? Math.abs(mean(errs.slice(-fifth)) - mean(errs.slice(0, fifth))) : null;
    const wrongBeats = g.beats.filter(t => Math.abs(near1(R.beats.map(b => b.t), t) - t) > TOL_BEAT).length, wrongDowns = g.downbeats.filter(t => Math.abs(near1(rd, t) - t) > TOL_BEAT).length;
    const constant = G.map.tempo().isConstant && !G.map.exportEligibility().reasons.length;
    // the exported MIDI, decoded independently, against the reference: every exported note is put back on the audio timeline and on the song's bars
    let exp = null;
    try {
      const f = D.allPartsMidi(a, { timing: "tempo-map", grid: G }), dm = decodeMidi(f.data), t0 = G.map.beatToTime((G.barOf(Math.min(...[...tr.lead, ...tr.bass].map(n => n.on))) + G.barOffset) * 4), sb = G.barOf(Math.min(...[...tr.lead, ...tr.bass].map(n => n.on)));
      const refBeat = n => n.tick / ref.division - ref.firstDownBeat, got = dm.notes.filter(n => n.track >= 1 && n.track <= 2).map(n => ({ midi: n.pitch, on: t0 + tickToSec(dm, n.onTick), beat: n.onTick / dm.division + 4 * Math.min(sb, 0) }));
      const pairs = []; R.notes.forEach((r, i) => got.forEach((e, j) => { if (e.midi === r.midi && Math.abs(e.on - r.on) <= TOL_NOTE) pairs.push([Math.abs(e.on - r.on), i, j]); }));
      pairs.sort((x, y) => x[0] - y[0]); const ur = new Set(), ue = new Set(), bd = []; for (const [, i, j] of pairs) if (!ur.has(i) && !ue.has(j)) { ur.add(i); ue.add(j); bd.push(Math.abs(got[j].beat - refBeat(R.notes[i]))); }
      exp = { notes: got.length, matched: bd.length, onSongBars: bd.length ? +(bd.filter(v => v * ref.beat <= TOL_BEAT).length / bd.length).toFixed(3) : null, worstMs: bd.length ? +(1000 * ref.beat * Math.max(...bd)).toFixed(1) : null, pickupInFile: got.filter(e => e.beat < 0).length };
    } catch (e) { exp = { error: e.message }; }
    const T = [
      ["first downbeat error <= 20 ms", bar1Err != null && Math.abs(bar1Err) <= 0.02, bar1Err == null ? "none" : (bar1Err * 1000).toFixed(1) + " ms"],
      ["beats within 20 ms >= 99%", within20 >= 0.99, (100 * within20).toFixed(1) + "%"],
      ["cumulative drift <= 20 ms", drift != null && drift <= 0.02, drift == null ? "n/a" : (drift * 1000).toFixed(1) + " ms"],
      ["wrong beat or bar shifts = 0", wrongBeats === 0 && wrongDowns === 0, `${wrongBeats} beats, ${wrongDowns} downbeats`],
      ["pickup preserved 100%", pick.length === 0 || (pickFound === pick.length && pickBefore >= pick.length), `${pickFound}/${pick.length} found`],
      ["not called variable", constant, constant ? "constant" : "called variable or refused"],
      ["exported MIDI on the song's bars (tempo map, every matched note within 70 ms of its song position)", !!exp && exp.onSongBars === 1, exp && exp.onSongBars != null ? `${(100 * exp.onSongBars).toFixed(1)}% of ${exp.matched} notes, worst ${exp.worstMs} ms` : "no matched notes"],
    ];
    row.targets = T.map(([name, ok, value]) => ({ name, ok, value })); row.exportCheck = exp;
    rows.push(row);
    console.log(`  grid targets (research, not claims): ` + T.map(([n, ok, v]) => `${ok ? "PASS" : "FAIL"} ${n} [${v}]`).join("; "));
    console.log(`${t.id}: ${a.bpm} BPM (ref ${row.tempo.ref}), bar 1 ${row.bar1.ok ? "OK" : "WRONG"} (${row.bar1.errSec == null ? "none" : (row.bar1.errSec * 1000).toFixed(0) + " ms"}, ${row.bar1.source}), beats F ${row.beats.f} (${onOff} on off-beats), downbeats F ${row.downbeats.f}, pickup ${pickFound}/${pick.length}, notes F ${row.notes.f} (P ${row.notes.precision} R ${row.notes.recall}), ${ms} ms`);
  }
  const scored = rows.filter(r => !r.refused), sum = k => scored.reduce((p, r) => p + k(r), 0);
  const summary = scored.length ? { tracks: scored.length, refused: rows.length - scored.length, bar1Correct: sum(r => r.bar1.ok ? 1 : 0), tempoWithin0_1pct: sum(r => Math.abs(r.tempo.errPct) <= 0.1 ? 1 : 0),
    meanBeatF: +(sum(r => r.beats.f) / scored.length).toFixed(3), meanDownbeatF: +(sum(r => r.downbeats.f) / scored.length).toFixed(3), pickupFound: `${sum(r => r.pickup.found)}/${sum(r => r.pickup.refNotes)}`,
    notes: fm(sum(r => r.notes.matched), sum(r => r.notes.ref), sum(r => r.notes.est)) } : null;
  rows.filter(r => r.refused).forEach(r => console.log(`${r.id}: refused (${r.refused})`));
  if (summary) console.log("summary", JSON.stringify(summary));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ manifest: path.basename(mpath), engine: "src/engine.js", tolerances: { beatSec: TOL_BEAT, noteSec: TOL_NOTE }, summary, tracks: rows }, null, 1));
  console.log("wrote", path.relative(process.cwd(), path.join(OUT, "results.json")));
})().catch(e => { console.error(e.message); process.exit(1); });
