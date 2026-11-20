# Changelog

What changed in each release of Teardown, newest first. The app shows this file from the version number in its toolbar. To release: bump `version` in `app/package.json`, add a section at the top of this file (the heading must be `## vX.Y.Z (YYYY-MM-DD)`, with a `Features`, `Improvements` or `Fixes` heading above each list), and `npm test` checks that the two agree. Entries end with a PR or issue number where there is one.

## v0.1.0 (2026-11-19)

The first numbered release: the Svelte app (replacing the single-file page) with an analysis that says how each number is known, and a transcription done by a note model.

### Features
- Notes are transcribed with Spotify's Basic Pitch, run in your browser: every note it hears, split at C3 into Notes and Bass, instead of one rough melody. The teardown appears first and the notes arrive a moment later. On one test track it finds 90% of the notes (the old reading found 48%). (#43, #45)
- One piano roll with the notes, the bass and suggested chord voicings on one keyboard, with a chord strip, a bar and chord readout, and solo and hide for each part.
- A song map you can scrub: click to seek, drag to scrub, drag the view box to pan, double-click to fit a section, and the playing section is marked apart from the selected one.
- MIDI export of a part or all parts in three timings: original timing, following the song's tempo map, or quantized to the grid once the bar lines are confirmed. Every unavailable choice says why.
- Chords where they change, not one per bar: the analysis finds chord changes inside a bar, and the strip, the voicings and the chord MIDI follow them. (#41)
- Delete a saved teardown, or all of them, from the Recent list, with a confirmation. It only removes the copy saved in this browser.
- This changelog, and the version number in the toolbar. (#45)

### Improvements
- Whole-track MIDI keeps the pickup notes before bar 1. (#41)
- Steady tracks keep a constant tempo instead of being called variable.
- A tempo correction keeps the tempo you typed.
- Short messages ("Saved", "Deleted ...") appear as toasts; lasting state stays on the page.
- Corrections (tempo, bar 1, chords, key) recompute everything built on the bar grid, or mark it out of date when the audio is not on hand.

### Fixes
- Chord exports (whole track, a bar inside a longer chord, the full-song package) now agree with the piano roll. (#41)
- The pickup of a track is no longer dropped from whole-track exports. (#41)
