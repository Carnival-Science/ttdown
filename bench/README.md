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
  "requirements": { "checksums": true, "continuousBeats": true, "identity": true,
                    "annotations": { "beats": "all", "downbeats": "all", "key": "all", "chords": 0.3 } },
  "tracks": [{
    "id": "ukg-007",
    "audio": "audio/ukg-007.wav",
    "sha256": "…",
    "split": "dev",
    "artists": ["Artist X", "Featured Artist"],
    "release": "LABEL-042",
    "songFamily": "artist x - song name",
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
- `sha256` is checked before each run; a mismatch stops the run before it starts.
- `artists`, `release` and `songFamily` are the leakage identifiers.
  - `artists`: everyone credited, including featured artists and remixers.
  - `release`: a catalog number if there is one.
  - `songFamily`: the underlying song, shared by its originals, remixes, edits and VIPs.
- **Real benchmark manifests must set `checksums`, `continuousBeats` and `identity` to true.**
- `tempo` is optional; without it, tempo comes from the median beat interval.
- Any annotation may be missing; metrics that need it are reported as not scored.
- `tags` are free-form condition labels. Every tag value becomes a row of the failure atlas.

Annotation formats (plain text, mir_eval/Sonic Visualiser style; `#` at line start or after a space is a comment):

| File | Line format |
|---|---|
| beats | `time [beat-in-bar]` (1 = downbeat; without positions, downbeats are "not annotated"). Must be continuous in scorable regions; declare uncertain spans as `gap <start> <end> <reason>`. Gaps are never interpolated: predictions inside them are not scored, and drift restarts after them. A **real tempo change** is not a gap: keep the beats continuous and declare `tempo-change <time> <note>`. |
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

## Section boundaries (arrangement)

A track may list `"sections": "ann/<id>.sections.lab"` (`start end label`, the chords format). The scorer compares the start of every section after the first with the analyzer's section starts, one-to-one, at ±0.5 s and ±3 s (`sections.w05`, `sections.w3`), as `mir_eval.segment.detection(..., trim=True)`; `bench:crosscheck` checks it against mir_eval. Labels are kept but not scored yet (the analyzer's labels are loudness heuristics). Scorable regions mask boundaries like other events.

`npm run bench:arrangement` runs the two arrangement fixtures (`test-songs/arrangement-fixtures/`, generated by `npm run songs:time`): an 8/16/8/16/8-bar arrangement at a constant 124 BPM and the same arrangement drifting from 124 to 112 BPM. `tests/arrangement-vs-version-a.test.js` compares the result with the pinned Version A run in `bench/baselines/version-a/arrangement-fixtures/`.

## Scoring semantics (corrected after the benchmark audit)

- **Event matching is maximum-cardinality one-to-one**, like `mir_eval`: greedy nearest-first, then completed by augmenting paths. Greedy alone undercounted events closer than two tolerance windows apart (reference 40/100 ms vs estimate 0/60 ms at ±50 ms is two matches; greedy found one, F 0.50 instead of 1.00). Where greedy was already maximum the result is identical, so no existing score changed (checked on all 22 synthetic tracks: metrics and failure classes identical). `tests/metrics.test.js` has the counterexample, ties, duplicates, chains on the tolerance edge, the `allow()` pitch condition, and 400 randomized cases against a brute-force oracle.
- **"Not annotated" is not "annotated and absent".** A track with no annotation file for a kind skips that kind. A kind that *is* annotated but has no events (a drumless breakdown, inside a scorable region or not) stays scorable: anything the analyzer predicts there is a false positive, F is 0, and the failure class is `extra`.
- **Vacuous is not perfect.** An event class with nothing annotated AND nothing predicted has `f: null, vacuous: true` and is left out of averages (it used to be 1.0, which lifted aggregates for tracks without, say, snares). Bass `noteF` likewise.
- **Region cross-check is independent for every evaluated event.** `bench/crosscheck_mir_eval.py [scores.json] [--manifest m.json]` rebuilds tracked beats and downbeats, the exported grid (its own `firstDown + n * barSec / 4`), drum hits, bass notes and chord bars (its own app-chord to Harte mapping) from `predictions.json`, applies its own half-open region masks and its own declared-gap filter, and scores chords per region with its own clipping. It only falls back to the copies in `scores.json` if `predictions.json` is missing. `bench:regions` includes a negative test: a scorer that silently dropped bass notes, chord bars or mis-scored a gap is caught. `npm run bench:regions` runs it on the fair-excerpt, disjoint, boundary, adjacent, annotated-silence and empty-region scenarios (skipped with a note when `mir_eval` is not installed; CI installs it).
- Not covered yet: true-negative coverage (how much annotated silence the analyzer left silent) is not reported separately from F.

## Scorable regions (partially annotated tracks)

A track may be annotated for an excerpt, or for several disjoint excerpts. Everything the analyzer predicts outside them has no ground truth, so it must not count as a false positive. Declare the annotated parts in the manifest, per track:

```json
"scorable": [{ "start": 0, "end": 60 }, { "start": 120.5, "end": 180 }]
```

- **One mask, applied to predictions and references alike**: beats and downbeats (tracked and exported grid), drum events per class, bass notes (by onset), the 16-step pattern score (only bars wholly inside one region), and chords (clipped at each region edge and scored per region, then weighted by reference seconds). Drift restarts at every region edge, exactly as at a declared `gap`.
- **Half-open** `[start, end)`: an event exactly at `start` counts, one exactly at `end` does not, so adjacent regions never count an event twice.
- Regions must be finite, ordered, non-overlapping, with `end > start >= 0`. Anything else fails the run (exit 2 at `run.js`, exit 1 at `score.js`) with a message naming the track.
- **Annotated silence is declared, not inferred.** A kind with no events inside a region is only valid if the region says so: `"scorable": [{ "start": 20, "end": 40, "silent": ["drums", "bass"] }]`. Then it stays scorable (predictions there are false positives; with nothing predicted either it is vacuous, `f: null`, never 1.0). Without the declaration, "no events" cannot be told apart from "nobody annotated this region", so the run fails with a message naming the track, region and kind (`silent` accepts drums, bass and chords; beats cannot be silent: declare a `gap`).
- **Regions must lie inside the recording.** At scoring time a region that starts after the audio ends, or ends more than 0.5 s after it, marks the track `invalid-scorable-region` (ground truth, not analyzer): nothing is scored for it, the report lists it under "Unscorable ground truth", and the run fails. Previously such a benchmark completed with only tempo and key scored.
- **Required capabilities count scored coverage, not files.** For a track with regions, a kind counts toward `requirements.annotations` only if it has events in a region or a region declares it silent.
- Tempo and key are track-level labels and are not masked. The report lists each track's regions, seconds and share of the recording.
- A track without `scorable` is scored over the whole recording, exactly as before: the synthetic scores are byte-for-byte unchanged by this feature (`tests/bench-regions-score.test.js` also checks that a whole-track region gives identical metrics).
- `tests/bench-regions.test.js` (helpers, in `npm test`) and `npm run bench:regions` (end to end on the real predictions).

## Ground-truth integrity and required coverage

`run.js` checks everything before the browser starts and stops with exit 2 if anything fails.
- Every annotation file is hashed and compared with `annotationSha256` in the manifest, so an edited answer file can't change results silently.
- Audio files are checked against `sha256`.
- The manifest's `requirements` are enforced:
  ```json
  "requirements": { "checksums": true, "continuousBeats": true, "identity": true,
                    "annotations": { "beats": "all", "downbeats": "all", "key": "all", "chords": 0.3, "drums": 0.5 } }
  ```
  `"all"` means every track; a number is the minimum share of tracks. `downbeats` means the beats file carries bar positions.
  - `checksums` requires a hash for the audio and for every annotation.
  - `continuousBeats` rejects any hole longer than 1.75× the local beat interval that isn't declared as a gap, any beat inside a gap, and any gap without a reason.
  - `identity` requires `artists`, `release` and `songFamily` on every track.

`score.js` checks again at scoring time:
- A track whose answer files no longer match is **not scored**, and the run exits 1.
- It records each track's annotation hashes and a single **truth fingerprint** for the whole answer set (in `scores.json` and `report.md`), so two reports can only be compared if their fingerprints match.
- It notes any track whose answers changed after its predictions were made.
- It writes a coverage table to the report.

**The manifest must not change between prediction and scoring.** `run.js` records the manifest's sha256. If `score.js` is given a different manifest, it stops with exit 1 and writes nothing.

**Re-scoring after an intentional ground-truth revision:**
1. Correct the answer file(s) and update their `annotationSha256`.
2. Bump `manifest.version`.
3. Add `revisions: [{ "version": <new>, "date": "YYYY-MM-DD", "reason": "<what changed and why>", "tracks": [...] }]`.
4. Run `node bench/score.js <predictions.json> --rescore`.

Results go to `<predictions dir>/rescore-v<new>/`, so the original scores stay untouched. The report states the revision and the manifest version the predictions came from. Re-scoring without a version bump or a revision entry is refused. If tracks were added, run the analyzer again: a re-score can't invent predictions.
- **A revision may change answers, never the audio.** A track whose audio sha256 differs from the one recorded in its prediction is not scored (`audio-changed-since-prediction`), and the run fails.
- **A revision result is never overwritten.** If `rescore-v<N>/` already exists, scoring stops; another revision needs a new version.

## Run completeness

Every manifest track of the split is required. `score.js` exits 1 unless **every** required track was analyzed and scored. Reports are written either way, and failures are listed by cause because each needs a different owner:

| Category | Meaning | Owner |
|---|---|---|
| Analyzer failures | crash ("Couldn't read"), timeout, or page errors (metrics kept for diagnosis) | analyzer |
| No usable prediction | track not run, or its audio missing or changed | whoever ran the benchmark |
| Unscorable ground truth | answer files changed since they were pinned | annotation custodian |
| Unknown tracks | predictions for tracks no longer in the manifest | whoever ran the benchmark |

Aggregate metrics in an incomplete run cover only the scored tracks, and the report says so at the top of its completeness section.

**Uncaught page errors** (exceptions in the app) fail the run, and the track's metrics are kept for diagnosis. **Ordinary console warnings and `console.error` lines** (e.g. a font that can't load offline) are counted, with a few sample lines, in a separate report section and do **not** fail the run.

## Exported-grid drift

`drift` is **phase-locked**: exported beat *n* is tied to true beat *n* from the first true beat, so a grid that slips by whole beats on a tempo-changing track keeps accumulating error. The class is `slipped-beats` once it is half a beat or more off. `driftNearest` (distance to the nearest exported beat) is kept for comparison; it can never exceed half a beat.

Beats are **never interpolated**. At a declared gap the count restarts with a new anchor, because how many beats passed inside the gap is unknown. An unexplained hole also restarts the count; it is reported as `undeclaredGaps`, and it fails validation when `continuousBeats` is required.

**Tempo changes.** A declared `tempo-change` does **not** restart the count: the beats are continuous, and the fixed export grid really does drift there. The continuity check compares each interval only with intervals at the same tempo, i.e. on the same side of every declared change.
- **A lasting change** isn't flagged even without a declaration, because the local median adapts.
- **The likely false positive** is a *short* passage at another tempo, such as a few half-time beats in a fill. It looks like missing beats until declared.
- **No masking:** a declaration can't hide a genuinely missing beat at an unchanged tempo.

The 1.75× threshold is provisional for G1a. Every flagged hole and its resolution (gap, tempo change, or annotation fix) goes in the annotation QA log, so false positives can be counted.

## Holdout safeguards

**Enforced by code** (`lib/holdout.js`, tested in `tests/bench-holdout.test.js`):
1. Holdout tracks live in their **own manifest**. A dev run refuses a manifest that contains holdout tracks; a `--holdout` run refuses anything else.
2. `--holdout` writes **outside the repository** and prints no per-track detail. Requirement failures are summarized without naming tracks.
3. `--operator NAME` is required. Every run is appended to the custody log `holdout-runs.jsonl` next to the holdout manifest: date, operator, reason, engine head SHA, page sha256, manifest sha256.
4. The working tree must be **clean**, so each result maps to one commit.
5. **One run per engine build.** If the log already has a run for this `index.html`, another run needs `--reason "<why>"`, which is logged.
6. `node bench/check-splits.js dev.json holdout.json` fails on any shared track id, audio file, **artist**, **release** or **song family**, compared ignoring case, accents and punctuation. It also fails if any track lacks those identifiers, since leakage can't then be ruled out. The legacy `group` field is still compared if present.

**Artist IDs.** Prefer stable internal IDs (`artistIds: ["art-0007"]`) kept in an artist registry outside the repo, passed with `--registry artists.json`:

```json
{ "artists": { "art-0007": { "name": "Bicep", "aliases": ["…"], "external": { "musicbrainz": "…" } } } }
```

- Credited names are resolved through the registry's names and aliases, so one artist under different names collides.
- An alias that maps to two IDs fails the check, as does an `artistIds` value missing from the registry.
- External IDs are optional.
- Without a registry, names are still compared after normalization, but aliases can't be resolved, and the output says so.
7. The 12-track G1a pilot and all development tracks are dev data. Nothing from them (track, artist, release or song family) may enter the final holdout.

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
