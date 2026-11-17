# G1: Real-Music Accuracy Benchmark Plan

Status: **proposal for founder approval** · Date: 17 November 2026 · Builds on: G0 (PR #2 @ `59b3444`) · Companion docs: `docs/TECHNICAL_AUDIT_2026-11-16.md`, `ELECTRONIC_BENCHMARK_PROTOCOL.md` (branch `ceo/validation-and-experiment-foundation`)

## 1. Purpose and non-goals

**G1 answers one question: where, and under what conditions, does the current analyzer fail on real electronic music?**

- **No DSP changes in G1.** There is no Version B. Version A (engine at `main@eb796ff`, analysis-identical to `59b3444`) is measured as it is.
- The output is a **failure atlas**: per capability, per condition, how often and how badly it fails, with listening-verified examples. G2 will choose which algorithm to change based on this evidence.
- G1 does not produce marketing accuracy claims. The numbers are for engineering decisions until the holdout run and an independent review are complete.

## 2. Scope by capability (priority order)

| Priority | Capability | G1 ground truth | Why this order |
|---|---|---|---|
| 1 | Tempo, beats, downbeats/meter | Manual (all tracks) + DAW-derived (contributed tracks) | Every other output is indexed by this grid |
| 1 | **Exported grid drift** | Derived from the beat annotation | The largest unmeasured product risk (audit finding D-2) |
| 2 | Key (tonic + mode) | Manual, 2 annotators | Visible headline result; 2/6 synthetic misses already |
| 3 | Drum events (kick, snare/clap, hats) | DAW MIDI/stems where available; manual on excerpts otherwise | G0 showed current drum scoring ignores timing |
| 4 | Chords | Manual on a subset | Expensive to annotate; depends on grid |
| 5 | Bass notes | DAW MIDI only | Manual bass transcription is too costly and unreliable |
| – | Structure / sections | Deferred to G1c | Needs a section-labelling convention first |

## 3. Track sources and rights

**Rule: no audio enters the benchmark without a documented right to use it for internal evaluation of a commercial product.** Rights, licence and provenance are recorded per track in the manifest. Audio is never committed to git and never uploaded to third-party services.

| Source | What we get | Rights path | Value |
|---|---|---|---|
| **S1. Producer-contributed sessions** (recommended primary) | Final master + DAW project or stem/MIDI exports | Written contributor agreement: internal evaluation only, no model training without separate consent, deletion on request, retention period | Highest. Exact tempo maps, drum/bass/chord MIDI and declared key, so annotations become verification rather than transcription. It also seeds a proprietary benchmark no competitor has. |
| **S2. Openly licensed recordings** (CC BY / CC0 only) | Audio only; we annotate | Per-track licence check and snapshot of the licence page at download time. **Exclude NC and ND licences** pending legal review. | Broad style coverage; annotation cost is ours |
| **S3. Public research annotations** (e.g. GiantSteps Tempo/Key, Harmonix Set) | Annotations; audio must be obtained separately | **Legal review required first.** Annotations licensed (CC BY-SA per mirdata for GiantSteps); audio rights unclear | External comparability with published results; not a primary set |

Founder decision needed: which sources to use, budget, and whether legal review of S2/S3 happens before or after a pilot on S1.

## 4. Track selection

**Sizes.**
- **Pilot (G1a):** 12 tracks, used to test the annotation protocol and harness end to end.
- **Development (G1b):** 60 tracks.
- **Hidden holdout (G1b):** 30 tracks.
- For key (a right/wrong outcome per track), 90 tracks give a 95 % confidence interval of roughly ±9–10 points around 70 % accuracy. Finer per-subgenre key conclusions need more tracks; this is an estimate, not a power calculation.

**Stratify across** the founder's nine styles, at least 6 development + 3 holdout each:
- house
- techno
- trance
- progressive
- drum & bass
- dubstep / bass music
- UK garage
- breakbeat
- ambient / downtempo

**Tag every track with these conditions** (used to slice the failure analysis):

| Condition | Why it matters |
|---|---|
| Tempo band (<90, 90–115, 115–135, 135–160, >160 BPM) | 125-BPM prior; DnB/dubstep half-time risk |
| Half-time feel (yes/no) | Octave errors |
| Swing / shuffle (none, light, heavy) | UKG, garage; hat and step placement |
| Four-on-the-floor vs broken beat | Downbeat templates assume kick-on-1 and backbeat |
| No clap/snare on 2 and 4 | Techno downbeat ambiguity |
| Drumless intro length (bars) | Downbeat and first-beat errors |
| Tempo drift or changes (none, DJ-edit, live-played, ramps) | Fixed export grid |
| Meter (4/4, other) | 4/4 hard-coded |
| Tonality (major, minor, modal, atonal/percussive, modulating) | Major/minor-only key model |
| Detuning (estimated cents) | Tuning estimate |
| Vocals (none, chops, lead) | Chroma and onset contamination |
| Sub-bass/kick overlap (808 on kick) | Kick vs 808 discrimination |
| Duration and mastering loudness | Runtime; onset detection on limited masters |

**Leakage rules:**
- Split by **artist and release**. No artist appears in both development and holdout.
- Remixes, edits, alternate masters and stems of one song stay in one split.

**Selection discipline:** define the selection quota *before* listening to analyzer output. Never add or drop tracks based on how the analyzer did on them.

## 5. Ground truth protocol

**General:**
- Annotators are independent of engineering and never see Track Teardown's output for the track.
- Tooling: Sonic Visualiser, with annotations exported as plain text.
- The files go in versioned annotation folders, each with an annotation-protocol version number.

| Task | Convention | Method | QA |
|---|---|---|---|
| Beats | Quarter-note level of the felt pulse. If half/double is genuinely plausible, record the alternative level as acceptable. | Tap along, then correct each beat against the waveform/spectrogram. Silence or drumless sections: annotate only if the pulse is unambiguous, and mark the span "uncertain". | 2 annotators on 100 % of tracks; inter-annotator beat F (±70 ms) reported; adjudicate below 0.9 |
| Downbeats / meter | First beat of each bar; meter per section | Marked on the beat annotation | 2 annotators; disagreements on "where is 1" kept as alternatives, not forced |
| Tempo map | Derived from beats; S1 tracks: from DAW project, then cross-checked against audio | – | Flag tempo changes and drift > 0.5 % |
| Key | Tonic + mode, extended labels: major, minor, dorian, phrygian, mixolydian, "atonal", "ambiguous", "modulates (segments)" | Musicians with a reference keyboard | 2 annotators; agreement and Cohen's κ reported |
| Chords | Harte syntax; `N` = no chord, `X` = unknown; root + maj/min mandatory, 7ths/sus where clear | 1 annotator + 1 reviewer, on a 30-track subset | Reviewer change rate reported |
| Drums | Events in seconds: kick, snare/clap, closed hat, open hat, other | S1: from MIDI/stems (check alignment to the master). Others: manual on two 16-bar excerpts per track (main groove + one variation/fill) | Second annotator on 20 % |
| Bass | Note onset, offset, MIDI pitch | S1 MIDI only | Octave checked by ear on 10 % |

**Rough cost estimate** (unverified until the pilot measures it): beats/downbeats 20–30 minutes per 5-minute track per annotator; key about 5 minutes; chords 45–60 minutes per track. For 90 tracks with double-annotated beats and key, that's about 75–90 annotator-hours. Chords on 30 tracks add about 30 hours. The pilot will replace these estimates with measured times.

## 6. Metrics

Defined in `tests/metrics.js` (G0) plus additions. Every metric is reported **per track**, then aggregated with **bootstrap 95 % confidence intervals over tracks**. Per-stratum results are reported with their *n*; no claim is made for a stratum with n < 5.

| Capability | Metrics |
|---|---|
| Tempo | Absolute/relative BPM error; Acc1 (±4 %); Acc2 (×2, ×½, ×3, ×⅓); octave-error rate |
| Beats | F-measure ±70 ms; mean signed and absolute timing error; continuity (CMLt/AMLt) |
| Downbeats | F-measure ±70 ms; bar-phase error class (off by 1, 2 or 3 beats, or not on a beat) |
| **Exported grid** (what the user receives: chords, sections, MIDI, aligned WAV) | Export beat/downbeat F; **max drift** \|export beat − true beat\| over the song; **time until drift first exceeds 70 ms**; % of bars correctly aligned |
| Key | Exact accuracy; MIREX weighted score (fifth 0.5, relative 0.3, parallel 0.2); confusion by category; accuracy split by tonality tag |
| Drums | Per-class precision/recall/F at ±30 ms and ±50 ms, **on the exported MIDI note times in seconds**, plus the existing 16-step pattern score for continuity |
| Chords | Time-weighted root accuracy and maj/min accuracy (mir_eval conventions); segmentation score |
| Bass | Onset F ±50 ms; pitch accuracy; octave-error rate; duration error |
| Engineering | Runtime (median/p95), peak memory, crash/"Couldn't read" rate, by duration |
| Confidence | Shown confidence vs observed correctness (reliability table). Calibration reported, **not** displayed to users until calibrated on held-out data. |

**Metric validity:**
- Cross-check our JS metrics against `mir_eval` (Python) on the same predictions before trusting any G1 number.
- Publish the metric code tests.
- Metric definitions and tolerances are versioned and frozen before the holdout run.

## 7. Baseline measurement

1. Freeze Version A: the engine at `main@eb796ff`. Analysis is identical at `59b3444`, as G0 proved. Push the `version-a` tag (founder approval).
2. Run the development set once, without changes. Record per-track predictions with checksums, engine commit, browser/OS versions and runtime.
3. Report the baseline per capability and per condition, with confidence intervals.
4. **The holdout is run once, at the end of G1**, by a different command that never prints per-track details to the console, to confirm the development-set conclusions. Its numbers are reported but never used for tuning.

## 8. Failure analysis

**Automatic classification** of every error into a fixed taxonomy:

| Capability | Failure classes |
|---|---|
| Tempo | half-time · double-time · ×⅔ / ×1.5 · other > 4 % · drift-induced |
| Beats | off-beat lock · phase drift · gaps (missed sections) · spurious beats in silence · start/end edge |
| Downbeats | phase +1 / +2 / +3 beats · flips mid-song · lost in breakdown |
| Exported grid | constant offset · cumulative drift · tempo-change break |
| Key | relative · parallel · fifth (dominant/subdominant) · modal mislabel · other |
| Drums | missed class · class confusion (kick ↔ 808, snare ↔ hat) · timing > 30 ms · pattern-repeat artefact (event exported where none exists) |
| Chords | root error · quality error · boundary error · no-chord confusion |
| Bass | octave · wrong note · missed onset · merged notes |

Then:
- **Condition slicing.** Failure rate per capability × condition tag. The output is the **failure atlas** heat-table.
- **Listening review.** Every failure in the pilot, and the worst 20 % per capability in development, is reviewed by ear by someone other than the engineer who classified it. They confirm the class or record a new one.
- **Hypotheses**, explicitly labelled as hypotheses. For example: "the 125-BPM prior causes most DnB octave errors". Each needs a falsifiable G2 experiment.

## 9. Engineering work required for G1 (no DSP changes)

1. **Manifest-driven benchmark.** A JSON manifest with track ID, local path, SHA-256, licence/provenance, split, condition tags and annotation files. Loaders for beats, key, chords (`.lab`) and drums/bass. The synthetic set is converted to a manifest, and **must reproduce G0's numbers exactly** (acceptance test).
2. **New metrics:** exported-grid drift, drum events in seconds from exported MIDI, MIREX key score, chord and bass metrics, bootstrap CIs. Each comes with hand-made metric tests.
3. **mir_eval cross-check script** (Python, dev-only), run on the benchmark JSON records.
4. **Report generator:** per-track CSV, failure-class counts, failure atlas, reliability table.
5. **Holdout isolation:** holdout audio and annotations stored outside the repo; separate command; results only.
6. **G0 follow-ups:**
   - record the PR head SHA, not the merge SHA;
   - pin Actions to commit SHAs;
   - generator-written truth files for synthetic songs.

## 10. Phases and acceptance criteria

| Phase | Done when |
|---|---|
| G1-H: harness | Synthetic set through the manifest path reproduces G0 records exactly; new metric tests pass; mir_eval agreement within 0.001 on beat/downbeat F |
| G1a: pilot (12 tracks) | Annotation times measured; inter-annotator agreement reported; every pilot failure classified and listened to; protocol v1.1 frozen |
| G1b: development (60) | Baseline report with CIs per capability and stratum; failure atlas; ranked G2 hypotheses with proposed experiments |
| G1c: holdout (30) | One run; conclusions confirmed or revised; independent review (ChatGPT plus one human) of method and results |

## 11. Risks

- **Rights and consent:** S1 needs contributor agreements before any audio arrives. S2/S3 need legal review.
- **Annotation ambiguity** (where "1" is in electronic intros, modal keys) can look like analyzer error. Mitigation: alternatives recorded, agreement reported, ambiguous items scored separately.
- **Small strata:** nine styles × several conditions can't all be covered by 90 tracks. Report n and avoid over-reading.
- **Selection bias** toward tracks contributors are proud of (clean mixes). Mitigation: quota by condition, and ask contributors for "difficult" tracks too.
- **Browser and runtime dependence:** results are recorded with the browser version. CI and local runs proved identical on synthetic audio; this will be re-checked on real audio.

## 12. Decisions needed from the founder

1. Track sources: S1 / S2 / S3, and whether to begin with an S1 pilot.
2. Budget and annotators (internal, contracted, producer community), and who holds the holdout.
3. Legal review of the contributor agreement and S2/S3 use.
4. Data retention and deletion policy for contributed audio.
5. Approval to start G1-H (harness only, no DSP change) before data arrives.
