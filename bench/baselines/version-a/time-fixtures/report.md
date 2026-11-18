# Benchmark report: time-fixtures (dev)

Head `3272ad33397db4630494163d223e76966b6827e8` **(uncommitted changes)** · page `versionA.bak.html` sha256 `a14fea961917` · 159.0.8154.6 · darwin 27.2.0 · manifest v2 sha256 `541921ee39d7` · classifier v2



> Generated answers, exact by construction. Time-model stress fixtures: reported, not gated. Not real-world accuracy.

12 of 12 tracks scored. Mean over tracks, [bootstrap 95 % CI], n.

| Metric | Mean [95 % CI] | n |
|---|---|---|
| Tempo within ±4 % (Acc1) | 0.9167 [0.75, 1] | 12 |
| Tempo allowing ×2/×½/×3/×⅓ (Acc2) | 1 [1, 1] | 12 |
| Tempo |error| (BPM) | 7.2596 [0.0002, 21.7677] | 12 |
| Tracked beats F (±70 ms) | 0.9313 [0.86, 0.9867] | 12 |
| Tracked downbeats F | 0.7372 [0.5405, 0.9145] | 12 |
| Exported grid beats F | 0.8718 [0.752, 0.9751] | 12 |
| Exported grid downbeats F | 0.671 [0.4421, 0.8841] | 12 |
| Exported grid max drift, phase-locked (ms) | 5677.0173 [113.907, 15106.9138] | 12 |
| Exported grid max drift, phase-locked (beats) | 8.9022 [0.2175, 22.7852] | 12 |
| Share of true beats with export within ±70 ms | 0.7648 [0.5436, 0.959] | 12 |
| Exported grid max drift, nearest beat (ms; capped at ½ beat) | 89.2857 [12.8512, 175.2678] | 12 |
| Key exact | 1 [1, 1] | 12 |
| Key MIREX weighted | 1 [1, 1] | 12 |
| Chords root (time-weighted) | 0.9218 [0.859, 0.9753] | 12 |
| Chords maj/min (time-weighted) | 0.9218 [0.859, 0.9753] | 12 |
| Kick F (±50 ms, exported MIDI) | 0.7302 [0.5621, 0.8848] | 12 |
| Snare/clap F (±50 ms) | 0.7409 [0.5223, 0.9122] | 12 |
| Hi-hat F (±50 ms) | 0.5725 [0.4557, 0.6865] | 12 |
| Kick F (±30 ms) | 0.6935 [0.5142, 0.8604] | 12 |
| Snare/clap F (±30 ms) | 0.7063 [0.4845, 0.8915] | 12 |
| Hi-hat F (±30 ms) | 0.5421 [0.404, 0.6792] | 12 |
| Bass onset F (±50 ms) | – | 0 |
| Bass note F (onset + pitch) | – | 0 |
| Bass octave errors (of matched) | – | 0 |

## Run completeness

Complete: all 12 required tracks were analyzed and scored.


### Browser console (diagnostic only; does not fail the run)

No console warnings or errors.

## Ground truth

Annotation protocol: synthetic-exact · truth fingerprint `023d33a024f874df` (sha256 over every track's annotation-file hashes; any changed answer file changes it)

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
| beats | ok 10, metrical-level 1, other 1 |
| downbeats | ok 8, other 4 |
| exportGrid | ok 8, slipped-beats 4 |
| key | ok 12 |
| chords | ok 8, root 4 |
| drums.kick | ok 5, missed 2, timing 1, mixed 3, extra 1 |
| drums.snare | ok 5, mixed 4, timing 1, missed 1, extra 1 |
| drums.hihat | missed 10, mixed 1, ok 1 |
| bass | – |

## Failure atlas

Failed / scored tracks per condition. Read with the n: small groups prove nothing.

| Condition | tempo | beats | downbeats | exportGrid | key | chords | drums.kick | drums.snare | drums.hihat | bass |
|---|---|---|---|---|---|---|---|---|---|---|
| bass=root on bar start | 1/12 | 2/12 | 4/12 | 4/12 | 0/12 | 4/12 | 7/12 | 7/12 | 11/12 | – |
| duration=7:00 (896 beats), the longest the page accepts (8:00) | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| four_on_floor=false | 1/12 | 2/12 | 4/12 | 4/12 | 0/12 | 4/12 | 7/12 | 7/12 | 11/12 | – |
| intro_silence=1200 ms | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| intro_silence=2000 ms | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| intro_silence=none | 1/10 | 2/10 | 4/10 | 4/10 | 0/10 | 4/10 | 7/10 | 7/10 | 9/10 | – |
| meter=3/4 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | – |
| meter=4/4 | 1/10 | 2/10 | 2/10 | 4/10 | 0/10 | 2/10 | 5/10 | 5/10 | 10/10 | – |
| meter=5/4 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| pickup=1 beat (beat 4 of bar 0) | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| pickup=2 beats (beats 3 and 4 of bar 0) | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| pickup=none | 1/10 | 2/10 | 4/10 | 4/10 | 0/10 | 4/10 | 7/10 | 7/10 | 9/10 | – |
| style=breakbeat | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| style=synthetic time-model fixture | 0/11 | 1/11 | 3/11 | 3/11 | 0/11 | 3/11 | 6/11 | 6/11 | 10/11 | – |
| swing=none | 1/12 | 2/12 | 4/12 | 4/12 | 0/12 | 4/12 | 7/12 | 7/12 | 11/12 | – |
| tempo_band=115-135 | 0/8 | 1/8 | 2/8 | 2/8 | 0/8 | 1/8 | 4/8 | 4/8 | 7/8 | – |
| tempo_band=135-160 | 0/2 | 0/2 | 1/2 | 0/2 | 0/2 | 1/2 | 1/2 | 1/2 | 2/2 | – |
| tempo_band=90-115 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_band=>160 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_behaviour=constant | 1/8 | 1/8 | 3/8 | 1/8 | 0/8 | 3/8 | 3/8 | 3/8 | 7/8 | – |
| tempo_behaviour=drift: 120 to 108 BPM (10 %) | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_behaviour=drift: 120 to 121 BPM (0.8 %) | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_behaviour=half-time breakdown (128 -> 64 -> 128 BPM), bars 17 to 20 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_behaviour=step change 120 to 150 BPM at bar 17 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_octave=ambiguous: 2-step at 174 (reads as 87) | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_octave=ambiguous: half-time feel at 140 (reads as 70) | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | – |
| tempo_octave=clear | 0/10 | 1/10 | 3/10 | 3/10 | 0/10 | 3/10 | 6/10 | 6/10 | 9/10 | – |

## Confidence reliability

Accuracy within each third of the app's own confidence value. Confidence is useful only if accuracy rises with it.

- key: conf 0.667–0.97: 1 (n 4) · conf 0.971–0.991: 1 (n 4) · conf 1.001–1.089: 1 (n 4)
- tempo: conf 4.78–8.53: 0.75 (n 4) · conf 8.8–10.99: 1 (n 4) · conf 11.06–11.57: 1 (n 4)

## G0 continuity (16-step drum pattern score)

- kick: P 0.9183 R 0.9285 (tp 1247, fp 111, fn 96)
- snare: P 0.8632 R 0.8541 (tp 808, fp 128, fn 138)
- hats: P 0.8541 R 0.3964 (tp 1546, fp 264, fn 2354)
