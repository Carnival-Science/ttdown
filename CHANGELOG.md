# Changelog

What changed in each release of Teardown, newest first. The app shows this file from the version number in its toolbar. To release: bump `version` in `app/package.json`, add a section at the top of this file (the heading must be `## vX.Y.Z (YYYY-MM-DD)`, with a `Features`, `Improvements` or `Fixes` heading above each list), and `npm test` checks that the two agree. Entries end with a PR or issue number where there is one.

## v0.1.0 (2026-11-19)

The first numbered release: the Svelte app (replacing the single-file page) with an analysis that says how each number is known, and a transcription done by a note model.

### Features
- Notes are transcribed with Spotify's Basic Pitch, run in your browser: every note it hears, split at C3 into Notes and Bass, instead of one rough melody. The teardown appears first and the notes arrive a moment later. On one synthesized test track it finds 90% of the notes (the old reading found 48%); real mixes are untested. (#43, #45)
- One piano roll with the notes, the bass and suggested chord voicings on one keyboard, with a chord strip, a bar and chord readout, and solo and hide for each part.
- A song map you can scrub: click to seek, drag to scrub, drag the view box to pan, double-click to fit a section, and the playing section is marked apart from the selected one.
- MIDI export of a part or all parts in three timings: original timing, following the song's tempo map, or quantized to the grid once the bar lines are confirmed. Every unavailable choice says why.
- Chords where they change, not one per bar: the analysis finds chord changes inside a bar, and the strip, the voicings and the chord MIDI follow them. (#41)
- Delete a saved teardown, or all of them, from the Recent list, with a confirmation. It only removes the copy saved in this browser.
- This changelog, and the version number in the toolbar. (#45)

### Improvements
- Tracks without percussion, such as a solo piano piece, say "No drums found" and hide the drum tools, instead of showing a made-up drum pattern. It measures how much of the sound is percussive; a very quiet drum part can be missed, and it does not detect vocals. (#61)
- Chords are read from the transcribed notes when they are there, which follows arpeggios far better than hearing them in the audio; major and minor chords only, and the roll says where the chord names came from. On one test piece the chord's root is right 88% of the time (the audio reading: 64%), but it finds fewer of the short chord changes at the start. (#44, #51)
- A new light look: paper, ink, lime and cobalt, with halftone circles, rings that show each analysis stage, a timeline view that glides to a section, and a confirmation when a teardown is saved. (#46)
- Whole-track MIDI keeps the pickup notes before bar 1. (#41)
- Steady tracks keep a constant tempo instead of being called variable.
- Bar 1 lands on the first chord of music without drums, and the beats no longer slide onto the off-beats.
- A tempo correction keeps the tempo you typed.
- Short messages ("Saved", "Deleted ...") appear as toasts; lasting state stays on the page.
- Corrections (tempo, bar 1, chords, key) recompute everything built on the bar grid, or mark it out of date when the audio is not on hand.

### Fixes
- Chord exports (whole track, a bar inside a longer chord, the full-song package) now agree with the piano roll. (#41)
