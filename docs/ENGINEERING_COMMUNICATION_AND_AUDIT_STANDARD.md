# Engineering Communication, Explainability, and Audit Standard

## Purpose

Track Teardown must be understandable to its users and auditable by its builders. Explainability is a product and engineering requirement, not marketing copy.

This document defines two complementary standards:
1. Product analysis trace: what the application tells a producer about how a result was produced.
2. Development audit: what the engineering team records after each meaningful change.

## A. Product analysis trace

Every analysis result should be represented as a structured claim with provenance. The user-facing explanation can be concise, but the underlying record must be detailed enough to reproduce and investigate the result.

### Required fields for an inference

- Result identifier and task (tempo, beat, key, chord, drum event, bass note, section, etc.).
- Value or hypothesis, units, and time range.
- Evidence references: relevant time windows and feature outputs, not merely a generated explanation.
- Method/algorithm identifier and version.
- Analysis settings and preprocessing version.
- Genre profile selected, or Auto/Unknown; explicitly record whether genre context affected this inference.
- Confidence value and calibration version, or an explicit "not calibrated" status.
- Ranked alternatives where ambiguity is material.
- Known limitations and reasons for abstention.
- User correction, if any, kept separately from the machine's original prediction.

Never claim the system inspected a signal feature unless it actually computed and stored that feature. Never generate a plausible explanation after the fact that is not linked to the actual computation.

### Explanation pattern

For each meaningful result, provide:
1. What we found.
2. Why we think so: actual evidence and method, summarized in producer-friendly language.
3. What else could be true: alternatives such as half/double-time BPM, relative key, competing chords, or uncertain instrument identity.
4. How sure we are: calibrated confidence when available; otherwise an honest qualitative/uncalibrated state.
5. How to verify or correct it: timestamp, waveform/spectrogram/beat-grid overlay, playback loop, or editable value.

Examples (templates only; values must come from actual stored analysis):
- Tempo: "We estimate 128 BPM. The strongest beat periodicity is near 128; 64 BPM is a plausible half-time interpretation. Downbeat alignment is less certain than tempo."
- Key: "A minor is the leading hypothesis. Pitch-class evidence supports A and E strongly, but C major remains plausible because this passage does not establish a clear tonal center."
- Kick: "A kick-like transient is detected at 00:32.418. The low-frequency transient and broadband attack support the event; a bass transient overlaps, so this event is marked medium confidence."

### Progressive disclosure

Do not force experts to read a technical essay for every result:
- Default: concise result and one-sentence rationale.
- Expand: evidence, alternatives, and method.
- Advanced: technical settings, signal views, and reproducibility metadata.

Respect experienced producers. Avoid beginner tutorials and anthropomorphic claims such as "the AI listened and understood" when a specific signal-processing operation was performed.

### User corrections and feedback

- Allow correction of supported outputs.
- Preserve original prediction, corrected value, timestamp, and correction provenance.
- Do not silently overwrite ground truth or training labels with user edits.
- Use corrections for model improvement only under explicit consent and appropriate rights.
- Separate user-specific preferences from global model training data.
- Provide export/deletion controls when SaaS storage exists.

## B. Development communication standard

For every substantive work session, provide:
1. Objective.
2. Why it matters.
3. What was inspected (files, code paths, docs, comparable apps, datasets, tests actually examined).
4. Options considered and trade-offs.
5. Decision and rationale.
6. Changes made, with exact files/branch/PR; distinguish planned from completed.
7. Validation: exact commands/tests/benchmarks run and outcomes; mark not run, blocked, or partial.
8. Self-audit: assumptions, flaws, gaps, regressions, and what should be done differently.
9. Decision log: decided, deferred, and requiring founder approval.
10. Next steps with acceptance criteria.

Never claim a change was tested, deployed, merged, or successful unless execution/tool results verify it. Distinguish code changes from documentation/planning changes.

## C. Engineering quality gates

Before a significant algorithm or architecture change:
- inspect existing implementation and tests;
- identify baseline and known failure cases;
- review credible research, established tools, and open implementations;
- check license, maintenance, platform support, and commercial-use compatibility;
- define a hypothesis and pre-registered evaluation metric;
- isolate candidate from control;
- test on development data and evaluate on hidden holdout;
- inspect failures, not only aggregate scores;
- retain the change only if it clears acceptance criteria without unacceptable regressions.

A paper, product feature, GitHub stars, or leaderboard is not proof a technique will work on our audio, genres, latency budget, or commercial constraints.

## D. Audit trail and reproducibility

For each benchmark run, preserve repository SHA, analyzer/config versions, dataset manifest and audio checksums, preprocessing/resampling settings, runtime/hardware, metric implementation/tolerances, per-track predictions, ground truth references, aggregate results, uncertainty intervals, and failure logs.

For each user-facing analysis, preserve enough version metadata to explain which engine and settings produced the result, subject to privacy and retention policy.

## E. Communication principles

Be candid and specific. Explain technical concepts in plain language, then provide depth. Identify uncertainty instead of hiding it. Challenge assumptions respectfully when evidence disagrees. Prefer a small verified improvement over a broad unverified claim.
