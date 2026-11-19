# Note-first transcription: a first Basic Pitch measurement (2026-11-19)

Status: **research note, one track, nothing integrated.** Part of #24 (model baselines), using the paired-render material from #36. No product claim follows from it.

## Why

On the paired render *more please* (a drumless chiptune-style piece written as MIDI; 105 BPM, 4/4; 590 notes), the exported MIDI from the chord-regions work (PR #41) was **no better than before** as a reconstruction. Bars 18–24 have a bass arpeggio under moving upper notes, and the chord reader turned every changing note set into a chord change (33 regions start in those 7 bars, against 1.9 per bar in bars 1–17). It reads a change in *which notes sound* as a change in *harmony*. Tuning cannot fix that, and a triad-only reader cannot name what a piano or arpeggio plays. Chords should be an interpretation of transcribed notes, not a substitute for missing ones.

## What was measured

Same alignment as `bench/paired-renders.js` (first original note at the first sound, offset −8.571 s). Maximum-cardinality one-to-one matching (`tests/metrics.js`, as fixed in #21; an earlier greedy version of the scorer gave the same numbers on this track), **exact pitch**, onset within **50 ms**; "+offset" also needs the end within max(50 ms, 20% of the reference duration). The original MIDI is the answer key; the audio is the render of that MIDI.

| Output | Notes | Onset P | Onset R | Onset F1 | Onset+offset F1 |
|---|---|---|---|---|---|
| Teardown export before chord regions (melody, bass, suggested chords) | 536 | 56.0 | 50.8 | 53.3 | 17.6 |
| Teardown export now (same, with chord regions) | 739 | 47.0 | 58.8 | 52.2 | 17.9 |
| Teardown melody + bass only (in either export) | 418 | 67.0 | 47.5 | 55.6 | 19.8 |
| **Basic Pitch, library defaults (untuned)** | 679 | 78.1 | 89.8 | **83.5** | 35.0 |
| Basic Pitch, `tight` (onset 0.6, frame 0.4, min length 80 ms) | 577 | 89.8 | 87.8 | 88.8 | 41.1 |
| Basic Pitch, `loose` (onset 0.4, frame 0.2, min length 60 ms) | 1204 | 46.3 | 94.6 | 62.2 | 19.2 |

Recall by region (onset, exact pitch; precision in brackets):

| Region | Teardown melody + bass | Teardown all parts | Basic Pitch default | Basic Pitch tight |
|---|---|---|---|---|
| Pickup (2 notes) | 2/2 (2 of 2 written) | 2/2 (8 written) | 2/2 (2 written) | 2/2 (2 written) |
| Bars 1–17 | 47% (69%) | 60% (53%) | 85% (77%) | 84% (89%) |
| Bars 18–24, the arpeggios | 56% (61%) | 69% (38%) | **96% (82%)** | **96% (92%)** |
| Bars 25–41 | 44% (68%) | 53% (47%) | 91% (77%) | 87% (89%) |

Basic Pitch 0.4.0, the ICASSP 2022 model through ONNX Runtime on CPU, took 1.8 s for the 1:33 file. The package is Apache 2.0 (`LICENSE` in the wheel); I did not check the weights' terms separately.

## What this does and does not show

- On this clean render, a general polyphonic note model recovers far more of the notes than Teardown's heuristic melody + bass + chord guesses, **including the arpeggio bars that break the chord reader**, and it keeps the pickup. Chord labels are not scored here.
- **One track.** It is a synthesized chiptune written as MIDI, with no vocals, no drums, no reverb and no mastering. Real mixes will be harder, so this is an upper bound, not an expected result.
- The `tight` setting was picked after seeing this track's score. Treat only the **default** row as untuned; `tight` and `loose` are brackets around it, not tuned values.
- Durations are poor (onset+offset F1 35–41). Part of that is the render's release tails against the MIDI's note lengths, which has not been separated from model error.
- Octave and doubled-note errors were not analysed. The 90 extra notes at default thresholds were not inspected.
- The model's onsets sit about 26 ms early on average (best shift −26 ms). That is within the 50 ms tolerance but would matter against a 20 ms grid target.
- Not done: any other model (the ByteDance piano model, Harmonica, YourMT3+, source separation), a browser (TypeScript) run, memory or latency in the browser, or integration. The acceptance targets proposed in review (onset+pitch F1 ≥ 90%, with duration ≥ 75% on held-out renders) are targets, not claims, and this run meets neither.

## Reproduce

Audio and MIDI stay outside the repo.

```
python3 -m venv venv && venv/bin/pip install --no-deps basic-pitch
venv/bin/pip install onnxruntime numpy scipy librosa resampy pretty_midi mir_eval typing_extensions
venv/bin/python bench/amt/run_basic_pitch.py "more please.mp3" out
node bench/amt/score-notes.js --ref "more please.mid" --offset -8.571 --bar1 0.571 --bpm 105 --split 18,25 out/bp_default.mid out/bp_tight.mid
```

(`pip install basic-pitch` alone needs TensorFlow and CoreML on macOS and did not resolve on Python 3.12.) The Teardown rows came from scratch comparison scripts that read the exported files; they are not committed.

## Next

1. Run the same comparison on the other paired renders and on the synthetic fixtures with note truth, with thresholds fixed before looking (a dev/holdout split per `bench/check-splits.js`).
2. Inspect the extra notes, the octave errors and the durations on this track.
3. Run the browser (TypeScript) build for size, latency and memory, and check the weights' licence.
4. Try the piano-specific model on a piano-only render, since a solo-piano case is the stated failure.
5. Product ideas that do not wait for a model: timestamped chord copying (`Bar 19: 1 Gm · 2 Bb · 3& Gm`) and a MIDI export with transcribed notes only, no suggested voicings.
