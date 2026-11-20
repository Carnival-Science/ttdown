# Is there percussion in the track? (drum evidence)

**Problem.** The drum pattern is normalised to the loudest step, so Teardown found a "kick" and a "snare" in a piano piece and showed a made-up Rhythm tab (*more please*: a piano-only render). The old "no kick or snare found" notice almost never fired.

**What is measured now.** `engine.drumEvidence(x, SR)` (`src/engine.js`, saved as `a.drumEvidence = { method: "percussive-share-v1", windows, pAll, pLo, found }`, added after every Version A field):
- harmonic/percussive separation, light version, on a 2048-point spectrogram (hop 512): per bin, the median across 17 neighbouring frequencies (a hit is steady across frequency; neighbours are clamped at both ends of the spectrum so the lowest bins, where kicks and sub bass live, count) against the median across 17 neighbouring frames (a sustained note is steady in time); the percussive share of the energy is `pAll` over the whole spectrum and `pLo` below 200 Hz;
- up to 8 windows of 8 s (shorter tracks: one window, at least 5 s): 4 evenly spaced, plus the 4 most transient-heavy ones from a cheap scan of the **whole** track (normalised spectral flux), so drums that play in only one part of a long track are not skipped. The highest window of each measure decides;
- `found: false` when `pAll < 0.20` and `pLo < 0.30`; `true` when `pAll >= 0.30`; otherwise `null` (unclear, nothing is claimed).
- Cost: about 1.4 s per track on this machine, plus about 0.3 s for the scan of a long track.

**What the app does.** `domain.noDrumsFound(a)` is true when the evidence says `false` (even if the pattern has a kick), or, as before, when no pattern has a kick or snare step. The Rhythm tab and Drums button are hidden and the notice says "No drums found in this track, so there is no drum analysis…"; "Show the drum tools anyway" brings them back. Teardowns saved before this have no `drumEvidence` and keep the old behaviour until they are analysed again.

## Measured (thresholds set on these files: a regression set, not an accuracy figure)

| Set | Files | Result |
|---|---|---|
| Generated songs with drums (8), time fixtures (dnb, halftime, 3/4, halftime breakdown), arrangement fixture, sections song | 13 | all `true` (pAll 0.32 to 0.67) |
| Drums only in the first 5 s of a 2-minute synthetic track | 1 | not missed: pAll of the whole track equals that of its first 8 s (unit test); the evenly spaced windows alone gave 0.05 against 0.22 (a reviewer found this on PR 61) |
| Bass stem (no drums) | 1 | `false` (0.046) |
| Chiptune melody fixtures (no drums by construction) | 2 | `false` (0.15, 0.16): read as drums before the lowest bins were counted |
| Piano renders of the owner's MIDI: *more please*, *big mac*, *an angel orchestrated*, *be all* (7 s) | 4 | all `false` (pAll 0.10 to 0.14, pLo 0.05 to 0.20). *bliss* was not measured (its file could not be found) |
| 36 real songs from a private library (outside the repo, not labelled) | 36 | 32 `true`, 2 `null` (La clé des champs 0.13 / 0.73, HelloWorld 0.29), **2 `false`**: Oklou "obvious" (0.157 / 0.134) and Porter Robinson "Blossom" (0.155 / 0.143). I do not know whether those two have drums |

Between the highest drumless file (0.16) and the quietest labelled drum file (0.32) there is now a gap, but the real songs are not labelled, so it is only known to hold for these files.

**Limits, plainly.**
- Percussive energy is evidence of percussion, not necessarily of drums. A soft, washed-out drum part can read as "none" (two real songs do, and they may well have soft drums), and a sound with sharp, noisy attacks other than drums could read as drums.
- This tells percussion from sustained tones. It says **nothing about vocals**: Teardown does not detect them, and the notice says so. Telling an instrumental from a song with vocals needs a model for it; a spectral rule could not be checked here without labelled recordings.
- The 36 real songs are not labelled. Only the three piano renders (written and rendered by the owner) are known drumless.

## Not done
Vocal detection; a labelled set of real drumless and drum-light tracks to set the thresholds on (needed before trusting the middle of the range); a 'few drums' state.

`domain.songMidiFiles` (the full-song package, used by the legacy page and the tests; the Svelte app no longer has that package) writes no kick, snare or hi-hat file for a track with measured no drums unless `opts.includeDrums` is set.

Tests: `tests/drum-evidence.test.js` (in `npm test`: synthetic signals incl. a short drum section in a long track, the generated songs, drumless renders only when `TT_PAIRED_DIR` points at them, the domain rule), `tests/midi-export.test.js` (the package) and `tests/app-part-midi.test.js` (the page).
