#!/usr/bin/env node
/* Full-track transcription vs the representative pattern, scored against note-level truth (bench/lib/transcription.js, mir_eval rules:
 * 50 ms onsets, 50 cents). For every track whose manifest has melody_lead and/or bass answers:
 *   transcribed  a.transcription.lead / .bass: notes at their real times over the whole song (engine transcribeTrack)
 *   pattern      the 4-bar hook / bassline repeated over the song exactly as the full-song MIDI writes it (domain.songNotes), placed
 *                with firstDown + step * barSec / 16, which is where those MIDI notes land against the lined-up audio
 * Per-section rows show where repetition cannot follow the music (a changed melody, a silent passage, tempo drift).
 *   node bench/melody-track.js <predictions.json> <manifest.json> [--json] [--check]
 *   --check  fail unless, on every track with lead truth, transcribed beats pattern overall on lead pitch+onset F, and transcribed
 *            reaches 0.8 on a constant-tempo track. Used by CI on test-songs/melody-fixtures (reported set, not a Version A gate). */
"use strict";
const fs = require("node:fs"), path = require("node:path");
const { loadTruth } = require("./lib/loaders"), { noteScores } = require("./lib/transcription");
const TM = require("../src/timemap"), D = require("../src/domain")({ TimingStore: require("../src/timing-store"), engine: require("../src/engine")({ TimeMap: TM }) });
const [predsArg, manArg] = process.argv.slice(2).filter(a => !a.startsWith("--")), JSONOUT = process.argv.includes("--json"), CHECK = process.argv.includes("--check");
if (!predsArg || !manArg) { console.error("usage: node bench/melody-track.js <predictions.json> <manifest.json> [--json] [--check]"); process.exit(2); }
const P = JSON.parse(fs.readFileSync(predsArg, "utf8")), man = JSON.parse(fs.readFileSync(manArg, "utf8")), mdir = path.dirname(path.resolve(manArg));
const F = s => s.pitchOnset.F, rows = [], problems = [];
for (const rec of P.tracks) {
  if (rec.status !== "ok") continue; const t = man.tracks.find(x => x.id === rec.id); if (!t) continue;
  const T = loadTruth(t, mdir), a = Object.assign({}, rec.full); a.grid = rec.grid; const tr = a.transcription;
  const N = D.songNotes(a), fd = a.firstDown || 0, st = a.barSec / 16, place = ns => ns.map(n => ({ onset: fd + n.t * st, offset: fd + (n.t + n.dur) * st, midi: n.midi }));
  const G = TM.forAnalysis(a), secs = a.sections.map(s => ({ label: s.label, startBar: s.startBar, bars: s.bars, lo: G.barStart(s.startBar), hi: G.barStart(s.startBar + s.bars) }));
  for (const [part, ref, full, pat] of [["lead", T.melody_lead, tr && tr.lead, N.hook], ["bass", T.bass, tr && tr.bass, N.bass]]) {
    if (!ref || !ref.length) continue;
    const est = full ? full.map(n => ({ onset: n.on, offset: n.off, midi: n.midi })) : null, pe = place(pat);
    const row = { id: rec.id, part, nRef: ref.length, transcribed: est ? noteScores(est, ref) : null, pattern: noteScores(pe, ref), sections: [] };
    // per span of the truth's own structure: 4-bar windows on the truth's downbeats (the generator's sections are multiples of 4 bars)
    const downs = (T.downbeats || T.beats.filter(b => b.pos === 1).map(b => b.t) || []).map(d => typeof d === "number" ? d : d.t);
    for (let k = 0; k + 4 <= downs.length; k += 4) { const lo = downs[k], hi = k + 4 < downs.length ? downs[k + 4] : Infinity, inn = n => n.onset >= lo - 0.03 && n.onset < hi - 0.03;
      const r = ref.filter(inn); row.sections.push({ bars: `${k + 1}-${k + 4}`, nRef: r.length, transcribed: est ? F(noteScores(est.filter(inn), r)) : null, pattern: F(noteScores(pe.filter(inn), r)), estT: est ? est.filter(inn).length : null, estP: pe.filter(inn).length }); }
    rows.push(row);
    if (CHECK && part === "lead") {
      if (!est) problems.push(`${rec.id}: no full-track transcription`);
      else { if (!(F(row.transcribed) > F(row.pattern))) problems.push(`${rec.id}: transcribed lead F ${F(row.transcribed)} does not beat the repeated pattern's ${F(row.pattern)}`);
        if (/constant/.test((t.tags || {}).tempo_behaviour || "") && F(row.transcribed) < 0.8) problems.push(`${rec.id}: transcribed lead F ${F(row.transcribed)} under 0.8 on a constant-tempo track`); }
    }
  }
}
if (JSONOUT) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) {
  console.log(`${r.id} ${r.part}: ${r.nRef} notes | transcribed pitch+onset F ${r.transcribed ? F(r.transcribed) : "n/a"} (onset ${r.transcribed ? r.transcribed.onset.F : "-"}, octave errors ${r.transcribed ? r.transcribed.octave.rate : "-"}) | repeated pattern ${F(r.pattern)}`);
  console.log("   bars    ref  transcribed(est)  pattern(est)"); for (const s of r.sections) console.log(`   ${s.bars.padEnd(7)} ${String(s.nRef).padStart(3)}  ${String(s.transcribed).padStart(7)} (${s.estT})     ${String(s.pattern).padStart(6)} (${s.estP})`);
}
if (CHECK) { if (problems.length) { console.error("melody-track check FAILED:\n  " + problems.join("\n  ")); process.exit(1); } console.log(`melody-track check passed (${rows.filter(r => r.part === "lead").length} lead tracks)`); }
