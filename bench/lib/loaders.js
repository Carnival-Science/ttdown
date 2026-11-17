// Annotation file loaders. Plain text, one item per line, whitespace/comma/tab separated, '#' at line start or after a space starts a comment (so "F# minor" is safe).
// Formats follow mir_eval / Sonic Visualiser exports so annotators can use standard tools.
//   beats   : time [beat-in-bar]           (beat-in-bar 1 = downbeat; without it, downbeats are "not annotated")
//             gap start end reason          (declared uncertain span; see beats() below)
//   key     : "<Tonic> <mode>"             (major/minor scored; dorian, phrygian, ... , atonal, ambiguous kept as labels)
//   chords  : start end label              (Harte syntax, N = no chord, X = unknown)
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
function beats(file) {
  const all = rows(file);
  // gap lines are re-read from the raw text so the reason keeps its punctuation (rows() splits on commas)
  const gaps = fs.readFileSync(file, "utf8").split(/\r?\n/).map(l => l.replace(/(^|\s)#.*/, "").trim()).map(l => /^gap[\s,]+(\S+?)[\s,]+(\S+?)(?:[\s,]+(.*))?$/i.exec(l)).filter(Boolean)
    .map(m => ({ start: num(m[1], file), end: num(m[2], file), reason: (m[3] || "").trim() || null })).sort((a, b) => a.start - b.start);
  const R = all.filter(r => r[0].toLowerCase() !== "gap").map(r => ({ t: num(r[0], file), pos: r[1] != null ? Number(r[1]) : null })).sort((a, b) => a.t - b.t);
  const hasPos = R.length > 0 && R.every(r => Number.isFinite(r.pos));
  return { beats: R.map(r => r.t), positions: hasPos ? R.map(r => r.pos) : null, downbeats: hasPos ? R.filter(r => r.pos === 1).map(r => r.t) : null, gaps };
}

// Continuity check. A hole longer than 1.75x the local beat interval must be covered by a declared gap; beats may not
// sit inside a declared gap; gaps must be well-formed and must not overlap.
function validateBeats(B, { factor = 1.75 } = {}) {
  const problems = [], t = B.beats, gaps = B.gaps || [];
  gaps.forEach((g, i) => { if (!(g.end > g.start)) problems.push(`gap ${g.start}-${g.end}: end must be after start`); if (!g.reason) problems.push(`gap ${g.start}-${g.end}: give a reason`); if (i && g.start < gaps[i - 1].end) problems.push(`gap ${g.start}-${g.end}: overlaps the previous gap`); });
  for (const x of t) if (gaps.some(g => x > g.start && x < g.end)) problems.push(`beat at ${x} s lies inside a declared gap`);
  const I = t.slice(1).map((x, i) => x - t[i]), med = a => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
  for (let i = 0; i < I.length; i++) {
    const local = med(I.slice(Math.max(0, i - 8), i).concat(I.slice(i + 1, i + 9)));
    if (local && I[i] > factor * local && !gaps.some(g => g.start >= t[i] - 1e-6 && g.end <= t[i + 1] + 1e-6))
      problems.push(`undeclared gap ${t[i].toFixed(3)}-${t[i + 1].toFixed(3)} s (${(I[i] / local).toFixed(1)}x the local beat interval); annotate the beats or declare "gap <start> <end> <reason>"`);
  }
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

function notes(file) { return rows(file).map(r => ({ onset: num(r[0], file), offset: num(r[1], file), midi: Math.round(num(r[2], file)) })).sort((a, b) => a.onset - b.onset); }

// Load every annotation a manifest track lists; paths are relative to the manifest file.
function loadTruth(track, manifestDir) {
  const A = track.annotations || {}, p = k => path.resolve(manifestDir, A[k]), T = { tempo: track.tempo != null ? Number(track.tempo) : null };
  if (A.beats) Object.assign(T, beats(p("beats")));
  if (A.key) T.key = key(p("key"));
  if (A.chords) T.chords = chords(p("chords"));
  if (A.drums) T.drums = drums(p("drums"));
  if (A.bass) T.bass = notes(p("bass"));
  if (T.tempo == null && T.beats && T.beats.length > 2) { // tempo from the median inter-beat interval
    const d = T.beats.slice(1).map((t, i) => t - T.beats[i]).sort((a, b) => a - b); T.tempo = 60 / d[Math.floor(d.length / 2)]; T.tempoDerived = true;
  }
  return T;
}

module.exports = { beats, validateBeats, key, chords, drums, notes, loadTruth, pitchClass };
