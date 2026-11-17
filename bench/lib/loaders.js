// Annotation file loaders. Plain text, one item per line, whitespace/comma/tab separated, '#' at line start or after a space starts a comment (so "F# minor" is safe).
// Formats follow mir_eval / Sonic Visualiser exports so annotators can use standard tools.
//   beats   : time [beat-in-bar]           (beat-in-bar 1 = downbeat; without it, downbeats are "not annotated")
//   key     : "<Tonic> <mode>"             (major/minor scored; dorian, phrygian, ... , atonal, ambiguous kept as labels)
//   chords  : start end label              (Harte syntax, N = no chord, X = unknown)
//   drums   : time class                   (kick|bd, snare|sd|clap|cp|rim, hihat|hh|chh|ohh|openhat|closedhat)
//   bass    : onset offset midi
"use strict";
const fs = require("node:fs"), path = require("node:path");

// a comment is '#' at line start or after whitespace; a '#' inside a token (F#, C#:min) is a sharp
const rows = file => fs.readFileSync(file, "utf8").split(/\r?\n/).map(l => l.replace(/(^|\s)#.*/, "").trim()).filter(Boolean).map(l => l.split(/[\s,]+/));
const num = (v, file) => { const x = Number(v); if (!Number.isFinite(x)) throw new Error(`${file}: not a number: ${v}`); return x; };

function beats(file) {
  const R = rows(file).map(r => ({ t: num(r[0], file), pos: r[1] != null ? Number(r[1]) : null })).sort((a, b) => a.t - b.t);
  const hasPos = R.length > 0 && R.every(r => Number.isFinite(r.pos));
  return { beats: R.map(r => r.t), positions: hasPos ? R.map(r => r.pos) : null, downbeats: hasPos ? R.filter(r => r.pos === 1).map(r => r.t) : null };
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

module.exports = { beats, key, chords, drums, notes, loadTruth, pitchClass };
