# Time-model fixtures: where Version A fails

Twelve synthetic songs whose timing is **not** a constant-tempo 4/4 loop starting at 0:00, run through the frozen analyzer (Version A, `analyzer-baseline-a`, `index.html` sha256 `a14fea96…`) with the real-music harness. This is the evidence the TimeMap migration is supposed to act on, collected **before** any consumer (chords, sections, exports, overlays) was moved onto it.

Reported, **not gated**: no threshold was set from these results, and CI only reports them. Truth is exact by construction, but each condition is a single fixture (n = 1), so nothing here is a rate. They say what breaks, not how often it breaks on real music.

- Generator: `test-songs/make_time_fixtures.py` (own seed `20261117`, never used to tune anything; deterministic, audio and annotation hashes identical across two generations). Manifest `test-songs/time-fixtures/manifest.json` v1.
- Reproduce: `npm run songs:time && npm run bench:time-fixtures` (add `--page versionA.bak.html` to `bench/run.js` to force the frozen page). Stored run: `bench/baselines/version-a/time-fixtures/`.
- Recorded on Apple M1, Node 24.19, Chromium 159, 12/12 tracks scored, 0 page errors.

## Results

| Fixture | Tempo truth → est (class) | Tracked beat F | Tracked downbeat F | Exported-grid beat F | Exported-grid max drift (class) | Kick / snare F (exported MIDI, ±50 ms) | Chords maj/min | TimeMap: local tempo steady? | TimeMap: tempo changes | TimeMap: best constant grid vs tracked beats (max) | TimeMap: export |
|---|---|---|---|---|---|---|---|---|---|---|---|
| leading_silence_2s | 120 → 120 (ok) | 0.99 | 0.98 | 0.96 | 6 ms (ok) | 0.98 / 0.98 | 1.00 | yes | 0 | 6 ms | allowed |
| pickup_1beat | 120 → 120 (ok) | 0.98 | 0.98 | 0.98 | 4 ms (ok) | 1.00 / 0.99 | 1.00 | yes | 0 | 6 ms | allowed |
| pickup_2beats_late | 118 → 118 (ok) | 0.99 | 0.98 | 0.98 | 2 ms (ok) | 0.98 / 0.99 | 1.00 | yes | 0 | 8 ms | allowed |
| halftime_140 | 140 → 140 (ok) | 0.98 | 0.96 | 0.99 | 7 ms (ok) | 0.94 / 0.94 | 1.00 | yes | 0 | 8 ms | allowed |
| dnb_174 | 174 → 87 (half) | 0.66 | 0.00 | 0.66 | 55.2 s (slipped-beats) | 0.57 / 0.89 | 0.67 | yes | 0 | 6 ms | allowed |
| drift_slow | 120.5 → 120.5 (ok) | 0.99 | 0.96 | 0.99 | 53 ms (ok) | 0.69 / 0.70 | 0.99 | yes | 0 | 41 ms | refused: tempo-drift |
| drift_fast | 114.1 → 114 (ok) | 0.99 | 0.96 | 0.31 | 659 ms (slipped-beats) | 0.08 / 0.04 | 0.84 | no (±5.1 %) | 1 | 502 ms | refused: tempo-changes |
| tempo_change_step | 120 → 120 (ok) | 0.70 | 0.60 | 0.68 | 4.7 s (slipped-beats) | 0.74 / 0.71 | 0.91 | no (±6.4 %) | 3 | 194 ms | refused: tempo-changes |
| halftime_breakdown | 128 → 128 (ok) | 0.93 | 0.91 | 0.93 | 7.5 s (slipped-beats) | 0.88 / 0.87 | 1.00 | yes | 0 | 9 ms | allowed |
| meter_3_4 | 120 → 120 (ok) | 0.99 | 0.29 | 0.99 | 7 ms (ok) | 0.49 / 0.78 | 0.81 | yes | 0 | 8 ms | allowed |
| meter_5_4 | 140 → 140 (ok) | 0.98 | 0.22 | 0.99 | 10 ms (ok) | 0.42 / 0.00 | 0.85 | yes | 0 | 7 ms | allowed |
| long_10min | 128 → 128 (ok) | 0.89 | 0.89 | 1.00 | 3 ms (ok) | 0.89 / 0.89 | 1.00 | yes | 0 | 6 ms | allowed (tracked beats end 121 s before the audio ends; the rest is extrapolated) |

Columns: *tracked* = the beats and downbeats the engine's tracker produced; *exported grid* = the `firstDown + n * barSec` grid that chords, sections, MIDI and the aligned WAV use today; *TimeMap* = `src/timemap.js` built from the tracker's own grid with the engine's 4/4 labelled "assumed".

## What fails, and why

**Passes.** Leading silence (2 s), a 1-beat and a 2-beat pickup, and the long recording's tempo are handled: tempo exact, beat and downbeat F 0.98 to 0.99 (the long track is the exception below), exported grid within 6 ms. Half-time feel at 140 is read as 140, matching the annotation. The synthetic version of these cases is not the hard version; real intros are untested.

**1. The exported grid ignores a tracker that is right (drift).** On `drift_fast` (120 to 108 BPM) the tracker follows the drift (tracked beat F 0.99) but the exported grid scores beat F 0.31, kick/snare F 0.08/0.04, and chords fall to 0.84. This is the structural defect from the audit, now measured: the information exists and is discarded. On `drift_slow` (0.8 % drift) the grid-drift class says `ok` (53 ms, inside ±70 ms), yet exported kick/snare F at ±50 ms is only 0.69/0.70 against 0.98 on the constant fixtures: the pass/fail class hides event-level damage. Moving consumers onto the tracked grid is justified by these two rows.

**2. Tempo octave (`dnb_174`).** Read as 87: beat F 0.66, downbeat F 0.00, kick 0.57. The "55 s drift" is the metric counting beats at the wrong metrical level, not physical drift. TimeMap cannot see this: tempo is steady, so export is `allowed`. Fixing it needs tempo/octave evidence (alternatives with scores), not a time model.

**3. A tempo step defeats the tracker itself (`tempo_change_step`, 120 to 150).** Tracked beat F 0.70, downbeat F 0.60: the single-period tracker does not follow the change, so TimeMap built from its beats is also wrong. TimeMap does notice the instability (local tempo ±6.4 %, three "changes" where the truth has one) and refuses export, which is the right outcome for the wrong reason. A tempo-adaptive tracker is a separate piece of work.

**4. Half-time breakdown (`halftime_breakdown`).** The tracker holds 128 BPM pulses through the 64 BPM section (beat F 0.93 against an annotation at 64). Both readings are defensible; the annotation convention decides. TimeMap sees steady tempo and allows export. The "7.5 s drift" is again beats counted at different levels.

**5. Meter is silently forced to 4/4 (`meter_3_4`, `meter_5_4`).** Tempo and beats are right (F 0.99, 0.98) but tracked downbeat F is 0.29 and 0.22, chords 0.81 and 0.85, 5/4 snare 0.00. The UI still reports "N bars of 4/4". TimeMap allows export because the meter is only *assumed*: until meter detection exists, the gate cannot refuse these. Disclosure in the UI is the cheap interim fix.

**6. The long track is silently truncated (`long_10min`).** The engine analyses rhythm for the first 480 s only; the last tracked beat is at 479.5 s. Tracked beat and downbeat F and kick/snare F are all 0.89 (beat recall 0.80, precision 1.00). The exported grid scores 1.00 because it extrapolates a constant tempo, which is only right for a constant-tempo track. (The input-limits PR now discloses the cap in the UI.) TimeMap adds the caveat "tracked beats end 121 s before the audio ends".

**7. Key.** 12/12 exact after I changed the fixtures' chord progression. My first version used Am F C G, and Version A named **C major on all twelve**: that progression is equally C major, so it was the fixture, not only the engine. It does show how readily the relative-key reading flips when a major chord (here E, giving G#) is absent.

**8. Not explained: hi-hats.** Hi-hat F is 0.46 to 0.72 even on fixtures where everything else is right (3 of 8 hat steps found on `leading_silence_2s`; a stereo copy gives the same pattern). The regression songs use the same hat recipe and score 0.93. I did not find the cause (fixture sound design versus a Version A weakness), so hi-hats are excluded from every conclusion here.

## What this changes in the plan

- **Confirmed:** routing consumers through the tracked grid fixes the drift rows (exported beat F 0.31 to about 0.99 is the ceiling, to be measured, not assumed).
- **Not fixed by TimeMap, needs other work:** octave errors, tempo steps, meter (3/4, 5/4), breakdown level, the 8-minute cap, hi-hats.
- **TimeMap blind spots found here:** it is only as good as the beats it is given. It cannot detect an octave error, a wrong-but-regular tracker, or a non-4/4 meter, and says so only through the "assumed" caveat.
- **TimeMap changed because of this data:** the constant-tempo gate was local-tempo variation only; `drift_slow` showed it can pass while a single tempo is 41 ms off by the end. Export now also requires the best constant grid to reproduce every tracked beat within 20 ms, and discloses beats ending well before the audio does. The 20 ms threshold is reasoned and sits in the gap between the 20 other tracks (5.6 to 8.8 ms on every constant track, regression songs included) and `drift_slow` (41 ms). That is 20 synthetic tracks: it needs real recordings before it gates anything a user sees.

## Limits of this report

One fixture per condition; synthetic sounds; truth for ambiguous cases (half-time, breakdown, 6/8 not included) is a convention; the harness's drift metric over-reports when the metrical level differs; hi-hat results unexplained; no real music.
