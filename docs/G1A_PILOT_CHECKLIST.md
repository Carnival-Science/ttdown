# G1a Pilot: Operational Checklist for the First 12 Tracks

Goal: **12 rights-cleared electronic tracks, independently annotated, run through the existing harness, every failure reviewed by ear.**

Scope rules:
- The pilot is **development data** and can never become holdout.
- No analyzer changes during G1a; the analyzer stays at Version A (`index.html` unchanged since `eb796ff`).
- No new harness features unless a step below is literally blocked.

Each step has an owner and a definition of done. Tick boxes as you go, and record dates in the intake and QA logs (templates at the end).

---

## 0. Roles (name a person for each before starting)

| Role | Does | Can't also be |
|---|---|---|
| **Founder** | Approves sources, agreement, budget, storage; signs off at the end | – |
| **Data lead** | Recruits contributors, collects files, keeps the intake log, maintains the manifest | Annotator for the same track |
| **Annotator A, Annotator B** | Annotate independently; never see Track Teardown output for the track | Data lead, Engineer |
| **Adjudicator** | Resolves A/B disagreements; keeps the QA log | Annotator for the same track |
| **Engineer** | Runs the harness, investigates failures, writes the pilot report | Annotator; must not see the final holdout later |
| **Holdout custodian** | Not used in G1a. Name this person now so they stay independent of pilot work, for the final holdout | Engineer |

Minimum team: founder, data lead (who can also adjudicate tracks they didn't collect), 2 annotators, engineer.

## 1. Decisions and approvals (before contacting anyone)

- [ ] **Source:** producer-contributed sessions (S1, recommended). Open CC BY/CC0 audio (S2) only to fill style gaps, with the licence page saved at download.
- [ ] **Contributor agreement** reviewed by a lawyer (this checklist is not legal advice). Key terms to cover:
  - internal evaluation only;
  - no model training without separate written consent;
  - no redistribution;
  - storage location and access list;
  - retention period;
  - deletion on request within N days;
  - attribution or no attribution;
  - permission to publish aggregate statistics only, never audio or per-track data, without consent.
- [ ] **Budget:** contributor fees (if any), plus annotator time at about 1–1.5 h per track per annotator (to be measured), plus adjudication.
- [ ] **Storage:**
  - an encrypted, access-restricted location **outside the git repository**, with a backup;
  - an access list written down;
  - nothing sent to third-party services (cloud transcription, stem splitters, AI tools).
- [ ] **Retention and deletion policy** written, with the date by which pilot data is deleted unless re-consented.
- [ ] **Artist registry** file created in the same storage: internal IDs `art-0001`, `art-0002`, … The registry is private and stays out of the repo.

**Done when:** the founder has approved all six items in writing (email is fine).

## 2. Track selection (decide the slots BEFORE collecting; never pick or drop tracks by analyzer results)

Twelve slots. Each covers a style plus a condition that stresses a known risk from the audit.

| # | Style | Condition to cover | Risk it tests |
|---|---|---|---|
| 1 | House | four-on-the-floor, clap on 2 and 4 (baseline) | – |
| 2 | Techno | **no clap/snare on 2 and 4** | downbeat templates |
| 3 | Trance | long drumless breakdown | gaps, downbeat recovery |
| 4 | Progressive | long intro (16+ bars), gradual build | first downbeat, drift |
| 5 | Drum & bass | 170–176 BPM | half-time octave error (125 BPM prior) |
| 6 | Dubstep / bass music | 140 BPM half-time feel | octave error, downbeat |
| 7 | UK garage | heavy swing / shuffle | hats, step grid |
| 8 | Breakbeat | broken kick pattern | downbeat templates |
| 9 | Ambient / downtempo | weak onsets, few drums | tempo, beats |
| 10 | Any | **tempo change or drift** (live-played, DJ edit, ramp) | fixed export grid |
| 11 | Any | **modal or ambiguous key** (phrygian/dorian), or modulation | major/minor-only key model |
| 12 | Any | vocal-led with sub-bass / 808 under the kick | chroma contamination, kick/808 confusion |

**Each track must:**
- be in 4/4 for the pilot (note any other metre; don't select for it yet);
- be 2–8 minutes long;
- be a final master;
- come from a contributor who can grant the rights.

**At most one track per artist, and no two tracks from the same release or song family.**

- [ ] The slot table above is filled with candidate titles before any file is received.

## 3. Intake (per track)

- [ ] Signed contributor agreement on file; agreement ID recorded.
- [ ] **Files received:**
  - final master WAV/AIFF (44.1 or 48 kHz, 24-bit preferred; no MP3 as the only source);
  - **stems and/or MIDI exports**, or the DAW project (for drum and bass truth);
  - the contributor's declared tempo, key and time signature, recorded as **metadata, not ground truth**.
- [ ] Identity recorded:
  - `artistIds`: register new artists in the registry, with aliases;
  - `release` (catalog number if one exists);
  - `songFamily`.
- [ ] Condition tags recorded (style, tempo band, swing, four-on-the-floor, drumless intro bars, tempo drift, tonality, vocals, sub/kick overlap).
- [ ] SHA-256 of every received file recorded at intake.
- [ ] Files stored in the restricted location under the track ID (`g1a-01` … `g1a-12`); originals kept read-only.
- [ ] Intake log row complete.

**Done when:** 12 rows are complete in the intake log, and the slot table is satisfied or deviations are noted with reasons.

## 4. Annotation protocol v1.0 (annotators work independently and never open Track Teardown on these tracks)

Tool: Sonic Visualiser (record the version). Export plain text in the formats in `bench/README.md`. Log minutes spent per task.

**Beats and downbeats** (both annotators, all 12 tracks):
- [ ] Tap at the quarter-note pulse, then correct every beat against the waveform and spectrogram.
- [ ] Mark bar positions (1–4).
- [ ] If half or double time is genuinely plausible, note the alternative in the QA log.
- [ ] **Beats are continuous in every scorable region.** Where the pulse can't be verified, don't guess: write `gap <start> <end> <reason>`.
- [ ] A **real tempo change** is not a gap: keep beating through it and write `tempo-change <time> <note>`.
- [ ] Never add interpolated or "probably here" beats.

**Key** (both annotators):
- [ ] Tonic plus mode with a reference keyboard: `major`, `minor`, `dorian`, `phrygian`, `mixolydian`, `atonal`, `ambiguous`, or segments if it modulates.

**Chords** (one annotator plus a reviewer, on at least 4 of 12 tracks, the most harmonic ones):
- [ ] Harte syntax, `N` for no chord, `X` for unknown.

**Drums:**
- [ ] From stems/MIDI where available. Check alignment to the master (offset under 5 ms), then export events (`kick`, `snare`/`clap`, `hihat`).
- [ ] Without stems: annotate two 16-bar excerpts (main groove plus one variation).

**Bass:**
- [ ] From MIDI only. Check the octave by ear on at least 2 tracks.

**Done when:** every track has beats and key from both annotators, chords on at least 4 tracks, and drums and bass wherever stems or MIDI exist.

## 5. Agreement and adjudication

- [ ] Compute **inter-annotator beat F (±70 ms)** per track. The engineer can use `tests/metrics.js` `events()` (A against B); no new tooling.
- [ ] **Adjudicate:**
  - beat F below 0.90;
  - any disagreement on where bar 1 is;
  - any key disagreement.
- [ ] The adjudicator picks or merges, or marks the region as a `gap` with the reason "annotators disagree". Never average.
- [ ] Record agreement figures and every decision in the QA log. Key agreement is reported as Cohen's κ across the 12 tracks (labelled as indicative, n = 12).

**Done when:** each track has one adjudicated annotation set, and the QA log explains every change.

## 6. Freeze and validate

- [ ] **Write the manifest** (`name: "g1a-pilot"`, `version: 1`, `annotationProtocol: "v1.0"`) with:
  - `split: "dev"` on all tracks;
  - audio `sha256` and `annotationSha256`;
  - identity fields;
  - tags;
  - `requirements`: `checksums`, `continuousBeats` and `identity` set to true; beats, downbeats and key `"all"`; chords `0.3`.
- [ ] **Validate:** run `node bench/run.js <pilot-manifest.json> --out <pilot-results-dir>`. It checks everything before analyzing and stops with exit 2 on any problem.
- [ ] **Fix every flagged hole:** for each `undeclared gap` reported, record in the QA log whether it was:
  - (a) missing beats, now annotated;
  - (b) a real uncertain span, now declared as a `gap`;
  - (c) a real tempo change, now declared as a `tempo-change`. **These are the 1.75× threshold's false positives; count them.**
- [ ] **Re-pin and log:** after any annotation fix, update hashes and record the change in the QA log.
- [ ] **Leakage check:** `node bench/check-splits.js <pilot-manifest.json> <empty-holdout-manifest.json> --registry <artists.json>` passes. This proves the identifiers are complete; the real holdout check comes later.

**Done when:** `run.js` starts analyzing without objections.

## 7. Run and score (engineer)

- [ ] **Clean tree:** the engine commit is clean and recorded; the analyzer is unchanged.
- [ ] **Run:** `node bench/run.js …` completes all 12 tracks.
- [ ] **Score:** `node bench/score.js <dir>/predictions.json` exits 0 with completeness 12/12. If it doesn't, the report lists each failure by cause: fix the input or record the analyzer failure, but **never drop a track**.
- [ ] **Store the record:**
  - `scores.json`, `tracks.csv` and `report.md` saved with the truth fingerprint and manifest sha256;
  - results stored with the data, not in the repo.
- [ ] **Annotation fixes after scoring** use the re-score procedure (version bump, `revisions` entry, `--rescore`).

## 8. Failure review (the point of the pilot)

- [ ] **Listen to every failure** (any class other than `ok`), with someone other than the engineer: audio, annotation and app output side by side. Confirm the failure class, or record a new one.
- [ ] **Check the 1.2 s silence finding** (synthetic: extra exported kicks after leading silence) on pilot tracks with silent or drumless intros.
- [ ] **Measure:**
  - annotation minutes per track per task;
  - inter-annotator agreement;
  - number of threshold false positives;
  - adjudication time.
- [ ] **Write the pilot report:**
  - the failure atlas (n = 12; observations, not statistics);
  - the top 3 failure hypotheses, each with a falsifiable G2 experiment;
  - protocol changes for v1.1;
  - classifier v3 thresholds;
  - a decision on the 1.75× threshold;
  - the cost per track for the 60 + 30 set.

**Done when:** the founder signs off the pilot report, and protocol v1.1 plus the go/no-go for the 60-track development set are decided.

## 9. Close-out

- [ ] **Version and back up:** pilot data, annotations, logs and results versioned and backed up in the restricted storage.
- [ ] **Deletion:** dates set per the retention policy, and any contributor deletion requests handled.
- [ ] **Final holdout custodian confirmed:** independent, and never shown pilot or development results that name tracks.

---

## Templates

**Intake log** (one row per track):

| Track ID | Slot | Contributor / agreement ID | Received (date) | Files + SHA-256 | Stems/MIDI? | Declared tempo/key/metre (metadata) | artistIds | release | songFamily | Tags | Storage path | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

**Annotation QA log** (one row per event):

| Date | Track ID | Task | Who | Event (flagged hole / disagreement / correction / tempo change / gap) | Detail (times, A vs B) | Resolution | Minutes |
|---|---|---|---|---|---|---|---|

**Time log** (for the cost estimate):

| Track ID | Annotator | Beats+downbeats (min) | Key (min) | Chords (min) | Drums (min) | Bass (min) | Adjudication (min) |
|---|---|---|---|---|---|---|---|

## Timeline (estimate; replace with actuals)

| Week | Milestone |
|---|---|
| 1 | Approvals (section 1), slot table, outreach |
| 2–3 | Intake of 12 tracks |
| 3–4 | Independent annotation, agreement, adjudication |
| 5 | Freeze, validate, run, score |
| 5–6 | Failure listening review, pilot report, founder sign-off |
