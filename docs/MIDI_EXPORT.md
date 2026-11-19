# MIDI export: what it writes, and how it is checked

Issue #29, first engineering slice. This page says exactly what the exported MIDI is, so nothing downstream mistakes it for something else.

## What the files are

| File | Content | Source | Timing |
|---|---|---|---|
| 1 Kick, 2 Snare or clap, 3 Hi-hats | the detected drum pattern, per bar | analysis (`drumParts`) | **quantized**: whole 16th steps |
| 4 808 / Bass | the detected bass line folded to a 4-bar loop, repeated over the bars where the kick plays | analysis (`bassline`) | **quantized**, loop-repeated |
| 5 Chords (suggested) | triads built from the detected chord *names* (`chordFromName`), one per bar (the per-part and all-parts files use chord regions: docs/CHORDS.md) | **generated**, not heard in the audio | whole bars |
| 6 Hook (rough) | the detected melody folded to a 4-bar loop and repeated over the hook's section | analysis (`hook`) | **quantized**, loop-repeated |

**The full-song package is quantized.** Every note onset is a whole 16th step counted from bar 1 (24 ticks at 96 per quarter), so the file sits on a grid, not on the times the notes were actually played. Nothing is silently substituted: the file names, each file's track name and a text event inside each file say "quantized to the 16th-note grid ... not the original timing", and the chord file says "SUGGESTED voicings generated from the detected chord names, not transcribed from the audio". Original timing and a tempo map are offered for the melody, bass and chords from the piano roll (next section).

## Three timings (piano roll MIDI menu)

`domain.midiModes(a, grid, confirmed)` says which timings are available and why not; `partMidi(a, part, { timing, grid, range })` writes one part, `allPartsMidi(a, { timing, grid, range, tempo })` writes all of them as **one Type 1 file** (a tempo track, then Melody, Bass or 808, Chords (suggested)). 480 ticks per quarter.

| Timing | What the file holds | Available when |
|---|---|---|
| **Original timing** | the transcription's onsets and ends in audio seconds, written at one *reference tempo* (the export grid's tempo when beats were tracked, else the analysis tempo). Plays at the audio's time as long as the DAW uses that tempo (or imports the file's). DAW bar lines are not the song's. | the teardown has a full-track transcription (melody, bass) or chord names (chords). Not blocked by the beat grid or by a stale tempo correction: it does not use the grid for melody and bass. |
| **Follow tempo map** | notes placed on the tracked beats, with a tempo event wherever the beat length changes (microseconds carried forward, so beat k lands within 1 µs of the tracked beat). Notes play at their audio time *and* bar lines follow the song. The file starts at bar 1, or at the pickup bar when a note comes before it. | tracked beats (not the constant fallback), not stale. Tempo changes and drift are carried, not refused. Caveats when the downbeat or 4/4 are still assumptions. |
| **Quantized** | 16th-grid steps at one tempo, as before. A whole-track file starts one bar before bar 1 when the transcription has a pickup (notes in bar -1), and says so in its text, so the pickup is not dropped. An explicit range is never widened. | only when `exportGate` allows it (unchanged: stale, refused, needs confirmation). |

The gate is still the only rule for quantized MIDI and the bar-aligned WAV; it no longer blocks the other two timings. Chords are always suggested voicings of the detected chord names, each where its chord region starts and ends (see docs/CHORDS.md; one per bar for teardowns analysed before regions, and for a bar the person corrected), in every timing. A whole-track file (no range) starts at the pickup bar when the transcription has notes before bar 1, so the pickup is kept. Checked by `tests/midi-timing.test.js` (in `npm test`): original-timing and tempo-map onsets within 1 ms of the audio estimates; on `tempo_change_step`, `drift_fast` and `drift_slow` (quantized refused) a note on every tracked beat lands on a whole quarter note at its song bar and beat and within 1 ms of its audio time; Type 1 structure and track names; what is offered for a stale result, a fallback grid and a teardown with no transcription.

## Tempo, bar 1, meter

* **Tempo** is the TimeMap *export grid's* tempo (`exportGrid().bpm`, the least-squares slope through the bar-one anchor, written to microsecond precision), not the analysis' `a.bpm`, which is rounded to 0.1 BPM. At 128.0 vs a true 128.04 BPM that rounding is 130 ms of drift over 7 minutes. Without the option (`songMidiFiles(a)`) `a.bpm` is written, as before. After a tempo correction the grid is the labelled constant-tempo fallback, so the tempo is the corrected one.
* **Bar 1** is tick 0 in the full-song package. The lined-up WAV puts the first downbeat at its start, so MIDI and WAV start together. Leading silence, a pickup and a first downbeat before the audio are handled by that alignment, not by negative MIDI times (a note before bar 1 is refused). The piano-roll files keep a pickup instead (previous section).
* **Meter** is 4/4 only (other meters are refused by TimeMap). Every file now states it (time-signature event at tick 0); before, the file said nothing and a DAW assumed 4/4.
* A note ends **one tick early** (a release gap of 1/96 beat) so repeated notes re-trigger.

## Same-pitch notes

The SMF spec does not say what overlapping notes of one pitch mean, and players disagree, so the writer never produces them: a note still sounding when the next note of that pitch starts is cut just before it, and a second note with the same pitch and onset is written once (the longer one). Before this change an overlapping note's note-off could land after the next note's note-on, which swapped the two durations. The analyzer does not produce such notes on the current fixtures; the guard is for real recordings.

## Who may export

`domain.exportGate(a, map, confirmed)` is the single decision, used by the button *and* again at the click:

* stale (a tempo or "not 4/4" correction made without the audio) → blocked, confirmation or not;
* TimeMap `refused` (tempo changes, drift beyond the grid tolerance, other meters) → blocked; confirmation cannot lift it;
* `needs-confirmation` (the analyzer's 4/4 and downbeat are assumptions) → blocked until the person confirms both;
* `allowed` → exports, with the grid's tempo.

## How it is checked

* `tests/lib/smf.js` is an independent SMF and zip reader (no code shared with the writer).
* `tests/midi-export.test.js` (in `npm test`) decodes every file for every exportable Version A fixture and compares counts, pitches, velocities, onsets (within half a tick), durations (within 1.5 ticks), tempo (equals the export grid's), 4/4, track end, metadata and file names; plus repeated, overlapping, duplicate, octave and very long notes, bad input, and the export gate (stale, refused with confirmation, key-only correction).
* `tests/app-exports.test.js` downloads the real zip from the built app, unzips and decodes it, and checks the parts, tempo against the tracked beats, 4/4, grid placement and the labels.

## Not done (still open in #29)

* Importing into two DAWs and checking the result by ear and by eye: **manual, not done**.
* The symbolic event contract (pitch bend, voice labels, provenance and correction state per event). Original timing and tempo-map exports exist for the transcribed parts (above); the drum parts are still quantized only.
* The round trip is in the unit and product tests, not yet in the product benchmark (`bench/`) as a scored dimension.
* Comparing exported notes against the reference audio (onset detection on the WAV) rather than against the internal events and the tracked beats.
* Real-music fixtures: everything here ran on the synthetic fixtures.

## Per-part MIDI (beside the piano rolls and chords)

`domain.partMidi(a, part, { tempo, section })` writes ONE displayed part with the same `midiBytes` as the package (same grid, tempo, 4/4, same-pitch rules, labels), so there is no second writer.

| Where | Button | Writes |
|---|---|---|
| Notes tab, Top line | MIDI | the 4-bar phrase the piano roll shows (not the song-length repeat the package writes) |
| Notes tab, Bass | MIDI | the displayed 4-bar bass phrase |
| Harmony tab | Chords MIDI · bars x-y | one suggested triad per chord region (or per bar, for older teardowns) in the selected section, from that section's first bar |
| Harmony tab | Copy chord names | text only: `Am \| F G \| C \| G`, bars separated by `\|`, a bar's chords in order, `N.C.` where no chord was found |
| Export | Download the song as MIDI | the full package |

The buttons read the same gate as Export (`exportState`, wrapping `domain.exportGate`): locked until the bar lines are confirmed, locked with a reason when the grid is refused or the result is stale, and nothing on a part button can lift either. Files carry the same honesty labels (rough, quantized, suggested voicings). Checked in `tests/midi-export.test.js` (decoded notes equal the displayed notes) and `tests/app-part-midi.test.js` (the real downloads, the lock, the copied text).

## Tracks with no drums

`domain.noDrumsFound(a)`: no kick and no snare in the main pattern or any section's pattern. It says nothing about vocals or other instruments, so the page never says "instrumental". When true, the Rhythm tab and the Drums overlay button are hidden and one notice says so, with a "Show the drum tools anyway" button (the detector can be wrong, so hiding is never final). Tempo, beat clicks, arrangement, chords and notes are unchanged. Nothing is deleted and the analyzer's output is untouched.

The analyzer's section label "Groove" is its catch-all for a stretch with no clear change. It is kept in the data (Version A predictions are unchanged) but shown as "Whole track", "Steady part" or "Main part".
