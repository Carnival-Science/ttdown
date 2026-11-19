# Version B: tempo and grid accuracy (research milestone, not started)

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
