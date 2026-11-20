# The note model in the app: Spotify Basic Pitch (2026-11-19)

Teardown now transcribes notes with **Spotify's Basic Pitch**, run in the browser tab, instead of showing only the engine's own rough melody and bass. Chords, tempo, bars, sections and drums are unchanged (the existing engine). Evidence for the choice: `docs/AMT_BASELINE.md` (PR #43): on one paired render the engine's export scored onset F1 52.2% and Basic Pitch 83.5%.

## What runs where

1. The engine analyses the track as before (about 3 s for 1:33). The teardown appears at once, with the engine's rough notes.
2. In the background, `app/src/lib/audio/basic-pitch.ts` resamples the decoded audio to mono 22.05 kHz, loads the model (about 0.9 MB, `app/public/models/basic-pitch/`) and the tf.js runtime (a lazily loaded 1 MB chunk) and runs Basic Pitch. The status line says "Transcribing the notes… 40%". Nothing is uploaded.
3. The notes replace the engine's: `domain.transcriptionFromNotes` splits them at C3 (MIDI 48) into **Bass** (below) and **Notes** (the rest; the field the melody used, so the roll, the exports and saved data work unchanged), and labels each with its bar, beat, length and section from the TimeMap grid. On and off times stay at their real times.
4. The result is saved with the teardown (about 50 KB for 540 notes). A tempo or bar-1 correction relabels the same notes on the new grid without running the model again.

The piano roll and exports call the upper part **Notes**, not Melody: Basic Pitch writes every note it hears. Chord voicings stay a separate, suggested layer. MIDI files say "rough transcription of the audio by Spotify's Basic Pitch".

If the model cannot load or run (offline, blocked, unsupported browser), the engine's notes stay on screen and a toast says so; nothing else changes. The engine's transcription is still computed, as the fallback.

## Settings

The library defaults, the same as the Python package's: onset threshold 0.5, frame threshold 0.3, minimum note length 11 frames (about 128 ms). **Not tuned** on any track. `BASIC_PITCH` in `basic-pitch.ts` records them, and the saved `transcription.method` names them.

## Measured

- **Same notes as the research run:** on the paired render *more please* the in-app result is 679 notes (544 Notes, 135 Bass), onset F1 83.5% (P 78.1, R 89.8), both pickup notes found, identical to the Python run in PR #43.
- **Time (headless Chromium, no GPU):** 1:33 of audio takes about 76 s on the CPU backend, which is what the worker uses. The model runs in a Web Worker, so the page stays usable the whole time (`tests/app-notes-responsive.test.js`: a click is served within 200 ms; with the model on the page's own thread the same click timed out after 10 s). Before the worker, the CPU backend blocked the page for 70 s in one task, which is what failed the Firefox journey in CI (PR 45). The WebGL backend is **not used**: inside the worker it stalled at 5% for over 8 minutes in headless Chromium (software GL). It can be forced with `window.__ttBpBackend = "webgl"`. **A real GPU would likely be faster, but I have not measured one.**
- **Size:** the app's main chunk is unchanged; the tf.js chunk (1.0 MB) and the model (0.9 MB) load only when a track is transcribed.

## Not verified

- Accuracy on anything but one clean synthesized chiptune track (no vocals, drums, reverb or mastering). Real mixes will be harder; the About text in the roll says it has been checked on one track only.
- Speed and memory on real devices (phones especially), and for an 8-minute track.
- The licence of the **trained weights** separately from the code (the npm package is Apache-2.0; no separate weights licence was found; `app/public/models/basic-pitch/SOURCE.txt`).
- Basic Pitch's own limits: lengths are rough (onset+offset F1 about 35 on that track), octave errors and doubled notes were not analysed, and the notes are not separated by instrument.
- Chords still come from the engine's audio detector. A reader that takes chords from the notes (`docs/SYMBOLIC_CHORDS.md`, PR #44) scored better on one annotated track but was not good enough to adopt.

## Tests

- `tests/basic-pitch-transcription.test.js` (in `npm test`): the note-to-transcription mapping, labels, pickup, and the MIDI files, on synthetic notes.
- `tests/app-basic-pitch.test.js` (in the app tests): the real model in the page, the status line, the notes, the roll labels, the MIDI files, saved data and the failure fallback. The bench build skips the model unless a test opts in (`window.__ttBasicPitch`), so the other browser tests keep their speed.
