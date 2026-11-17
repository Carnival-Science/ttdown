# bench/: G1 benchmark harness

Measures the analyzer against annotated tracks listed in a **manifest**. It works the same for the synthetic test songs and for real music. Plan and rationale: `docs/G1_REAL_MUSIC_BENCHMARK_PLAN.md`. This harness changes no analysis code.

```bash
npm run songs              # synthetic songs + their answer files + test-songs/manifest.json
npm run bench:synthetic    # run the analyzer on the manifest, then score it
npm run bench:parity       # acceptance: must reproduce the G0 benchmark (run `npm run benchmark` first)
npm run bench:crosscheck   # every metric recomputed with mir_eval (pip install mir_eval)

node bench/run.js <manifest.json> [--out DIR] [--page index.html]     # real data: predictions only
node bench/score.js <DIR>/predictions.json                             # scores.json, tracks.csv, report.md
```

`run.js` (browser, slow) and `score.js` (pure, fast) are separate, so scoring can be repeated, tested and changed without re-running the analyzer.

## Manifest

```json
{
  "name": "electronic-dev", "version": 3, "annotationProtocol": "v1.0",
  "tracks": [{
    "id": "ukg-007",
    "audio": "audio/ukg-007.wav",
    "sha256": "…",
    "split": "dev",
    "rights": { "source": "contributor agreement CA-012", "licence": "internal evaluation only" },
    "tempo": 132,
    "tags": { "style": "uk garage", "swing": "heavy", "four_on_floor": false, "tempo_band": "115-135" },
    "annotations": { "beats": "ann/ukg-007.beats.txt", "key": "ann/ukg-007.key.txt", "chords": "ann/ukg-007.chords.lab", "drums": "ann/ukg-007.drums.txt", "bass": "ann/ukg-007.bass.txt" }
  }]
}
```

Field notes:
- Paths are relative to the manifest. Audio and annotations for real music live **outside this repository**.
- `split` is `dev` or `holdout`.
- `sha256` is checked before each run; a mismatch marks the track `checksum-mismatch` and it isn't analyzed.
- `tempo` is optional; without it, tempo comes from the median beat interval.
- Any annotation may be missing; metrics that need it are reported as not scored.
- `tags` are free-form condition labels. Every tag value becomes a row of the failure atlas.

Annotation formats (plain text, mir_eval/Sonic Visualiser style; `#` at line start or after a space is a comment):

| File | Line format |
|---|---|
| beats | `time [beat-in-bar]` (1 = downbeat; without positions, downbeats are "not annotated") |
| key | `F# minor` (also `dorian`, `phrygian`, …, `atonal`, `ambiguous`: kept, not scored as major/minor) |
| chords | `start end label` (Harte: `A:min`, `C:maj7/3`, `N`, `X`) |
| drums | `time class` (`kick`/`bd`, `snare`/`sd`/`clap`/`cp`/`rim`, `hihat`/`hh`/`chh`/`ohh`) |
| bass | `onset offset midi` |

## What is measured

All metrics are per track, averaged over tracks with a seeded bootstrap 95 % CI.
- **Tempo:** Acc1/Acc2 and absolute error.
- **Beats and downbeats:** tracked by the engine, F-measure at ±70 ms.
- **Exported grid:** what the user receives (chords, sections, MIDI). Scored as beat/downbeat F, plus **drift**: maximum offset from the true beats, and when it first exceeds 70 ms.
- **Key:** exact, and the MIREX weighted score.
- **Chords:** time-weighted root and maj/min, following mir_eval.
- **Drums:** event F at ±30/50/100 ms per class, **measured on the exported MIDI note times in seconds**, plus G0's 16-step pattern counts.
- **Bass:** onset F, note F (onset + pitch), octave-error rate.

Every error also gets a **failure class** (`lib/classify.js`, versioned). `report.md` contains:
- the summary table with confidence intervals;
- failure-class counts;
- the **failure atlas**: failed/scored tracks per condition tag;
- a **reliability table**: is the app's own confidence higher when it's right?

## Holdout rules

- A normal run **skips** `holdout` tracks.
- `--holdout` runs **only** holdout tracks, **refuses to write inside the repository**, and prints no per-track detail.
- Holdout results are for the final check only, never for tuning.
- `tests/bench-holdout.test.js` checks these rules.

## Verification

- `npm run bench:parity` must report every check matching G0 (104/104 on the synthetic set).
- `npm run bench:crosscheck` must agree with mir_eval within 0.001 on every value (120/120 on the synthetic set).
- Metric code tests: `tests/bench-metrics.test.js`.
