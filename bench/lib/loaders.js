// Annotation file loaders. Plain text, one item per line, whitespace/comma/tab separated, '#' at line start or after a space starts a comment (so "F# minor" is safe).
// Formats follow mir_eval / Sonic Visualiser exports so annotators can use standard tools.
//   beats   : time [beat-in-bar]           (beat-in-bar 1 = downbeat; without it, downbeats are "not annotated")
//             gap start end reason          (declared uncertain span; see beats() below)
//             tempo-change time note        (a real tempo change; beats stay continuous)
//   key     : "<Tonic> <mode>"             (major/minor scored; dorian, phrygian, ... , atonal, ambiguous kept as labels)
//   chords  : start end label              (Harte syntax, N = no chord, X = unknown)
//   melody_vocal, melody_lead : onset offset midi [tag ...]   vocal melody / instrumental lead notes, MIDI number (fractional = cents).
//             Tags: unpitched (a consonant or noise burst: not a pitched note), ambiguous (annotators disagreed). An annotation file
//             with no notes is an annotated absence (declare it with "silent" for the region, see bench/lib/regions.js).
//   melody_vocal_f0, melody_lead_f0 : time hz       optional frame-level f0 (hz <= 0 = unvoiced), enables raw pitch/chroma accuracy
//   sections: start end label              (arrangement; boundaries are scored, labels are kept but not scored yet)
//   drums   : time class                   (kick|bd, snare|sd|clap|cp|rim, hihat|hh|chh|ohh|openhat|closedhat)
//   bass    : onset offset midi
"use strict";
const fs = require("node:fs"), path = require("node:path");

// a comment is '#' at line start or after whitespace; a '#' inside a token (F#, C#:min) is a sharp
const rows = file => fs.readFileSync(file, "utf8").split(/\r?\n/).map(l => l.replace(/(^|\s)#.*/, "").trim()).filter(Boolean).map(l => l.split(/[\s,]+/));
const num = (v, file) => { const x = Number(v); if (!Number.isFinite(x)) throw new Error(`${file}: not a number: ${v}`); return x; };

// Beats must be continuous inside scorable regions. Where the pulse can't be verified (drumless breakdown,
// free-time intro, ambiguous metre) the annotator declares it:   gap <start> <end> <reason...>
// Gaps are never filled with interpolated beats: beat-based metrics restart after a gap, and predictions inside a
// gap are not scored. An unexplained hole between beats is an annotation error (validateBeats), not a gap.
// A legitimate tempo change is NOT a gap: the beats stay continuous. The annotator declares where it happens:
//   tempo-change <time> <note...>
// so the continuity check compares each beat interval only with intervals at the same tempo.
const special = (file, word) => fs.readFileSync(file, "utf8").split(/\r?\n/).map(l => l.replace(/(^|\s)#.*/, "").trim()) // re-read raw text so notes keep punctuation
  .map(l => new RegExp(`^${word}[\\s,]+(.*)$`, "i").exec(l)).filter(Boolean).map(m => m[1]);
function beats(file) {
  const all = rows(file), isData = r => !/^(gap|tempo-change)$/i.test(r[0]);
  const gaps = special(file, "gap").map(s => /^(\S+?)[\s,]+(\S+?)(?:[\s,]+(.*))?$/.exec(s) || []).map(m => ({ start: num(m[1], file), end: num(m[2], file), reason: (m[3] || "").trim() || null })).sort((a, b) => a.start - b.start);
  const tempoChanges = special(file, "tempo-change").map(s => /^(\S+?)(?:[\s,]+(.*))?$/.exec(s)).map(m => ({ t: num(m[1], file), note: (m[2] || "").trim() || null })).sort((a, b) => a.t - b.t);
  const R = all.filter(isData).map(r => ({ t: num(r[0], file), pos: r[1] != null ? Number(r[1]) : null })).sort((a, b) => a.t - b.t);
  const hasPos = R.length > 0 && R.every(r => Number.isFinite(r.pos));
  return { beats: R.map(r => r.t), positions: hasPos ? R.map(r => r.pos) : null, downbeats: hasPos ? R.filter(r => r.pos === 1).map(r => r.t) : null, gaps, tempoChanges };
}

// Every beat interval: is it a hole (> factor x the local interval at the same tempo), and is a gap declared there?
// "Same tempo" = intervals on the same side of every declared tempo change (by interval midpoint). Shared by
// validateBeats and metrics.phaseDrift so both read the annotation the same way.
function beatIntervals(times, gaps = [], tempoChanges = [], factor = 1.75) {
  const t = times, I = t.slice(1).map((x, i) => x - t[i]), ch = tempoChanges.map(c => c.t);
  const region = I.map((_, i) => ch.filter(c => c <= (t[i] + t[i + 1]) / 2).length);
  const med = a => a.length ? a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)] : null;
  return I.map((iv, i) => {
    const near = []; for (let j = i - 1; j >= 0 && near.length < 8; j--) if (region[j] === region[i]) near.push(I[j]);
    for (let j = i + 1, k = 0; j < I.length && k < 8; j++) if (region[j] === region[i]) { near.push(I[j]); k++; }
    const local = med(near);
    return { start: t[i], end: t[i + 1], ratio: local ? iv / local : null, hole: !!local && iv > factor * local,
      declaredGap: gaps.some(g => g.start >= t[i] - 1e-6 && g.end <= t[i + 1] + 1e-6) };
  });
}

// Continuity check. A hole longer than 1.75x the local beat interval (at the same tempo) must be covered by a declared
// gap; beats may not sit inside a gap; gaps need a reason and must not overlap; tempo changes need a note.
// G1a records every flagged hole and how it was resolved (gap, tempo change, or annotation fix) in the QA log.
function validateBeats(B, { factor = 1.75 } = {}) {
  const problems = [], t = B.beats, gaps = B.gaps || [], tc = B.tempoChanges || [];
  gaps.forEach((g, i) => { if (!(g.end > g.start)) problems.push(`gap ${g.start}-${g.end}: end must be after start`); if (!g.reason) problems.push(`gap ${g.start}-${g.end}: give a reason`); if (i && g.start < gaps[i - 1].end) problems.push(`gap ${g.start}-${g.end}: overlaps the previous gap`); });
  tc.forEach(c => { if (!c.note) problems.push(`tempo-change ${c.t}: give a note (e.g. "128 -> 64 BPM halftime breakdown")`); if (gaps.some(g => c.t > g.start && c.t < g.end)) problems.push(`tempo-change ${c.t}: inside a declared gap`); });
  for (const x of t) if (gaps.some(g => x > g.start && x < g.end)) problems.push(`beat at ${x} s lies inside a declared gap`);
  for (const h of beatIntervals(t, gaps, tc, factor)) if (h.hole && !h.declaredGap)
    problems.push(`undeclared gap ${h.start.toFixed(3)}-${h.end.toFixed(3)} s (${h.ratio.toFixed(1)}x the local beat interval); annotate the missing beats, declare "gap <start> <end> <reason>", or, if the tempo really changes here, declare "tempo-change <time> <note>"`);
  return problems;
}

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function pitchClass(name) { // "C", "F#", "Bb", "C##"
  const m = /^([A-Ga-g])([#b]*)$/.exec(String(name || "").trim()); if (!m) return null;
  let pc = NOTE[m[1].toUpperCase()]; for (const c of m[2]) pc += c === "#" ? 1 : -1; return ((pc % 12) + 12) % 12;
}
function key(file) {
  const line = rows(file)[0] || [];
  const tonic = pitchClass(line[0]), mode = (line[1] || "").toLowerCase();
  const label = line.join(" ");
  if (tonic == null) return { label, tonic: null, mode: (line[0] || "").toLowerCase(), scorable: false }; // "atonal", "ambiguous"
  return { label, tonic, mode, scorable: mode === "major" || mode === "minor" };
}

function chords(file) { return rows(file).map(r => ({ start: num(r[0], file), end: num(r[1], file), label: r.slice(2).join(" ") || "N" })).sort((a, b) => a.start - b.start); }

const DRUM = { kick: "kick", bd: "kick", snare: "snare", sd: "snare", clap: "snare", cp: "snare", rim: "snare",
  hihat: "hihat", hh: "hihat", chh: "hihat", ohh: "hihat", openhat: "hihat", closedhat: "hihat" };
function drums(file) {
  const out = { kick: [], snare: [], hihat: [], other: 0 };
  for (const r of rows(file)) { const c = DRUM[(r[1] || "").toLowerCase()]; if (c) out[c].push(num(r[0], file)); else out.other++; }
  for (const c of ["kick", "snare", "hihat"]) out[c].sort((a, b) => a - b);
  return out;
}

const MELODY_TAGS = new Set(["unpitched", "ambiguous"]);
function melodyNotes(file) {
  return rows(file).map(r => {
    const n = { onset: num(r[0], file), offset: num(r[1], file), midi: num(r[2], file), tags: r.slice(3).map(x => x.toLowerCase()) };
    if (!(n.offset > n.onset)) throw new Error(`${file}: note must end after it starts (${r[0]} ${r[1]})`);
    if (!(n.midi >= 0 && n.midi <= 127)) throw new Error(`${file}: MIDI pitch out of range 0..127: ${r[2]}`);
    for (const t of n.tags) if (!MELODY_TAGS.has(t)) throw new Error(`${file}: unknown tag "${t}" (use unpitched or ambiguous)`);
    return n;
  }).sort((a, b) => a.onset - b.onset || a.midi - b.midi);
}
function f0Series(file) { return rows(file).map(r => ({ t: num(r[0], file), hz: num(r[1], file) })).sort((a, b) => a.t - b.t); }
function notes(file) { return rows(file).map(r => ({ onset: num(r[0], file), offset: num(r[1], file), midi: Math.round(num(r[2], file)) })).sort((a, b) => a.onset - b.onset); }

// Load every annotation a manifest track lists; paths are relative to the manifest file.
function loadTruth(track, manifestDir) {
  const A = track.annotations || {}, p = k => path.resolve(manifestDir, A[k]), T = { tempo: track.tempo != null ? Number(track.tempo) : null };
  if (A.beats) Object.assign(T, beats(p("beats")));
  if (A.key) T.key = key(p("key"));
  if (A.chords) T.chords = chords(p("chords"));
  if (A.sections) T.sections = chords(p("sections")); // same start/end/label format
  if (A.drums) T.drums = drums(p("drums"));
  if (A.bass) T.bass = notes(p("bass"));
  for (const k of ["melody_vocal", "melody_lead"]) { if (A[k]) T[k] = melodyNotes(p(k)); if (A[k + "_f0"]) T[k + "_f0"] = f0Series(p(k + "_f0")); }
  if (T.tempo == null && T.beats && T.beats.length > 2) { // tempo from the median inter-beat interval
    const d = T.beats.slice(1).map((t, i) => t - T.beats[i]).sort((a, b) => a - b); T.tempo = 60 / d[Math.floor(d.length / 2)]; T.tempoDerived = true;
  }
  return T;
}

module.exports = { beats, beatIntervals, validateBeats, key, chords, drums, notes, melodyNotes, f0Series, loadTruth, pitchClass };
