# Melody ground truth and note scoring

Scoring support for **vocal melody** and **instrumental lead** transcription (issue #23). It extends the benchmark harness (`bench/`); it is not a model, and it changes none of the 15 Version A gates. Synthetic scores here are regression measurements, **not** real-world accuracy.

## Why

The legacy "hook" check compared 16th-step grid positions on one synthetic song: it ignored pitch and duration, so a melody with the right rhythm and the wrong notes scored perfectly. `tests/transcription.test.js` has that exact case (onset-only F 1.00, onset+pitch F 0.00). Bass scoring is not a substitute for melody truth.

## Annotation format

Per track, in the manifest's `annotations` (paths relative to the manifest, hashed like every other annotation):

| Key | File format | Meaning |
|---|---|---|
| `melody_vocal` | `onset offset midi [tag ...]` per line | vocal melody notes |
| `melody_lead` | same | instrumental lead notes (synth lead, guitar, sax, ...) |
| `melody_vocal_f0`, `melody_lead_f0` | `time hz` per line (`hz <= 0` = unvoiced) | optional frame-level f0, enables raw pitch/chroma accuracy against real pitch movement |

Times are seconds; `midi` is a MIDI number, fractional for cents (60.5 = 50 cents up); `#` starts a comment. Tags (optional, after the pitch):

- `unpitched`: a vocal consonant, breath or noise burst. It is not a pitched note: never a miss, and an estimate that lands on it (onset within tolerance of its span) is ignored rather than charged.
- `ambiguous`: the annotators could not agree. Reported strictly (a miss if unmatched) and leniently (not a miss if unmatched; a match still counts).

A file with no notes is an annotated absence. Vocal and lead are separate kinds with separate files; a song may have both, one or neither.

### Scope, silence and per-kind regions

Everything from the region rules (`bench/README.md`, "Scorable regions") applies: half-open `[start, end)`, a note belongs to the region of its **onset**, undeclared emptiness fails the run, `"silent": [...]` declares annotated silence (now accepting `melody_vocal` and `melody_lead`), and a declared-silent region still charges hallucinated notes as false positives.

New: **per-kind scopes.** The vocal melody may have been annotated for 30 s while the beats cover the whole song:

```json
"scorableByKind": {
  "melody_vocal": [{ "start": 0, "end": 30 }],
  "melody_lead":  [{ "start": 0, "end": 10, "silent": ["melody_lead"] }, { "start": 10, "end": 40 }]
}
```

A kind with its own list ignores the track-level `scorable`; kinds without one use it, or the whole recording. Keys must be annotated event kinds; every list is validated like `scorable` (shape, order, duration, undeclared silence). Unavailable truth is never a false positive: predictions outside a kind's scope are dropped.

## Predictions (every candidate model, evaluated identically)

- **The analyzer's own output.** Its only melodic output is the "hook": one folded 4-bar loop repeated through its section. `bench/run.js` records it (`exported.hook`) and the scorer treats it as the instrumental lead (`source: "analyzer hook"`). It never stands for the vocal.
- **Any other model:** `node bench/score.js predictions.json --candidate model.json`, with
  ```json
  { "name": "my-model", "version": "0.3", "tracks": { "<track id>": { "melody_vocal": [{ "onset": 1.0, "offset": 1.4, "midi": 62 }], "melody_lead": [] } } }
  ```
  A kind the candidate **lists** is scored (an empty list means "found nothing": F 0). A kind it does **not** list is **not evaluated** (`null`, `melodyNotEvaluated`), never F 0 by default. With `--candidate` the analyzer's hook is not mixed in. The candidate file's path, sha256, name and version are recorded in `scores.json` (`meta.candidate`). Invalid notes (offset not after onset, MIDI outside 0 to 127) stop the run (exit 2).

## Metrics (configuration is reported in every result)

Matching is one-to-one and **maximum-cardinality** (the same matcher as the other event metrics), with `mir_eval.transcription` rules: onset within **±50 ms**, pitch within **±50 cents**, offset within the larger of **20 % of the reference note's duration** and **50 ms**; distances are rounded to 4 decimals before comparing and pitch distance uses mir_eval's arithmetic, so an edge value falls on the same side.

| Result | Meaning |
|---|---|
| `onset` | onset only (what the old hook check was; ignores pitch and duration) |
| `pitchOnset` | onset and pitch: **the headline note F** |
| `full` | onset, pitch and offset: the offset-aware score |
| `avgOverlap` | average overlap ratio of the `full` matches (informational: depends on which of several equally large matchings is chosen) |
| `offsetErrorMs`, `durationRatio` | on onset+pitch matches: median absolute/signed offset error, median duration ratio |
| `octave` | of onset-matched notes: wrong pitch, and how many are whole-octave errors |
| `fragmentation` | reference notes covered by 2+ same-pitch estimates (one note split up) |
| `merged` | estimates covering 2+ same-pitch reference notes (repeated notes glued together) |
| `lenient` | `pitchOnset` and `full` with unmatched `ambiguous` reference notes not counted as misses |
| `frames` | `mir_eval.melody` measures on one shared 10 ms grid: voicing recall, voicing false alarm, raw pitch accuracy, raw chroma accuracy, overall accuracy |

Frames: notes become frames by a monophonic rule (a frame is voiced if a note covers it; if notes overlap, the latest onset wins). With an f0 file the reference is that series (last sample at or before the frame; unvoiced if older than 2.5 median sample spacings); without one it is derived from the reference notes and the result says so (`frames.reference`). Reference and estimate share the time base, so no resampling is involved.

**Vacuous is not perfect.** Nothing annotated and nothing predicted gives `null` and `vacuous: true` (mir_eval returns 0 or 1 for several degenerate cases; here they are null so they cannot move an average). Predictions against an annotated-empty reference are false positives with F 0 (class `extra`).

Failure classes (`melody_lead`, `melody_vocal` in the report): `ok`, `timing-or-duration` (pitches right, offsets not), `octave`, `wrong-notes` (rhythm right, pitches wrong: the old blind spot), `fragmented`, `missed`, `extra`, `mixed`, `n/a`.

## Verification

- `tests/transcription.test.js` (in `npm test`): 25 note cases and 4 f0-series cases with hand-checked expectations: repeated notes merged and fragmented, glissando (staircase found, flattened), vibrato inside and outside ±50 cents (the ±60 cent case is checked against the analytic 2/π·asin(5/6) = 0.629), ornaments at 60 ms and 40 ms, annotated and vacuous silence, unpitched consonants, ambiguous notes, a melody switch, octave errors (up and two down), tolerance edges (50 ms, 50 cents, 20 % and the 50 ms floor), close notes needing maximum matching, double-triggered estimates, and out-of-range/partial intervals.
- `npm run bench:transcription`: `bench/crosscheck_transcription.py` re-evaluates those cases plus N seeded random cases (default 300; **1000 run: 19194 of 19194 values agree** within 0.001) with `mir_eval.transcription` and `mir_eval.melody`, using its own note-to-frame rule, region masks and unpitched handling.
- `npm run bench:melody`: `bench/score.js` end to end on the synthetic predictions (the analyzer's hook, perfect/octave/empty/unlisted/invalid candidates, per-kind scopes, undeclared silence, annotation errors, provenance) and `crosscheck_mir_eval.py` on every positive scenario (it rebuilds candidate notes and the analyzer's hook from the raw files).
- The synthetic lead line (`lead120_Amin`) now has an exact `melody_lead` annotation (generated with the audio; the audio is byte-identical).

## Version A on the exact synthetic lead line (`bench/baselines/version-a/melody/`)

| | |
|---|---|
| Onset only (the old hook check) | F 0.974 (P 0.949, R 1.000) |
| Onset + pitch | F 0.974 |
| Onset + pitch + offset | **F 0.753** |
| Median offset error / duration ratio | -6 ms / 1.00 (but 34 of 150 notes miss the offset tolerance) |
| Raw pitch accuracy (frames) | 0.800 |

The old metric showed a near-perfect hook. Judged as usable MIDI (right note, right place, right length) about three quarters of the notes are right, on a perfectly clean synthetic tone. One song, synthetic, a loop folded and repeated: this demonstrates the metric, not the analyzer's real-world quality.

## Annotation protocol for real recordings

1. **Two independent annotators** per track, working from the mix, never seeing the analyzer's output or each other's work. Prefer a **stem or the original MIDI** when the rights allow: transcribe from it and record that in the provenance, because dense mixes hide notes. A stem is evidence for the annotation, not the analyzed audio.
2. Annotate **pitched notes** only; mark consonants and breaths `unpitched`; mark notes you would defend neither way `ambiguous`. Annotate onsets at the perceived attack, offsets at the perceived release (reverb tails are not note length: say what you used). One voice per file; if two voices sing, annotate the lead voice and note it.
3. **Scope honestly.** Annotate whole passages and declare them in `scorable` / `scorableByKind`; declare silences (`"silent"`) instead of leaving gaps. Never annotate "the parts that worked".
4. **Agreement:** score annotator B against annotator A with this same scorer (`--candidate`), report onset, onset+pitch and full F and raw pitch accuracy where f0 exists. Agreement bounds how much any model score means.
5. **Adjudicate** every disagreement: a third person (or both annotators together) listens, decides, and the decision is recorded; unresolved cases keep the `ambiguous` tag. Human review of all `ambiguous` notes before the set is frozen.
6. **Normalize:** MIDI numbers (fractional for cents), seconds, one note per line, sorted by onset, no overlapping notes of one voice, offset after onset, tags lowercase. The loader rejects the rest.
7. **Split provenance:** the track's manifest entry records the split (`dev` or `holdout`) and, per kind, `annotationProvenance`:
   ```json
   "annotationProvenance": { "melody_vocal": { "annotators": ["A", "B"], "adjudicated": true, "source": "stem + listening", "agreement": { "onsetF": 0.96, "pitchOnsetF": 0.94 }, "date": "2026-12-01" } }
   ```
   It is copied into `scores.json` (`melodyProvenance`), recorded, never scored. Holdout rules (`bench/README.md`) apply unchanged: annotators of a holdout track are not the people tuning a model.

## Not done, and why

- **The two-track rights-cleared dry run** needs audio and annotators: it is blocked on issue #5. The scorer, format, protocol and a worked example are ready for it.
- No model is evaluated or recommended here, and no threshold, gate or baseline moved. Synthetic scores must not be presented as real-world accuracy.
- Polyphonic melody (several voices in one file), vibrato-aware note segmentation, and pitch-bend annotation beyond the optional f0 series are not scored.
