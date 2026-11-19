# Symbolic chord reading from transcribed notes: a first experiment (2026-11-19)

Status: **research prototype on one track, no chord ground truth, nothing integrated.** Follows `docs/AMT_BASELINE.md` (PR #43) and feeds #26. #26 says "no algorithm rewrite prior to a measurable baseline": this is **not** that baseline, because there is no annotated chord truth yet. It tests one narrower question: does reading chords from *notes* hold up better than reading them from the audio, and how much does note-transcription error change the reading?

## The prototype

`bench/amt/symbolic-chords.js` reads chords from notes at every 8th note of a constant-tempo 4/4 grid:
- evidence is the notes sounding in a one-beat window around each 8th, so an arpeggio's notes all count for the one chord they outline; notes below C3 count more;
- candidates are major, minor, diminished, augmented, sus2, sus4 triads and maj7, m7, 7, m7b5, dim7 chords, plus "N" (no chord);
- one Viterbi pass picks the sequence, with a cost per change (higher off the beat), and equal neighbours merge into regions.

`bench/amt/compare-chords.js` runs it on (a) the original MIDI, (b) Basic Pitch's MIDI from the audio, and compares each with the reading from the original MIDI and with Teardown's audio-based chord regions.

## Result on *more please* (590 notes, 40 bars, bars 18–24 are the arpeggios)

Agreement with the chords read from the **original MIDI**, at the 8th notes where the original has notes (317). "Triad" = root plus maj/min/dim/aug/sus, with sevenths reduced to their triad.

| Input | Regions per bar (all bars, bars 18–24) | Same root | Same triad | Same root / triad in bars 18–24 |
|---|---|---|---|---|
| Original MIDI (the reference itself) | 1.3, 1.0 | 100% | 100% | 100%, 100% |
| Basic Pitch, default | 1.3, 1.1 | 85% | 75% | 68%, 64% |
| Basic Pitch, stricter thresholds | 1.2, 1.1 | 85% | 74% | 68%, 64% |
| Teardown audio detector (chord regions, as shipped) | 2.6, 4.7 | 65% | 50% | 41%, 36% |

Reading the chords from *notes* gives a calm progression (about one region per bar, also through the arpeggios), where the audio detector produces 4.7 regions per bar there. Note error matters too: Basic Pitch's notes give a reading that matches the original-MIDI reading 85% of the time at the root.

## What this does **not** show

- **The reference is not truth.** It is this prototype's own reading of the original MIDI. In bar 21 the bass plays C2, G2, E♭3, G2 (a Cm arpeggio), while the upper voices spell G minor; the prototype reads G minor 7 there, and Basic Pitch's notes give C minor 7, which looks *more* right. So "agreement" here measures sensitivity to transcription error, **not accuracy**. The prototype needs more weight on the bass, and that has to be set against annotated chords, not against this track's output.
- **The one parameter that matters was set by eye.** The change cost (0.9) was chosen from 1.4, 0.9 and 0.6 by looking at bars 1–4 and 18–24 of this same track. Nothing is tuned on held-out data, and the vocabulary is one I chose.
- **The comparison is not like for like.** The reference reads 7ths, diminished and sus chords; the audio detector can only say major or minor, so it is penalised for vocabulary, not only for errors (the root-only column avoids that: 65% against 85%).
- **One clean chiptune render**, constant tempo, 4/4, no vocals or drums. A real mix will be harder for the transcription as well.
- **The opening bars:** the original's bars 1–2 (E♭, F on beat 4&, F7, F♯dim7 by the notes) come out as `D#sus2, F7, F#dim7` at 1.1, 1.4, 2.4: the F♯dim7 and F7 are found, the first chord is called sus2 rather than E♭, and there is no separate F before the F7.
- Not run: other tracks, other chord vocabularies or algorithms, or a chord ground truth.

## What would make it a baseline

1. A **short human chord annotation** for *more please* (change times, root, quality, N), made from the audio and the score, starting with bars 1–8 and 18–24. Chord symbols are not derivable from the MIDI alone (#36 says so).
2. Score all three readings (original MIDI, Basic Pitch notes, audio detector) against that annotation: change-time F1 at ±150 ms, root, major/minor and 7th-aware accuracy, regions per bar.
3. Only then tune the change cost, bass weight and vocabulary, with the tuning track kept apart from a held-out one.

## Reproduce

```
node bench/amt/symbolic-chords.js "more please.mid" --offset -8.571 --bar1 0.571 --bpm 105 --from 18 --to 25 --print
node bench/amt/compare-chords.js --ref "more please.mid" --offset -8.571 --bar1 0.571 --bpm 105 --engine-audio "more please.mp3" --est out/bp_default.mid --est out/bp_tight.mid
```

(`out/` is the output of `bench/amt/run_basic_pitch.py`.)
