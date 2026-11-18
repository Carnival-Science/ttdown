# Time-model fixtures: where Version A fails

Twelve synthetic songs (manifest **v2**) whose timing is **not** a constant-tempo 4/4 loop starting at 0:00, run through the frozen analyzer (Version A, `analyzer-baseline-a`, `index.html` sha256 `a14fea96…`) with the real-music harness. This is the evidence the TimeMap migration is supposed to act on, collected **before** any consumer (chords, sections, exports, overlays) was moved onto it.

Reported, **not gated**: no threshold was set from these results, and CI only reports them. Truth is exact by construction, but each condition is a single fixture (n = 1), so nothing here is a rate. They say what breaks, not how often it breaks on real music.

- Manifest history: v1 had a 10-minute track (`long_10min`); the page now refuses anything over 8:00, so v2 replaces it with a 7-minute one. The v1 Version A run is kept in `bench/baselines/version-a/time-fixtures-v1/` and is the source of finding 6 below.
- Generator: `test-songs/make_time_fixtures.py` (own seed `20261117`, never used to tune anything; deterministic, audio and annotation hashes identical across two generations). Manifest `test-songs/time-fixtures/manifest.json` v1.
- Reproduce: `npm run songs:time && npm run bench:time-fixtures`; to force the frozen Version A page, run `bench/run.js` with `--page versionA.bak.html` (see `docs/BASELINE_A.md`). Stored run: `bench/baselines/version-a/time-fixtures/` (v2) and `time-fixtures-v1/`.
- Recorded on Apple M1, Node 24.19, Chromium 159, 12/12 tracks scored, 0 page errors.

## Results

| Fixture | Tempo truth → est (class) | Tracked beat F | Tracked downbeat F | Exported-grid beat F | Exported-grid max drift (class) | Kick / snare F (exported MIDI, ±50 ms) | Chords maj/min | TimeMap: local tempo steady? | TimeMap: tempo changes | TimeMap: pinned export grid error, max / RMS | TimeMap: export state (what the analyzer's assumed 4/4 needs, or why refused) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| leading_silence_2s | 120 → 120 (ok) | 0.99 | 0.98 | 0.96 | 6 ms (ok) | 0.98 / 0.98 | 1.00 | yes | 0 | 9 / 4 ms | needs-confirmation (downbeat, meter) |
| pickup_1beat | 120 → 120 (ok) | 0.98 | 0.98 | 0.98 | 4 ms (ok) | 1.00 / 0.99 | 1.00 | yes | 0 | 7 / 3 ms | needs-confirmation (downbeat, meter) |
| pickup_2beats_late | 118 → 118 (ok) | 0.99 | 0.98 | 0.98 | 2 ms (ok) | 0.98 / 0.99 | 1.00 | yes | 0 | 8 / 4 ms | needs-confirmation (downbeat, meter) |
| halftime_140 | 140 → 140 (ok) | 0.98 | 0.96 | 0.99 | 7 ms (ok) | 0.94 / 0.94 | 1.00 | yes | 0 | 9 / 4 ms | needs-confirmation (downbeat, meter) |
| dnb_174 | 174 → 87 (half) | 0.66 | 0.00 | 0.66 | 55.2 s (slipped-beats) | 0.57 / 0.89 | 0.67 | yes | 0 | 7 / 3 ms | needs-confirmation (downbeat, meter) |
| drift_slow | 120.5 → 120.5 (ok) | 0.99 | 0.96 | 0.99 | 53 ms (ok) | 0.69 / 0.70 | 0.99 | yes | 0 | 52 / 26 ms | refused: tempo-drift |
| drift_fast | 114.1 → 114 (ok) | 0.99 | 0.96 | 0.31 | 659 ms (slipped-beats) | 0.08 / 0.04 | 0.84 | no (±5.1 %) | 1 | 707 / 326 ms | refused: tempo-changes |
| tempo_change_step | 120 → 120 (ok) | 0.70 | 0.60 | 0.68 | 4.7 s (slipped-beats) | 0.74 / 0.71 | 0.91 | no (±6.4 %) | 3 | 237 / 106 ms | refused: tempo-changes |
| halftime_breakdown | 128 → 128 (ok) | 0.93 | 0.91 | 0.93 | 7.5 s (slipped-beats) | 0.88 / 0.87 | 1.00 | yes | 0 | 10 / 4 ms | needs-confirmation (downbeat, meter) |
| meter_3_4 | 120 → 120 (ok) | 0.99 | 0.29 | 0.99 | 7 ms (ok) | 0.49 / 0.78 | 0.81 | yes | 0 | 8 / 4 ms | needs-confirmation (downbeat, meter) |
| meter_5_4 | 140 → 140 (ok) | 0.98 | 0.22 | 0.99 | 10 ms (ok) | 0.42 / 0.00 | 0.85 | yes | 0 | 7 / 3 ms | needs-confirmation (downbeat, meter) |
| long_7min | 128 → 128 (ok) | 1.00 | 1.00 | 1.00 | 3 ms (ok) | 1.00 / 1.00 | 1.00 | yes | 0 | 11 / 4 ms | needs-confirmation (downbeat, meter) |

Columns: *tracked* = the beats and downbeats the engine's tracker produced; *exported grid* = the `firstDown + n * barSec` grid that chords, sections, MIDI and the aligned WAV use today; *TimeMap* = `src/timemap.js` built from the tracker's own grid with the engine's 4/4 labelled "assumed"; the export state is the three-state gate (`allowed`, `needs-confirmation`, `refused`), where `needs-confirmation (downbeat, meter)` is what any engine result gets until a person confirms the first downbeat and the meter. The pinned export grid is the single-tempo grid an exporter would write, anchored on the tracked downbeat.

## What fails, and why

**Passes.** Leading silence (2 s), a 1-beat and a 2-beat pickup, and a 7-minute recording are handled: tempo exact, beat and downbeat F 0.98 to 0.99 (the 7-minute track scores 1.00 throughout), exported grid within 6 ms. Half-time feel at 140 is read as 140, matching the annotation. The synthetic version of these cases is not the hard version; real intros are untested.

**1. The exported grid ignores a tracker that is right (drift).** On `drift_fast` (120 to 108 BPM) the tracker follows the drift (tracked beat F 0.99) but the exported grid scores beat F 0.31, kick/snare F 0.08/0.04, and chords fall to 0.84. This is the structural defect from the audit, now measured: the information exists and is discarded. On `drift_slow` (0.8 % drift) the grid-drift class says `ok` (53 ms, inside ±70 ms), yet exported kick/snare F at ±50 ms is only 0.69/0.70 against 0.98 on the constant fixtures: the pass/fail class hides event-level damage. Moving consumers onto the tracked grid is justified by these two rows.

**2. Tempo octave (`dnb_174`).** Read as 87: beat F 0.66, downbeat F 0.00, kick 0.57. The "55 s drift" is the metric counting beats at the wrong metrical level, not physical drift. TimeMap cannot see this: the tempo is steady and the grid stable, so the only barrier to export is the confirmation step (`needs-confirmation`), and a consistent 87 BPM grid is still the wrong musical reading. Consistency is not correctness. Fixing it needs tempo/octave evidence (alternatives with scores), not a time model.

**3. A tempo step defeats the tracker itself (`tempo_change_step`, 120 to 150).** Tracked beat F 0.70, downbeat F 0.60: the single-period tracker does not follow the change, so TimeMap built from its beats is also wrong. TimeMap does notice the instability (local tempo ±6.4 %, three "changes" where the truth has one) and refuses export, which is the right outcome for the wrong reason. A tempo-adaptive tracker is a separate piece of work.

**4. Half-time breakdown (`halftime_breakdown`).** The tracker holds 128 BPM pulses through the 64 BPM section (beat F 0.93 against an annotation at 64). Both readings are defensible; the annotation convention decides. TimeMap sees steady tempo and treats it like any other stable grid (`needs-confirmation`). The "7.5 s drift" is again beats counted at different levels.

**5. Meter is silently forced to 4/4 (`meter_3_4`, `meter_5_4`).** Tempo and beats are right (F 0.99, 0.98) but tracked downbeat F is 0.29 and 0.22, chords 0.81 and 0.85, 5/4 snare 0.00. The UI still reports "N bars of 4/4". The gate says `needs-confirmation` because the meter is only *assumed*; it cannot refuse these until meter detection exists, and it would allow them if someone confirmed the assumed 4. Disclosure in the UI is the cheap interim fix.

**6. Long recordings were silently truncated (v1 `long_10min`, 10:00).** The engine analyses rhythm for the first 480 s only; the last tracked beat was at 479.5 s. Tracked beat, downbeat and kick/snare F were all 0.89 (beat recall 0.80, precision 1.00). The exported grid scored 1.00 only because it extrapolates a constant tempo. This is why the page now refuses anything over 8:00 (the input limit equals the analysis coverage), and why v2 uses a 7-minute track, which the engine tracks to its end (last beat 419.9 s of 420 s, F 1.00).

**7. Key.** 12/12 exact after I changed the fixtures' chord progression. My first version used Am F C G, and Version A named **C major on all twelve**: that progression is equally C major, so it was the fixture, not only the engine. It does show how readily the relative-key reading flips when a major chord (here E, giving G#) is absent.

**8. Not explained: hi-hats.** Hi-hat F is 0.46 to 0.72 even on fixtures where everything else is right (3 of 8 hat steps found on `leading_silence_2s`; a stereo copy gives the same pattern). The regression songs use the same hat recipe and score 0.93. I did not find the cause (fixture sound design versus a Version A weakness), so hi-hats are excluded from every conclusion here.

## What this changes in the plan

- **Confirmed:** routing consumers through the tracked grid fixes the drift rows (exported beat F 0.31 to about 0.99 is the ceiling, to be measured, not assumed).
- **Not fixed by TimeMap, needs other work:** octave errors, tempo steps, meter (3/4, 5/4), breakdown level, hi-hats. (The 8-minute cap is now an input limit rather than a silent truncation.)
- **TimeMap blind spots found here:** it is only as good as the beats it is given. It cannot detect an octave error, a wrong-but-regular tracker, or a non-4/4 meter, and says so only through the "assumed" caveat.
- **TimeMap changed because of this data:** the first export gate looked only at local tempo variation, and `drift_slow` showed it can pass while one tempo is 41 ms off by the end. The reviewed design measures the error of the grid an exporter would actually write (pinned on the tracked downbeat; max and RMS), refuses on drift beyond a configurable 20 ms, and separates measured coverage from extrapolated audio. On the fixtures the pinned grid is 7 to 11 ms max (RMS 3 to 4) on every constant-tempo track and 52 ms on `drift_slow`. The 20 ms threshold is a grid-export compatibility threshold, not an accuracy claim; it comes from 20 synthetic tracks and needs real recordings.
- **Confirmation is a person's job, not a check.** For `meter_3_4` and `meter_5_4` the gate says `needs-confirmation`; it would become `allowed` if someone confirmed the assumed 4. The metronome audition is what should catch that, which is why the confirmation step must play it.

## Limits of this report

One fixture per condition; synthetic sounds; truth for ambiguous cases (half-time, breakdown, 6/8 not included) is a convention; the harness's drift metric over-reports when the metrical level differs; hi-hat results unexplained; no real music.

## Arrangement fixtures (added for Phase 2c step 2)

Two further fixtures in their own manifest (`test-songs/arrangement-fixtures/`, so the twelve time fixtures above are byte-for-byte unchanged): intro 8, groove 16, breakdown 8, drop 16, outro 8 bars, once at a constant 124 BPM and once drifting from 124 to 112 BPM. Answers include section boundaries.

| Fixture | Version A boundaries within ±0.5 s | Mean error | After Phase 2c step 2 | Mean error |
|---|---|---|---|---|
| `arrangement_constant` | 4 of 4 (F 1.00) | 13.5 ms | 4 of 4 (F 1.00) | 3.3 ms |
| `arrangement_drift` | 0 of 4 (F 0.00; up to 1.29 s late) | – | 4 of 4 (F 1.00) | 2.9 ms |

Version A found the right **bars** for every boundary even under drift; it converted them to time with one constant tempo. Both are F 1.00 at ±3 s. Labels are not scored: Version A calls the groove a "Drop" and the outro a "Groove" on both fixtures (loudness heuristics), and the change does not alter them. Two fixtures, synthetic: not an accuracy claim.
