# bench/: G1 benchmark harness

Measures the analyzer against annotated tracks listed in a **manifest**. It works the same for the synthetic test songs and for real music. Plan and rationale: `docs/G1_REAL_MUSIC_BENCHMARK_PLAN.md`. This harness changes no analysis code.

```bash
npm run songs              # synthetic songs + their answer files + test-songs/manifest.json
npm run bench:synthetic    # run the analyzer on the manifest, then score it
npm run bench:parity       # acceptance: must reproduce the G0 benchmark (run `npm run benchmark` first)
npm run bench:crosscheck   # every metric recomputed with mir_eval (pip install mir_eval)
npm run bench:integrity    # edited answers / missing coverage must fail scoring

node bench/run.js <manifest.json> [--out DIR] [--page index.html]     # real data: predictions only
node bench/score.js <DIR>/predictions.json                             # scores.json, tracks.csv, report.md
```

`run.js` (browser, slow) and `score.js` (pure, fast) are separate, so scoring can be repeated, tested and changed without re-running the analyzer.

## Manifest

```json
{
  "name": "electronic-dev", "version": 3, "annotationProtocol": "v1.0",
  "requirements": { "checksums": true, "annotations": { "beats": "all", "downbeats": "all", "key": "all", "chords": 0.3 } },
  "tracks": [{
    "id": "ukg-007",
    "audio": "audio/ukg-007.wav",
    "sha256": "…",
    "split": "dev",
    "group": "artist-x/release-y",
    "rights": { "source": "contributor agreement CA-012", "licence": "internal evaluation only" },
    "tempo": 132,
    "tags": { "style": "uk garage", "swing": "heavy", "four_on_floor": false, "tempo_band": "115-135" },
    "annotations": { "beats": "ann/ukg-007.beats.txt", "key": "ann/ukg-007.key.txt", "chords": "ann/ukg-007.chords.lab", "drums": "ann/ukg-007.drums.txt", "bass": "ann/ukg-007.bass.txt" },
    "annotationSha256": { "beats": "…", "key": "…", "chords": "…", "drums": "…", "bass": "…" }
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

## Ground-truth integrity and required coverage

`run.js` checks everything before the browser starts and stops with exit 2 if anything fails.
- Every annotation file is hashed and compared with `annotationSha256` in the manifest, so an edited answer file can't change results silently.
- Audio files are checked against `sha256`.
- The manifest's `requirements` are enforced:
  ```json
  "requirements": { "checksums": true, "annotations": { "beats": "all", "downbeats": "all", "key": "all", "chords": 0.3, "drums": 0.5 } }
  ```
  `"all"` means every track; a number is the minimum share of tracks. `downbeats` means the beats file carries bar positions. `checksums: true` requires a hash for the audio and for every annotation.

`score.js` checks again at scoring time:
- A track whose answer files no longer match is **not scored**, and the run exits 1.
- It records each track's annotation hashes and a single **truth fingerprint** for the whole answer set (in `scores.json` and `report.md`), so two reports can only be compared if their fingerprints match.
- It notes any track whose answers changed after its predictions were made.
- It writes a coverage table to the report.

To correct an annotation, edit the file, update its hash, bump the manifest `version`, and re-score. The old report keeps the old fingerprint.

## Exported-grid drift

`drift` is **phase-locked**: exported beat *n* is tied to true beat *n* from the first true beat, so a grid that slips by whole beats on a tempo-changing track keeps accumulating error. The class is `slipped-beats` once it is half a beat or more off. `driftNearest` (distance to the nearest exported beat) is kept for comparison; it can never exceed half a beat. Gaps in the beat annotation are bridged using the local beat interval.

## Holdout safeguards

**Enforced by code** (`lib/holdout.js`, tested in `tests/bench-holdout.test.js`):
1. Holdout tracks live in their **own manifest**. A dev run refuses a manifest that contains holdout tracks; a `--holdout` run refuses anything else.
2. `--holdout` writes **outside the repository** and prints no per-track detail. Requirement failures are summarized without naming tracks.
3. `--operator NAME` is required. Every run is appended to the custody log `holdout-runs.jsonl` next to the holdout manifest: date, operator, reason, engine head SHA, page sha256, manifest sha256.
4. The working tree must be **clean**, so each result maps to one commit.
5. **One run per engine build.** If the log already has a run for this `index.html`, another run needs `--reason "<why>"`, which is logged.
6. `node bench/check-splits.js dev.json holdout.json` fails on any shared track id, audio file or `group` (set `group` to artist/release so related tracks stay in one split).

**Procedure** (people, not code):
- **Custodian.** One named custodian, not the engineer tuning the analyzer, holds the holdout manifest, audio, annotations and custody log outside this repository, e.g. an access-restricted drive.
- **Engineers.** Engineers never see holdout audio, per-track results or annotations.
- **When the holdout runs.** Only to confirm a decision already made on the dev set. The custodian:
  1. tags the engine commit;
  2. runs `check-splits`;
  3. runs `--holdout`;
  4. shares only `report.md` aggregates with the founder and the independent reviewer.
- **Re-runs.** These need a written reason in the log and the founder's agreement. If holdout results are used to change the analyzer, that holdout set is **spent**: it becomes dev data, and a fresh holdout is needed for the next confirmation.
- **Review the log.** The custody log is reviewed at each G-phase sign-off.

## Verification

- `npm run bench:parity` must report every check matching G0 (104/104 on the synthetic set).
- `npm run bench:crosscheck` must agree with mir_eval within 0.001 on every value (120/120 on the synthetic set).
- `npm run bench:integrity` checks that edited answer files and unmet requirements fail scoring (needs `bench:synthetic` first).
- Metric code tests: `tests/bench-metrics.test.js`.
