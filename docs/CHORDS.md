# Chords: where they change, not one per bar

Until now the analyzer named **one chord per bar** (`chords.bars`). Real music often changes chord inside a bar: an anticipation on beat 4&, two chords per bar, a passing chord on beat 4. On the paired render "more please" (audio rendered from a MIDI file the person wrote), about 70% of the original's simultaneous note attacks fall somewhere other than a bar line.

## What the analyzer reports

`analysis.chordRegions = { method: "chords-v2", regions: [{ t0, t1, bar, beat, endBar, endBeat, c }] }` (`src/engine.js` `chordRegions`), added after every Version A field. `chords.bars` is unchanged and still used for the key check, the loop and per-bar corrections.

1. **Evidence at every 8th note** of the bar grid, including the pickup bar:
   - a pitch-class profile, with C2–B3 from 8192-sample spectra (for pitch resolution) and C4–B5 from 4096-sample spectra (for timing);
   - the bass from the **transcribed bass line**, not the spectrum, because the kick drum otherwise reads as a bass note.
2. **Scores** for every major and minor triad, plus "no chord", at each 8th, as log-probabilities. The score adds:
   - a bonus when the bass is on the root (a smaller one when it is on the third or fifth);
   - a small penalty for chords outside the key;
   - a preference for the bar's own chord (`chords.bars`, read from the whole bar), so the steady reading wins unless the 8ths clearly say otherwise.
   
   A **pedal** (one bass note held under changing chords) is ignored: where the bass in the surrounding ±2 bars is at least 85% one note, it is not used.
3. **One Viterbi pass** picks the sequence. Each change costs something, more on an off-beat 8th and less on a bar line, so a passing melody note does not become a chord.
4. **Adjacent 8ths with the same chord merge** into one region. Each region keeps its real start and end, in seconds and as bar plus beat (in 8ths). A region need not start on a bar line.

Triads only (major or minor), as before. Sevenths and other chord types are the next step.

## How the app uses them

`domain.chordSpans(a, grid)` returns the chords in time. It uses the regions when the teardown has them, and falls back to one chord per bar for teardowns saved before regions existed. A bar the person corrected shows their chord for the whole bar, and the region it cut keeps the rest.

Everything that shows or writes chords uses `chordSpans`:
- the piano roll's chord strip and its purple suggested voicings;
- the bar.beat · chord readout;
- the chords MIDI in all three timings (per part and all parts), cut at the exported bars: a chord that began before the range and still sounds in it is kept, and with no range and no section ("Whole track") every bar is written, from the pickup bar when there is one;
- `songNotes` (the full-song MIDI package and the Check by ear overlay);
- the copied chord names: `Eb F | F | Gm | Dm`, bars separated by `|`, with a bar's chords in order.

Clicking a chord opens the correction for its bar. When the bar holds more than one chord, the correction lists them and says a correction sets one chord for the whole bar.

## How well it works (measured, not claimed)

Tuned on the eight synthetic test songs and **one** real paired render, so treat the real-music numbers as a first reading, not a benchmark.

The two metrics:
- **Exact chord:** checked at every 8th. On "more please" the reference is the best triad on the original MIDI's sounding notes, with a bonus when the lowest note is the root. On the synthetic songs it is the truth `.lab`, sampled every 0.1 s.
- **Change boundaries F:** a detected change counts within ±150 ms of a change in that reference.

| | One chord per bar | Chord regions |
|---|---|---|
| Synthetic songs, exact chord | 0.994 | 0.994 (no worse) |
| "more please", exact chord | 0.386 | 0.655 |
| "more please", same root | 0.470 | 0.727 |
| "more please", change boundaries F | 0.27 | 0.68 (precision 0.90) |
| "more please", regions starting off a bar line | 0 of 39 | 79 of 106 |

The opening of "more please" now reads E♭ → F on beat 4& of bar 1, then a change on beat 4 of bar 2. The original has E♭ → F (beat 4&) → F7 → D7/F♯. The second F and the D7 are out of reach for a triad-only reader: it reads them as F and F♯m.

`tests/chord-regions.test.js` (in `npm test`) covers:
- a synthetic track whose chord changes on beat 3 of every other bar;
- the spans, corrections and the pickup;
- the chord names text and the chords MIDI.

`tests/app-pianoroll.test.js` §7 covers the strip, the voicings and the correction in the page.
