# Track Teardown — CEO Product & Engineering Audit

**Scope:** Static review of the default branch source, README, package manifest, synthetic audio generator, benchmark script, and listed browser tests. This is a source review, not a completed runtime, security, legal, or customer-validation audit.

**Reviewed baseline:** `main` at the November 16, 2026 repository snapshot.

## Executive decision

**Keep investing, but do not market the current benchmark figures as real-world accuracy claims.** Track Teardown has a differentiated product idea: turn a reference track into a reliable, editable technical breakdown that helps professional producers make faster creative and production decisions. The current implementation is a promising prototype, not yet a commercially hardened product.

The product's strongest potential moat is a rights-cleared, independently annotated evaluation corpus; reliable multi-genre analysis; a producer correction loop; and structured outputs that accelerate professional workflows.

## Findings backed by the current repository

### 1. Benchmark validity is the first priority

- `tests/benchmark.js` evaluates six generated test tracks: pop, trap, house, swing, one melodic lead example, and one fast-808 example.
- `test-songs/make_test_songs.py` creates algorithmic mixtures with known ingredients. This is useful for controlled regression tests, but it is not representative of commercial recordings with vocals, mastering, reverb, layered percussion, live performances, tempo drift, and complex arrangements.
- The generated patterns and four-chord progressions repeat in a highly regular way. The benchmark therefore tests a narrow and predictable distribution.
- The key metric compares pitch-class sets. Relative major/minor keys share the same pitch classes, so this metric does not prove exact tonic/mode identification.
- Hook evaluation is limited to the one lead test case.
- The current benchmark script calculates kick, snare, hats, chords, key pitch-class equivalence, and hook onsets. It does **not** calculate the advertised 808/bass precision and recall. The README's bass figures must be removed, relabeled, or backed by an actual reproducible metric.
- Chord evaluation is limited to triads and a repeating progression. It does not adequately test inversions, sevenths, extensions, slash chords, ambiguous harmony, or no-chord regions.

**Decision:** Preserve synthetic tests as unit/regression tests. Build a separately reported, held-out real-world benchmark with verified annotations and explicit dataset rights.

### 2. Analysis outputs need calibrated uncertainty

- Tempo search is bounded to 70–180 BPM and applies a prior centered around 125 BPM. This can bias results and excludes legitimate tempos outside the search range.
- The analysis assumes a 4/4 bar grid in several downstream calculations and UI descriptions. Non-4/4 music needs detection or an explicit unsupported/uncertain state.
- Key estimation uses chroma profiles, bass evidence, and inferred chords. Relative major/minor ambiguity remains a difficult case and must be evaluated as exact key, not just matching notes.
- Arrangement labels are assigned with heuristic energy/tone thresholds. A loud section is not automatically a drop, and a quiet section is not automatically a breakdown.
- Genre classification uses fixed BPM, rhythm, and spectral thresholds. Treat it as a suggestion, not a definitive classification.
- Frequency-balance coaching compares every genre against one rough modern-electronic reference vector. That should become genre-aware or be presented as descriptive measurements rather than a universal mix target.
- The Compare feature produces a weighted heuristic score. It is not a perceptually validated similarity metric and should not be marketed as an objective percentage of how close two productions sound.

**Decision:** Show the estimate, confidence, alternatives, evidence, and a way to correct it. Never hide uncertainty behind a single confident label.

### 3. Test command can conceal failures

The current `npm test` command pipes each test process through `tail -1`. In common shells, the pipeline exit status is the status of `tail`, not the test process. A failed browser test can therefore appear to pass. It also does not stop the suite on the first failure.

This branch replaces that command with a Node runner that executes every `tests/test*.js` process and propagates failures.

### 4. Product and architecture readiness

- The application is currently a large, single-file browser app (`index.html` is about 3,169 lines / 368 KB in the reviewed snapshot).
- Audio analysis is performed in the browser. That is a meaningful privacy and cost advantage for the current product.
- Saved work uses browser local storage with optional Claude artifact runtime integrations for account/database/coach features. Those integrations are not a substitute for an independent commercial identity, data, billing, and support platform.
- The current repository does not show a conventional backend, subscription system, CI workflow, or production observability layer.
- The single-file architecture is acceptable for a prototype/offline mode, but feature modules, testable DSP modules, and a clear deployment boundary are needed before scaling a team or SaaS offering.

## CEO scorecard (provisional, not a quality certification)

| Area | Assessment | Why |
|---|---|---|
| Product concept | Strong | Potentially valuable professional reference-analysis workflow |
| Current feature breadth | Broad prototype; narrow commercial MVP should focus on accurate core analysis |
| DSP evidence | Not yet proven | Synthetic benchmark is narrow |
| Test reliability | Needs immediate fix | Test pipeline can mask failures |
| Maintainability | Needs investment | Large monolithic HTML/JS file |
| Commercial readiness | Early | Account, billing, operations, privacy, and support gaps |
| Market differentiation | Promising hypothesis | Must validate with experienced producers and willingness-to-pay research |

## Recommended roadmap

### P0 — Trust and reproducibility
1. Fix test exit-code propagation (included in this branch).
2. Reconcile README metrics with metrics actually computed.
3. Add exact-key scoring that distinguishes relative major/minor.
4. Add real-world, held-out evaluation with independently checked labels.
5. Add metric definitions, tolerances, per-track results, and reproducible benchmark commands.
6. Establish upload limits, decode failure behavior, and performance baselines.

### P1 — Analysis quality
1. Tempo: support broader ranges, half/double-time hypotheses, confidence, and manual correction.
2. Meter: detect or explicitly flag non-4/4 tracks.
3. Drums: report event-level precision/recall with timing tolerance and per-genre breakdowns.
4. Harmony: evaluate chord roots/qualities and temporal boundaries; support uncertainty and richer chord types.
5. Bass and melody: score note onset, pitch, duration, and octave separately.
6. Arrangement: evaluate boundary detection and label agreement separately; allow user correction.
7. Genre-aware mix feedback; distinguish measured facts from stylistic suggestions.

### P2 — Commercial product
1. Preserve a local/offline mode.
2. Build a separately deployable web application with user identity, projects, and secure data boundaries.
3. Add explicit consent and retention controls before any audio leaves a user's device.
4. Add subscription/billing, quotas, abuse controls, and support workflows only after product value is validated.
5. Add CI, release automation, error monitoring, and rollback procedures.
6. Review copyright, licensing, terms, and privacy obligations for user-uploaded recordings and benchmark datasets.

## Release gates

Do not claim "industry-leading accuracy" or publish a single overall accuracy percentage until:
- The benchmark is reproducible from a clean checkout.
- Every published metric is computed by the checked-in benchmark code.
- Train/tuning and held-out evaluation sets are separated by recording/song.
- Dataset provenance and commercial-use permissions are documented.
- Performance is reported by genre, task, and confidence band.
- Material regressions are blocked in CI.

**Bottom line:** Build trust first. A smaller set of honest, verifiably strong features will sell better and retain customers longer than a large list of impressive but unproven detections.


## Updated strategic direction

The long-term product is multi-genre with user-selected genre context. Electronic music is the first validation domain, not the permanent target-market boundary. The customer is an experienced producer who wants faster, more reliable reference-track analysis and production decisions—not a beginner seeking lessons. See docs/PRODUCT_STRATEGY.md and docs/ELECTRONIC_BENCHMARK_PROTOCOL.md.
