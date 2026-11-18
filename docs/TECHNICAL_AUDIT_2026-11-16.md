# Teardown — Technical Audit, Phases 1–5

Date: 16 November 2026 · Audited revision: `main` @ `eb796ff` (inner clone `ttdown/`) · Status: **read-only audit; no application code changed**

Line references are to `index.html` at that revision.

---

## A. Objective

Complete the first assignment: audit the repository (Phase 1), the analysis algorithms (Phase 2), competing tools and licensing (Phase 3), the benchmark (Phase 4), and recommend one first improvement (Phase 5). No algorithm replacement or architecture change was made.

## B. Investigation

- Read the full analysis engine (`index.html:387–877`: DSP helpers, `transcribe`, `analyze`), genre rules (`883–892`), MIDI/WAV export (`1661–1690`), key/tempo correction (`2306–2330`), upload handler (`3088–3105`), storage/sync (`2905–2935`, `3070–3080`), AI coach context (`2544–2590`).
- Read every test file, `tests/benchmark.js`, `test-songs/make_test_songs.py`, `package.json`, `README.md`.
- Read the unmerged branch `origin/ceo/validation-and-experiment-foundation` (16 commits: strategy, benchmark protocol, competitor review, `tests/run-tests.js`).
- Compared the outer folder with the inner clone.
- Web-checked licences for madmom, Beat This!, Essentia/essentia.js, Basic Pitch, Harmonix Set and GiantSteps.
- **Not inspected in depth:** about 2,300 lines of UI code (Learn, Journal, Sample Lab, Idea generator, Compare). I checked those only for storage and network behaviour.

## C. Findings

### C1. Repository and process

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Two copies of the app. The outer repo commits every file **and** tracks `ttdown/` as a gitlink (mode 160000) with no `.gitmodules`. The copies are currently byte-identical but will drift. | `git ls-files -s`; `cmp` on every file | High (process) |
| 2 | The whole product is one 369 KB `index.html` (3,168 lines; line 2176 is 29 KB of data). Analysis, UI, export, storage, coach and curriculum share one closure, so nothing is unit-testable without a browser. | file structure | High |
| 3 | `npm test` cannot fail. The script is `node t.js \| tail -1`, and the tests `console.log` values and page errors and never assert anything. The branch's `run-tests.js` fixes exit codes, but the tests still exit 0 on wrong results. | `package.json`, `tests/test*.js` | High |
| 4 | **Tempo, beat, downbeat and section accuracy are not measured anywhere.** | `tests/benchmark.js` | Critical |
| 5 | Key is scored as correct when the prediction has the *same notes* as the answer, so relative-key confusions count as correct. | `benchmark.js` `sc()` | High |
| 6 | The README's "808 / bass onsets P 0.91 R 0.71" row is not produced by any script. `fast808_truth.json` is generated but never read. | `benchmark.js`, `make_test_songs.py` | High (claim integrity) |
| 7 | The synthetic songs are also the tuning set. They have a fixed RNG seed, constant tempo, 4/4, start-at-zero, identical bars and whole-bar triads. Comments in the code say thresholds were "measured on test songs" (e.g. `ONSET_LAG`, line 823). | `make_test_songs.py`, `index.html:823` | High (overfitting) |
| 8 | Nothing runs on this machine. Node.js isn't installed, `python`/`python3` are Microsoft Store stubs, there is no `node_modules`, and the test WAVs are gitignored and not generated. Two tests also write to `/tmp/`, which doesn't exist on Windows. | shell checks | Blocker for validation |
| 9 | No result carries an engine version, settings, evidence or alternatives, except a top-4 key list. Saved teardowns are keyed by title+duration and overwritten on re-analysis. | `saveHist`, `tdId` | High (explainability) |
| 10 | User corrections overwrite the prediction and set confidence to a hard-coded `99`. `retempo` changes BPM but doesn't recompute chords, downbeat or drum grid, so the analysis is left internally inconsistent. | `setKey`, `retempo` (2306–2328) | High |
| 11 | No credentials in the frontend. Coach, sync and file saves go through the claude.ai artifact runtime (`window.claude.use`). Audio is not uploaded. Analysis JSON (including the song title) *is* synced to the user's account and sent to the LLM coach as prompt context. | 2508–2590, 2907 | Info / privacy note |
| 12 | No file-size or duration limit before `decodeAudioData`. The whole file is decoded to float stereo (~210 MB for 10 minutes), which can exhaust memory on phones. Rhythm analysis caps at 480 s, but decoding does not. | `analyze` 519–523 | Medium |
| 13 | The AI coach can explain results the engine never computed. It receives result JSON only, not the evidence. That is the "fabricated explanation after the fact" risk the founder brief prohibits. | `coachContext` | Medium (product trust) |

### C2. Feature status

| Feature | Status |
|---|---|
| Global tempo, 4/4 beat grid, first downbeat | Implemented |
| Time-signature detection | **Not implemented**: 4/4 is hard-coded (4 phase candidates, 16-step bars) |
| Tempo changes / tempo map | **Not implemented**: one global BPM |
| Global key (major/minor) | Implemented |
| Modal keys, modulation | Not implemented |
| Chords | Partial: one maj/min triad per bar |
| Drums | Implemented as a **16-step pattern summariser** (per 8-bar part), not event transcription |
| Bass | Partial: one section, at most 16 bars, folded to a 4-bar loop |
| Hook/melody | Partial: same approach as bass |
| Structure | Partial: energy/spectral-change blocks with loudness-rule labels |
| Explainability / provenance / correction history | Mostly documented only (branch docs) |
| Accuracy claims in the README | Partly unsupported (finding C1-6) |

### C3. Pipeline: audio import to analysis

```
file → decodeAudioData @44.1 kHz (whole file in memory)
     → mono, 22.05 kHz by averaging sample pairs (weak anti-alias)
     → STFT 1024/256 → log spectral flux in 4 bands (low <150, mid, upper 2–5k, high >5k)
         + "noisiness" + 1–5 kHz spectrogram (Uint8)
     → TEMPO: autocorrelation of flux, 70–180 BPM, log-Gaussian prior centred 125 BPM
     → BEATS: Ellis-style DP tracker at that fixed tempo → quarter-beat phase fix (kick+snare)
     → DOWNBEAT: drum template (kick on 1, snare on 2&4 or 3), 4/4 only
     → DRUMS: per-step band values on the tracked grid → leakage subtraction → 16-step pattern
             per 8-bar part (step "on" if hit in ≥60 % of bars)
     → SECTIONS: per-bar RMS + 6-band energy on a FIXED grid from file start → 4/8-bar blocks
             → cut at ≥2.5 dB or band-shape change → label by loudness rules
     → KEY: 8192-pt peak-picked chroma (C2–B6), tuning offset, Temperley + Krumhansl profiles
             + bass-note bonus + chord-fit/tonic re-scoring
     → CHORDS: per-bar chroma on FIXED grid (firstDown + n·barSec) → best maj/min triad
     → BASS/HOOK: transcribe() on loudest section, harmonic salience, folded loop
     → result object → render, localStorage / account sync
     → EXPORT: songNotes() places patterns on FIXED grid (barSec/16), loops bass/hook
```

**The structural defect.** The engine computes a drift-following beat grid (`beatsF`) and then throws it away. Chords, sections, MIDI export and the "lined-up" WAV all use a constant `barSec` from one global BPM. Sections are also binned from file start (line 724) but reported relative to `firstDown` (line 865), so they can be offset by up to half a bar.

## D. Algorithm audit (Phase 2)

| Capability | Approach | Assumptions | Likely failures | How to measure |
|---|---|---|---|---|
| **Tempo** (564–576, 713) | ACF of detrended flux, harmonic sum + 8th/16th terms, prior at 125 BPM (σ 0.9 oct), 0.25 BPM steps; refined by median tracked beat if within 3 BPM | Constant tempo; true tempo 70–180 | DnB (170–176) → 85–88; dubstep 140 vs 70 (70 is at the range edge); ambient with weak onsets; >180 impossible. `bpmConf = best/mean` is uncalibrated | Abs/rel BPM error; Acc1 (±4 %) and Acc2 (octave-tolerant) reported separately |
| **Beats** (589–604) | Dynamic-programming tracker (Ellis 2007 style), tightness 100, single period | Period fixed from the ACF tempo | Inherits octave errors; can't follow real tempo changes | Beat F-measure (±70 ms), CMLt/AMLt |
| **Downbeat / meter** (578–587, 607–612, 662–670) | Drum templates: kick on 1(+3), snare 2&4 or 3 | 4/4; backbeat or half-time drums exist | Techno with no clap (four identical kicks, so ambiguous); breakbeat/garage/DnB variants; intros without drums; pickups; any non-4/4 | Downbeat F-measure; bar-phase error; meter confusion |
| **Key** (785–864) | Peak chroma + two profiles + bass bonus + chord-based rescoring; hand-tuned weights (0.6, 0.1, 0.5, 0.6, 0.15, 0.05) | One global key; major/minor only | Phrygian/dorian techno and bass music; atonal/percussive tracks; modulating trance. `keyConf` is a raw score gap | Exact accuracy, MIREX weighted score, confusion matrix, calibration |
| **Chords** (835–849) | z-scored per-bar chroma vs 24 triads, −0.08 penalty for out-of-key chords, threshold 0.45 | One chord per bar, triads only, fixed grid | Two chords per bar, 7ths/sus/power stabs, no temporal smoothing, wrong when tempo drifts | Time-weighted root and maj/min accuracy (mir_eval conventions), segmentation |
| **Drums** (600–675) | Band-flux onsets on tracked steps, band-leakage ratios measured per track, "noise between harmonics" snare score, pattern majority vote | 16-step grid; parts repeat for ≥60 % of bars | Fills, variations, triplets; layered/processed kicks; any one-off event (lost by design); benchmark rewards repetition | Event-level P/R/F1 per class at ±30–50 ms against times in seconds, not grid steps |
| **Bass** (489–514) | Harmonic salience on 8192-pt FFT (0.37 s window ≈ 3 sixteenths at 128 BPM), interpolated peaks, low-band onsets | Bass repeats in a 4-bar loop within one section | Window smears fast lines; low-note frequency resolution is marginal; octave errors; everything outside the chosen section is invented by looping | Onset F1, pitch accuracy, octave-error rate (where annotated) |
| **Structure** (716–772) | 4/8-bar energy/band-shape change detection + loudness labels | Phrases in 4/8-bar blocks aligned to file start | Boundaries off by a block; mislabelled "Drop" vs "Groove"; no repetition analysis (same section can't be recognised twice) | Boundary F1 at ±0.5 s and ±3 s; label agreement |
| **Genre** (883–892) | Rule-based, used only for advice text | – | Good: it does not alter analysis. Keep it that way. | – |

### Most serious weaknesses (ranked)

1. **There is no measurement of tempo, beat or downbeat accuracy**, the layer every other output depends on.
2. **The grid used for output is rigid and global**, discarding the tracked beats; a 0.5 BPM error drifts by about a beat over 4 minutes at 128 BPM.
3. **The tempo prior centred at 125 BPM** is a genre stereotype built into the objective measurement. It contradicts the founder rule for DnB and dubstep.
4. **Downbeat depends on stereotyped drum templates**, with 4/4 hard-coded.
5. **Confidence values are uncalibrated raw scores**, and corrections write a fake 99.
6. **Drum, bass and hook output is pattern repetition**, not transcription. That is acceptable as a product choice if it is labelled honestly, but the current scorecard rewards it.

### Improvements ranked by expected accuracy impact ÷ cost

| Rank | Improvement | Impact | Cost |
|---|---|---|---|
| 1 | Benchmark harness: tempo/beat/downbeat metrics, assertions, Version A frozen | Enables everything | Low |
| 2 | Expose and store the tracked beat/downbeat times; build chords/sections/MIDI from them | High (all downstream) | Low–Med |
| 3 | Beat/downbeat candidate B (neural, browser-run) vs A | High | Med |
| 4 | Remove/neutralise the 125-BPM prior; report half/double alternatives explicitly | Med–High for DnB/dubstep | Low |
| 5 | Provenance + original/corrected separation + honest confidence | Trust (non-accuracy) | Low–Med |
| 6 | Chord HMM/Viterbi smoothing, sub-bar segments, 7th/sus vocabulary | Med | Med |
| 7 | Key: modal profiles, calibrated confidence | Med for techno/bass music | Med |
| 8 | Event-level drum transcription | Med–High, needs real annotations | High |
| 9 | Bass/melody via Basic Pitch candidate | Med | Med |
| 10 | Structure via self-similarity/repetition | Med | Med |

## E. Existing approaches and licensing (Phase 3)

This adds algorithm-level and licence detail to `docs/COMPETITIVE_LANDSCAPE.md` on the `ceo/…` branch, which already covers the product-level review. **Licence status column:** *checked* = confirmed via web search of project/registry pages today; *unverified* = from prior knowledge and must be confirmed against the project's own LICENSE file before use. None of this is legal advice.

| Tool / method | What it does | Commercial-SaaS status | Runs in browser? | Recommendation |
|---|---|---|---|---|
| **Beat This!** (CPJKU, ISMIR 2024) | Transformer beat + downbeat tracker, no DBN post-processing | Code and weights reported MIT (**checked via mirrors only**; read the upstream LICENSE before use) | Community ONNX/WebGPU exports exist | **Primary Version B candidate** for beats/downbeats |
| **madmom** | RNN+DBN beat/downbeat/tempo/key/chords: strong baselines | Code BSD; **pre-trained models CC BY-NC-SA 4.0, non-commercial** (checked) | No (Python/Cython) | **Evaluation reference only**, never shipped |
| **Essentia / essentia.js** | Huge MIR library: key, tempo, TempoCNN, etc. | **AGPL-3.0**; commercial licence from UPF/MTG (checked); TempoCNN models AGPL-derived | Yes (WASM) | Avoid in the product without a commercial licence; OK as an offline reference |
| **Basic Pitch** (Spotify) | Polyphonic note transcription (audio → MIDI) | **Apache-2.0** (checked) | Yes (`@spotify/basic-pitch`, TF.js) | Candidate for bass/hook B experiment later |
| QM Vamp plugins / Chordino (Sonic Visualiser ecosystem) | Beat/key/segmentation/chords | GPL, commercial licence negotiable (**unverified**) | No | Offline baseline in Sonic Visualiser; useful annotation tool |
| librosa | Python MIR toolkit | ISC (**unverified**) | No | Reference implementations, dataset tooling |
| mir_eval | Standard MIR metrics | MIT (**unverified**) | No (Python) | Use its metric definitions; mirror them in JS or run Python in CI |
| Demucs / HPSS | Source separation / harmonic-percussive split | Demucs MIT (**unverified**); HPSS is a well-known method | HPSS yes (cheap); Demucs too heavy in browser | HPSS is a cheap pre-step worth an A/B for key/chords |
| Mixed In Key, Moises, Ableton audio-to-MIDI, SpectraLayers, RX | Products | Not integrable; workflow inspiration (see branch doc) | – | Learn workflows: editable grids (Ableton), cue points (MIK), stem-aware analysis (Moises) |

**Datasets (evaluation):**
- **GiantSteps Tempo/Key** (electronic, Beatport previews): annotations CC BY-SA 4.0 per mirdata (checked via mirdata, not the repo); audio not redistributed.
- **Harmonix Set** (912 pop tracks: beats, downbeats, sections): has its own licence that must be accepted (terms not yet read); no audio.

Using third-party datasets for *internal evaluation* is a different legal question from *training* or *publishing claims*. This needs founder and legal review.

## F. Benchmark plan (Phase 4)

**Audit of the existing benchmark:** see C1 findings 3–8. It is a regression test on 6 synthetic loops, not an accuracy benchmark. Keep it for that purpose, and rename its output "synthetic regression scorecard".

The branch doc `ELECTRONIC_BENCHMARK_PROTOCOL.md` already defines dataset composition, annotation spec, metrics, calibration and A/B rules well. I endorse it, with these concrete additions:

1. **Three tiers.**
   - T0 synthetic regression (extend the generator: tempo drift, intro silence/pickups, 2 chords/bar, fills, 174 and 70 BPM, 3/4 and 6/8 cases, phrygian keys; new seeds not used for tuning).
   - T1 development set: real electronic tracks with rights, used for tuning.
   - T2 hidden holdout: never seen by whoever tunes; run only for go/no-go; stored outside the repo.
2. **Size for a first decision.** About 60 real tracks, at least 6 per subgenre listed in the brief, plus a 30-track holdout. With paired per-track comparisons this detects differences of roughly 10 percentage points in beat F-measure. Smaller effects need more tracks.
3. **Annotation standard v1 (beats first).** Two annotators tap beats in Sonic Visualiser and correct them against the waveform. Downbeats and meter are marked. Half-/double-time "acceptable" interpretations are recorded explicitly. Disagreements are adjudicated and logged. Annotators never see analyzer output.
4. **Run record.** Every run writes JSON per track: track ID, SHA-256 of the audio, dataset version, engine commit, config hash, prediction, truth, error, runtime, failure category.
5. **Version A** = `main@eb796ff`, frozen as a tag, run under one pinned Chromium (Playwright) on documented hardware.

**First Version B experiment:** beat and downbeat tracking (see G).

## G. Implementation recommendation (Phase 5)

### Recommended first improvement: a measurable beat-and-downbeat grid

**Step G0 (prerequisite, no behaviour change; needs your OK to edit code).**
- Add `beats[]` and `downbeats[]` (seconds) to the analysis result. This is purely additive: `beatsF` is already computed.
- Add tempo, beat-F, downbeat-F and Acc1/Acc2 metrics to the benchmark.
- Make the tests assert and fail properly.
- Tag Version A.

**Step G1 (Version B, needs your approval).** Compare against A on identical files:
- **B1 (in-house):** remove the 125-BPM prior from the decision, and report both octave hypotheses with their scores as alternatives.
- **B2 (external):** Beat This! (ONNX in the browser) for beats/downbeats, after the upstream licence is read.

Measure both on T0 + T1. Pick a winner on T1, then confirm once on T2.

**Step G2 (only after G1 succeeds).** Build chords, sections and MIDI from the measured grid instead of the constant `barSec`.

**Why this matters.** Every product output (drum steps, chord bars, section times, MIDI alignment, the lined-up WAV) is indexed by this grid. A half-time error or a wrong downbeat silently corrupts everything else, and today nobody would know because it isn't measured. It is also the cheapest truth to annotate and has the best public reference data.

**Code affected:** `analyze` lines 564–713 (tempo, beats, downbeat), 824 (`firstDown`), 836 and 865 (chord/section mapping), `songNotes`/`alignedWav` (1661–1690), `tests/benchmark.js`, `package.json`.

**Alternatives considered:**
- Starting with key: the most visible feature, but downstream-independent and lower risk.
- Starting with chords: depends on the grid.
- Starting with a rewrite: rejected per the brief.

**Success criteria (pre-registered).** On T1, the winning B must:
- improve the median per-track **downbeat F-measure** by at least 10 points, with a 95 % bootstrap CI excluding zero;
- not reduce beat F-measure (CI lower bound > −2 points);
- not increase the octave-error rate;
- not change key accuracy;
- process a 6-minute track in a median ≤ 30 s on a mid-range laptop;
- reproduce the result on T2.

**What could go wrong:**
- The ONNX model is too slow or too large for phones. Mitigation: B1 runs everywhere; B2 becomes desktop-only or server-side later.
- Licence terms for weights differ from the code.
- Electronic music with no backbeat may favour neither candidate.
- Annotation disagreement on "where is 1" in intros is real. Record both annotators' choices; don't force one.

## H. Testing and validation performed

| Test | Run? | Result |
|---|---|---|
| `npm test` | **No**: Node.js not installed | – |
| `npm run benchmark` | **No**: Node.js not installed, test WAVs not generated | – |
| `npm run songs` | **No**: no real Python install | – |
| Static inspection (grep/read) | Yes | Findings above |

**No accuracy number in this document was measured by me.** The README's scorecard is unverified by this audit.

### H.1 Addendum: Version A baseline run (same day, after the toolchain was installed)

Environment: Node 26.13.1, Playwright 1.65.1 (Chromium 159), Python 3.12.10 + numpy 2.5.5, Windows 11. Engine `eb796ff`; the only working-tree change was `package.json` `songs` → `python`. Raw records with SHA-256 checksums of `index.html` and every WAV are in `tests/out/versionA-benchmark-2026-11-16.txt` and `tests/out/versionA-tests-2026-11-16.txt` (gitignored).

- `npm run songs` → exit 0, generated 8 WAVs.
- `node tests/benchmark.js` → exit 0, 20 s. The totals match the README (kick P0.94 R0.98, snare P1.00 R0.98, hats P1.00 R0.93, chords 1.00, hook P0.94 R1.00).
  - **Exact key: 4/6.** `lead120_Amin` was reported as C major and `fast808_142` (F# minor) as A major. The scorecard counts both as correct ("same notes"), which is how the README arrives at "6/6".
  - **No 808/bass metric is printed**, confirming finding C1-6.
  - Kick false positives come entirely from `trap142` (an extra kick at beat 2.3).
- Feature tests, run one by one with `node tests/testN.js`: all 9 exit 0, all report `errors []`, total runtime about 3 minutes. They contain no assertions, so exit 0 does not mean the output was correct.
  - test18 shows the key error reaching the UI ("Check the key: C major" for an A-minor song).
  - test22 shows a pop127 808 note placed at 3.2 instead of on the kick at 3.3.
- `npm test` was not used. Its `for … do … done` script is POSIX shell, which npm runs through `cmd.exe` on Windows.
- Side effect: tests 18, 21 and 22 write about 37 MB to `C:\tmp` (hard-coded `/tmp/` paths).

### H.2 Step G0: measurement foundation (approved by founder, same day)

Branch `g0-measurement` (local, uncommitted). Version A is tagged `version-a` → `eb796ff` (local tag, not pushed).

**What changed**

| File | Change |
|---|---|
| `index.html` | Additive only. The tracked beat and downbeat times (seconds) are attached to the result as a **non-enumerable** `grid` property, so history, account sync, sharing and the coach are unchanged. No computed value changes. |
| `tests/metrics.js` (new) | Beat/downbeat F-measure with one-to-one matching at ±70 ms, signed and absolute timing error, tempo Acc1/Acc2 at ±4 %, octave-error flag. |
| `tests/metrics.test.js` (new) | 15 hand-made checks of the metric code (off-beat, double/half time, no double matching, tolerance edges). |
| `tests/benchmark.js` | Original scorecard lines kept identical. Adds: exact key accuracy; tempo; tracked beat/downbeat F; F of the grid the app actually exports (`firstDown + n·barSec`); the 2 padded songs (grid only); per-song runtime; page errors. Writes a JSON record (commit, dirty flag, page and audio SHA-256, Node and browser versions, config, every prediction). Exits 1 if any gate fails. |
| `tests/benchmark-gates.json` (new) | 15 regression floors = measured Version A values, rounded down. Floors, not targets. |
| `tests/run-tests.js` | Taken verbatim from branch `ceo/validation-and-experiment-foundation` (cross-platform; preserves exit codes). |
| `tests/test*.js` | Exit 1 on any page error. `/tmp/` → `tests/out/`. test21 now asserts the first downbeat of the 0 / 0.3 / 1.2 s padded songs (±20 ms). |
| `package.json` | `npm test` = metric tests, then the runner. Works on Windows. |

**Validation (exact commands, actual results)**
- `node tests/metrics.test.js` → passed.
- `node tests/benchmark.js versionA.bak.html` (page extracted from `version-a`; SHA-256 matches the original `2A87F25B…`) and `node tests/benchmark.js index.html` → **8/8 songs give byte-identical analysis results**, and `grid` never appears in serialized results.
- `npm test` → metric tests passed; feature tests 9 passed, 0 failed (exit 0).
- `npm run benchmark` → 15/15 gates passed (exit 0).
- Negative check: a copy of the engine that always reports "major" → `GATES FAILED: key(exact).R = 0.1667 (gate 0.666)`, exit 1.
- **Not verified:** that a feature test exits 1 on a real page error. The code path is a one-line check, but I didn't trigger it.

**Version A grid baseline (synthetic, 8 songs, ±70 ms)**

Tempo Acc1 1.000 (mean |error| 0.000 BPM). Tracked beat F 0.994, downbeat F 0.978. Exported-grid beat F 0.995, downbeat F 0.986. Exact key 4/6.

These songs have constant tempo and start on the beat, so they **cannot** show the rigid-grid problem (finding D-2). Only real tracks with drift can.

**New finding from the per-beat records.** Every unpadded song misses its first beat (at 0:00), and every song has one extra beat in the trailing silence. The cause is that frame 0's onset value is zeroed (`eAll[0] = 0`, line 555), so a hit at exactly 0:00 cannot be detected. Many electronic tracks start on the downbeat at 0:00. The exported grid is unaffected (it is extrapolated from `firstDown`). Logged, not fixed.

**Still open from G0's scope.**
- The README still claims "Key 6/6" and an 808/bass row with no source script. Correcting public claims needs founder approval.
- There is still no bass metric.
- Version A is frozen as a tag and as a gitignored copy `versionA.bak.html`.

## I. Results

No change to the product, so no accuracy delta. Deliverable: this audit.

## J. Self-audit

- Line-level claims are from reading code, not executing it. The "rigid grid" and "half-bar section offset" findings follow from the code paths, but their size on real tracks is **not measured**.
- About 2,300 lines of UI code were only skimmed for storage/network behaviour. I didn't check browser compatibility (Safari `decodeAudioData` MP3 handling, iOS memory).
- Licence statuses marked "checked" come from search-result summaries of project and registry pages, and in the Beat This! case from third-party mirrors. They are not readings of the authoritative LICENSE files.
- The dataset-size estimate (about 60 + 30 tracks) is a rough power heuristic, not a formal calculation.
- I'm critical of synthetic-set overfitting, but I'm recommending synthetic tests for the first regression gate. That is fine only because real tracks (T1/T2) decide the winner.

## K. Decision log

| Decision | Status |
|---|---|
| No code changed; audit only | Made |
| Build on the `ceo/…` branch docs rather than duplicate them | Made |
| Which copy is canonical: the outer folder, the inner `ttdown/` clone, or the GitHub `ethonnor/ttdown` remote? | **Founder approval needed** |
| Install Node.js 20+ and Python 3 + numpy on this machine so tests and the benchmark can run | **Founder approval needed** |
| Merge `ceo/validation-and-experiment-foundation` into `main` | **Founder approval needed** |
| Step G0 (additive beats/downbeats output, real assertions, benchmark metrics) | **Founder approval needed** |
| Adopt any external model (Beat This!, Basic Pitch) | Deferred until upstream licence is read and A/B is run |
| madmom / Essentia in the product | Rejected (non-commercial / AGPL) unless licensed |
| Source of real annotated electronic tracks (rights, annotators, budget) | **Founder decision** |

## L. Next steps (in order, with acceptance criteria)

1. **Set up the environment.** `node -v` ≥ 20, `npx playwright install chromium` and `npm run songs` all succeed. Then run the existing benchmark and record Version A output to a dated file.
2. **Choose the canonical repo** and remove the duplicate. Acceptance: one source of truth; the outer repo either becomes a proper submodule or goes away.
3. **Merge the branch docs and the test runner, and make the tests assert.** Acceptance: deliberately breaking `analyze()` makes `npm test` exit non-zero.
4. **Step G0.** Acceptance: the benchmark prints tempo error, Acc1/Acc2, beat-F and downbeat-F per synthetic song. Version A is tagged. Existing outputs are byte-identical apart from new fields.
5. **Extend the synthetic generator** (drift, pickups, 174/70 BPM, odd meters). Acceptance: new cases are generated with seeds not used for tuning, and their truth files are versioned.
6. **Build the T1/T2 real-track set (beats/downbeats only first).** Acceptance: about 60 + 30 tracks with documented rights, two-annotator agreement logged, and checksums recorded.
7. **Run the G1 A/B.** Acceptance: results against the pre-registered criteria in section G, per subgenre, with CIs.
8. **Step G2,** and only then chords/key improvements.

## M. CEO summary

- **Where we are.** The app does a lot and runs entirely in the browser, which is a real privacy and cost advantage. But **we cannot currently prove it's accurate.** Its own scorecard tests six computer-generated loops the code was tuned on. It doesn't measure tempo or "where bar 1 is" at all, and one advertised number (808/bass) isn't produced by any script in the repo.
- **The biggest technical risk.** Every output (drums, chords, sections, MIDI) hangs off one constant-tempo grid. If tempo or bar 1 is wrong, everything downstream is quietly wrong, and nothing would tell us.
- **What I recommend first.** Measure the beat grid properly, then test one in-house fix against one modern open-source model on real electronic tracks we have rights to. This is cheap and unblocks everything else.
- **Legal flag.** Two of the best-known open-source music-analysis toolkits (madmom's models, Essentia) **cannot be used in a paid product** without licences. Spotify's Basic Pitch (Apache-2.0) is usable. Beat This! appears usable (MIT), but this must be confirmed from its own licence file.
- **Decisions I need from you:**
  1. Which repo copy is canonical.
  2. Permission to install Node and Python here.
  3. Whether to merge the existing strategy branch.
  4. Approval for Step G0, which is additive and has no behaviour change.
  5. How we'll source and pay for annotated real tracks.

### Sources (licence checks)

- madmom licence (code BSD, models CC BY-NC-SA 4.0): https://pypi.org/project/madmom/0.14/ · https://arxiv.org/pdf/1605.07008
- Beat This!: https://pypi.org/project/beat-this/ · https://huggingface.co/musetric/beat-this-onnx · https://arxiv.org/html/2407.21658v1
- Essentia licensing: https://essentia.upf.edu/licensing_information.html · https://essentia.upf.edu/models/LICENSE · https://mtg.github.io/essentia.js/docs/api
- Basic Pitch: https://github.com/spotify/basic-pitch · https://github.com/spotify/basic-pitch-ts
- Harmonix Set: https://github.com/urinieto/harmonixset
- GiantSteps: https://github.com/GiantSteps/giantsteps-tempo-dataset · https://mirdata.readthedocs.io/en/0.3.6/source/quick_reference.html
