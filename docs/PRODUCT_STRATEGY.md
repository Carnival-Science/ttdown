# Track Teardown — Product Strategy

## One-sentence company description

Track Teardown is a reference-track analysis platform for professional music producers: it turns a song into a reliable, editable technical breakdown so producers can make faster, better-informed creative and production decisions.

## What we are building

A professional tool for producers, engineers, and music creators who already know their craft. It helps answer: What are the tempo, meter, groove, and rhythmic feel? What harmonic material, bass movement, and melodic motifs are present? How is the arrangement structured? What measurable spectral, dynamic, and stereo characteristics explain the sound? Which details of a reference track matter to the user's own production?

This is not primarily a course, tutorial, or beginner learning experience. The value is speed, accuracy, control, and useful insight.

## Market scope and initial wedge

**Long-term market:** multi-genre music production. Users select the genre or style they are analyzing. The product must not assume one set of production norms applies to all music.

**Initial validation domain:** electronic music. This is where we prove the measurement system first, not the only audience we intend to serve. The electronic benchmark should cover house/techno, trance/progressive, bass music, breakbeat/UK garage, ambient/downtempo, and related forms. Do not overfit to four-on-the-floor house.

Genre is an explicit user-selected analysis profile, with an auto/unsure option. It can adjust priors and interpretation, but must not rewrite objective evidence or force results to fit a stereotype. Preserve an inspectable, genre-neutral measurement layer and disclose when genre context changes an inference.

## Product principles

1. Accuracy before breadth.
2. Evidence before assertion: trace inferences to audio evidence and show alternatives where appropriate.
3. Producer control: allow corrections to tempo, meter, downbeat, key, chord events, and section boundaries.
4. Genre-aware, not genre-locked.
5. Workflow acceleration, not teaching: concise breakdowns, editable data, exports, and DAW handoff.
6. Privacy by design: explain upload, retention, deletion, and any training/feedback use.
7. No vanity scores: do not collapse unlike dimensions into an unvalidated accuracy or similarity number.

## Minimum strong core

1. Tempo hypotheses, beat grid, and downbeat/bar alignment, including half/double-time alternatives.
2. Meter/time signature or an explicit uncertain/unsupported state.
3. Key (tonic + mode), handling relative-key ambiguity honestly.
4. Chord events and harmonic timeline, including unknown/ambiguous regions.
5. Kick, snare/clap, and hi-hat event detection with timing and confidence.
6. Bass/808 note onsets and pitch where separable from kick and other low-frequency content.
7. Arrangement boundaries and transition points, treating labels as hypotheses.
8. Runtime, memory, and failure diagnostics across supported devices.

Outputs should be structured and editable, timestamped, aligned to the musical grid, and distinguish direct measurements from musical interpretation. Only export MIDI for tasks that meet the accuracy bar.

Explicitly defer courses, practice journals, gamification, broad sample management, unrelated idea generation, social features, and AI song recreation. Do not build a large subscription system before repeat usage and willingness to pay are demonstrated.

## Technical architecture direction

Separate:
- Audio evidence: waveform, spectral features, onset candidates, energy, pitch/chroma, beat candidates.
- Inference: tempo, meter, key, chords, drums, bass, and structure hypotheses.
- Genre profile: optional priors and context, never a hidden rewrite of evidence.
- Confidence/evaluation: calibrated confidence, alternatives, benchmark scoring, error reporting.
- Product/API: projects, exports, SaaS accounts, permissions, billing, analytics.

This separation supports user-selected genres while keeping measurements independently testable.

## Potential defensibility

The moat is not a generic "AI music analysis" claim. It could be:
- a high-quality, rights-cleared, independently annotated evaluation corpus;
- reliable performance on real, difficult mixes across electronic substyles and eventually other genres;
- a producer correction loop and detailed error taxonomy;
- fast analysis and useful structured outputs;
- integrations into professional production workflows.

The dataset and evaluation system are strategic assets.

## SaaS direction

SaaS is the intended commercial direction, but accounts and billing do not create product-market fit. First prove the analysis is valuable and repeatedly used. When justified, build user identity, secure project ownership, explicit upload consent, retention/deletion controls, background processing, versioned analysis history, quotas, billing, support, monitoring, backups, and a stable API. Preserve local/offline analysis if it remains a meaningful advantage.

## North-star outcome

A professional producer gets a reliable, actionable understanding of a reference track in less time than their current manual workflow and uses that insight to make a better production decision. Measure accuracy, time-to-useful-insight, repeat usage, and willingness to pay—not tutorial completion or feature count.
