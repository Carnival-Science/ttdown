# Electronic Music — Accuracy Benchmark Protocol

## Objective

Establish a reproducible, independently checkable baseline before tuning algorithms or making commercial accuracy claims. Electronic music is the first validation domain, not the permanent market boundary.

## Benchmark rules

1. Freeze current analyzer as Control A and record its commit SHA.
2. Freeze dataset and annotation versions before evaluating a candidate.
3. Split by complete recording, never by clips from the same song.
4. Keep a hidden holdout that is never used to tune thresholds or parameters.
5. Use two qualified annotators for ambiguous labels; adjudicate disagreements and record uncertainty.
6. Record source, rights, license, commercial-use permission, annotation method, and provenance.
7. Report every task separately, with sample counts and confidence intervals. No single headline accuracy score.
8. Run Control A and Candidate B on identical files, settings, runtime, and target hardware.
9. Preserve per-track predictions and error examples, not only aggregate scores.
10. Insufficient evidence is "not evaluated", not 100% or 0%.

## Dataset composition

Cover multiple electronic styles:
- House and techno, including sparse, dense, and swung grooves.
- Trance and progressive electronic.
- Bass music, dubstep, and drum and bass.
- Breakbeat and UK garage.
- Ambient and downtempo electronic.
- Synthwave and melodic electronic.

Stratify by track duration, sample rate, mastered stereo vs licensed stems, vocal density, live/sampled/synthesized percussion, arrangement density, tempo range, half/double-time ambiguity, swing, syncopation, tempo drift, meter, tonal/modal/atonal material, modulation, sidechain, distortion, reverb, and overlapping low-frequency content.

Synthetic tracks remain useful for deterministic regression and edge cases, but must be reported separately from real-world recordings.

## Annotation specification

Each item should include:
- stable track ID, source/license metadata, checksum, preprocessing version;
- tempo hypothesis or tempo map and accepted half/double-time interpretations;
- beat and downbeat timestamps;
- meter and annotator agreement;
- key tonic/mode, including modulation regions where appropriate;
- chord labels and time intervals, including unknown/ambiguous regions;
- drum event timestamps/classes (kick, snare/clap, closed/open hat, other percussion);
- bass onset, offset, pitch, and octave where ground truth is available;
- section boundaries and labels with a documented annotation convention;
- annotator roles, disagreement notes, and adjudication result.

Annotators must work independently of the analyzer under test.

## Metrics and tolerances

Specify and version timing tolerances before evaluation. Report per-track and aggregate results.

| Task | Primary measures | Notes |
|---|---|---|
| Tempo | Absolute BPM error; exact and half/double-time-aware accuracy | Report both; never silently normalize |
| Beat grid | Beat F1 and timing deviation | Publish tolerance |
| Downbeat | Downbeat F1 and bar-phase error | Include intro silence and pickups |
| Meter | Exact meter accuracy and confusion matrix | Include uncertain/unsupported predictions |
| Key | Exact tonic + mode accuracy and confusion matrix | Relative major/minor are distinct |
| Chords | Time-weighted chord accuracy; segment boundary F1 | Separate root, quality, inversion, extensions |
| Drums | Event precision/recall/F1 by class | One-to-one event matching |
| Bass | Onset F1, pitch accuracy, octave and duration error | Report only where annotatable |
| Structure | Boundary F1 and label agreement | Separate boundaries from semantic labels |
| Runtime | Median/p95 runtime, memory, failure rate | By device and duration |

Metric code must define one-to-one event matching so one prediction cannot match multiple ground-truth events. Publish tests for the metric implementation.

## Confidence calibration

Store confidence and alternatives. Bin predictions by confidence and compare stated confidence with observed correctness. Report calibration error and coverage vs accuracy. Measure whether abstaining on low-confidence cases improves precision. Do not show numerical confidence to users until calibrated on held-out data.

## Control A vs Candidate B

Run both versions on the same locked dataset. Compare paired per-track errors and bootstrap confidence intervals by track, not individual frames. Pre-register primary tasks, practical improvement thresholds, and regression guardrails. Report runtime/failure changes and inspect representative false positives and false negatives.

A candidate wins only if it materially improves the pre-registered target without unacceptable regressions elsewhere.

## Current repository limitations

- Current synthetic suite is narrow and highly regular.
- Key scoring compares pitch-class sets and cannot distinguish relative major/minor.
- Current benchmark does not calculate advertised 808/bass precision and recall.
- Hook evaluation is limited to one synthetic lead example.
- Chord scoring is limited to repeating triads.
- Synthetic results are not real-world performance claims.

## Initial release gate

No public accuracy claim until the benchmark runs from a clean checkout; labels and rights are documented; holdout is isolated; metrics/tolerances are versioned; confidence and failures are reported; results are independently reviewed; and a repeatable CI regression suite exists.

Research datasets may help, but each license must be reviewed before commercial use. Artificial Audio Multitracks may help with aligned synthetic/music-production tasks; it is not a substitute for real electronic mixes.
