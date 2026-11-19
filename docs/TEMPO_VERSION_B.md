# Version B: tempo and grid accuracy (built: whole-track constant-tempo fit; bar 1 and pickups for drumless music)

Opened 2026-11-19 after a real-music failure: *Jane Remover, "a vicious cycle"* (C major, 161 BPM, constant) is read as 161.5 BPM and
"Variable 149-175". The user's own correction to 161 used to come back as 161.5 (fixed in `353f920`: a typed tempo is no longer overwritten
by the tracker's measurement). The fix does not make the grid right: the tracker still wanders, so the track is still called variable.

Version A (`analyzer-baseline-a`, `bench/baselines/version-a/`) stays frozen as the comparison. Version B is developed beside it and is
only adopted when it beats Version A on the benchmark below without losing speed.

## What the code does today (verified 2026-11-19, `src/engine.js`, `src/timemap.js`)

| Behaviour | Where | Why it matters |
|---|---|---|
| global tempo = peak of an autocorrelation score over one combined onset envelope, 70-180 BPM in 0.25 BPM steps | engine.js ~285 | 0.25 BPM is 28 ms of drift over 3 minutes at the grid edge; faster/slower music is out of range |
| the DP beat tracker's median beat length then replaces the BPM when within 3 BPM | engine.js ~409, ~436 | one wandering tracker contaminates the global tempo (this is how 161 became 161.5) |
| a tempo the user types only sets the tracker's target | engine.js 295 | the tracker still wanders after the correction |
| local tempo = least squares over +-4 beats (9 beats, about 3.3 s at 161 BPM) | timemap.js `tempoWindow` | drum fills, breakdowns and syncopation move it |
| the track is "constant" only if EVERY local tempo is within 3 % of the median | timemap.js `constantTolerance` | one bad local estimate makes the whole track "Variable" and the export refused |

## Plan

1. **Regression case.** The exact audio of the Jane Remover track (kept local, never committed; checksum recorded) with independently verified
   constant 161 BPM and grid alignment. This is the first required fixture.
2. **Tempo benchmark** (`bench/tempo/`): absolute BPM error (fractional BPM included), half/double rate, **false variable-tempo rate**, tempo-change
   detection, grid alignment error over the whole track, downbeat accuracy, analysis latency. Data: our own DAW exports, drumless breakdowns,
   syncopated electronic, breakcore, DnB, swing, fractional BPM, genuine tempo changes; public annotated sets (GiantSteps Tempo) for EDM.
3. **Constant-grid fitter first.** Fit BPM and phase JOINTLY against onset evidence over the whole recording (`t_n = t0 + n * 60/BPM`), fine
   resolution, several candidates kept (including half/double), separate periodicity for low/mid/high/broadband. Accept a variable-tempo model only
   when it explains the audio significantly better than the constant one. Outcomes: constant / gradual drift / tempo changes / uncertain.
4. **Lock constant tempo.** When the person types a tempo, the grid becomes exactly constant at that tempo with a fitted phase (labelled "locked at your tempo"), not a
   tracker that wanders around it.
5. **Compare offline** against Essentia (PercivalBpmEstimator, RhythmExtractor2013), madmom and Beat This! for what they get right; adopt techniques, not necessarily libraries.
6. **Key** follows once tempo is solid (HPCP, percussion suppression, electronic-music profiles, agreement across sections).

## Rules

* No accuracy claim on real music until the real-music fixtures (G1A) exist; the synthetic benchmark cannot see this failure.
* Gates are never lowered; Version A parity and the 15 G0 gates keep passing for anything on the default path.
* Speed is a feature: report analysis latency next to every accuracy number.

## First real-music measurements (2026-11-19; audio stays local, never committed)

Reference method: a whole-track comb, one BPM and one phase laid over low/mid/high onset evidence, scanned at 0.05 BPM, and repeated per quarter of
the track (a constant tempo peaks at the same BPM in every quarter). Offline scratch tool, not in the engine.

| Track | Source value | Engine (Version A) | Whole-track comb | Verdict |
|---|---|---|---|---|
| Jane Remover, "it's a vicious cycle" | 161 BPM, C major (songbpm.com, tunebat.com) | 161.5, C major, "Variable 149-175", export refused | peak 161.40 in all four quarters (161.0 scores half as well) | constant tempo; engine BPM about 0.1 off; **false "variable"**. The sources' 161 is a rounding or a different master; the audio is 161.4 |
| Porter Robinson, "Mother" | 98 BPM, E major (tunebat.com) | 98.0, E major, "Variable 94.7-105.6", export refused | peak 98.00 in all four quarters | BPM and key right; **false "variable"** (worst beat 345 ms off the grid) |

Both failures are the CLASSIFICATION (tracker beats called a tempo change), not the global tempo estimate. A typed 161 on the first track is 0.4 BPM
off the audio (about 0.4 s of drift over the song), so "set it to what the site says" can make the grid worse than the detection.

## Built: the constant-tempo fit (2026-11-19)

`engine.fitConstantTempo` (engine.js, before `analyzeDecoded`): onset evidence (low + mid + half of high band) is combed with one BPM and one phase over the
WHOLE track, scanned at 0.05 BPM near the autocorrelation tempo and refined to 0.005, then each quarter is fitted on its own. Accepted only when the whole-track peak
stands clear (peak / median >= 1.5) and every quarter with evidence (>= 3 of 4, each peak / median >= 1.3) agrees with it. *Agrees* was "peaks within 0.1 %"; since the
paired-render work it is "peaks within 0.15 % AND the one grid's best phase in that quarter is within 30 ms of the global phase (or of the off-beat)", because a quarter's own
tempo is only good to about 0.15 % while phase drift is what actually breaks a grid (a steady 105 BPM render measured 105.11 in one quarter and was refused). The whole-track
tempo is also refined from the slope of the local phases over 8 stretches (a 142 BPM fixture fitted 141.95 before, 142.00 after). When accepted the beats ARE
that grid (`a.grid.source` = "constant-fit", `a.tempoFit` = { method, bpm, ratio, quarters, locked }), `a.bpm` follows it (0.01 BPM precision, an integer only
within 0.03), and the track is constant by construction. When not accepted nothing changes: the tracker's beats stand (this is why drift and tempo-change tracks stay
refused). A tempo the person types is **locked**: only the phase is fitted, no acceptance test, and the grid is exactly that tempo.

| Track | Before | After |
|---|---|---|
| Jane Remover, "it's a vicious cycle" | 161.5, "Variable 149-175", export refused | 161.4 (fit 161.415, quarters 161.395/161.435/161.395/161.455), constant, worst beat 0.1 ms off one tempo, export needs only the usual confirmation |
| Porter Robinson, "Mother" | 98.0, "Variable 94.7-105.6", export refused (345 ms) | 98.0 (fit 97.995), constant, 0.1 ms |
| time fixtures (12) | | identical to Version A on all but long_7min (now exactly constant, 0 ms pinned error); drift_slow, drift_fast, tempo_change_step still refused for the same reasons |

Checks: G0 15 gates pass with unchanged numbers (tracked beat F 0.994); app parity 0 differ on all three manifests (same engine hash); `tests/constant-tempo.test.js` (in `npm test`):
noisy steady tempo, drumless breakdown, step and drift rejected, 10 s clip rejected, locking, and the two real tracks (skipped where the audio is not present; run it with the files in
`~/Soulseek Downloads/complete` or `TT_REAL_AUDIO`). Analysis time unchanged (about 4.4 s for a 3-4 minute track).

Not done: more real-music cases (each needs a vouched BPM), a tempo benchmark scored on false-variable rate, gradual-drift and tempo-change *classification* (a rejected fit
just falls back to the tracker), Version A comparison on real music (G1A), and the candidate comparison with Essentia / madmom / Beat This!.

## Built: bar 1 and pickups (B2, 2026-11-19)

The first paired render: *more please*, a drumless chiptune-style piece written as MIDI (105 BPM, 4/4, no tempo changes, 590 notes) and rendered to MP3. The MIDI is
the answer key; the analyzer only hears the audio. The piece opens with a two-note pickup (A5 on beat 4, B-flat 5 on its "and") into the first chord (E-flat, D, F) on
beat 1. Scored with `bench/paired-renders.js` (below):

| | Before | After |
|---|---|---|
| tempo | 105 (tracker; constant fit refused: one quarter at 105.11) | 105 (constant fit 104.997) |
| beats on the beat (F, 70 ms) | 0.27: the tracker slid onto the off-beats for 114 beats mid-song | 0.99 |
| bar 1 | 1.72 s off (bar lines one beat early: the pickup was beat 1) | 12 ms off, on the first chord |
| downbeat F | 0.20 | 0.99 |
| pickup notes | read as beat 1 and 1-and of bar 1 | both transcribed in the bar before bar 1 |
| notes, exact pitch, onset 50 ms (lead + bass vs all 590 MIDI notes) | F 0.551 (P 0.656, R 0.475) | F 0.557 (P 0.664, R 0.480) |
| typed tempo 105 | bar 1 wrong, pickup lost | bar 1 on the first chord, pickup kept |

Three causes, three fixes (`src/engine.js`):

1. **Constant fit refused a constant render** (above): the per-quarter test now checks phase drift, not a tempo tolerance finer than a quarter can measure.
2. **Beat 1 came from kick and snare even with no drums.** With no snare or clap on any step, the "kick" is the bass and the choice has no evidence. There the
   notes decide: the full-track transcription is read once on the current grid, and duration-weighted onsets (bass x1.5, a note counts up to 4 beats) are summed on
   the 8 eighth-note positions of a bar. A clear winner (>= 1.2 x the runner-up, >= 32 notes) becomes beat 1, moving the grid by half a beat when it is an off-beat
   (which also fixes beats locked onto the 8ths). `a.downbeatFit = { method: "note-onsets-v1", movedBy8ths }` records it; the notes keep their times and only their
   bar and beat are relabelled (`relabelTrack`), so no second transcription pass. Tracks with a backbeat are untouched (the G0 benchmark is identical).
3. **Notes before bar 1 were never read.** The transcription now reads the bar before bar 1 too: a pickup is bar -1 with a negative beat. MIDI keeps it in every
   timing: original timing (audio seconds), tempo map (the file starts at the pickup bar) and quantized (a whole-track file starts one bar early and says so).
   The full-song zip package still starts at bar 1 with the lined-up WAV (a note before bar 1 has no place there).

Checks: `tests/pickup-downbeat.test.js` (in `npm test`): the pickup in all three MIDI timings and in the all-parts file; the real render when it is on this machine
(`TT_PAIRED="audio|midi"`): bar 1 on the first chord, >= 95 % of beats on the beat, every downbeat on a MIDI bar line, the pickup notes before bar 1, detected and with
a typed 105. G0 15 gates pass with unchanged numbers; time fixtures identical (long_7min drift 0.1 ms different); melody-track check passes; app parity 0 differ.

### The paired-render benchmark

`node bench/paired-renders.js <manifest.json> [--out DIR]` runs the engine (the same `src/engine.js` the page inlines) on each render and scores it against its
own MIDI: tempo, beat F and off-beat lock, bar 1 (the first MIDI downbeat at or after the first note), downbeat F, pickup notes found, and one-to-one note matching
(exact pitch, 50 ms). Constant-tempo 4/4 MIDI only; anything else is refused, not guessed. The audio is aligned by putting the MIDI's first note at the first sound in
the audio (renders trim the empty leading bars), or by `offsetSec` in the manifest. Renders stay outside the repo; `bench/paired-renders.example.json` shows the format.
Keep some compositions as holdout (`"split": "holdout"`) and do not tune on them.

Not done: only one render scored so far (the vote's thresholds are set on it, so it is a development result, not a measured accuracy); drum tracks still choose beat 1
from kick and snare only; no harmony-change cue yet; polyphonic transcription (the note F1 above is capped by a one-melody-one-bass design; Basic Pitch is the first
candidate to compare offline, not to adopt); the browser decodes MP3 slightly differently from ffmpeg (a few ms of encoder delay), which the bench does not model.
