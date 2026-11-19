# Symbolic chord reading from transcribed notes: a first experiment (2026-11-19)

Status: **research prototype on one track, scored against a development-reference annotation that the owner has not signed off, nothing integrated.** Follows `docs/AMT_BASELINE.md` (PR #43) and feeds #26. #26 says "no algorithm rewrite prior to a measurable baseline": this is **not** that baseline (one track, an unsigned annotation). It tests a narrower question: does reading chords from *notes* hold up better than reading them from the audio, and how much does note-transcription error change the reading?

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

## Scored against a chord annotation (second run)

I drafted a chord annotation for bars 1–8 and 18–24 from the original MIDI's notes, and a reviewer corrected eight entries (each checked against the MIDI before adopting: no G in the first region, no new attack at 7.4, no C at 7.3&, and so on). It has 25 segments and 23 chord changes, with root, bass, triad, seventh, extensions and alternatives per segment, and stays **outside the repo** (it is someone's music). Status: **a development reference, not an answer key**: it has not been signed off by the owner, extensions are the least certain part, and it was drafted from the same notes the symbolic reader sees, so the "original MIDI" row is not independent evidence.

`bench/amt/score-chords.js` scores at every 8th note in the annotated bars (120 steps; 99 for quality, skipping the region with no third and the two marked uncertain). Columns are cumulative: root; root and triad class; root, triad and seventh. Change F1 counts a reading's chord changes within ±150 ms of the annotation's (maximum-cardinality one-to-one matching, `tests/metrics.js`). The scorer is `bench/amt/chord-scoring.js`, tested on synthetic annotations in `tests/amt-chord-scoring.test.js`: it scores to the end of the annotated ranges (an earlier version stopped at bar 45), and a reading's change at a range start is excluded just as the annotation's first chord is.

| Reading | Root | + triad | + seventh | Change F1 (P / R) | Regions per bar |
|---|---|---|---|---|---|
| Symbolic reader on the **original MIDI** | 70% | 62% | 46% | 47% (60 / 39) | 1.0 |
| Symbolic reader on Basic Pitch (default) | 80% | 75% | 61% | 46% (56 / 39) | 1.1 |
| Symbolic reader on Basic Pitch (stricter) | 79% | 74% | 60% | 41% (50 / 35) | 1.1 |
| Teardown audio detector (chord regions) | 64% | 49% | 10% | 49% (37 / 74) | 3.1 |

What it says:
- **The symbolic reader is not yet good, even on perfect notes.** Its root accuracy is 70% on the original MIDI, and only 50% in the arpeggio bars (88% in bars 1–8). That is the harmonic analysis failing, not the transcription, which is exactly the separation the experiment was meant to make. The cause is visible in bar 21, where the bass spells Cm and the reader goes with the upper voices (G minor).
- It beats the audio detector on root (70–80% vs 64%), triad (62–75% vs 49%) and seventh (46–61% vs 10%), but the vocabulary is part of that gap (the audio detector only says major or minor).
- On change times, the audio detector has the better F1 (49%) because it finds most changes (74% recall) at the cost of 3 times as many regions (37% precision); the symbolic reader finds fewer (39% recall) and is more often right when it does.
- Reading Basic Pitch's notes scored *higher* than reading the original MIDI (80% vs 70% at the root). I do not know why, and have not looked; one possibility is that the transcription drops the inner and ornamental notes that mislead the reader.

## Tuning: a small, mixed, one-track result

I swept bass weight (1.6, 3, 5), the bass-is-root bonus (0.35, 0.8, 1.5), the change cost (0.5, 0.9, 1.4) and the other-tones penalty (0.5, 0.25), tuning on one annotated range and testing on the other (the same piece, so this is not a real held-out test):
- Tuned on bars 1–8, the best setting (heavy bass) **drops the arpeggio bars from 50% to 32% root**. Not usable.
- Tuned on bars 18–24, the best setting (bass weight 3, change cost 0.5, other penalty 0.25) raises them from 50% to 77% root and the seventh from 36% to 66%, and costs bars 1–8 a little (root 88 to 84%, triad 77 to 72%, seventh 60 to 56%).
- I did **not** change the defaults. One piece with two ranges cannot choose between those, and the change cost still produces 26% change F1 in bars 1–8.

## What would make this a baseline

1. The owner signing off, or correcting, the annotation, and extending it to the rest of the piece.
2. More annotated pieces, including a piano-only one (the stated failure), with a development and a held-out split.
3. A reader that decides the bass role from the music: an arpeggiated bass line against sustained upper voices (bar 21) needs the bass pattern, not a weight.
4. Only then, tuning, and only against the held-out pieces.

## Reproduce

```
node bench/amt/score-chords.js --annotation "annotation.json" --ref-midi "more please.mid" --offset -8.571 --engine-audio "more please.mp3" --est out/bp_default.mid --est out/bp_tight.mid
node bench/amt/score-chords.js ... --only-range 1 --param bassW=3 --param change=0.5   # one range, with parameter overrides

node bench/amt/symbolic-chords.js "more please.mid" --offset -8.571 --bar1 0.571 --bpm 105 --from 18 --to 25 --print
node bench/amt/compare-chords.js --ref "more please.mid" --offset -8.571 --bar1 0.571 --bpm 105 --engine-audio "more please.mp3" --est out/bp_default.mid --est out/bp_tight.mid
```

(`out/` is the output of `bench/amt/run_basic_pitch.py`.)
