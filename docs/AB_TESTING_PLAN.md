# Track Teardown — Evaluation and Experiment Plan

## Priority order

1. Offline analyzer validation (accuracy first).
2. Producer-assisted error review and correction capture.
3. Workflow-value experiments with experienced producers.
4. SaaS pricing, retention, and conversion experiments.
5. Interface experiments only after the analysis is trusted.

Do not run a user-facing A/B test that changes analyzer and interface simultaneously.

## Track A — Offline analyzer bake-off

This is a paired technical evaluation, not a customer-facing randomized A/B test.

- A / Control: frozen current analyzer, commit SHA recorded.
- B / Candidate: candidate analyzer on a separate branch/version.
- Both analyze identical, locked files under identical settings and runtime.
- Synthetic fixtures are regression tests only; claims require a rights-cleared, expert-annotated real-world holdout.
- Begin with electronic music across multiple substyles, not only four-on-the-floor.
- Split by whole recording, keep a hidden holdout, and document provenance.

See docs/ELECTRONIC_BENCHMARK_PROTOCOL.md for strata, annotation schema, metrics, tolerances, and release gates.

## Track B — Producer validation

Recruit experienced electronic producers. Observe their current reference-analysis workflow and identify repeated, expensive tasks. Use tracks they have rights to analyze.

Capture:
- task attempted and whether the output was useful;
- time to reach a useful decision vs their normal process;
- corrections to tempo, downbeat, meter, key, chords, drums, bass, and structure;
- which results they trust enough to use in a session;
- exports actually used in a DAW;
- whether they return for another track and why.

Do not lead participants toward positive feedback. Record failures and reasons.

## Track C — Product experiments (after technical baseline)

### Experiment 1: Analysis output
- A: current output.
- B: evidence-first, editable analysis with confidence, alternatives, timestamps, and separation of measurements from inference.

Primary outcome: percentage of sessions where a producer confirms at least one result was useful for a real production decision.

Guardrails: correction rate, analysis failure rate, time to useful insight, and abandonment.

### Experiment 2: User-selected genre profile
- A: neutral analysis profile.
- B: explicit genre selection with electronic substyle profile.
- Compare only when the underlying evidence layer is identical and benchmark sample sizes are adequate per style.

Primary outcome: task-specific accuracy or producer-rated usefulness without reduced cross-style reliability.

### Experiment 3: Workflow handoff
- A: results only.
- B: structured DAW-ready exports for supported, accurate tasks.

Primary outcome: percentage of users who actually use an export in a production session. Downloads alone do not prove use.

## Track D — SaaS and commercial validation

Before extensive billing/account infrastructure:
- validate repeated use with a small cohort of professional producers;
- test whether the product saves meaningful time or improves decisions;
- identify which outputs are valuable enough to pay for;
- test transparent pricing with real offers, not hypothetical "would you pay?" questions alone;
- understand processing costs, support burden, and storage expectations.

Later measures: activation, time-to-first-useful-insight, weekly active producers, repeat analyses, export usage, paid conversion, retention/churn, cost per analyzed minute, gross margin, failure rate, and correction rate.

## Assignment and analysis rules

Randomize by user/account for product A/B tests and persist assignment. Predefine hypothesis, eligibility, primary metric, guardrails, sample-size/power method, and stopping rule. Do not stop early because results look favorable. Analyze intention-to-treat and disclose exclusions. Segment by genre/subgenre and experience only when planned and adequately powered. Avoid collecting raw audio, exact song titles, artist names, or personal notes in analytics by default. Make audio retention and feedback use explicit and consent-based.

## North-star outcome

A professional producer reaches a reliable, actionable understanding of a reference track faster than their existing workflow and uses that insight to make a better production decision. Do not optimize for tutorial completion, time in app, or feature count.


## Required experiment reporting

Every experiment report must include the hypothesis, frozen versions, dataset manifest, method, metrics, uncertainty, failure examples, limitations, self-audit, and next decision. Do not report only a winning aggregate score. See docs/ENGINEERING_COMMUNICATION_AND_AUDIT_STANDARD.md.
