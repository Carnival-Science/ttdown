# TimeMap: the musical time model

`src/timemap.js`: one module that answers "when, in the audio, is this musical position?" and "what musical position is this audio time?", and records **how well each answer is known**. It is a plain classic script (no ES modules, no DOM), so it loads in Node with `require` and in `index.html` as a classic script from `file://` as well as from a server.

Status: the analyzer is unchanged. Phase 2c is moving the page's consumers onto TimeMap one at a time, each measured against the pinned Version A predictions (`docs/BASELINE_A.md`):

| Consumer | Status |
|---|---|
| Bar ruler, metronome clicks, "loop 4 bars from where I am" | **on TimeMap** (this step; table in `bench/baselines/version-a/consumers/ruler-metronome.md`) |
| Section times (timeline, section table, section loops, plan text) | **on TimeMap** (Phase 2c step 2): a section's bar numbers map to time through the tracked bars; the arrangement pass itself is unchanged |
| Chord intervals (and the chord-check loops, which must move with them) | open |
| Drum and bass event timing; the "check by ear" overlay | open |
| MIDI and aligned-audio exports | open (gated by `exportEligibility()`) |

**One page, one file, one source of truth.** `index.html` stays a single self-contained file (it also runs as a single-file artifact), so `src/timemap.js` is **inlined** into it between two marker comments. `src/timemap.js` is the only place to edit; `npm run sync:timemap` copies it into the page and `npm test` fails (`tests/timemap-sync.test.js`) if the two differ. The page's tests compare what the page does with what `src/timemap.js` computes in Node.

## Model

- **Time** is audio seconds (`timeToSample` / `sampleToTime` convert).
- **Musical coordinate** `beat` (q) is a float number of *tracked* beats from bar 1 beat 1. Integer q sits on tracked beats; between beats it is linearly interpolated, so the map follows drift and tempo changes. A pickup has q < 0 and lies in bar -1. `bar` is 0-based. Only times strictly before the first or after the last tracked beat are extrapolated (`extrapolated: true`).
- `timeToBeat` and `beatToTime` are exact inverses everywhere.

## What is measured, inferred, corrected, unknown

| Element | Where it is recorded | Values |
|---|---|---|
| Each beat | `src[i]` | `measured` (tracker), `user`, `fallback-grid` |
| Whole map | `source` | `tracker`, `fallback-grid` |
| Downbeat (bar 1) | `downbeat.status` | `measured` (tracker), `user` (placed or confirmed), `unknown` |
| Meter | `meter.status` | `measured` (regular downbeat spacing), `assumed` (the analyzer hard-codes 4), `user`, `ambiguous`, `unsupported` |
| Tempo | `tempo()` | median/min/max, `isConstant`, `segments`, `changes`, `hypotheses` |
| Tempo alternatives | `tempo().hypotheses` | half and double with `score: null, calibrated: false`: possibilities, **not probabilities** |
| Coverage | `coverage()` | measured span, extrapolated seconds before/after, fraction measured |
| User corrections | `corrections[]`, `original()` | `{ type, from, to, source: "user", at }`; the machine result is never overwritten |

If the downbeat is unknown or the meter is `ambiguous` / `unsupported`, there is **no bar layer**: `bar` and `beatInBar` are `null`, `bars()` is empty. It never falls back to forcing 4/4.

**Meter representation and its limit.** `meter = { beatsPerBar, numerator, denominator, beatUnit, status, note }`. `beatsPerBar` counts *tracked pulses*, not the time signature: a 6/8 groove may be tracked as 2 (dotted-quarter) or 6 (eighth) pulses per bar, and 12/8 as 4. `numerator`, `denominator` and `beatUnit` stay `null` unless a person states them (`withMeter({ beatsPerBar: 4, numerator: 12, denominator: 8, beatUnit: "dotted-quarter" })`), because the tracker cannot know them; the fields exist so compound and other meters can be represented later without changing the shape. Meter *changes* inside a track are not representable yet. Bar exports accept only 4 pulses per bar with no contradicting denominator.

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
m.tempo(); m.tempoAt(t); m.tempoCurve(); m.coverage();
m.exportGrid(); m.exportGridTime(q);                // the single-tempo grid an exporter would write, with its error
m.exportEligibility();                              // { state, eligible, needs, reasons, caveats, exportRange, exportGrid, coverage }
m.withDownbeat(t); m.confirmDownbeat();             // corrections return a NEW map; originals untouched
m.withMeter(n | { beatsPerBar, numerator, denominator, beatUnit }); m.confirmMeter(); m.withMeterUnsupported(note);
m.fingerprint();                                    // changes whenever anything a derived result depends on changes

const G = TM.forAnalysis(analysisResult);            // the grid consumers use, in the analysis's own bar numbering
G.barStart(b); G.barOf(t); G.beats(from, to); G.isExtrapolated(t); G.kind; G.reason; G.label
```

Errors are `TimeMapError` with a `code` (`too-few-beats`, `bad-beats`, `bad-duration`, `bad-meter`, `no-downbeat`, `no-meter`, `fingerprint-mismatch`, ...). Bad input is rejected, never repaired.

## `forAnalysis(result)`: the grid the page's consumers use

Given the analyzer's result (`duration`, `bpm`, `barSec`, `firstDown`, optional non-enumerable `grid`), it returns an object whose `barStart(b)`, `barOf(t)` and `beats(from, to)` use the analysis's own bar numbering (bar 0 is the bar containing `firstDown`, exactly as sections and the chord grid number them), so the ruler and the chord and section views cannot disagree about which bar is which.

- `kind: "tracked"`: built from the tracked beats, so bar lines and clicks follow tempo drift. The analyzer's 4/4 stays labelled "assumed".
- `kind: "fallback-grid"`: one constant tempo, labelled. Used when there is no tracked grid (**a saved teardown does not keep it**), the grid is too short, the tracker and the analyzer disagree about the first downbeat by more than a tenth of a bar, or the user corrected the BPM (a stale tracked grid must not override a correction). With the result's own `barSec` it reproduces the legacy `firstDown + bar * barSec` exactly, so saved teardowns look as they always did. `reason` says why.
- It never throws; any failure becomes a labelled fallback. The page rebuilds it when the BPM, bar length, first downbeat or duration change.
- `beats()` includes a beat up to 20 ms before `from` (callers play or draw it at `from`), so a first beat that lands a few ms before 0:00 is not lost.
- The ruler draws bar lines outside the tracked beats dashed and the ruler carries the provenance (`data-grid`, tooltip).

## Immutability

A TimeMap and everything reachable from its public fields (`t`, `src`, `downbeat`, `meter`, `tempoHypotheses`, `corrections`, `settings`, `warnings`) is deeply frozen, as is every memoised result (`tempo()`, `exportEligibility()`, `exportGrid()`, `coverage()`, `tempoCurve()`). Memoised values live in a module-level `WeakMap`, so instances carry no mutable cache. Inputs are copied on the way in (the caller's beats, settings and hypotheses are not frozen or aliased) and `toJSON()` hands out copies.

## Staleness

Derived results (chords, sections, MIDI) store the `fingerprint()` of the map they were computed from. The fingerprint is a 64-bit hash of: schema, duration, source, anchor, downbeat status, the full meter (including status and any stated denominator), **the settings**, every beat time and its source. Correction timestamps are excluded. After a correction, or a change of any setting that can change tempo classification or export eligibility, the fingerprint differs, so a result with the old one is stale and must be recomputed or hidden, not shown as valid. Wiring this into the UI is Phase 2d.

## Export gating: three states

`exportEligibility()` returns one of:

| `state` | Meaning |
|---|---|
| `allowed` | Tracked grid, steady tempo, and **both** the meter and the first downbeat confirmed (`user`), or a `measured` meter with a user downbeat |
| `needs-confirmation` | A stable grid whose meter and/or first downbeat are only the analyzer's assumption. `needs` lists `meter` and/or `downbeat`. Confirmation should be lightweight: audition a metronome, check the first downbeat, confirm the meter (`confirmDownbeat()`, `confirmMeter()`) |
| `refused` | Ambiguous or unsupported meter, other than 4 pulses per bar, tempo changes, unsteady tempo, or **tempo drift**: a steady-looking tempo whose single pinned grid misses a tracked beat by more than `gridTolerance`. `reasons` names them. Confirmation never overrides a refusal |

Analysis and original-audio playback are never gated, nor are exports that need no musical grid.

`exportRange` is the span of **whole bars inside the tracked beats**; an export never includes extrapolated audio. A caveat appears when more than `maxExtrapolatedSeconds` (8 s) of the audio lies outside the tracked span. A fallback grid (a saved result with no tracked beats) can reach `allowed` only after confirmation, stays labelled as a fallback in `caveats`, and its `exportRange` is the whole audio.

**The error of the grid actually exported.** `exportGrid()` is the grid an exporter writes: bar 1 beat 1 sits *exactly* on the tracked (or user-confirmed) downbeat, and the tempo is the least-squares slope through that pinned anchor. It reports `maxDeviationMs` and `rmsDeviationMs` against every tracked beat, and `interceptShiftMs`, what pinning the anchor costs relative to a free least-squares line. On the six synthetic songs the pinned grid is within 7.5 to 11.9 ms (RMS 3.6 to 4.7); `pop127_pad1200` shows the pinning cost, 6.1 ms. The gate is on the maximum. A single mis-tracked beat can therefore refuse an otherwise good track; that is deliberate for now and will be revisited with real recordings.

## Provisional thresholds (not calibrated)

`DEFAULTS` in the module, all overridable per map (`settings`) and included in the fingerprint: local tempo within 3 % of the median is "steady"; a tempo segment ends after 8 consecutive beats outside ±4 %; a downbeat must lie within half a beat interval of a tracked beat; **`gridTolerance` 20 ms** for the pinned export grid; `maxExtrapolatedSeconds` 8. They are reasoned, not tuned on real recordings. The 20 ms value is a *grid-export compatibility threshold*, not an accuracy claim: on 20 synthetic tracks a free least-squares fit left 5.6 to 8.8 ms on every constant-tempo track and 41 ms on a 0.8 % drift (`docs/TIME_FIXTURES_BASELINE.md`), and the pinned grid measured 7.5 to 11.9 ms on the six regression songs. The pinned grid has not yet been measured on the other fixtures. Revisit when real recordings are available.

## Tempo estimation note

The analyzer places beats on a ~11.6 ms frame grid, so single beat intervals alternate between frame counts. The median interval of a 127 BPM track comes out as about 126.05 BPM. TimeMap estimates tempo with a least-squares fit, which recovers 127.0.

## Tests

- `tests/timemap.test.js` (Node, 35 cases, in `npm test`; includes `forAnalysis`: legacy parity of the fallback, drift following, corrections, slack): conversion round trips; leading silence; pickups; nonzero first downbeat; unknown/ambiguous/unsupported/3-4 meter; half/double alternatives; drift (a fixed grid leaves ±70 ms, the map does not); tempo change and half-time breakdown; a 10-minute recording; fallback parity with the app's `firstDown + bar*barSec + step*barSec/16`; quantize; corrections and confirmations; the three export states; export-grid error and anchor pinning; coverage and export range; the exact last beat; meter representation; deep immutability and input copying; fingerprint coverage; JSON round trip and tamper detection; input validation. Six deliberate mutations of the module were each caught.
- `tests/timing-consumers.test.js` (in `npm test`): ruler and metronome, legacy grid versus TimeMap, against the pinned Version A predictions and the annotated truth on all 20 synthetic tracks. Any track that gets worse fails the test unless the regression is listed with its cause; the drift tracks must improve.
- `tests/test29.js` (browser, in `npm test`): in the real page, ruler ticks, metronome clicks and the 4-bar loop sit exactly where TimeMap puts them on `drift_fast`; a saved teardown shows a labelled fallback with the old ticks; a BPM correction replaces the tracked grid; extrapolated bar lines are dashed. Fails against the previous page.
- `tests/test24.js` (browser, in `npm test`): TimeMap built from the real analyzer's grid for 6 synthetic songs: measured, steady, tempo within 0.5 %, beat F >= 0.98, bar 1 within 70 ms of a true downbeat, the assumed meter needs confirmation and is allowed once confirmed with the exported grid within 20 ms, same fingerprint in the page and in Node.

## Not done yet

Tempo-scale (×2 / ÷2) as a correction; meter changes inside a track; compound-meter handling beyond recording what a person states; persisting maps with saved projects; the remaining consumers (table above).
