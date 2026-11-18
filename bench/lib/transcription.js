// Note-level and frame-level scoring of melody transcriptions (vocal melody and instrumental lead). Pure functions, no I/O.
//
// Notes are { onset, offset, midi, tags? } in seconds and (possibly fractional) MIDI numbers. Matching is one-to-one and
// MAXIMUM-cardinality (see tests/metrics.js), with mir_eval's rules (mir_eval.transcription 0.8.2):
//   onset  : |onset_est - onset_ref| <= onsetTol            (distances rounded to 4 decimals first, as mir_eval does)
//   pitch  : |1200 * log2(f_est / f_ref)| <= pitchTolCents  (f = 440 * 2^((midi - 69) / 12))
//   offset : |offset_est - offset_ref| <= max(offsetRatio * ref_duration, offsetMinTol)
// Three scores, each P / R / F over the whole matching, so "right rhythm, wrong notes" cannot hide:
//   onset      onset only                        (the old "hook" metric was like this; it ignores pitch and duration)
//   pitchOnset onset + pitch                     (mir_eval precision_recall_f1_overlap with offset_ratio=None)
//   full       onset + pitch + offset            (mir_eval precision_recall_f1_overlap defaults, "offset-aware")
// plus average overlap ratio of the full matches (informational: it depends on which of several equally large matchings is chosen), offset and duration errors, octave errors, fragmentation and merged notes.
//
// Vacuous is not perfect: nothing annotated AND nothing predicted gives null scores (never 1.0). Predictions against an annotated
// but empty reference are false positives (F 0).
//
// Frame scores (frameScores) follow mir_eval.melody: voicing recall, voicing false alarm, raw pitch accuracy, raw chroma accuracy
// and overall accuracy, on one shared constant-hop time grid so no resampling is involved. Notes are turned into frames by the
// monophonic rule documented there. mir_eval returns 0 / 1 for degenerate cases (no voiced reference frames); here they are null.
"use strict";
const { match } = require("../../tests/metrics");

const DEFAULTS = Object.freeze({ onsetTol: 0.05, pitchTolCents: 50, offsetRatio: 0.2, offsetMinTol: 0.05, hop: 0.01, frameCentsTol: 50, overlapShare: 0.5 });
const r4 = v => v == null || !Number.isFinite(v) ? null : +v.toFixed(4);
const round4 = x => Math.round(x * 1e4) / 1e4;           // mir_eval rounds distances to 4 decimals before comparing
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const cents = (a, b) => 1200 * (Math.log2(hz(a)) - Math.log2(hz(b))); // signed, est relative to ref; same arithmetic as mir_eval (1200 * (log2 f_ref - log2 f_est)) so a pitch exactly on the tolerance edge falls on the same side
const dur = n => n.offset - n.onset;
const prf = (tp, nEst, nRef) => {
  if (nEst === 0 && nRef === 0) return { tp: 0, fp: 0, fn: 0, P: null, R: null, F: null, vacuous: true };
  const P = nEst ? tp / nEst : 0, R = nRef ? tp / nRef : 0;
  return { tp, fp: nEst - tp, fn: nRef - tp, P: r4(P), R: r4(R), F: r4(P + R ? 2 * P * R / (P + R) : 0), vacuous: false };
};
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

/** One-to-one matching of est to ref notes under the chosen rules. Returns [[estIdx, refIdx], ...]. */
function matchNotes(est, ref, cfg, { pitch = true, offset = true } = {}) {
  const win = cfg.onsetTol;
  return match(est.map(n => n.onset), ref.map(n => n.onset), win + 1e-6, (e, r) => {
    if (round4(Math.abs(est[e].onset - ref[r].onset)) > win) return false;
    if (pitch && Math.abs(cents(est[e].midi, ref[r].midi)) > cfg.pitchTolCents) return false;
    if (offset && round4(Math.abs(est[e].offset - ref[r].offset)) > Math.max(cfg.offsetRatio * dur(ref[r]), cfg.offsetMinTol)) return false;
    return true;
  }).map(m => [m[0], m[1]]);
}
const overlap = (a, b) => Math.max(0, Math.min(a.offset, b.offset) - Math.max(a.onset, b.onset));
const samePitch = (a, b, cfg) => Math.abs(cents(a.midi, b.midi)) <= cfg.pitchTolCents;

/**
 * Score estimated notes against reference notes.
 * Reference tags: "unpitched" (a vocal consonant or noise burst: not a pitched note, never a false negative, and an estimate that
 * lands on it is ignored rather than a false positive); "ambiguous" (the annotators could not agree: reported as a lenient variant
 * in which an unmatched ambiguous reference note is not a miss; matches still count).
 */
function noteScores(estAll, refAll, config = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const unp = refAll.filter(n => (n.tags || []).includes("unpitched")), ref = refAll.filter(n => !(n.tags || []).includes("unpitched"));
  // estimates that sit on an unpitched reference note (and match no pitched one) are ignored, not charged
  const preMatch = new Set(matchNotes(estAll, ref, cfg, { pitch: false, offset: false }).map(m => m[0]));
  const ignored = new Set(); estAll.forEach((n, i) => { if (!preMatch.has(i) && unp.some(u => n.onset >= u.onset - cfg.onsetTol && n.onset <= u.offset)) ignored.add(i); });
  const est = estAll.filter((_, i) => !ignored.has(i));
  const out = { config: { onsetTol: cfg.onsetTol, pitchTolCents: cfg.pitchTolCents, offsetRatio: cfg.offsetRatio, offsetMinTol: cfg.offsetMinTol }, nRef: ref.length, nEst: est.length, ignoredUnpitched: ignored.size, unpitchedRef: unp.length };
  if (!ref.length && !est.length) return { ...out, vacuous: true, onset: prf(0, 0, 0), pitchOnset: prf(0, 0, 0), full: prf(0, 0, 0), avgOverlap: null, offsetErrorMs: null, durationRatio: null, octave: null, fragmentation: null, merged: null, lenient: null };
  const mo = matchNotes(est, ref, cfg, { pitch: false, offset: false }), mp = matchNotes(est, ref, cfg, { pitch: true, offset: false }), mf = matchNotes(est, ref, cfg, { pitch: true, offset: true });
  out.vacuous = false; out.onset = prf(mo.length, est.length, ref.length); out.pitchOnset = prf(mp.length, est.length, ref.length); out.full = prf(mf.length, est.length, ref.length);
  out.avgOverlap = mf.length ? r4(mf.reduce((s, [e, r]) => s + (Math.min(est[e].offset, ref[r].offset) - Math.max(est[e].onset, ref[r].onset)) / (Math.max(est[e].offset, ref[r].offset) - Math.min(est[e].onset, ref[r].onset)), 0) / mf.length) : null;
  // duration and offset errors, on the notes whose onset and pitch were right
  const offErr = mp.map(([e, r]) => 1000 * (est[e].offset - ref[r].offset)), ratio = mp.map(([e, r]) => dur(est[e]) / dur(ref[r]));
  out.offsetErrorMs = mp.length ? { n: mp.length, medianAbs: r4(median(offErr.map(Math.abs))), median: r4(median(offErr)) } : null;
  out.durationRatio = mp.length ? { n: mp.length, median: r4(median(ratio)) } : null;
  // octave errors: right onset, wrong pitch by whole octaves
  const wrong = mo.filter(([e, r]) => Math.abs(cents(est[e].midi, ref[r].midi)) > cfg.pitchTolCents);
  const oct = wrong.filter(([e, r]) => { const c = cents(est[e].midi, ref[r].midi), k = Math.round(c / 1200); return k !== 0 && Math.abs(c - 1200 * k) <= cfg.pitchTolCents; });
  out.octave = { onsetMatched: mo.length, wrongPitch: wrong.length, octaveErrors: oct.length, rate: mo.length ? r4(oct.length / mo.length) : null };
  // fragmentation: a reference note covered by 2+ estimates of the same pitch (each mostly inside it); merged: one estimate covering 2+ same-pitch reference notes
  const share = (a, b) => overlap(a, b) / Math.min(dur(a), dur(b));
  const frag = ref.filter(r => est.filter(e => samePitch(e, r, cfg) && share(e, r) >= cfg.overlapShare).length >= 2).length;
  const merged = est.filter(e => ref.filter(r => samePitch(e, r, cfg) && share(e, r) >= cfg.overlapShare).length >= 2).length;
  out.fragmentation = { refNotesFragmented: frag, rate: ref.length ? r4(frag / ref.length) : null }; out.merged = { estNotesMerged: merged, rate: est.length ? r4(merged / est.length) : null };
  // lenient variant for ambiguous reference notes: an unmatched ambiguous note is not a miss
  const amb = new Set(); ref.forEach((n, i) => { if ((n.tags || []).includes("ambiguous")) amb.add(i); });
  const lenient = (m, nEst) => { const matched = new Set(m.map(x => x[1])), nRefL = ref.length - [...amb].filter(i => !matched.has(i)).length; return prf(m.length, nEst, nRefL); };
  out.lenient = amb.size ? { ambiguousRef: amb.size, pitchOnset: lenient(mp, est.length), full: lenient(mf, est.length) } : null;
  return out;
}

// ---- frames ----
const toCents = f => f > 0 ? 1200 * Math.log2(f / 10) : 0;      // mir_eval hz2cents (base 10 Hz); 0 = unvoiced
/** Frame times 0, hop, 2*hop, ... inside [lo, hi): the same grid for reference and estimate. */
function gridTimes(lo, hi, hop) { const t = []; for (let k = Math.ceil(lo / hop - 1e-9); k * hop < hi - 1e-9; k++) t.push(k * hop); return t; }
/** Monophonic notes to frame frequencies: a frame is voiced if a note covers it; if notes overlap, the latest onset wins. Returns Hz (0 = unvoiced). */
function notesToFrames(notes, times) {
  const ns = notes.slice().sort((a, b) => a.onset - b.onset), f = new Array(times.length).fill(0); let j = 0, active = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i]; while (j < ns.length && ns[j].onset <= t) active.push(ns[j++]);
    active = active.filter(n => n.offset > t); f[i] = active.length ? hz(active[active.length - 1].midi) : 0;
  }
  return f;
}
/** An f0 series [{t, hz}] (hz <= 0 unvoiced) to the grid: the last sample at or before the frame; unvoiced if that sample is older than 2.5 median spacings. */
function seriesToFrames(series, times) {
  const s = series.slice().sort((a, b) => a.t - b.t), sp = median(s.slice(1).map((x, i) => x.t - s[i].t)) || 0.01, f = new Array(times.length).fill(0); let j = -1;
  for (let i = 0; i < times.length; i++) { while (j + 1 < s.length && s[j + 1].t <= times[i] + 1e-12) j++; f[i] = j >= 0 && times[i] - s[j].t <= 2.5 * sp && s[j].hz > 0 ? s[j].hz : 0; }
  return f;
}
/** mir_eval.melody measures on two aligned frame series (Hz, 0 = unvoiced). */
function frameMeasures(refHz, estHz, centsTol = DEFAULTS.frameCentsTol) {
  const n = refHz.length, rc = refHz.map(toCents), ec = estHz.map(toCents);
  let rv = 0, uv = 0, hit = 0, fa = 0, rpa = 0, rca = 0, oa = 0;
  for (let i = 0; i < n; i++) {
    const R = refHz[i] > 0, E = estHz[i] > 0; if (R) rv++; else uv++;
    if (R && E) hit++; if (!R && E) fa++;
    if (R && E) { const d = Math.abs(rc[i] - ec[i]); if (d < centsTol) rpa++; const o = 1200 * Math.floor(d / 1200 + 0.5); if (Math.abs(d - o) < centsTol) rca++; if (d < centsTol) oa++; }
    if (!R && !E) oa++;
  }
  return { frames: n, refVoiced: rv, refUnvoiced: uv, voicingRecall: rv ? r4(hit / rv) : null, voicingFalseAlarm: uv ? r4(fa / uv) : null, rawPitchAccuracy: rv ? r4(rpa / rv) : null, rawChromaAccuracy: rv ? r4(rca / rv) : null, overallAccuracy: n ? r4(oa / n) : null, vacuous: n === 0 || (rv === 0 && !estHz.some(h => h > 0)) };
}
/** Frame scores for estimated notes against reference notes or an f0 series, over [lo, hi) (default the whole [0, duration)). */
function frameScores(estNotes, ref, { duration, regions = null, hop = DEFAULTS.hop, centsTol = DEFAULTS.frameCentsTol } = {}) {
  let times = gridTimes(0, duration, hop); if (regions) times = times.filter(t => regions.some(r => t >= r.start && t < r.end));
  const refHz = ref.series ? seriesToFrames(ref.series, times) : notesToFrames(ref.notes, times), estHz = notesToFrames(estNotes, times);
  return { hop, centsTol, ...frameMeasures(refHz, estHz, centsTol) };
}

module.exports = { DEFAULTS, noteScores, frameScores, frameMeasures, notesToFrames, seriesToFrames, gridTimes, matchNotes, hz, cents, toCents };
