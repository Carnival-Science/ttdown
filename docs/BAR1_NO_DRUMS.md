# Bar 1 and the beat phase when there are no drums (issue #50)

## The problem
On piano pieces the beat tracker locked half a beat late (all tracked beats on the MIDI's off-beats) and bar 1 was wrong. Measured with
`node bench/paired-renders.js` on four simple piano renders of someone's MIDI (kept outside the repo).

## What was found
1. The snare steps the tracker reports on a piano are its attacks. `!snare.some(Boolean)` is false, so the note vote for bar 1
   (Version B, B2) never ran. Confirmed by printing the pattern: all four pieces have snare steps.
2. Letting the vote run is not enough. Gating it on the measured "no drums" (`drumEvidence.found === false`, true on all four) moved
   big mac from 670 ms to 1559 ms off and changed nothing on bliss and angel. The pieces are syncopated: with the perfect MIDI
   onsets, more onsets fall on off-beat eighths than on beats for big mac (60 vs 75) and angel (65 vs 75), and bliss ties (40 vs 40). Bass notes, chord
   attacks and chord changes do no better, so no vote over note content can pick the phase.
3. The cue that works is structural: these renders are loops cut at a bar line, so the first sound is bar 1.
4. That cue is wrong for a piece that starts on a pickup. "more please" (two-note pickup) is correct today through the vote; applying
   the first-sound rule alone moved its bar 1 by 559 ms (downbeat F 1 to 0). So the vote goes first.

## The rule (engine.js, Version B, B3; constants in `BAR1`)
Only when the drum evidence measures no drums:
- the note vote decides if it has at least `voteMin` = 150 transcribed notes and a winner 1.2 times the runner-up (a winner of position 0 keeps bar 1 as it is);
- otherwise, if the audio starts within `startWithin` = 0.25 s, the first sound is bar 1: the beat lattice is moved half a beat when
  it sits on the off-beats and extended back to that sound (`downbeatFit.method` = `first-sound-v1`).

## Measured (paired renders, off = main before, on = this change)
| Piece | Bar 1 error off to on | Beat F off to on | Downbeat F off to on |
|---|---|---|---|
| big mac | 670 ms to 3 ms | 0 to 0.985 | 0 to 1 |
| bliss | 229 ms to 9 ms | 0 to 0.985 | 0 to 1 |
| an angel orchestrated | 659 ms to 15 ms | 0 to 0.985 | 0 to 1 |
| more please (pickup) | 12 ms to 12 ms | 0.997 to 0.997 | 1 to 1 |

`npm run benchmark` (15 gates), `bench:synthetic` and `bench:parity` (104/104) are the same before and after: no fixture in them reaches this rule.

## be all
Its MIDI header says 140 BPM but the render is about 137.8 BPM (a fit of the audio's note onsets to the MIDI note times, and the file name says 138).
Scored against a copy of the MIDI at 138: tempo 137.8, beat F 0.97, notes F 0.62. It still gets no bar 1: with under 16 tracked beats the engine
does not choose downbeats (a separate limit, unchanged here).

## Limits
- Thresholds were set from five real files by the person who read them: tuned, not held out. The four renders are no longer a clean scoring set.
- A pickup piece with fewer than 150 notes is anchored to its pickup (wrong by the pickup length).
- A file cut mid-bar with no drums is read as starting on bar 1.
- The synthetic fixtures in `tests/bar1-no-drums.test.js` are a regression guard, not evidence of accuracy.
