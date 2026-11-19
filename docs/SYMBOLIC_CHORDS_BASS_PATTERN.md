# Symbolic chords, follow-up: scorer fixes and a first bass-pattern term (2026-11-19)

Stacked on `docs/SYMBOLIC_CHORDS.md` (PR #44, kept as the initial baseline). Same caveats: one track, an annotation the owner has not signed off, 120 scored steps, nothing integrated.

## 1. Scorer fixes

Made in PR #44 itself (review findings, both reproduced): the 45-bar cap, the asymmetric change boundaries, and first-come matching of change times (now maximum-cardinality, `tests/metrics.js`), with `tests/amt-chord-scoring.test.js`. The numbers below use the fixed scorer. PR #43's note scorer got the same maximum matching (`bench/amt/note-matching.js`; same numbers on this track).

## 2. Does Basic Pitch win because of note durations?

Median length of bass notes (below C3): original MIDI 0.92 beats, Basic Pitch 0.99; upper notes: 0.73 beats against 0.61. Basic Pitch also writes 135 bass notes where the original has 107. So its bass is slightly longer and its upper voices shorter, which would shift the reader's duration-weighted evidence toward the bass. That is **consistent with**, but does not confirm, the duration explanation (a controlled extension of bass notes in the original MIDI, as a reviewer ran, is the test; I did not repeat it).

## 3. One bass-pattern term, tried once, not adopted

`bassPat` in `bench/amt/symbolic-chords.js` (default 0 = off): a bonus for each chord equal to the share of the bass-register attacks (below C3, each counted once) in a 4-beat window around the step whose pitch class is a chord tone. A C-G-E♭-G bass then favours Cm, not the most frequent note, G. The weight (1.0) and the window (4 beats) were fixed before looking; there was no sweep.

| Reading | bassPat | Bars 1–8: root / triad / seventh | Bars 18–24: root / triad / seventh |
|---|---|---|---|
| Original MIDI | 0 | 88 / 77 / 60 | 50 / 50 / 36 |
| Original MIDI | 1 | 69 / 53 / 40 | 50 / 50 / 36 |
| Basic Pitch notes | 0 | 88 / 84 / 70 | 71 / 68 / 54 |
| Basic Pitch notes | 1 | 72 / 49 / 35 | 86 / 82 / 61 |

- On Basic Pitch's notes the arpeggio bars improve (root 71% to 86%), but bars 1–8 get much worse (triad 84% to 49%).
- On the **original MIDI the arpeggio bars do not improve at all** (root 50%). The term does find Cm for bar 21 (`Cm7` from 20.3 to 21.4), but a window that straddles the bar line also puts Cm7 on the last two beats of bar 20, which the annotation calls Gm(add11), so the gain and the loss cancel.
- Why bars 1–8 suffer: those bars change chord inside the bar, and a fixed 4-beat window blurs the changes.

Reading: the idea (count bass attacks by pitch class, not by loudness or duration) is supported in bar 21, but one fixed window is the wrong shape. It needs candidate regions of different lengths (half a beat to two bars), each scored on its own evidence, aligned to where the bass pattern starts and stops. That is the next experiment; this one is not for adoption and the default is off.

## Not done
- No controlled duration experiment; no variable-length regions; no other annotated piece.
- The earlier parameter sweep (PR #44) was scored with the old scorer; its conclusions (mixed, defaults unchanged) stand, but its exact numbers were not rerun.
