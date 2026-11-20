# Issue #32 audit: the synchronized producer workspace

Issue #32 ("Future: synchronized producer workspace for chords, notes, rhythm and corrections") is a **deferred** feature of the
research program #22. Its own text says: prototype only after the research baseline, and do not rebuild the removed Learn, Coach,
Journal or Sample Lab, or add decorative panels. This audit compares its checklist with what `main` (65a162a) already does, says
what is missing, and says what is safe to build before the research baseline exists. It is a reading of the code and a look at the
running app, not a user study: nothing here measures time-to-understand or correction effort.

## Status of the checklist

| #32 item | State on `main` | Where |
|---|---|---|
| Linked section selection and playback | Built | `Explorer.svelte`, `transport.svelte.ts`: one transport and one playhead across the arrangement and the piano roll (`tests/app-transport.test.js`) |
| Phrase loops, beat clicks | Built | Transport bar: Off / Section / 4 bars, Beat clicks (`song-tools.svelte.ts`) |
| Slow playback | Built | 50% / 75% / 100%, pitch preserved (`song-tools.svelte.ts` `setRate`) |
| Transcription-over-original audition | Built | "Check by ear" plays the detected parts over the song; disabled when out of date |
| Editable chord lane | Partly: one chord per bar | `PianoRollPanel.svelte` `setChord`. The chord strip shows chords that change inside a bar (chord regions), but a correction sets one chord for the whole bar |
| Drum events editing | Built (16-step grid per section) | `SectionDetail.svelte` `edited` |
| Pitch / onset / offset note editor | **Not built.** The roll is inspection-only | `MultiRoll.svelte` header: "Read-only by design" |
| Corrections propagate through TimeMap and saved data | Built for tempo, bar 1, meter, key, chord and drum edits (Phase 2d) | `docs/ROADMAP.md` section 9, `tests/app-corrections.test.js` |
| Visually distinguish observed notes, inferred chords, suggested voicings, user edits, unsupported areas | **Partly.** One "Estimated" badge for the whole roll; layers differ by colour; a corrected chord name was underlined with dots and its voicing looked like any suggested voicing; nothing keyed what each mark means | This change (below) |
| Raw vs quantized view; export phrases with timing and provenance | Export in three timings (original, tempo map, quantized) per part and range. There is no raw-vs-quantized *view* toggle on the roll | `docs/MIDI_EXPORT.md`, `PianoRollPanel.svelte` |
| Undo | **Not built** | grep for undo/redo finds only delete-confirmation text |
| Keyboard and touch usability, large-file performance | Not audited. The arrangement map and ruler handle pointer and some keys; the roll has no keyboard note navigation. Input limits exist (8 minutes) | not verified |
| Test with producers; time-to-understand; correction effort | Not done. Needs people, and the #22 pilot (#36) | n/a |

## What gates the rest

- A **note editor** writes user-authored notes into the saved result, so it touches persistence, export timing and stale-result
  rules. That is a "needs independent review" change under `AGENTS.md`, and it should wait for #29 (MIDI export round-trip and
  original-vs-quantized timing), so edits have a settled representation to be saved in.
- Editing is only worth building if the notes are good enough to be worth correcting. That is the question #23, #24, #25 and #28
  answer with real-music data (#36). Until then a note editor would polish output whose accuracy on real music is unmeasured.
- **Undo** is a prerequisite of any editor (every correction goes through `teardown.replace`, which builds a new object, so a
  history of previous results is feasible; the cost is saved-data size and its interaction with Phase 2d recomputation).

## What this change does

Only the provenance item, because it needs no new data, model or editing, and makes the existing estimates easier to judge:

- The voicings of bars the person corrected are their own layer on the roll, **Your chord voicings** (solid dark outline, light
  fill), separate from **Suggested chord voicings** (hollow purple). Both follow the one "Chords (suggested)" toggle.
- A corrected chord name in the strip carries a dot as well as the dotted underline.
- The roll's About popover has a six-row key: heard notes, heard bass, inferred chord names (a "?" marks a shaky guess), suggested
  voicings, your corrections, and blank or "–" areas (nothing read reliably: unknown, not silence). The popover scrolls when
  it is taller than the window.
- No legend strip was added: a previous change removed one on purpose (the part toggles above the roll name the parts).

## Recommended order for the rest (not started)

1. #29 settles the export representation. 2. Undo for corrections (small, independent). 3. A raw-versus-quantized view of the
roll, reusing the export timing modes. 4. Sub-bar chord corrections on chord regions. 5. Only after #23/#24/#28 show the notes are
worth correcting: the note editor, with Codex review. 6. Producer sessions (#36) to measure time-to-understand and correction
effort before any of 3 to 5 is called done.
