# Track Teardown — A/B Testing and Evaluation Plan

## Purpose

Prove two different things independently:

1. **Algorithm quality:** Does a new analyzer produce more accurate musical results on the same audio?
2. **Product value:** Does a new workflow help producers complete useful work, return, and choose to pay?

Do not combine these into one experiment. Better UI cannot prove better DSP, and a better offline benchmark cannot prove customers value the product.

## Track A — Offline analyzer bake-off (run this first)

This is a paired benchmark, not a customer-facing randomized experiment. Every candidate version analyzes the exact same files under the same environment.

### Arms

- **A / Control:** frozen current `main` analyzer.
- **B / Candidate:** proposed analyzer on a separate branch or versioned engine.
- Store the commit SHA, analyzer version, settings, browser/runtime version, and benchmark dataset version for every run.

### Dataset design

1. Keep the existing synthetic songs as deterministic regression fixtures.
2. Create a licensed, held-out real-world set with expert-verified labels.
3. Split by recording/song, never by clips from the same song across tuning and test sets.
4. Stratify by genre, tempo, meter, vocal density, recording quality, and arrangement complexity.
5. Include edge cases: half/double-time ambiguity, swung timing, live drums, rubato, sparse intros, dense masters, key changes, modulations, non-diatonic chords, and non-4/4 meter.
6. Maintain a separate tuning set. Do not tune on the final holdout.
7. Record provenance, license, annotation method, annotator agreement, and allowed commercial use for every dataset.

Potential research starting points include Artificial Audio Multitracks for aligned synthetic/music-production tasks. Its authors explicitly caution that generated audio does not replace evaluation on real compositions. See https://link.springer.com/article/10.1186/s13636-023-00278-7. Any dataset must be checked for its actual license and permitted use before inclusion.

### Metrics (report separately; no vanity composite)

| Task | Primary metric | Required breakdown |
|---|---|---|
| Tempo | Absolute BPM error and within-tolerance accuracy | Exact, half/double-time normalized, genre |
| Beat tracking | Beat F-measure with documented timing tolerance | Meter, genre, live vs programmed |
| Downbeat/bar-1 | Downbeat F-measure and alignment error | Intro silence, pickup, syncopation |
| Key | Exact tonic + mode accuracy | Relative-key confusions, confidence |
| Chords | Time-weighted chord accuracy and segment boundary F1 | Root, quality, inversion, extensions |
| Drums | Event precision/recall/F1 with timing tolerance | Kick, snare, hats, ghost notes |
| Bass | Onset F1, pitch accuracy, octave error, duration | Sustained vs re-triggered 808 |
| Melody | Note precision/recall, pitch and onset error | Polyphony and vocal/instrument lead |
| Structure | Boundary F1 and label agreement | Genre and section type |
| Runtime | Median and p95 analysis time, peak memory | Duration, sample rate, device class |

For tempo, report both raw BPM error and a clearly labeled half/double-time-aware score. Do not silently count a 70 BPM estimate as correct for a 140 BPM track without showing that distinction.

For key, exact-key accuracy must distinguish relative major/minor even though they share pitch classes. Pitch-class-set accuracy can be a secondary diagnostic only.

### Decision rule

Before opening the holdout, define a minimum practically meaningful improvement for each primary metric and the acceptable regression margin for all other important metrics. Use paired per-track comparisons and confidence intervals. Do not select a winner based on one aggregate score.

A candidate advances only when:
- It improves the pre-registered primary task(s) by the required amount.
- It does not materially regress critical tasks.
- Its confidence estimates are calibrated (high-confidence outputs are actually more accurate).
- Runtime and memory remain acceptable on target devices.
- Failures are reviewed by listening, not just by a dashboard.

## Track B — Product experience A/B tests

Run only after the analysis version is stable enough that users are not unknowingly receiving materially different accuracy.

### Experiment 1: Results presentation

- A: current analysis/results layout.
- B: evidence-first layout with confidence, alternatives, uncertainty explanations, and quick corrections.

**Primary outcome:** percentage of successful uploads that lead to a user-confirmed useful result or next action.

**Secondary outcomes:** time to first useful action, manual correction rate, MIDI export rate, and abandonment.

### Experiment 2: Rebuild workflow

- A: current Build It instructions.
- B: guided workflow with task checklist, DAW-specific steps, progress checkpoints, and contextual explanations.

**Primary outcome:** completion of a first rebuild/export.

**Secondary outcomes:** time to complete, number of help requests, repeat use, and user-rated usefulness.

### Experiment 3: Compare experience

- A: current single closeness score.
- B: separate rhythm, harmony, arrangement, sound-balance, and dynamics diagnostics, each with evidence and recommended next action.

**Primary outcome:** percentage of users who make a targeted improvement and re-run Compare.

**Guardrail:** do not describe a heuristic score as an objective perceptual similarity percentage.

### Experiment 4: Positioning and willingness to pay

Test honest product positioning with real producers:
- Music analysis tool.
- FL Studio learning assistant.
- Reference-track teardown and reconstruction platform.

Use interviews and transparent landing-page/offer tests. Do not fake scarcity, pretend a payment was processed, or advertise capabilities that are not shipped. Validate willingness to pay before building a large subscription system.

## Assignment and measurement rules

- Randomize at the account/user level, not per page view, so a person sees the same variant.
- Persist the assigned variant for the experiment duration.
- Define eligibility, exclusions, primary metric, guardrails, sample-size method, and stopping rule before launch.
- Avoid peeking and stopping as soon as a favorable result appears.
- Use a power calculation based on baseline conversion/variance and the minimum detectable effect; do not invent a universal sample size.
- Analyze intention-to-treat and report exclusions.
- Segment results by new vs returning users and relevant device class only when planned and adequately powered.
- Do not record raw audio or song titles in analytics by default. Prefer event metadata, task outcomes, app version, and consented feedback.
- Provide clear notice and opt-out where required. Respect deletion and retention choices.

## Event taxonomy (proposed)

| Event | Properties (minimum) |
|---|---|
| `upload_started` | app_version, experiment_id, variant, file_size_bucket, duration_bucket |
| `analysis_completed` | analyzer_version, duration_ms, success, error_category |
| `result_corrected` | task, correction_type, confidence_bucket |
| `midi_exported` | export_type |
| `rebuild_completed` | workflow_version, elapsed_bucket |
| `compare_completed` | metric_dimensions_present, corrections_made |
| `return_session` | days_since_prior_session |
| `subscription_started` | plan_id, offer_variant (only after payments exist) |

Avoid sending audio bytes, exact song titles, artist names, or personal notes to product analytics unless there is a separately justified, consented feature requiring it.

## Recommended sequence

1. Fix benchmark/report mismatches and test runner reliability.
2. Build the real-world, rights-cleared holdout.
3. Run the A/B analyzer bake-off offline.
4. Ship the winning analyzer behind a versioned feature flag.
5. Run results-presentation and rebuild-workflow product experiments.
6. Test positioning and willingness to pay.
7. Build billing and SaaS operations after evidence of repeat value.

## What a winning result means

A win is not "more clicks" or "users stayed longer." A win means users get a more accurate and understandable teardown, successfully make something in their DAW, and come back because the product helped them improve.
