# Symbolic chord reading from transcribed notes: a first experiment (2026-11-19)

Status: **research prototype on one track, scored against a development-reference annotation that the owner has not signed off, nothing integrated.** Follows `docs/AMT_BASELINE.md` (PR #43) and feeds #26. #26 says "no algorithm rewrite prior to a measurable baseline": this is **not** that baseline (one track, an unsigned annotation). It tests a narrower question: does reading chords from *notes* hold up better than reading them from the audio, and how much does note-transcription error change the reading?

**Update (integration):** the reader is now the app's **default chord source whenever Basic Pitch's notes are available** (see "Integration" at the end). The research prototype and its scorer stay in `bench/amt/`.

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

## Integration: chords from notes are the default (2026-11-20)

`domain.chordRegionsFromNotes(a, G, notes)` (`src/domain.js`) is the prototype's reader on the app's grid: a chord at every 8th note of the tracked bar grid (pickup bar included), evidence from the notes in a one-beat window, one Viterbi pass, equal neighbours merged. It writes `a.chordRegions = { method: "chords-from-notes-v1", regions }` in the same format as the audio detector's, so the chord strip, the voicings, the bar.beat readout, the chord MIDI and the copied chord names follow without change (`domain.chordSpans`). When the notes arrive (and again when a tempo or bar-1 correction relabels them) the app replaces the audio detector's regions with these; a corrected bar still wins. With no notes, an untracked grid or a model failure, the audio detector's regions stay. The roll's About text says which source the chord names have.

**Differences from the research reader:** major and minor triads only (the audio detector's vocabulary), because every consumer builds triads from the chord name; sevenths, sus and diminished chords are not offered yet. Constants are the prototype's, unchanged and untuned.

**Pedal guard (2026-11-20, revised 2026-11-21):** the lowest-note root bonus is not given in a pedal bar. That is a bar whose lowest bass note (below C3) keeps one pitch class at every 8th that has one, whose neighbours' most frequent bass pitch class is the same, and where that bass is heard in every beat (in each beat, at least one 8th where it is the lowest bass note for at least half the 8th). A held bass under changing chords (such as an 808 on the key's root) is not each chord's root. Without the guard, `test-songs/pop127_Amaj` read its F#m bars as A (chord accuracy 75% in the app, against 99.8% for the audio detector). A bass that moves inside the bar is never a pedal. Two earlier versions in PR #59 got this wrong, both caught in review: using only the most frequent lowest note (A for 2.5 beats then F#m read as F#m from 1 s on; `tests/chords-from-notes.test.js` check 9), and treating no note below C3 as a held bass (A2 moving up to F#3; check 10). Where the bass moves the reading is byte-for-byte the same as without the guard (checks 8 and 10). The before/after on the synthetic songs and the reproduction commands are in PR #59; `bench/amt/app-chord-check.js` scores the app's reader from two checkouts on the same captured notes. Not yet measured on real music.

**Measured on *more please*** (Basic Pitch notes from the app, the engine's own grid, the same annotation as above: a development reference the owner has not signed off, and the piece the reader was set up on, so this flatters it):

| Range | Reading | Root | + triad | Change F1 (P / R) | Regions per bar |
|---|---|---|---|---|---|
| all annotated bars | chords from notes (now) | 88% | 80% | 55% (65 / 48) | 1.1 |
| | audio detector (before) | 64% | 49% | 47% (36 / 70) | 3.0 |
| bars 1-8 | chords from notes | 88% | 77% | **29%** (38 / 23) | 1.0 |
| | audio detector | 88% | 74% | 59% (57 / 62) | 1.8 |
| bars 18-24 (arpeggios) | chords from notes | 89% | 82% | 84% (89 / 80) | 1.3 |
| | audio detector | 38% | 30% | 39% (26 / 80) | 4.4 |

The notes-based reading is much better in the arpeggio bars and about equal in the opening, but it **finds fewer chord changes in bars 1-8** (change F1 29% against 59%): it prefers a steady chord and misses short ones. Nothing was measured on any other real piece, on a piece with vocals or drums, or on the synthetic songs (the model cannot run in Node; their chord truth is for the audio detector's gate, which is unchanged). `tests/chords-from-notes.test.js` (in `npm test`) covers the reader on synthetic notes; `tests/app-basic-pitch.test.js` checks the regions in the page after the real model ran.

Reproduce the table: dump the notes of the page (`window.__td.transcription`, bench build, `window.__ttBasicPitch = true`) and score `chordRegionsFromNotes` output and the audio regions with `bench/amt/chord-scoring.js` (`prepare`, `score`) against the annotation.

## Chord boundaries: each change is re-placed by at most one 8th (2026-11-21)

**Problem.** On *more please* the app's chord changes came an 8th note early (273 ms at 105 BPM): the F that is struck on the "and" of beat 4 started on beat 4, and the same at the Gm and the A♯. The cause is the evidence window. A chord at an 8th is scored from the notes in a one-beat window around it (`CFN.win`, half a beat each side), which is right for NAMING a chord (an arpeggio's notes all count) but lets the next chord's notes vote before they sound.

**Change.** The names are decoded exactly as before. Afterwards each change is re-placed by at most one 8th, either way, by comparing four 8ths around it that are the same for every candidate position. The evidence for each 8th is what sounds *inside it*: a note that begins in it (within 40 ms of its edges, for the note model's onset jitter) counts double, a held-over note once, and the root bonus goes to the lowest note sounding in it. A bass note below C3 that is a tone of the new chord and not of the old one, struck in the first 8th of the new region and not in the one before, adds a small bonus: where an 8th has no evidence either way, the change goes to the first 8th in which the new chord's bass is struck. A region never collapses and never swaps places with a neighbour. Each change is re-placed once, from where the decoding put it (a first version re-met a boundary it had just moved and could move it two 8ths; `tests/chords-from-notes.test.js` check 12 compares 300 pseudo-random fixtures with and without the re-placement, `opts.refine = false`). Constants: `CFN.refine`, `attack` 2 (bass-register notes only), `jitter` 0.04, `anchor` 0.3, `refineMargin` 0.05.

**Measured** on the one annotated track (`more please.mp3`, annotation v2, development reference, owner has not signed it off), the app's own note capture, `bench/amt/app-chord-check.js` for the scores and `bench/amt/chord-boundaries.js` for the timing (one-to-one matching, `matchOneToOne` in `bench/amt/chord-scoring.js`; a first version could count one boundary for two annotated changes, which changed main's figures from 16 matched / 96 ms to 15 / 83 ms):

| | main (1775c8b) | this change |
|---|---|---|
| root (120 steps in the annotated ranges) | 88.3% | 91.7% |
| root + triad | 79.8% | 81.8% |
| chord-change F1 within ±150 ms (P / R) | 55.0% (65 / 48) | 70.0% (82 / 61) |
| annotated changes matched one-to-one to a boundary within 300 ms | 15 of 23 | 15 of 23 |
| of those: more than 20 ms early / late / within 20 ms | 4 / 0 / 11 | 1 / 0 / 14 |
| mean absolute boundary error (of the matched ones) | 83 ms | 30 ms |
| reading boundaries in the annotated ranges left unmatched | 2 | 2 |

The 13 ms that most boundaries still show is the annotation's own offset from the beat grid (every on-time boundary reads +12 to +14 ms), not an error of the reading. One boundary is still an 8th early (the Dm7 of bar 3, annotated 3.4.5, 273 ms early, as on main): the reading has no bass or other evidence there that tells Gm from Dm. Not measured: any other track, with or without a chord annotation.

A synthetic check with a known answer agrees: every bar of the fixture in `tests/chords-from-notes.test.js` (check 10) changes A to F♯m at 2.5 beats; main put every F♯m at beat 3 or 4 (250 to 300 ms early at 120 and 100 BPM); it is now at 2.5 beats, within 10 ms, at 100, 120 and 140 BPM. The chord names are unchanged in all of those cases.

**What this does not fix, and the limits.**
- The constants were chosen while looking at this track (an attack weight on every note, rather than bass notes only, moved the Gm to Dm change at 3.4.5 a step the wrong way, for instance), against an annotation that is a development reference. They have not been tested on a second annotated track, so the numbers above are on the data they were fitted to.
- 8 of the 23 annotated changes still have no boundary near them: the F13 and F♯dim7 of bar 2 and similar chords that differ only by an extension or a seventh, which a major/minor-only vocabulary cannot name. That is the next step (diminished, then sevenths), not boundary placement.
- A boundary moves by one 8th at most. A change the Viterbi pass puts two 8ths away is left there.
- Chords that begin between two 8ths (a 16th-note anticipation) are still placed on an 8th.

Reproduce: capture once with `app-chord-check.js capture`, then `node bench/amt/chord-boundaries.js --capture capture.json --annotation ann.json --baseline-repo DIR_OF_MAIN --list` and `app-chord-check.js score ... --baseline-repo DIR_OF_MAIN`. The capture of real music stays outside the repository.

## Chord vocabulary: diminished, diminished seventh and augmented (2026-11-22)

**Problem.** The reader chose among 24 chords (12 major, 12 minor), so the chromatic F♯dim7 that steps into the Gm in *more please* (bar 2 beat 4, and again in bar 24) had to be called F♯m or Gm. Every consumer built a triad from the name with `endsWith("m")`.

**Change.** Candidates are now major, minor, diminished (`Bdim`), diminished seventh (`F#dim7`) and augmented (`Caug`), 60 in all. `chordParse(name)` in `src/domain.js` is the one place that turns a name into a root and intervals, and `chordFromName`, `chordNotes` and the roll's voicing (`PianoRollPanel.svelte`) use it, so a dim7 is drawn, exported to MIDI and spelled with four notes; a name it does not know (a seventh, a sus) gives no notes instead of a wrong triad. A four-note diminished seventh is the same four notes from four roots; the lowest note picks the root. The new chords must earn their place: an emission cost of 0.25 (dim, aug) and 0.35 (dim7) is subtracted, so that a minor chord with a passing tone is not turned into a diminished one (tests 13 and 14 of `tests/chords-from-notes.test.js`).

**Measured** on *more please* (annotation v2, development reference, the app's own capture), against `main` with boundary placement merged (#69, ca52ca5), re-run on the vocabulary branch after the rebase (871934f):

| | before | after |
|---|---|---|
| root | 91.7% | 91.7% |
| root + triad | 81.8% | 85.9% |
| chord-change F1 (P / R) | 70.0% (82 / 61) | 73.2% (83 / 65) |
| annotated changes with a boundary within 300 ms | 15 of 23 | 16 of 23 |
| diminished chords in the whole 40-bar reading | 0 | 3: F♯dim7 at bar 2 beat 4 (annotated there) and bar 10 beat 3.5; F♯dim at bar 24 beat 3 (annotated F♯dim7: the seventh holds under 5% of the evidence there, so the tone rule keeps it a triad) |

**What this does not show.**
- The two costs were chosen while looking at this track, from the range that gives the F♯dim7s (bar 2 and, as F♯dim, bar 24) and no other diminished chord in the 40 bars (one cost for all three, tried at 0.15 / 0.25 / 0.35 / 0.5: nine, six, three and no diminished chords in the 40 bars; then dim and aug lowered to 0.25 so that a plain diminished triad beats a minor one with a missing fifth, which at 0.1 added Adim and G♯dim; since the tone rule (every tone of a diminished or augmented candidate needs 5% of the evidence) bar 24 reads F♯dim, not F♯dim7). The owner's note on the app's earlier output (F♯dim7 missing; the A♯ bars right) is the only check on the unannotated bars. No second piece.
- At a dim7 cost of 0.15 the reading also found Ddim7 at bar 4 beat 3 (annotated, low-medium confidence, "Ddim7") and Ddim7 in bars 27 and 31, where the owner's earlier review accepted A♯; at 0.35 the annotated Ddim7 is not read. That trade is made in favour of fewer false chords.
- A chord that lasts one beat (an 8th plus change cost) is only read when its notes are strong; test 13 uses two beats.
- Still not read: dominant, minor and major sevenths, half-diminished, sus, inversions, ninths and other extensions. The annotation's F13, Gm7, Gm11 and similar remain Gm/F-triads. Enharmonic spelling (E♭ for D♯) is a separate step.
- The audio detector (used when there are no notes) is unchanged: major and minor only.

## Chord list with times
The roll's popover has "Copy chords with times" and "Save chord list (.csv)" next to "Copy this section's chord names" (`chordTimingText` / `chordTimingCsv` in `src/domain.js`, built on `chordSpans`). One row per chord in the selected section: bar and beat (1-based, `3.5` is the "and" of beat 3), the start time as `m:ss.mmm`, and for the .csv also the end time in seconds and the chord's notes. Times are the audio's own timing (a chord region's detected time, else its place on the tracked grid), not quantized to a tempo. A chord that began before the section starts at the section's first bar line. Tested in `tests/chord-regions.test.js` (3b). Not verified: how a particular DAW reads the pasted text; the clipboard and file save are exercised by hand only, not by an automated browser test.
