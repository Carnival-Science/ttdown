# Benchmark report: time-fixtures (dev)

Head `07b9012e5e1236137cb49d3d7bbc18554c06be6e` **(uncommitted changes)** · page `versionA.bak.html` sha256 `a14fea961917` · 159.0.8154.6 · darwin 27.2.0 · manifest v1 sha256 `47120fc2ba16` · classifier v2



> Generated answers, exact by construction. Time-model stress fixtures: reported, not gated. Not real-world accuracy.

12 of 12 tracks scored. Mean over tracks, [bootstrap 95 % CI], n.

| Metric | Mean [95 % CI] | n |
|---|---|---|
| Tempo within ±4 % (Acc1) | 0.9167 [0.75, 1] | 12 |
| Tempo allowing ×2/×½/×3/×⅓ (Acc2) | 1 [1, 1] | 12 |
| Tempo |error| (BPM) | 7.2596 [0.0002, 21.7677] | 12 |
| Tracked beats F (±70 ms) | 0.9222 [0.8549, 0.9778] | 12 |
| Tracked downbeats F | 0.7282 [0.5342, 0.9054] | 12 |
| Exported grid beats F | 0.8719 [0.7521, 0.9752] | 12 |
| Exported grid downbeats F | 0.671 [0.4421, 0.8842] | 12 |
| Exported grid max drift, phase-locked (ms) | 5677.0173 [113.907, 15106.9138] | 12 |
| Exported grid max drift, phase-locked (beats) | 8.9022 [0.2175, 22.7852] | 12 |
| Share of true beats with export within ±70 ms | 0.7648 [0.5436, 0.959] | 12 |
| Exported grid max drift, nearest beat (ms; capped at ½ beat) | 89.2857 [12.8512, 175.2678] | 12 |
| Key exact | 1 [1, 1] | 12 |
| Key MIREX weighted | 1 [1, 1] | 12 |
| Chords root (time-weighted) | 0.9218 [0.859, 0.9753] | 12 |
| Chords maj/min (time-weighted) | 0.9218 [0.859, 0.9753] | 12 |
| Kick F (±50 ms, exported MIDI) | 0.7208 [0.5607, 0.8689] | 12 |
| Snare/clap F (±50 ms) | 0.7314 [0.5152, 0.8991] | 12 |
| Hi-hat F (±50 ms) | 0.5654 [0.4491, 0.6834] | 12 |
| Kick F (±30 ms) | 0.6841 [0.5106, 0.8483] | 12 |
| Snare/clap F (±30 ms) | 0.6968 [0.4793, 0.8784] | 12 |
| Hi-hat F (±30 ms) | 0.535 [0.3977, 0.6764] | 12 |
| Bass onset F (±50 ms) | – | 0 |
| Bass note F (onset + pitch) | – | 0 |
| Bass octave errors (of matched) | – | 0 |

## Run completeness

Complete: all 12 required tracks were analyzed and scored.


### Browser console (diagnostic only; does not fail the run)

No console warnings or errors.

## Ground truth

Annotation protocol: synthetic-exact · truth fingerprint `4e0d4688add76029` (sha256 over every track's annotation-file hashes; any changed answer file changes it)

| Annotation | Tracks | Required |
|---|---|---|
| beats | 12/12 | every track |
| downbeats | 12/12 | every track |
| key | 12/12 | every track |
| chords | 12/12 | every track |
| drums | 12/12 | every track |
| bass | 0/12 | – |

All annotation requirements met; every annotation file matches its pinned sha256.

## Failure classes

| Capability | Classes (count) |
|---|---|
| tempo | ok 11, half 1 |
| beats | ok 9, metrical-level 1, other 2 |
| downbeats | ok 7, other 5 |
| exportGrid | ok 8, slipped-beats 4 |
| key | ok 12 |
| chords | ok 8, root 4 |
| drums.kick | ok 4, missed 3, timing 1, mixed 3, extra 1 |
| drums.snare | ok 4, mixed 4, timing 1, missed 2, extra 1 |
| drums.hihat | missed 10, mixed 1, ok 1 |
| bass | – |

## Failure atlas

Failed / scored tracks per condition. Read with the n: small groups prove nothing.

| Condition | tempo | beats | downbeats | exportGrid | key | chords | drums.kick | drums.snare | drums.hihat | bass |
|---|---|---|---|---|---|---|---|---|---|---|
| bass=root on bar start | 1/12 | 3/12 | 5/12 | 4/12 | 0/12 | 4/12 | 8/12 | 8/12 | 11/12 | – |
| duration=10:00 (1280 beats) | 0/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | – |
| four_on_floor=false | 1/12 | 3/12 | 5/12 | 4/12 | 0/12 | 4/12 | 8/12 | 8/12 | 11/12 | – |
| intro_silence=1200 ms | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| intro_silence=2000 ms | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| intro_silence=none | 1/10 | 3/10 | 5/10 | 4/10 | 0/10 | 4/10 | 8/10 | 8/10 | 9/10 | – |
| meter=3/4 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | – |
| meter=4/4 | 1/10 | 3/10 | 3/10 | 4/10 | 0/10 | 2/10 | 6/10 | 6/10 | 10/10 | – |
| meter=5/4 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| pickup=1 beat (beat 4 of bar 0) | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| pickup=2 beats (beats 3 and 4 of bar 0) | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| pickup=none | 1/10 | 3/10 | 5/10 | 4/10 | 0/10 | 4/10 | 8/10 | 8/10 | 9/10 | – |
| style=breakbeat | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| style=synthetic time-model fixture | 0/11 | 2/11 | 4/11 | 3/11 | 0/11 | 3/11 | 7/11 | 7/11 | 10/11 | – |
| swing=none | 1/12 | 3/12 | 5/12 | 4/12 | 0/12 | 4/12 | 8/12 | 8/12 | 11/12 | – |
| tempo_band=115-135 | 0/8 | 2/8 | 3/8 | 2/8 | 0/8 | 1/8 | 5/8 | 5/8 | 7/8 | – |
| tempo_band=135-160 | 0/2 | 0/2 | 1/2 | 0/2 | 0/2 | 1/2 | 1/2 | 1/2 | 2/2 | – |
| tempo_band=90-115 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_band=>160 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_behaviour=constant | 1/8 | 2/8 | 4/8 | 1/8 | 0/8 | 3/8 | 4/8 | 4/8 | 7/8 | – |
| tempo_behaviour=drift: 120 to 108 BPM (10 %) | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_behaviour=drift: 120 to 121 BPM (0.8 %) | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_behaviour=half-time breakdown (128 -> 64 -> 128 BPM), bars 17 to 20 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_behaviour=step change 120 to 150 BPM at bar 17 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_octave=ambiguous: 2-step at 174 (reads as 87) | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_octave=ambiguous: half-time feel at 140 (reads as 70) | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| tempo_octave=clear | 0/10 | 2/10 | 4/10 | 3/10 | 0/10 | 3/10 | 7/10 | 7/10 | 9/10 | – |

## Confidence reliability

Accuracy within each third of the app's own confidence value. Confidence is useful only if accuracy rises with it.

- key: conf 0.667–0.97: 1 (n 4) · conf 0.971–0.991: 1 (n 4) · conf 1.001–1.089: 1 (n 4)
- tempo: conf 4.78–8.53: 0.75 (n 4) · conf 8.8–10.99: 1 (n 4) · conf 11.06–11.57: 1 (n 4)

## G0 continuity (16-step drum pattern score)

- kick: P 0.9237 R 0.8234 (tp 1343, fp 111, fn 288)
- snare: P 0.872 R 0.7663 (tp 872, fp 128, fn 266)
- hats: P 0.8615 R 0.3518 (tp 1642, fp 264, fn 3026)
