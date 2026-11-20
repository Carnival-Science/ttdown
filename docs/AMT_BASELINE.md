# Note-first transcription: a first Basic Pitch measurement (2026-11-19)

Status: **research note, one track, development-only findings.** Part of #24 (model baselines), using the paired-render material from #36. It makes **no independent accuracy claim** (see the last section of the findings), and its numbers have **not been reproduced** with the corrected scorer (see Provenance).

## Why

On the paired render *more please* (a drumless chiptune-style piece written as MIDI; 105 BPM, 4/4; 590 notes), the exported MIDI from the chord-regions work (PR #41) was **no better than before** as a reconstruction. Bars 18–24 have a bass arpeggio under moving upper notes, and the chord reader turned every changing note set into a chord change (33 regions start in those 7 bars, against 1.9 per bar in bars 1–17; counted by an uncommitted script on the engine). It reads a change in *which notes sound* as a change in *harmony*. Tuning cannot fix that, and a triad-only reader cannot name what a piano or arpeggio plays. Chords should be an interpretation of transcribed notes, not a substitute for missing ones.

## What was measured

Same alignment as `bench/paired-renders.js` (first original note at the first sound, offset −8.571 s). The original MIDI is the answer key; the audio is the render of that MIDI. One-to-one matching, **exact pitch**, onset within **50 ms**; "onset+offset" also needs the end within max(50 ms, 20% of the reference note's length).

TP = estimated notes matched to a reference note; FP = estimated notes matched to none; FN = reference notes matched by none. There are 590 reference notes, so TP + FN = 590 and TP + FP = the notes written.

| Output | Notes written | Onset TP | FP | FN | P | R | F1 | Onset+offset TP | FP | FN | F1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Teardown export before chord regions (melody, bass, suggested chords) | 536 | 300 | 236 | 290 | 56.0 | 50.8 | 53.3 | 99 | 437 | 491 | 17.6 |
| Teardown export now (same, with chord regions) | 739 | 347 | 392 | 243 | 47.0 | 58.8 | 52.2 | 119 | 620 | 471 | 17.9 |
| Teardown melody + bass only (in either export) | 418 | 280 | 138 | 310 | 67.0 | 47.5 | 55.6 | 100 | 318 | 490 | 19.8 |
| Basic Pitch, library defaults (untuned) | 679 | 530 | 149 | 60 | 78.1 | 89.8 | 83.5 | 222 | 457 | 368 | 35.0 |
| Basic Pitch, `tight` (onset 0.6, frame 0.4, min length 80 ms) | 577 | 518 | 59 | 72 | 89.8 | 87.8 | 88.8 | 240 | 337 | 350 | 41.1 |
| Basic Pitch, `loose` (onset 0.4, frame 0.2, min length 60 ms) | 1204 | 558 | 646 | 32 | 46.3 | 94.6 | 62.2 | 172 | 1032 | 418 | 19.2 |

**The TP, FP and FN counts were derived, not re-run.** The first version of this note published only note counts and percentages. For every row exactly one whole TP count is consistent with them (onset: the notes written, 590, and P, R and F1 to one decimal; onset+offset: F1 to one decimal), and FP and FN follow. They are arithmetic on the published figures, not output from the scorer.

Recall by region (onset, exact pitch; precision in brackets), **as first published, not recomputed**:

| Region | Teardown melody + bass | Teardown all parts | Basic Pitch default | Basic Pitch tight |
|---|---|---|---|---|
| Pickup (2 notes) | 2/2 (2 of 2 written) | 2/2 (8 written) | 2/2 (2 written) | 2/2 (2 written) |
| Bars 1–17 | 47% (69%) | 60% (53%) | 85% (77%) | 84% (89%) |
| Bars 18–24, the arpeggios | 56% (61%) | 69% (38%) | 96% (82%) | 96% (92%) |
| Bars 25–41 | 44% (68%) | 53% (47%) | 91% (77%) | 87% (89%) |

The rules behind these percentages were not stated before. Matching was done once over the whole track. Each note was counted in the region holding its own onset, so a matched pair can count in two regions. The bar 1 boundary sat 20 ms before the bar line, while the bar 18 and bar 25 boundaries sat on it. The corrected scorer puts every boundary 20 ms early, prints counts rather than percentages, and reports pairs that cross a boundary (`regionCounts` in `bench/amt/note-matching.js`). Notes within 20 ms before bar 18 or bar 25 can therefore move between rows when this is re-run.

## Provenance

| | Published rows | Recorded? |
|---|---|---|
| Basic Pitch rows | `bench/amt/score-notes.js` at commit `e03b134` (greedy matcher). Commit `88269ca` replaced it with maximum-cardinality matching and reported identical numbers (PR #43 discussion). | Commit: yes. Input and output hashes: **no** |
| Teardown rows | Uncommitted scratch scripts reading the exported MIDI files | **No**: not reproducible from the repository |
| Basic Pitch | 0.4.0, ICASSP 2022 model through ONNX Runtime on CPU | Package version: yes. ONNX Runtime and other versions, model hash, hardware: **no** |
| Inputs | The paired render and its source MIDI, kept outside the repository (private material) | Hashes: **no** |

**Reproduction status: unverified.** The corrected scorer has not been run on the private render and reference MIDI, which were not available for this correction. Each row above stays as first published until that is done. The scorer changed in ways that can move counts, though not by much on a track like this:
- **Boundary rounding.** Distances are rounded to 0.1 ms before being compared with the tolerance, as in mir_eval, so a note exactly 50 ms away now matches.
- **Malformed files are rejected.** MIDI files with unmatched note-on or note-off events, or zero-length notes, are refused rather than silently dropped.
- **Region boundaries are uniform**, as described under the region table.

## Findings (development only)

These hold for one clean synthesized render, its own alignment, and settings chosen while looking at it. They guide what to try next and are not accuracy claims.

- **Notes recovered.** With library defaults, Basic Pitch matched 530 of 590 reference notes. Teardown's best export matched 347. In bars 18–24, where the arpeggio breaks the chord reader, Basic Pitch kept 96% recall. It also found the pickup. Chord labels are not scored here.
- **Extra notes.** An earlier version of this note spoke of "90 extra notes". That was the net difference: 679 notes written minus 590 reference notes, which is 89. It is not the number of wrong notes.
  - At library defaults, **149** written notes matched nothing (FP) and **60** reference notes were missed (FN).
  - At `loose`, 646 written notes matched nothing.
  - None of the false positives were inspected. Octave errors, doubled notes and retriggers on release tails are all possible.
- **Durations are poor.** Onset+offset F1 is 19.2 (`loose`), 35.0 (defaults) and 41.1 (`tight`). Part of that is the render's release tails against the MIDI's note lengths, and that part has not been separated from model error.
- **Alignment sensitivity, not timing error.**
  - Moving every default-run note 26 ms earlier gives the most onset matches. That shows how sensitive the score is to the alignment.
  - It is not a measured timing error for the model. The alignment, with the first reference note placed at the first sound, is itself an estimate, and no per-note onset errors were measured.
  - The earlier reading, that the model's onsets sit 26 ms early and would matter against a 20 ms grid target, is **withdrawn**.
- **Running time.** The default run took 1.8 s for the 1:33 file. That is one wall-clock reading on an unrecorded CPU, with model loading and first-inference warm-up not separated out, so it is not a latency figure. `run_basic_pitch.py` now records model load, first inference and each setting's processing time separately.
- **Tuning.** `tight` was picked after seeing this track's score. Only the **defaults** row is untuned. `tight` and `loose` are brackets around it, not tuned values.

## Independent accuracy claims

**None.** An accuracy claim needs all of these:
- held-out renders with thresholds fixed before looking (a dev/holdout split per `bench/check-splits.js`)
- recorded input, model and output hashes
- the corrected scorer

The targets proposed in review (onset+pitch F1 ≥ 90%, with duration ≥ 75% on held-out renders) are still targets, and this run meets neither. This is one synthesized chiptune with no vocals, drums, reverb or mastering. Real mixes will be harder, so it is an upper bound, not an expected result.

Not done:
- any other model (the ByteDance piano model, Harmonica, YourMT3+, source separation)
- a separate check of the model weights' licence terms (the pip package is Apache 2.0)

## Reproduce

The audio, the MIDI, and both scripts' outputs stay **outside** the repository. Both scripts refuse a path inside it and never overwrite: the runner needs a new or empty directory, and the scorer a new `--out` file.

```
python3 -m venv venv && venv/bin/pip install --no-deps basic-pitch==0.4.0
venv/bin/pip install onnxruntime numpy scipy librosa resampy pretty_midi mir_eval typing_extensions
venv/bin/python bench/amt/run_basic_pitch.py "more please.mp3" ../amt-runs/more-please-1
node bench/amt/score-notes.js --ref "more please.mid" --offset -8.571 --bar1 0.571 --bpm 105 --split 18,25 \
  --out ../amt-runs/more-please-1/scores.json ../amt-runs/more-please-1/bp_default.mid ../amt-runs/more-please-1/bp_tight.mid ../amt-runs/more-please-1/bp_loose.mid
```

The runner writes `run.json`: the repo commit, package versions, model and input hashes, full settings, output hashes, and timings. The scorer prints the SHA-256 of every MIDI file and writes the same results as JSON. Hashes and counts can be quoted in GitHub; the files they describe cannot.

`pip install basic-pitch` alone needs TensorFlow and CoreML on macOS and did not resolve on Python 3.12. Only `basic-pitch` is pinned, because the other package versions of the first run were not recorded.

The scorer's matching is checked against `mir_eval.transcription` on random and boundary cases (`tests/amt-note-matching.test.js`).

## Next

1. Re-run every row above on the private inputs with the corrected scorer. Record the hashes, and replace "derived" with scorer output.
2. Run the same comparison on the other paired renders, and on the synthetic fixtures with note truth, with thresholds fixed before looking.
3. Inspect the 149 unmatched notes, the octave errors and the durations on this track.
4. Try the piano-specific model on a piano-only render, since a solo-piano case is the stated failure.
5. Product ideas that do not wait for a model: timestamped chord copying (`Bar 19: 1 Gm · 2 Bb · 3& Gm`) and a MIDI export with transcribed notes only, no suggested voicings.
