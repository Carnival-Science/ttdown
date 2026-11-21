# Piecewise tempo maps: research report for issue #57

Issue #57 asks whether Teardown can estimate a **piecewise tempo map** (steady regions, abrupt steps, gradual accelerations) instead of imposing one whole-song tempo, and
which method gives the best accuracy/latency trade-off. This is the research report. **No default pipeline change is made or proposed here**: `src/engine.js`, `src/timemap.js`,
the benchmark gates and the app are untouched. Everything new lives in `bench/tempo/`, one fixture generator and one test, and runs offline.

All fixture numbers are **synthetic, with exact answers by construction**: they say what each method can and cannot do, not how often it works on real music. Where real music was
available it was run privately (no audio, stems or annotations are in the repository); those results are **hypotheses, checked against nothing but the audio's own evidence**.

## Answer in short

1. **Yes, on synthetic audio.** A penalised change-point search over a comb table (`dp`, below) recovers steps, ramps, returns (A-B-A) and several changes with the engine's own
   onset evidence, and reports a drumless stretch as unknown instead of inventing a tempo. On the 9 variable-tempo dev fixtures it takes beat F from 0.875 (engine) to 0.981, mean BPM error from
   6.14 to 0.33 and Acc1 (an unknown stretch counted as wrong) from 0.813 to 0.967. Both the engine and the candidates report essentially no *false* tempo changes (the first draft of this report
   said 17 against 0; that was a scoring defect, see "Scoring fixes"): what separates them is whether the beat grid follows the music. On the holdout fixtures the picture is the same where the method works, and shows two
   limits (below): the octave of the first stretch, and a drumless ramp.
2. **The engine already follows some changes and loses others.** It follows a 128 to 150 step (beat F 0.996), a 128 to 150 ramp (0.995) and a 120 to 140 two-bar ramp (0.995), and loses a 100 to 132 step (0.616, holdout), a 110 to 140
   long ramp (0.754), a step inside a drumless section (0.718) and a four-tempo track (0.512). Whether it follows a change depends on the size and speed of the change relative to its single beat length.
3. **Best candidate: `dp`** (exact optimal partition by dynamic programming, then merge same-tempo neighbours, fit ramps in low-evidence runs, keep octave continuity).
   `ctf` (the coarse-to-fine proposal, top down) is as accurate on dev, faster, and less reliable on real music (one false 4:3 stretch on a steady track) and needs a two-split look-ahead to
   find A-B-A. The tempogram + Viterbi variant is the weakest on ramps and drumless stretches.
4. **Real music:** on a local file named "01 Init" (identity and ground truth **not verified**) the engine accepted one constant 150 BPM grid for the whole 5:26 track while its grid hits
   only 7 to 14 % of its beats between 99 and 170 s, where a 128.0 BPM grid hits 81 % (table below). That is the failure the issue describes. It is a hypothesis until someone checks it by ear.
5. **What is not solved:** octave of the first stretch, a transition inside a drumless or silent section (the place is unobservable: it is reported as unknown), same-tempo fragmentation
   on real music, phase continuity across a change, meter changes, and any claim about real-music accuracy beyond the cases above. Key modulation is feasible on clean synthetic audio
   and not yet on real mixes (end of this document).

## What was built (all offline, nothing wired in)

| File | What |
|---|---|
| `test-songs/make_tempo_map_fixtures.py` | Deterministic fixtures with exact answers: steps, ramps, A-B-A, multiple changes, short and long transitions, a drumless ramp, a step inside a drumless section, constant-tempo controls whose feel changes (half-time, double-time snare rolls, off-beat drums), and key-change fixtures. Reuses the sounds and `build` of `make_time_fixtures.py` without modifying it. Two manifests (`manifest.json` dev, `manifest-holdout.json` holdout) plus `manifest-key.json`. Generated audio is git-ignored. Regenerating gives byte-identical audio (checked: all dev and holdout files, twice) |
| `bench/tempo/evidence.js` | The engine's own onset evidence (low band, mid band raw, half the high band, each over its 98th percentile), re-derived from the engine's exported `mag` and `detrend`; `s` = that evidence reduced to "above what a grid at random sees" |
| `bench/tempo/segment.js` | The comb table (every tempo 70-180 BPM in 0.15 % steps x every phase, cumulative sums, so the best grid on any stretch is a lookup) and the candidates: `const`, `dp`, `ctf`, `tempogram`, plus `coalesce`, `withRamps`, `foldOctaves` |
| `bench/tempo/score.js`, `run.js`, `report.js` | Scorer against the answers and runner (below) |
| `bench/tempo/real.js` | Runs the candidates on a recording with no answer (prints stretches, z, hit rate). For private local audio |
| `bench/tempo/key.js`, `key-run.js` | The local-key feasibility experiment |
| `tests/tempo-segmentation.test.js` | 18 checks on synthetic evidence (step, A-B-A, ramp, drumless stretch, 20 noisy steady seeds, octave folding), in `npm test` |
| `bench/baselines/tempo-map/` | Stored results: `dev`, `holdout-first-look`, `holdout-final`, `key-dev`, `key-holdout` (JSON, summary, per-fixture table) |

Reproduce: `npm run songs:tempo-map && npm run bench:tempo-map` (dev; engine row from `bench/run.js`), and `node bench/tempo/run.js test-songs/tempo-map-fixtures/manifest-holdout.json --engine <holdout predictions> --anchor --summary`.
Device: Apple M1, macOS 27.2.1, Node 24.19.0, Chromium for the engine row.

### The candidates

* **const**: one grid over the whole track (what `fitConstantTempo` does, re-implemented on the comb table). The control: every other candidate is only worth having if it beats it.
* **dp**: maximise `sum of segment scores - lambda x (stretches - 1)` over every partition on a 2 s boundary grid, minimum stretch 8 s; exact (the same objective PELT solves; at
  this size the O(M^2) recursion is cheap), then each boundary is moved within +-2 s on a 0.1 s grid to where the two refitted sides score best (coarse to fine).
* **ctf** (the founder's proposal): fit a stretch with one grid, find the split that most improves the fit, accept it when the gain exceeds lambda, recurse into both halves; refine
  the split on a fine grid. A single split cannot explain A-B-A on some inputs (the first dev run found nothing on `dev_aba`), so when no single split pays it tries the best pair.
* **tempogram**: windowed (12 s) comb scores over time x tempo, decoded by Viterbi with a jump penalty; stretches are runs of the decoded path.
* A grid's score is `sum(s at its beats) - gamma x beats`, so a grid twice as fast has to earn its extra beats. Same lambda (12), gamma (0.35), minimum stretch (8 s) for all candidates;
  a sweep of lambda in {6, 12, 24} x gamma in {0.2, 0.35, 0.5} on the dev fixtures was flat from lambda 12 to 24 (false changes 0 in every cell), so the first-guess defaults were kept.
* **Post-processing shared by dp, ctf and tempogram:**
  * *coalesce*: neighbours within 1 % in tempo and 25 ms in phase at the join become one stretch (a same-tempo split with a phase gap stays split: a phase break);
  * *ramps*: a run of stretches whose best constant grid does not stand out (z below 5) is refitted as one grid whose period moves linearly (0.6 % steps, ends within 30 %
    of each other); accepted only if it reaches z 5 **and** at least half its beats land on onsets (a drumless pad-only stretch has one onset per bar and a comb score that looks fine);
  * *unknown*: a stretch with z below 5 (its best grid does not stand out from the tempo scan) is reported as unknown, not as a tempo;
  * *octave continuity*: each known stretch is moved by a factor 1/2, 1 or 2 to the octave nearest to the stretch before it, the first against the engine's own whole-track tempo.

## Scoring fixes made after review

A review of the first version of this report found defects in `bench/tempo/score.js`; the ones below were confirmed and fixed (`tests/tempo-score.test.js`, 14 checks; two of them reproduced on the old scorer before the fix).
The candidates and their settings were **not** changed: only the scoring and the stored results (`bench/baselines/tempo-map/`, all three re-scored).

1. **Beat F was capped.** Predicted beats after the last annotated beat (the audio keeps sounding) counted as false positives, so no method could score above about 0.984 (old scorer on a perfect grid with two tail beats: 0.992). Beats outside the annotated span are no longer scored.
2. **The engine's changes were counted unfairly.** Its beats were turned into "changes" at both edges of every excursion from the track median (a single step counted twice; old scorer: a clean 120 to 150 step gave 2 changes), while the candidates' changes were one per stretch boundary.
   Both now use one rule: a change is a stretch boundary (4 consecutive local tempi more than 3 % from the stretch's median start a new stretch). **This removes the first draft's claim "0 extra changes against the engine's 17": the engine's extra changes are 1 (dev) and 0 (holdout).**
   The first draft's headline was an artefact; the real differences are in the grid (beat F, Acc1), not in the count of changes.
3. **Acc1 rewarded abstaining.** It was averaged over the stretches a method commits to. Both the all-time version (unknown counted wrong) and the committed-only version are reported, and the all-time one ranks the methods.
4. **"Worst boundary error" was the largest per-fixture mean**, not the worst transition. It is now the worst single transition (`boundaryErrsS`); `ctf`'s worst is 2.99 s on dev.

## Fixtures and what is measured

22 tempo fixtures (13 dev, 9 holdout; `dev_slow_fills` and `dev_slow_step` were added to dev after the first holdout run, see below), 50 to 130 s each, 4/4 with kick, clap and hats, a pad and a bass.
Controls (no tempo change, the feel changes): `const`, `halftime_drop`, `offbeat` (all drums on off-beats), `dnb_double` / `slow_fills` (double-time snare rolls). Metrics (`bench/tempo/score.js`):
beat F within 70 ms; beat timing error (median, p95, worst); time-weighted BPM error; **Acc1** (within 4 %) and **octave-tolerant Acc1** (1/2, 2, 1/3, 3 times also accepted), reported separately, each over the stretches a method commits to **and** over all time with an unknown stretch counted as wrong (compare methods by the second: abstaining raises the first);
per-region Acc1 so a long section cannot hide a short one (all of it is in the JSON files); transitions found, missed and extra (tolerance 3 s either side of a step or a ramp's span);
coverage (the share of the track committed to a tempo; the rest is unknown); latency. "Extra" counts predicted tempo changes that match no truth transition.

### Results: dev (13 fixtures, frozen settings; `bench/baselines/tempo-map/dev.*`)

| Variable-tempo fixtures (9) | beat F | BPM err | Acc1 over committed stretches | Acc1, unknown counted wrong | octave-tolerant, unknown counted wrong | coverage | transitions found of 12 | missed | extra | median ms |
|---|---|---|---|---|---|---|---|---|---|---|
| engine (its own tracked beats; ms is the whole analysis) | 0.875 | 6.14 | 0.822 | 0.813 | 0.813 | 0.988 | 10 | 2 | 1 | 2610 |
| const | 0.517 | 8.28 | 0.54 | 0.42 | 0.42 | 0.778 | 0 | 12 | 0 | 213 |
| **dp** | 0.981 | 0.33 | 0.988 | 0.967 | 0.967 | 0.979 | 11 | 1 | 0 | 412 |
| ctf | 0.982 | 0.39 | 0.988 | 0.97 | 0.97 | 0.982 | 11 | 1 | 0 | 335 |
| tempogram | 0.902 | 1.38 | 0.917 | 0.859 | 0.859 | 0.941 | 10 | 2 | 0 | 233 |

Constant-tempo controls (4): every candidate and the engine have 0 tempo changes; BPM error 0.01 (engine 0.90); mean beat F 0.747 for all (the three other controls score 0.996 and the off-beat fixture scores 0 for everyone)
(below). The engine's `ms` includes the whole analysis (notes, chords, drums), the candidates' only the evidence and the search, so the two are not a speed comparison.

| Fixture | engine: beat F / Acc1 (unknown wrong) / found (extra) | dp | ctf |
|---|---|---|---|
| hol_step | 0.616 / 0.43 / 0 of 1 (0) | 0.996 / 0.993 / 1 of 1 (0) | 0.996 / 1 / 1 of 1 (0) |
| hol_init_like | 0.604 / 0.416 / 1 of 1 (0) | 0.875 / 0.779 / 0 of 1 (0) | 0.88 / 0.846 / 1 of 1 (0) |
| hol_ramp | 0.654 / 0.475 / 1 of 1 (0) | 0.995 / 1 / 1 of 1 (0) | 0.995 / 1 / 1 of 1 (0) |
| hol_aba | 0.778 / 0.709 / 2 of 2 (0) | 0.997 / 1 / 2 of 2 (0) | 0.962 / 0.962 / 1 of 2 (1) |
| hol_multi | 0.677 / 0.481 / 2 of 3 (0) | 0.874 / 0.69 / 3 of 3 (0) | 0.862 / 0.684 / 3 of 3 (0) |

### Results: holdout (9 fixtures, other tempi and seeds), in two steps

**First look** (frozen settings, before any change made because of the holdout; `holdout-first-look.*`, reproduce with `--no-coalesce` and no `--anchor`). It exposed an octave failure that no
dev fixture had: `holdout_dnb_double` (constant 87 BPM) was read at 174, because hats on the eighth notes make 174 as good a grid as 87 (the comb cannot tell them apart; the
engine can, through its own octave rule), and the 90 BPM stretch of `hol_multi` at 180. Control BPM error: 21.8 (dp, ctf). Variable fixtures: dp beat F 0.947, Acc1 0.892 over all time (octave-tolerant 0.947).

**After** (octave continuity added, `holdout-final.*`; the holdout is **no longer blind** for this change, because the failure it fixes was found there. I added two slow dev fixtures to
check the rule on data that did not influence it, and it held there; a fresh holdout is needed before this number is a claim):

| Variable-tempo fixtures (5) | beat F | BPM err | Acc1 over committed stretches | Acc1, unknown counted wrong | octave-tolerant, unknown counted wrong | coverage | transitions found of 8 | missed | extra | median ms |
|---|---|---|---|---|---|---|---|---|---|---|
| engine (its own tracked beats; ms is the whole analysis) | 0.666 | 16.20 | 0.51 | 0.502 | 0.502 | 0.985 | 6 | 2 | 0 | 2961 |
| **dp** | 0.947 | 5.17 | 0.937 | 0.892 | 0.947 | 0.956 | 7 | 1 | 0 | 563 |
| ctf | 0.939 | 5.81 | 0.898 | 0.898 | 0.953 | 1 | 7 | 1 | 1 | 365 |
| tempogram | 0.905 | 6.27 | 0.856 | 0.856 | 0.91 | 1 | 8 | 0 | 0 | 282 |

Controls (4): 0 changes for everyone, BPM error 0.01 for the candidates (0.57 engine). The remaining dp gap is `hol_multi`: its first stretch (90 BPM) is read at 180 (Acc1 0.69, octave-tolerant 0.96),
because the first stretch is placed against the engine's whole-track tempo and the engine's number for a track spanning 90 to 132 BPM is arbitrary.

| Fixture | engine: beat F / Acc1 (unknown wrong) / found (extra) | dp | ctf |
|---|---|---|---|
| hol_step | 0.616 / 0.43 / 0 of 1 (0) | 0.996 / 0.993 / 1 of 1 (0) | 0.996 / 1 / 1 of 1 (0) |
| hol_init_like | 0.604 / 0.416 / 1 of 1 (0) | 0.875 / 0.779 / 0 of 1 (0) | 0.88 / 0.846 / 1 of 1 (0) |
| hol_ramp | 0.654 / 0.475 / 1 of 1 (0) | 0.995 / 1 / 1 of 1 (0) | 0.995 / 1 / 1 of 1 (0) |
| hol_aba | 0.778 / 0.709 / 2 of 2 (0) | 0.997 / 1 / 2 of 2 (0) | 0.962 / 0.962 / 1 of 2 (1) |
| hol_multi | 0.677 / 0.481 / 2 of 3 (0) | 0.874 / 0.69 / 3 of 3 (0) | 0.862 / 0.684 / 3 of 3 (0) |

## What the engine does on these fixtures (the baseline the issue asked for)

The engine's tracker follows the 128 to 150 step, the 128 to 150 ramp of `dev_ramp` and the 120 to 140 two-bar ramp, and fails on others: the pattern is not "tempo changes break it" but "some do". Its constant fit (`tempoFit`)
accepts only the slow constant fixture (`dev_slow_fills`) and refuses the three other 60 s constant ones (the tracker's beats stand there, and they score beat F 0.996). On the four-tempo
`dev_multi` the engine's beats report 2 of the 3 changes and no extra one, yet stay on the first tempo (Acc1 1 on the 100 BPM region, 0 on the other four): the problem is the grid it lays down, not a count of changes.

## Tempo versus rhythmic feel (the issue's hypothesis 5)

Controls where **only the feel changes**, at a constant tempo, produced **no false change from any candidate** in any fixture: half-time snare from bar 17 at 150 and at 166, double-time snare
rolls at 87 and 92, a steady 4/4 with hats on the eighth notes. Two things that look like tempo changes and are not were handled, and one was not:

* **Half/double (octave):** a comb score cannot separate 87 from 174 when the faster grid's extra beats are also onsets. This is an **ambiguity of the evidence, not of the method**: `dp` read the 87 BPM
  control at 174 until octave continuity put it back. The rule keeps the octave of the engine's own decision (autocorrelation x log-Gaussian prior around 125 BPM) for the first stretch and
  continuity afterwards. It cannot stand if tempi really jump by more than a factor of 1.41 between neighbouring stretches (a step 100 to 150 would be folded to 100 to 75), and it cannot be right for the first stretch of
  a track whose tempi straddle the engine's octave boundary (`hol_multi`). **Needs a decision rule that uses more than onsets** (beat-synchronous harmonic rhythm, chord changes) or a person's choice; the alternatives (x1/2, x2) should be kept per stretch in the data.
* **Off-beat percussion (`offbeat` fixtures):** every drum hit is on an off-beat, so every method, including the engine, locks onto the off-beats: tempo exact, beat F **0**, off-beat F 0.99 (the metric
  `beatFOff` is the same beats moved half a beat). It is a phase problem, not a tempo problem, and it is issue #50. Segmenting does not help.
* **A drumless or silent transition cannot be located from onsets:** `dev_init_like` (a drumless ramp 128 to 150 over 8 bars) and `dev_silent_step` (a step inside 16 drumless bars). One pad or bass onset per bar
  gives a comb score that looks fine at the bar period and says nothing about the tempo in beats; without the hit-rate guard `dp` returned a confident ramp 98 to 113 BPM (z 11.6) for a truth of 128 to 150.
  With it, the stretch is **unknown**: dp and ctf score Acc1 1.0 on the stretches they commit to and are right not to commit on the ramp (coverage 0.78 to 0.84 on the init-like fixtures). A step inside a silent section is
  located to within about 1.4 s by `dp` and 0.04 s by `ctf` on `dev_silent_step`, which is luck of where the pad onsets fall, not evidence; report the *range*, as the issue says.

## Real music (private, local audio, **no ground truth**, nothing committed)

A local file named "01 Init" (5:26; identity and any ear annotation **not verified**; the issue's own BPM values are hypotheses and so are these). Engine (measured before main's later engine changes; not re-run on this file): 149.9 BPM, `constant-fit` accepted with quarters
149.946 / none / 149.946 / 150.026 (three of four valid, which is its acceptance rule). Candidates (`dp`, after coalescing; 8.1 s; `ctf` and `tempogram` agree on the structure but not on the exact edges):

| stretch (s) | candidate | z | its grid hits onsets | **engine's 150 BPM grid hits onsets** (same stretch) |
|---|---|---|---|---|
| 0.0-14.0 | 149.94 BPM | 7.4 | 0.91 | 0.91 (35 beats) |
| 14.0-32.1 | 149.97 | 8.9 | 1.00 | 1.00 (45) |
| 32.1-68.7 | 150.00 | 10.9 | 0.88 | 0.86 (91) |
| 68.7-99.0 | unknown (75.0, z 2.1) | 2.1 | 0.03 | 0.01 (76) |
| 99.0-140.7 | 128.00 | 6.5 | 0.19 | **0.07** (104) |
| 140.7-169.7 | 128.00 | 9.5 | 0.81 | **0.14** (73) |
| 169.7-187.0 | unknown | 2.5 | 0.09 | 0.00 (43) |
| 187.0-312.9 | 149.95 | 10.5 | 0.24 | 0.29 (314) |
| 312.9-326.4 | unknown | 1.5 | 0.00 | 0.00 (34) |

"Hits onsets" is the share of a grid's beats where the evidence is more than one standard deviation above its mean. A 150 BPM grid that hits 91 % of its beats at the start and 7 to 14 % between 99 and 170 s, while a
128.0 BPM grid (a round DAW tempo) hits 81 % there, is strong evidence for a tempo region the engine's single grid does not follow. It is not proof. The low rate in the last 126 s (0.24-0.29 for both) is the
evidence being sparse (half-time or sparse drums), which is a statement about evidence, not about tempo. A 128-to-150 return after 170 s also lands off the engine's phase in places: the engine's grid hits only
0.04 of its beats in 274-310 s, where a 150 BPM grid with its own phase fits (z 10): **a tempo that returns to the same value on a different phase**. Anyone reproducing the issue should annotate this
file by ear before any of this is quoted.

Steady-tempo controls on two real tracks the engine already handles (161.4 BPM, and 98.0 BPM, both quoted in `docs/TEMPO_VERSION_B.md`): `dp` reads 161.41 and 98.00 in every stretch and reports **no tempo change**,
but splits them into 4 and 6 same-tempo stretches (real music wanders by a few milliseconds more than the 25 ms phase rule allows; a merge on evidence loss fails too: merging a steady real track loses 13 to 68 % of the comb
score). `ctf` reported one false 130.62 BPM stretch (z 5.7, a 4:3 harmonic of 98) on the 98.0 track. The tempogram candidate read both at a harmonic of the truth (80.7 and 147.0).
**Fragmentation of a steady real track is an open problem**; today it is harmless to the tempo curve and wrong for any "N tempo regions" display.

## Latency and memory

Measured on the 326 s local file, Apple M1, Node 24.19.0, cold, one process each: evidence + comb table 1.2-1.3 s; `tempogram` 2.3 s in total; `ctf` 4.4-4.7 s; `dp` 7.3-8.1 s; **peak RSS 247-249 MB** for each
(Node itself plus the tempo x phase tables, about 630 tempi over 28 000 frames; it grows linearly with duration). The engine analyses the same file in 10.0 s in the browser harness with everything on, so a tempo map computed
after the first result is within the same order; the comb table could be shared with the engine's own constant fit. Not measured: browser (Chromium) cost of these candidates, warm cost, tracks near the 8-minute limit.

## What cannot be told apart (conditions to carry into the product)

* tempo versus feel at the octave (above), and which octave a track whose tempi span more than a factor of 1.4 is in;
* a transition inside a drumless/silent stretch: the range is known, the shape is not;
* a ramp versus a fast staircase of short steps when evidence is sparse (the `ramp` stretch's ends are reported, and are good to a few BPM at best: `dev_ramp` fitted 135.2 to 147.9 over the span the
  neighbouring steady stretches left it, for a truth of 128 to 150: the steady neighbours absorb the ends of the ramp);
* a tempo that returns to the same value on a different beat phase (a phase break) versus drift;
* off-beat lock and half-time feel on beat PHASE (not tempo): needs bar-level evidence (issue #50);
* meter changes (not tested at all here).

## Proposed contract (a proposal for review, not implemented)

* **TimeMap input:** an ordered list of regions that tile the track: `{ t0, t1, kind: "steady" | "ramp" | "unknown", bpm | { bpm0, bpm1 }, beats: [seconds], octave: { chosen, alternatives }, z, hitRate }`.
  `unknown` regions carry no beats, only their range; the beats of the others are the union. One authoritative TimeMap, in audio seconds; every consumer (ruler, metronome, loops, chords, sections, piano roll) already reads it.
* **A constant track is one `steady` region.** The engine's constant-tempo path (Version B) stays the default and only a validated *disagreement* opens extra regions: the same `dp` search with the
  constant model as the null, a split cost, and the hit-rate and z guards. The Init observation suggests the engine's acceptance rule ("three of four quarters agree") needs the same guard: a quarter with no evidence is
  not agreement.
* **UI:** a compact tempo lane on the arrangement, stable BPM labels per region, a marker per step, a slanted segment per ramp, hatched unknown spans; clicking a region shows its BPM, the alternatives (half, double)
  and the evidence (z, hit rate). No separate dashboard. Corrections are scoped to a region or boundary (later); raw evidence is never overwritten.
* **Export:** original-timing MIDI writes tempo events at region boundaries, and a ramp as a staircase (one tempo event per beat or per bar, the staircase error must be measured through `bench/timing-consumers.js`);
  an `unknown` region is written at the neighbouring tempo and labelled; quantized exports keep the eligibility policy of #29 and are **refused** across more than one region unless the person confirms.
  Not tested here: MIDI timing through a transition (the issue asks for it).

## Key modulation (feasibility only; `bench/tempo/key.js`, `bench/baselines/tempo-map/key-*.json`)

Chroma (65-2000 Hz) averaged over 8 s, correlated with the 24 Krumhansl-Kessler profiles, Viterbi with a flat change penalty (0.6; a sweep of 0.3 / 0.6 / 1.2 changed nothing on the dev fixtures). Synthetic fixtures:
a constant key, a modulation up a whole tone (A minor to B minor) and up a major third (to C# minor) at bar 17, and C Am F G (C major and A minor both defensible).

| Fixture | truth | found | exact | modulations found | boundary err | false mod. | mean margin |
|---|---|---|---|---|---|---|---|
| dev_key_const | A minor | A minor | 1.00 | 0 / 0 | - | 0 | 0.17 |
| dev_key_up2 | A minor, B minor | A minor, B minor | 0.98 | 1 / 1 | 0.7 s | 0 | 0.20 |
| dev_key_up4 | A minor, C# minor | A minor, C# minor | 0.98 | 1 / 1 | 1.4 s | 0 | 0.20 |
| dev_key_relative | C major | A minor | 0 (1.00 counting the relative key) | 0 / 0 | - | 0 | 0.08 |
| hold_key_const | A minor | A minor | 1.00 | 0 / 0 | - | 0 | 0.17 |
| hold_key_up5 | A minor, D minor | A minor, D minor | 0.94 | 1 / 1 | 3.4 s | 0 | 0.14 |
| hold_key_up3 | A minor, C minor | A minor, **G major** | 0.37 | 1 / 1 | 2.0 s | 0 | 0.10 |

The modulation is found in all three cases (boundary within 0.7 to 3.4 s), no false modulation on the two constant fixtures, and the relative-key ambiguity shows as a low margin (0.08 against 0.14 to 0.20). The wrong answer
(`hold_key_up3`: C minor read as G major) is the dominant-versus-tonic confusion of a short window on a progression whose strongest chord is the dominant, and it also has a low margin (0.10). On three real recordings (not
annotated; two sources quote C major and E major) it returned one stretch of E major (a known E major track: right), A minor then E minor for a C major track (the relative key, then a final 27 s stretch that may be a false
modulation), and G major / A minor / G major for the third (the engine says C major), all with margins of 0.04 to 0.08. **Verdict: feasible on clean synthetic audio; not promising on real mixes without annotated tonal
centres, and not evaluated on Basic Pitch notes or chord regions, which is the observation model the issue proposed.** Not worth its own implementation issue until there are annotations (#36); the experiment is kept for that day.

## Limits of this report

* Synthetic fixtures with clean drums and one sound recipe, a handful per condition (n = 1 to 3), 4/4 only, hats on every fixture. The numbers rank methods; they do not predict real-music accuracy. The two real tracks
  with a known tempo are checks for false changes, not accuracy results; the third is an observation without truth.
* **No DAW-render tempo automation ground truth** (#36) and no independent holdout of real recordings were available. No ear check of any real-music claim was done.
* **The holdout was looked at once, then the method changed** (octave continuity, and later coalescing): the final holdout rows are development-contaminated for those two changes. The first-look rows are stored.
  Settings (lambda, gamma, minimum length, z, hit rate) were not tuned on the holdout. `dev_slow_fills` and `dev_slow_step` were added to dev after the first holdout run, and the two changes were then judged on dev.
* Candidates keep one independent phase per stretch: beat phase continuity across a change (the issue's "continuous musical position") is not enforced and not measured; a change at a bar line is assumed.
* Not done: comparison with Essentia, madmom, Beat This! (the issue's hypothesis list names none as required, `TEMPO_VERSION_B.md` plan item 5 does); source separation; per-band periodicity; tempo-region
  correction UI; MIDI timing through a transition; tracks near 8 minutes; the downbeat of each region.
* Real-music engine rows and the private observations come from one machine and files that are not in the repository.

## Next steps (not started; for the CEO to choose)

1. Annotate the local "Init" file by ear/DAW (tempo regions and transition) and the phase after the return; then this report's real-music paragraph can be scored.
2. A fresh holdout (new seeds and tempi) before quoting the post-fix numbers, and DAW-rendered tempo automation pairs through #36.
3. Fix fragmentation of steady real tracks (a phase model that tolerates real-music wander) and the first-stretch octave (bar-level evidence), the two failures that remain on data where the method otherwise works.
4. Only then a prototype behind a flag: tempo regions in TimeMap, the tempo lane, and original-timing MIDI with tempo events, tested through `bench/timing-consumers.js`.
