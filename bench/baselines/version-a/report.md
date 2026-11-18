# Benchmark report: synthetic (dev)

Head `5194f4818ddd12f3a8aaedb2b3c70551510f108c` · page `index.html` sha256 `a14fea961917` · 159.0.8154.6 · darwin 27.2.0 · manifest v3 sha256 `dafab72457e6` · classifier v2



> Generated answers, exact by construction. Regression checks only, not real-world accuracy.

8 of 8 tracks scored. Mean over tracks, [bootstrap 95 % CI], n.

| Metric | Mean [95 % CI] | n |
|---|---|---|
| Tempo within ±4 % (Acc1) | 1 [1, 1] | 8 |
| Tempo allowing ×2/×½/×3/×⅓ (Acc2) | 1 [1, 1] | 8 |
| Tempo |error| (BPM) | 0 [0, 0] | 8 |
| Tracked beats F (±70 ms) | 0.9936 [0.9921, 0.9953] | 8 |
| Tracked downbeats F | 0.9776 [0.9725, 0.9824] | 8 |
| Exported grid beats F | 0.995 [0.9933, 0.9962] | 8 |
| Exported grid downbeats F | 0.9864 [0.9854, 0.9873] | 8 |
| Exported grid max drift, phase-locked (ms) | 6.6442 [3.8635, 10.0354] | 8 |
| Exported grid max drift, phase-locked (beats) | 0.0141 [0.0083, 0.0209] | 8 |
| Share of true beats with export within ±70 ms | 1 [1, 1] | 8 |
| Exported grid max drift, nearest beat (ms; capped at ½ beat) | 6.6442 [3.8635, 10.0354] | 8 |
| Key exact | 0.75 [0.5, 1] | 8 |
| Key MIREX weighted | 0.825 [0.65, 1] | 8 |
| Chords root (time-weighted) | 0.9948 [0.9878, 0.9987] | 8 |
| Chords maj/min (time-weighted) | 0.9948 [0.9878, 0.9987] | 8 |
| Kick F (±50 ms, exported MIDI) | 0.9453 [0.8856, 0.9927] | 8 |
| Snare/clap F (±50 ms) | 0.9875 [0.9756, 0.9966] | 8 |
| Hi-hat F (±50 ms) | 0.9463 [0.926, 0.9672] | 8 |
| Kick F (±30 ms) | 0.9453 [0.8856, 0.9927] | 8 |
| Snare/clap F (±30 ms) | 0.9875 [0.9756, 0.9966] | 8 |
| Hi-hat F (±30 ms) | 0.8838 [0.7707, 0.9502] | 8 |
| Bass onset F (±50 ms) | 0.8575 [0.8082, 0.9136] | 8 |
| Bass note F (onset + pitch) | 0.8293 [0.76, 0.9017] | 8 |
| Bass octave errors (of matched) | 0 [0, 0] | 8 |

## Run completeness

Complete: all 8 required tracks were analyzed and scored.


### Browser console (diagnostic only; does not fail the run)

No console warnings or errors.

## Ground truth

Annotation protocol: synthetic-exact · truth fingerprint `d7c1db183cd060f1` (sha256 over every track's annotation-file hashes; any changed answer file changes it)

| Annotation | Tracks | Required |
|---|---|---|
| beats | 8/8 | every track |
| downbeats | 8/8 | every track |
| key | 8/8 | every track |
| chords | 8/8 | every track |
| drums | 8/8 | every track |
| bass | 8/8 | every track |

All annotation requirements met; every annotation file matches its pinned sha256.

## Failure classes

| Capability | Classes (count) |
|---|---|
| tempo | ok 8 |
| beats | ok 8 |
| downbeats | ok 8 |
| exportGrid | ok 8 |
| key | ok 6, relative 2 |
| chords | ok 8 |
| drums.kick | ok 6, extra 2 |
| drums.snare | ok 8 |
| drums.hihat | ok 8 |
| bass | ok 6, wrong-notes 2 |

## Failure atlas

Failed / scored tracks per condition. Read with the n: small groups prove nothing.

| Condition | tempo | beats | downbeats | exportGrid | key | chords | drums.kick | drums.snare | drums.hihat | bass |
|---|---|---|---|---|---|---|---|---|---|---|
| bass=808 on kick | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 2/6 | 0/6 | 0/6 | 0/6 |
| bass=bassline | 0/2 | 0/2 | 0/2 | 0/2 | 2/2 | 0/2 | 0/2 | 0/2 | 0/2 | 2/2 |
| four_on_floor=false | 0/7 | 0/7 | 0/7 | 0/7 | 2/7 | 0/7 | 2/7 | 0/7 | 0/7 | 2/7 |
| four_on_floor=true | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| intro_silence=1200 ms | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 |
| intro_silence=300 ms | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| intro_silence=none | 0/6 | 0/6 | 0/6 | 0/6 | 2/6 | 0/6 | 1/6 | 0/6 | 0/6 | 2/6 |
| style=house | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| style=melodic | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 |
| style=pop | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0/3 | 0/3 |
| style=swing | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| style=trap | 0/2 | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 1/2 | 0/2 | 0/2 | 1/2 |
| swing=heavy | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| swing=light | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| swing=none | 0/6 | 0/6 | 0/6 | 0/6 | 2/6 | 0/6 | 2/6 | 0/6 | 0/6 | 2/6 |
| tempo_band=115-135 | 0/5 | 0/5 | 0/5 | 0/5 | 1/5 | 0/5 | 1/5 | 0/5 | 0/5 | 1/5 |
| tempo_band=135-160 | 0/2 | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 1/2 | 0/2 | 0/2 | 1/2 |
| tempo_band=90-115 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |

## Confidence reliability

Accuracy within each third of the app's own confidence value. Confidence is useful only if accuracy rises with it.

- key: conf 0.06–0.134: 0 (n 2) · conf 0.287–0.642: 1 (n 3) · conf 0.785–1.016: 1 (n 3)
- tempo: conf 4.85–4.89: 1 (n 2) · conf 6.43–7.26: 1 (n 3) · conf 7.27–11.39: 1 (n 3)

## G0 continuity (16-step drum pattern score)

- kick: P 0.9114 R 0.9858 (tp 761, fp 74, fn 11)
- snare: P 1 R 0.9897 (tp 575, fp 0, fn 6)
- hats: P 1 R 0.9209 (tp 2689, fp 0, fn 231)
