# Track Teardown

**Reference-track analysis for professional music producers.**

Track Teardown is being developed to help producers understand the musical and production characteristics of a reference track faster: tempo and groove, beat grid, key and harmony, drums, bass, arrangement, and measurable mix characteristics. The goal is a reliable, editable technical breakdown that supports faster creative and production decisions.

The long-term product is multi-genre. Users will select the genre or style they want to analyze; genre profiles provide context without forcing objective measurements to fit a stereotype. **Electronic music is the first validation domain**, not the product's permanent limit.

The current prototype analyzes audio locally in the browser. The commercial direction is SaaS, with privacy, consent, retention, and account controls designed before cloud audio processing is introduced.

## Product principles

- Accuracy before feature breadth.
- Evidence and calibrated uncertainty before confident-sounding guesses.
- Experienced-producer workflow acceleration, not beginner tutorials.
- User-selected genre context with an inspectable underlying measurement layer.
- No vanity accuracy or similarity scores.

## Current prototype

The current application is a single HTML file and includes a broad set of prototype workflows. These are not all part of the intended first commercial release. The next engineering phase is to establish reproducible accuracy baselines and narrow the core product around analysis tasks that meet a defensible quality bar.

## Accuracy status

The checked-in benchmark evaluates six highly controlled synthetic tracks (pop, trap, house, swing, one melodic lead example, and one fast-808 example). These fixtures are useful for regression testing, but are not representative of real commercial mixes and must not be described as real-world accuracy.

The current benchmark scores kick, snare/clap, hi-hat events, triad chords, hook onsets, and key pitch-class sets. Pitch-class scoring cannot distinguish relative major/minor. The benchmark does not calculate 808/bass precision and recall, despite older benchmark claims.

No real-world accuracy claim should be made until a rights-cleared, expert-annotated, held-out dataset and task-specific evaluation protocol exist.

## Validation documents

- [Product strategy](docs/PRODUCT_STRATEGY.md)
- [Electronic music benchmark protocol](docs/ELECTRONIC_BENCHMARK_PROTOCOL.md)
- [CEO product and engineering audit](docs/CEO_PRODUCT_AUDIT.md)
- [Evaluation and experiment plan](docs/AB_TESTING_PLAN.md)

## Development commands

```bash
npm install
npx playwright install chromium
npm run songs
npm run benchmark
npm test
```

## Current engineering status

This is a prototype under active validation. The existing single-file architecture and browser-local analysis are useful for experimentation, but production SaaS accounts, billing, observability, and customer support systems have not yet been built.

## Commercial positioning

Track Teardown is not intended to teach experienced producers basic music production. It is intended to reduce the time and uncertainty involved in analyzing references and making production decisions. Electronic music is the first accuracy-validation domain; the product architecture and roadmap remain multi-genre.
