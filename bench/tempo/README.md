# bench/tempo: research on piecewise tempo maps and local keys (issue #57)

Offline research tools. Nothing here is imported by `src/engine.js`, `src/timemap.js`, the app or the benchmark gates. The report with the results and the
decision-relevant findings is `docs/TEMPO_SEGMENTATION_RESEARCH.md`.

```
npm run songs:tempo-map        # generate the fixtures (test-songs/tempo-map-fixtures/, git-ignored): needs python3 + numpy
npm run bench:tempo-map        # dev: run the engine (bench/run.js, browser) then the candidates, print the aggregate summary
npm run bench:keys             # dev key fixtures
node bench/tempo/run.js <manifest.json> [--engine predictions.json] [--anchor] [--cands dp,ctf,tempogram,const] [--summary | --json] [--out-file results.json]
node bench/tempo/real.js <audio file>   # a recording with no answer file (local, never committed): prints each candidate's stretches
node tests/tempo-segmentation.test.js   # 18 checks on synthetic evidence (in npm test)
```

* **Dev and holdout.** `manifest.json` is dev: tune on it. `manifest-holdout.json` is the holdout (other tempi, other transition positions, other seed): look at it once per frozen setting and record it
  (`bench/baselines/tempo-map/holdout-first-look.*` is the first look at the current candidates; `holdout-final.*` is after a change made *because of* that look, so it is not blind for that change).
  The repository's own holdout custody (`bench/run.js --holdout`) is for real recordings and is not used here.
* **`--engine`** adds the engine's own tracked beats as the baseline row (`bench/run.js <manifest> --out DIR` writes `DIR/predictions.json`). `--anchor` folds each stretch's octave by continuity,
  starting from the engine's whole-track tempo (needs `--engine`).
* Settings: `--lambda 12` (cost of one more stretch, in comb-score units), `--gamma 0.35` (cost per beat), `--min 8` (shortest stretch, s), `--zmin 5` (below it a stretch is "unknown"), `--hmin 0.5`
  (a ramp needs this share of its beats on onsets), `--no-ramps`, `--no-coalesce`.
* The fixtures' truth is `truth/<id>.beats.txt` (every beat) and `truth/<id>.tempomap.json` (the regions the tempo function was written from). Real-music results have no truth and must not be
  quoted as accuracy; verify by ear or against a DAW project first.
