# Is there percussion in the track? (drum evidence)

**Problem.** The drum pattern is normalised to the loudest step, so Teardown found a "kick" and a "snare" in a piano piece and showed a made-up Rhythm tab (*more please*: a piano-only render). The old "no kick or snare found" notice almost never fired.

**What is measured now.** `engine.drumEvidence(x, SR)` (`src/engine.js`, saved as `a.drumEvidence = { method: "percussive-share-v1", windows, pAll, pLo, found }`, added after every Version A field):
- harmonic/percussive separation, light version, on a 2048-point spectrogram (hop 512): per bin, the median across 17 neighbouring frequencies (a hit is steady across frequency) against the median across 17 neighbouring frames (a sustained note is steady in time); the percussive share of the energy is `pAll` over the whole spectrum and `pLo` below 200 Hz;
- up to 8 windows of 8 s (shorter tracks: one window, at least 5 s) spread over the track; the **highest** window of each decides, so an intro does not hide the drums;
- `found: false` when `pAll < 0.16` and `pLo < 0.30`; `true` when `pAll >= 0.35`; otherwise `null` (unclear, nothing is claimed).
- Cost: about 1.2 s per track on this machine, whatever its length (the windows are fixed).

**What the app does.** `domain.noDrumsFound(a)` is true when the evidence says `false` (even if the pattern has a kick), or, as before, when no pattern has a kick or snare step. The Rhythm tab and Drums button are hidden and the notice says "No drums found in this track, so there is no drum analysis…"; "Show the drum tools anyway" brings them back. Teardowns saved before this have no `drumEvidence` and keep the old behaviour until they are analysed again.

## Measured (thresholds set on these files: a regression set, not an accuracy figure)

| Set | Files | Result |
|---|---|---|
| Generated songs with drums (8) and time fixtures (dnb, halftime, 3/4, halftime breakdown), arrangement fixture, sections song | 13 | all `found: true` (pAll 0.58 to 1.0) |
| Bass stem (no drums) | 1 | `false` (0.099 / 0.098) |
| Piano renders of the owner's MIDI: *more please*, *big mac*, *an angel orchestrated*, *be all* (7 s, one window) | 4 | all `false` (pAll 0.11 to 0.13, pLo 0.03 to 0.22). *bliss* was not measured (its file could not be found when this was written) |
| 36 real songs from a private library (kept outside the repo, not labelled) | 36 | 32 `true`, 3 `null` (Oklou "obvious" 0.195, "pretender" 0.338, "I Give Up" 0.337), **1 `false`** (Porter Robinson "Blossom", 0.146 / 0.132): a sparse real track can be called drumless, and I do not know whether it has drums |
| Chiptune melody fixtures (no drums by construction) | 2 | **`true`** (0.58, 0.55): sharp synthetic attacks read as percussive. A miss. |

**Limits, plainly.**
- The gap between the highest drumless piano window (0.13) and the quietest real drum song (0.195) is small. A soft, washed-out drum part can read as "none", and a synth lead with hard attacks can read as drums.
- This tells percussion from sustained tones. It says **nothing about vocals**: Teardown does not detect them, and the notice says so. Telling an instrumental from a song with vocals needs a model for it; a spectral rule could not be checked here without labelled recordings.
- The 36 real songs are not labelled. Only the three piano renders (written and rendered by the owner) are known drumless.

## Not done
Vocal detection; a labelled set of real drumless and drum-light tracks to set the thresholds on (needed before trusting the middle of the range); a 'few drums' state.

Tests: `tests/drum-evidence.test.js` (in `npm test`: synthetic signals, the generated songs, the piano renders when present, the domain rule) and `tests/app-part-midi.test.js` (the page).
