# G1a two-track annotation and QA

Prepared 17 November 2026. Status: protocol and blank records only. No listening, annotation, contributor contact or private audio access performed. Basis: PR #4 head `6a952de4181228992b66b61253b63c957ecf5cc8`, `bench/README.md` and `docs/G1A_PILOT_CHECKLIST.md`. Confirm against the final integration revision before execution.

Use only after the readiness checks in `G1A_TWO_TRACK_INTAKE.md` are complete. Two tracks are a preparation rehearsal for the 12-track development pilot. Do not report population accuracy, meaningful confidence intervals or a useful key-agreement kappa from two tracks.

## Independent work

Record tool/version (the checklist specifies Sonic Visualiser), protocol version, annotator, source hashes and elapsed minutes per task. A and B independently annotate beats, downbeats and key for each track without analyzer predictions or each other's labels. One annotator plus an independent reviewer annotates chords on at least one preselected harmonic track. Annotate drums wherever stems/MIDI support truth; without stems use two 16-bar excerpts (main groove and variation) and document coverage. Bass truth comes from MIDI only. Do not invent unobservable truth or treat contributor metadata as truth.

## Harness text formats

Times are seconds against the final master. Files are plain text. `#` at line start or after a space introduces a comment. The following describe syntax, not actual annotations.

| File | Syntax and QA |
|---|---|
| Beats/downbeats | `time beat-in-bar`; quarter-note pulse, positions 1–4, position 1 is a downbeat. Correct every verified beat against waveform/spectrogram. |
| Uncertain region in beats file | `gap <start> <end> <reason>`; do not interpolate. No beat may fall inside a gap. Predictions there are excluded; phase-locked drift restarts after a gap. |
| Real tempo transition in beats file | `tempo-change <time> <note>`; retain continuous beats. This does not restart drift. Never use a transition to hide a missing beat. |
| Key | Global label such as `F# minor`; modes, `atonal` and `ambiguous` are retained but not scored as major/minor. Record modulation/segment observations in QA; do not invent a segmented-key file grammar absent parser support. |
| Chords | `start end label`, Harte labels such as `A:min`, `C:maj7/3`; `N` for no chord, `X` for unknown. Record covered spans. |
| Drums | `time class`, using `kick`/`bd`, `snare`/`sd`/`clap`/`cp`/`rim`, `hihat`/`hh`/`chh`/`ohh`. Verify stem/MIDI alignment to master under 5 ms. |
| Bass | `onset offset midi`; MIDI-derived truth only. Record octave listening checks. The parent plan requires checks on at least two tracks where available; absent MIDI remains a documented limit. |

## Adjudication and continuity

Compute inter-annotator beat F at ±70 ms per track with existing `tests/metrics.js` `events()`. Adjudicate F below 0.90, any bar-1 disagreement and every key disagreement. Resolve through evidence or a reasoned gap; never average beat positions. Preserve A/B originals and decisions.

The provisional continuity threshold is 1.75 times the local beat interval. For each flag record whether beats were missing, the span is genuinely uncertain, or a real tempo change caused a false positive. Preserve the threshold. Hash every revised file and record why it changed. Declared changes cannot mask an actual hole at unchanged tempo.

| Track | A/B beat F | Bar-1 agreement | Key agreement | Reviewer/adjudicator | Final file hashes | Status |
|---|---|---|---|---|---|---|
| g1a-01 | Pending | Pending | Pending | Pending | Pending | Not started |
| g1a-02 | Pending | Pending | Pending | Pending | Pending | Not started |

| Date | Track/task | Event and time span | A/B evidence | Decision/reason | Before/after hash | Owner/reviewer | Minutes |
|---|---|---|---|---|---|---|---|
| Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

| Track/annotator | Beats/downbeats min | Key min | Chords min | Drums min | Bass min | Adjudication min |
|---|---|---|---|---|---|---|
| g1a-01 / A | Pending | Pending | Pending | Pending | Pending | Pending |
| g1a-01 / B | Pending | Pending | Pending | Pending | Pending | Pending |
| g1a-02 / A | Pending | Pending | Pending | Pending | Pending | Pending |
| g1a-02 / B | Pending | Pending | Pending | Pending | Pending | Pending |

## Authorized execution checklist (future work)

1. Resolve intake, coverage and adjudication blockers; freeze the dev manifest with audio and annotation hashes. Store all real data outside Git. Record clean engine commit and unchanged analyzer checksum.
2. Run existing `bench/check-splits.js` with the private registry and the approved manifest pair. An empty holdout only checks identity readiness; final holdout separation remains pending.
3. Run `node bench/run.js <manifest.json> --out <restricted-results-dir>`. Validation failures must stop before analysis with exit 2. Resolve each flagged issue with a QA record and re-pin hashes.
4. Run `node bench/score.js <restricted-results-dir>/predictions.json`. Require exit 0 and completeness 2/2; retain every selected track and report all failure categories. Keep predictions, logs, manifest hash, truth fingerprint, scores.json, tracks.csv and report.md in restricted storage.
5. Do not change manifest between prediction and scoring. Intentional annotation revisions need new hashes, a version bump, dated revisions entry and `--rescore`; preserve existing results. Audio changes require new predictions. Never overwrite a revision output directory.
6. With an independent reviewer, listen to every failure only under separately authorized data access. Record failure-class evidence, the leading-silence exported-kick hypothesis where applicable, provisional continuity false positives, time cost and unresolved issues. No algorithm changes are authorized here.
7. Report two-track observations and readiness for the remaining ten slots. Founder sign-off and the full 12-track protocol review remain outstanding.

## Current blockers

No tracks, rights decisions, storage approvals, personnel assignments, received-file hashes or annotations have been supplied or verified. Actual intake, annotation, pilot execution, listening review and sign-off are therefore pending. The preparation documents do not authorize contact, spending or access to private audio.
