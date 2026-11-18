# TimeMap: the musical time model

`src/timemap.js`: one module that answers "when, in the audio, is this musical position?" and "what musical position is this audio time?", and records **how well each answer is known**. It is a plain classic script (no ES modules, no DOM), so it loads in Node with `require` and in `index.html` with `<script src>` from `file://` as well as from a server.

Status: **additive, not yet used by the analyzer or the UI** (Phase 2a). Nothing in `index.html` changed; the benchmark, parity and gates are unaffected. Consumers (sections, chords, drum/bass/melody events, overlays, exports) move onto it in later PRs, one at a time, each measured against Version A (`docs/BASELINE_A.md`).

## Model

- **Time** is audio seconds (`timeToSample` / `sampleToTime` convert).
- **Musical coordinate** `beat` (q) is a float number of beats from bar 1 beat 1. Integer q sits on tracked beats; between beats it is linearly interpolated, so the map follows drift and tempo changes. A pickup has q < 0 and lies in bar -1. `bar` is 0-based. Before the first / after the last tracked beat, positions are extrapolated from the nearest beats and flagged `extrapolated: true`.
- `timeToBeat` and `beatToTime` are exact inverses everywhere.

## What is measured, inferred, corrected, unknown

| Element | Where it is recorded | Values |
|---|---|---|
| Each beat | `src[i]` | `measured` (tracker), `user`, `fallback-grid` |
| Whole map | `source` | `tracker`, `fallback-grid` |
| Downbeat (bar 1) | `downbeat.status` | `measured`, `user`, `unknown` |
| Meter | `meter.status` | `measured` (regular downbeat spacing), `assumed` (the analyzer hard-codes 4/4), `user`, `ambiguous`, `unsupported` |
| Tempo | `tempo()` | median/min/max, `isConstant`, `segments`, `changes`, `hypotheses` |
| Tempo alternatives | `tempo().hypotheses` | half and double listed with `score: null, calibrated: false`. They are possibilities, **not probabilities**. |
| User corrections | `corrections[]` | `{ type, from, to, source: "user", at }`; `original()` returns the untouched machine result |

If the downbeat is unknown or the meter is `ambiguous` / `unsupported`, there is **no bar layer**: `bar` and `beatInBar` are `null`, `bars()` is empty. It never falls back to forcing 4/4.

A fixed constant-BPM grid is only available through `fromConstantGrid` (for a saved result with no tracked beats). Every beat is tagged `fallback-grid`, `measured` is false, and `position().source` says so.

## Interface

```js
const TM = require("./src/timemap");            // or window.TimeMap
const m = TM.fromGrid({ beats, downbeats }, { duration, meter: { beatsPerBar: 4, status: "assumed" } }); // analyzer's result.grid
const f = TM.fromConstantGrid({ bpm, firstDownbeat, duration, beatsPerBar: 4 });                       // labelled fallback
const r = TM.fromJSON(JSON.parse(JSON.stringify(m)));                                                    // lossless

m.timeToBeat(t); m.beatToTime(q); m.position(t);   // { beat, bar, beatInBar, extrapolated, source }
m.barStart(bar); m.bars();                          // bars overlapping [0, duration]
m.quantize(t, perBeat = 4);                         // { beat, t, deviation }: explicit, keeps the groove
m.tempo(); m.tempoAt(t); m.tempoCurve();
m.exportEligibility();                              // { eligible, verified, grade, reasons, caveats }
m.withDownbeat(t); m.withMeter(n); m.withMeterUnsupported(note);   // return a NEW map; originals untouched
m.fingerprint();                                    // changes whenever anything a derived result depends on changes
```

Errors are `TimeMapError` with a `code` (`too-few-beats`, `bad-beats`, `bad-duration`, `bad-meter`, `fingerprint-mismatch`, ...). Bad input is rejected, never repaired.

## Staleness

Derived results (chords, sections, MIDI) should store the `fingerprint()` of the map they were computed from. After a correction the fingerprint differs, so a result with the old one is stale and must be recomputed or hidden, not shown as valid. Wiring this into the UI is Phase 2d.

## Export gating

`exportEligibility()` refuses (`eligible: false`) for an unknown downbeat, `ambiguous`/`unsupported` meter, a meter other than 4/4, any tempo change or non-constant tempo, and **tempo drift**: a steady-looking tempo where the best single constant tempo (`tempo().constantGrid`) still misses a tracked beat by more than `gridTolerance` (20 ms). It names the reasons. It adds a caveat when the tracked beats end more than 8 s before the audio does (the rest is extrapolated). For tracked constant-tempo 4/4 it returns `eligible: true`. `verified` is `true` only when the meter and downbeat are measured or user-confirmed; with the analyzer's assumed 4/4 it is `false` with the caveat "meter is assumed to be 4/4, not measured". **Decision needed:** whether the product should allow export with that caveat (current default of this module) or require user confirmation first.

## Provisional thresholds (not calibrated)

`DEFAULTS` in the module: local tempo within 3 % of the median is "constant"; a tempo segment ends after 8 consecutive beats outside ±4 %; a downbeat must lie within half a beat interval of a tracked beat; one constant tempo must reproduce every tracked beat within 20 ms to allow export. These are reasoned values, not tuned on real data. The 20 ms value was chosen after the time-model fixtures (`docs/TIME_FIXTURES_BASELINE.md`): every constant-tempo synthetic track measured 5.6 to 8.8 ms, `drift_slow` 41 ms. That is 20 synthetic tracks; real recordings may need a different value.

## Tempo estimation note

The analyzer places beats on a ~11.6 ms frame grid, so single beat intervals alternate between frame counts. The median interval of a 127 BPM track comes out as about 126.05 BPM. TimeMap estimates tempo with a least-squares fit over a window of beats, which recovers 127.0 (`tests/test24.js` checks 6 synthetic songs within 0.5 %).

## Tests

- `tests/timemap.test.js` (Node, 26 cases, in `npm test`): conversion round trips; leading silence; pickups; nonzero first downbeat; unknown/ambiguous/unsupported/3-4 meter; half/double alternatives; drift (fixed grid drifts out of ±70 ms, the map does not); tempo change and half-time breakdown; a 10-minute recording; fallback parity with the app's current `firstDown + bar*barSec + step*barSec/16`; quantize; corrections, immutability, JSON round trip and tamper detection; input validation. Three deliberate mutations of the module were each caught.
- `tests/test24.js` (browser, in `npm test`): TimeMap built from the real analyzer's grid for 6 synthetic songs: measured, constant tempo, tempo within 0.5 %, beat F >= 0.98, bar 1 within 70 ms of a true downbeat, same fingerprint in page and Node.

## Not done yet

Tempo-scale (×2 / ÷2) as a correction; meter changes inside a track; wiring into `index.html` (the page must load `src/timemap.js`, which means adding `src/` to the dev-server allowlist and deciding between a second shipped file and inlining it into the single-file app); persisting maps with saved projects.
