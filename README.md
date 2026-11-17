# Track Teardown

**Upload a song, get a step-by-step plan to rebuild it in FL Studio.**

Track Teardown listens to an MP3 in your browser and works out the tempo, key, song sections, drum pattern, chords, 808/bass line and a rough hook. It then turns that into a 13-step Build-it plan with MIDI you can import straight into FL Studio's Piano roll. It's a learning tool for producers: you study how a song is made by rebuilding it yourself, then make something original.

Everything runs in one HTML file. The audio is analyzed locally in the browser and is never uploaded anywhere.

![Build it plan](docs/build-it.png)

## What it does

| Tab | What you get |
|---|---|
| **Overview** | Tempo, key (with a "play the key" ear check), mood, energy and a quick read of the mix |
| **Build it** | A step-by-step FL Studio plan (Piano roll and Playlist only), with a MIDI picture and a download for every part, warnings when a detection looks shaky, and a 25-minute session timer |
| **Song map** | Arrangement timeline lined up with the audio, bar ruler, loop/slow-down tools, "Check by ear" (synth plays the detected parts over the song), bar-by-bar chord grid |
| **Idea generator** | Original drum, 808, chord and melody ideas in the song's key and tempo, exportable as MIDI |
| **Sounds and mix** | Which samples and plugins suit the style, and mix moves |
| **Compare** | Upload your version and get a closeness score (tempo, key, drums, mix) |

Plus a **Sample Lab** (sort and tag your sample folders), a **Journal** (practice log and habits), a **Learn** tab with ear training, and a **Display** menu (text size, spacing, accent color).

## Exports that line up in FL Studio

- **Full-song MIDI per part** (kick, snare, hats, 808, chords, hook): every file starts at bar 1, and every note sits on the 16th-note grid.
- **The reference song, lined up**: a WAV copy of the song, padded or trimmed so its first downbeat lands exactly on bar 1. Drop it on Track 1 at bar 1, and the MIDI matches it, as long as the song keeps one steady tempo (the export uses a single tempo for the whole song).

## How accurate is it?

**We have not measured accuracy on real music yet.** The only numbers so far come from `tests/benchmark.js`, which runs the analyzer on 6 computer-generated songs where the right answer is known: pop, trap, house, swing, a melodic song and a fast-808 song. The tempo and beat rows also use 2 copies of the pop song with silence added at the start.

These songs have a constant tempo, start on the beat and repeat the same bars. The analyzer was also tuned on them. So these are **regression checks** (they catch changes that make things worse), not a measure of how well the app does on real tracks.

| Part | Result | How it's scored |
|---|---|---|
| Tempo | 8/8 within ±4 % | BPM vs the true tempo |
| Beats | F-measure 0.994 | Tracked beat times vs true beat times, ±70 ms |
| Downbeats (bar 1) | F-measure 0.978 | Same, for the first beat of each bar |
| Key, exactly right | **4/6** | Tonic and major/minor must both match. The two misses named the relative key (C major for A minor, A major for F# minor). Counting "same notes" as correct would give 6/6, which is how earlier versions of this page got that number. |
| Chords | 213/213 bars | One major/minor triad per bar; the test songs only use one triad per bar |
| Kick | precision 0.94, recall 0.98 | Position on the 16-step grid, bar by bar (not timing in seconds) |
| Snare / clap | precision 1.00, recall 0.98 | Same |
| Hi-hats | precision 1.00, recall 0.93 | Same |
| Hook onsets | precision 0.94, recall 1.00 | One song only (17 of 17 notes found, 1 extra) |
| 808 / bass | **not measured** | No benchmark scores it yet. Earlier versions of this page listed numbers here that no script produces. |

*Precision: when it says there's a hit, there is one. Recall: it found the hits that are really there. F-measure combines the two (1.0 = perfect).*

The drum scores check *which* 16th-note steps have a hit, not *when* the hit lands, so they can't catch a timing error. Real mixes, with reverb, layered samples, vocals and tempo drift, are harder. Treat the output as a first draft and check it by ear; the app has tools for exactly that.

Every benchmark run saves a full record to `tests/out/` and fails if any score drops below the floors in `tests/benchmark-gates.json`. Those floors are the measured values above, not targets. The method and its known weaknesses are in `docs/TECHNICAL_AUDIT_2026-11-16.md`.

### How the detection works (short version)

- **Tempo and beats:** spectral-flux onsets, autocorrelation for tempo, then dynamic-programming beat tracking that follows small tempo drift while the drum pattern is read. Chords, sections and the exported MIDI then use one fixed tempo for the whole song, in 4/4.
- **Kick:** low-band onsets. An 808 note with no kick on it is filtered out by checking for the kick's 2–5 kHz click, but only when a song clearly has both kinds of low hits.
- **Snare / clap:** sustained broadband noise after the hit, measured in the *quiet gaps between harmonics*, so synth notes, chord changes and kick clicks don't count.
- **Hats:** high-band onsets, a later window for swung 16ths, and hats hidden under a snare decided from the hats around them.
- **808 / bass:** low-end onsets at 16th-note resolution, and each note's pitch read from the whole time it rings, skipping the attack.
- **Key:** chroma correlated with two key profiles, plus bass evidence, then checked against the detected chords (which chords fit, which chord the song keeps returning to).

## Run it

Open `index.html` in a browser. That's it.

For development, `npm run dev` serves it at http://localhost:5173. It serves only the app, `docs/`, `test-songs/` and `tests/samples/`, and only to this computer.

When it runs as a Claude artifact, saved teardowns, the journal and progress sync to your Claude account. On its own it falls back to your browser's local storage.

## Tests

```bash
npm install
npx playwright install chromium
npm run songs        # makes the synthetic test songs (needs Python 3 + numpy)
npm test             # metric tests, dev-server security tests, then the feature tests
npm run benchmark    # scorecard on the synthetic songs; fails below tests/benchmark-gates.json
```

GitHub Actions runs all of this on every pull request (`.github/workflows/ci.yml`).

| File | What it checks |
|---|---|
| `tests/benchmark.js` | Scorecard against synthetic songs with known answers, with regression floors (`tests/benchmark-gates.json`) |
| `tests/metrics.test.js` | The scoring code itself, on hand-made cases |
| `tests/dev-server.test.js` | `npm run dev` never serves git history, packages, dotfiles or other local files |
| `tests/test21.js` | MIDI and the reference WAV start exactly on bar 1 |
| `tests/test22.js` | Build-it plan: step order, MIDI pictures, warnings |
| `tests/test23.js` | Chord grid and click-to-hear |
| others | Sample Lab, idea generator, overlay, stems, the 8 coaching features, volume (these mostly fail only on page errors; they print what they see rather than check it) |

## Habits this project follows

- **Measure before and after.** Every detection change is run against the scorecard, and CI fails if a score drops. "Feels more accurate" isn't evidence.
- **Realistic test data.** The first synthetic hi-hats were full-range noise and would have steered the snare fixes wrong, so the test drums were rebuilt to sound like real ones.
- **Change one thing, then re-run everything.**
- **Check on real screens**, desktop and phone, scrolled and unscrolled.

## Limits

- The hook and bass transcriptions are rough on dense mixes. Use them as a starting point, not the answer.
- Relative keys (like A minor and C major) share the same notes, so the app may name either one. It did on 2 of the 6 test songs.
- Tempo and bars: one fixed tempo per song, 4/4 only. Songs that speed up, slow down or change meter will drift off the grid.
- A beat right at 0:00 is currently missed by the beat tracker (the bar-1 position is still found).
- Saved teardowns don't keep the audio. Re-upload the song for listening tools and the lined-up WAV.

## Credits

Built by Ethan Goodwin with Claude (Anthropic), as a way to learn music production by taking songs apart.
