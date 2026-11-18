# Benchmark report: arrangement-fixtures (dev)

Head `b2f05513b81787cfbc93632db98d1014fd2224ba` **(uncommitted changes)** · page `versionA.bak.html` sha256 `a14fea961917` · 159.0.8154.6 · darwin 27.2.0 · manifest v1 sha256 `a87e71306690` · classifier v2



> Generated answers, exact by construction. Section boundaries at known bar lines, constant and drifting tempo. Reported, not gated.

2 of 2 tracks scored. Mean over tracks, [bootstrap 95 % CI], n.

| Metric | Mean [95 % CI] | n |
|---|---|---|
| Tempo within ±4 % (Acc1) | 1 [1, 1] | 2 |
| Tempo allowing ×2/×½/×3/×⅓ (Acc2) | 1 [1, 1] | 2 |
| Tempo |error| (BPM) | 0.028 [0, 0.056] | 2 |
| Tracked beats F (±70 ms) | 0.9922 [0.9911, 0.9933] | 2 |
| Tracked downbeats F | 0.9821 [0.9821, 0.9821] | 2 |
| Exported grid beats F | 0.6033 [0.2133, 0.9933] | 2 |
| Exported grid downbeats F | 0.5224 [0.0536, 0.9912] | 2 |
| Exported grid max drift, phase-locked (ms) | 671.8655 [25.97, 1317.761] | 2 |
| Exported grid max drift, phase-locked (beats) | 1.3226 [0.0537, 2.5915] | 2 |
| Share of true beats with export within ±70 ms | 0.5245 [0.0491, 1] | 2 |
| Exported grid max drift, nearest beat (ms; capped at ½ beat) | 218.235 [25.97, 410.5] | 2 |
| Key exact | 1 [1, 1] | 2 |
| Key MIREX weighted | 1 [1, 1] | 2 |
| Chords root (time-weighted) | 0.7317 [0.6099, 0.8534] | 2 |
| Chords maj/min (time-weighted) | 0.7317 [0.6099, 0.8534] | 2 |
| Kick F (±50 ms, exported MIDI) | 0.5592 [0.1796, 0.9388] | 2 |
| Snare/clap F (±50 ms) | 0.4859 [0.1268, 0.8451] | 2 |
| Hi-hat F (±50 ms) | 0.4625 [0.2757, 0.6492] | 2 |
| Kick F (±30 ms) | 0.5224 [0.1061, 0.9388] | 2 |
| Snare/clap F (±30 ms) | 0.4648 [0.0845, 0.8451] | 2 |
| Hi-hat F (±30 ms) | 0.4101 [0.171, 0.6492] | 2 |
| Section boundaries F (±0.5 s) | 0.5 [0, 1] | 2 |
| Section boundaries F (±3 s) | 1 [1, 1] | 2 |
| Bass onset F (±50 ms) | – | 0 |
| Bass note F (onset + pitch) | – | 0 |
| Bass octave errors (of matched) | – | 0 |

## Run completeness

Complete: all 2 required tracks were analyzed and scored.


### Browser console (diagnostic only; does not fail the run)

No console warnings or errors.

## Ground truth

Annotation protocol: synthetic-exact · truth fingerprint `5a19c49b196a4d9b` (sha256 over every track's annotation-file hashes; any changed answer file changes it)

| Annotation | Tracks | Required |
|---|---|---|
| beats | 2/2 | every track |
| downbeats | 2/2 | every track |
| key | 2/2 | every track |
| chords | 2/2 | every track |
| drums | 2/2 | every track |
| bass | 0/2 | – |
| sections | 2/2 | every track |

All annotation requirements met; every annotation file matches its pinned sha256.

## Failure classes

| Capability | Classes (count) |
|---|---|
| tempo | ok 2 |
| beats | ok 2 |
| downbeats | ok 2 |
| exportGrid | ok 1, slipped-beats 1 |
| key | ok 2 |
| chords | root 2 |
| drums.kick | ok 1, mixed 1 |
| drums.snare | mixed 2 |
| drums.hihat | missed 2 |
| bass | – |

## Failure atlas

Failed / scored tracks per condition. Read with the n: small groups prove nothing.

| Condition | tempo | beats | downbeats | exportGrid | key | chords | drums.kick | drums.snare | drums.hihat | bass |
|---|---|---|---|---|---|---|---|---|---|---|
| arrangement=intro 8, groove 16, breakdown 8, drop 16, outro 8 bars | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | – |
| bass=root on bar start | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | – |
| four_on_floor=false | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | – |
| intro_silence=none | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | – |
| meter=4/4 | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | – |
| pickup=none | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | – |
| style=synthetic time-model fixture | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | – |
| swing=none | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | – |
| tempo_band=115-135 | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | – |
| tempo_behaviour=constant | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | – |
| tempo_behaviour=drift: 124 to 112 BPM (10 %) | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | – |
| tempo_octave=clear | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | – |

## Confidence reliability

Accuracy within each third of the app's own confidence value. Confidence is useful only if accuracy rises with it.

- key: too few tracks
- tempo: too few tracks

## G0 continuity (16-step drum pattern score)

- kick: P 0.9095 R 0.9567 (tp 221, fp 22, fn 10)
- snare: P 0.7763 R 0.9365 (tp 118, fp 34, fn 8)
- hats: P 0.9747 R 0.4766 (tp 347, fp 9, fn 381)
