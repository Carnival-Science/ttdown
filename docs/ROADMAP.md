# Track Teardown: Living Roadmap and Phase 0 Record

Status values: **implemented · in progress · deferred · blocked · rejected · open** (not started).
Last updated: 2026-11-17 (Phase 0, revised after PR #6 merged and after founder review). Update this file in every PR that changes an item's status.

**Guiding milestone.** A producer uploads a reference track and learns something useful about its production that would otherwise take them a long time to work out. Benchmarks exist to make that result trustworthy. They are not the product, and nothing here should grow into a research platform ahead of putting the tool in front of producers (alpha study, Phase 11).

## 1. Phase 0 baseline (measured, not copied from earlier docs)

| Item | Value |
|---|---|
| Commit | `d6c448ab20939b52d3efa1731b8916c44ad22b6c` (`origin/main`, working tree clean, `gitDirty:false` in the run record) |
| Machine | Apple M1, 8 cores, 8 GB RAM, macOS 27.2 |
| Toolchain | Node v24.19.0, npm 12.0.2, Playwright 1.65.1, Chrome Headless Shell 159.0.8154.6, Python 3.12 + numpy 1.26 |
| Setup deviations | `npm run songs` calls `python`, which here is a Nix Python with no numpy; songs were generated with `python3 test-songs/make_test_songs.py`. Chromium 1255 had to be downloaded (`npx playwright install chromium`). |
| `npm test` | exit 0. metrics tests passed; dev-server tests 32 checks passed; feature tests 9 passed / 0 failed. **175 s** wall, 379 MB peak RSS (driver process). |
| `npm run benchmark` | exit 0. 15/15 gates passed. **15.7 s** wall, 260 MB peak RSS. About 1 s per synthetic song, including page analysis. Record: `tests/out/benchmark-2026-11-17T21-27-30-166Z.json` (page sha256 `a14fea961917…`). |
| Benchmark values | tempo Acc1 1.000 (8/8); tracked beat F 0.994, downbeat F 0.978; exported-grid beat F 0.995, downbeat F 0.986; key exact **4/6** (relative-key misses on `lead120_Amin`, `fast808_142`); kick P0.94 R0.98; snare P1.00 R0.98; hats P1.00 R0.93; chords 213/213; hook P0.94 R1.00. Matches the README. |
| Not measured | Any real recording; bass/808 accuracy; melody beyond one synthetic song; cold-vs-warm timings, memory inside the browser page, main-thread blocking. These are Phase 9 work. |

**After PR #6 merged** (`main` @ `07b9012`), the full suite was re-run: `npm test` exit 0 (9/9 feature tests, 198 s), `benchmark` 15/15 gates (17 s), `bench:synthetic` 8/8 tracks, `bench:parity` 104/104, `bench:crosscheck` 120/120, `bench:integrity` passed. The analyzer is unchanged (`index.html` sha256 `a14fea96…`). It is now pinned as **Version A**: see `docs/BASELINE_A.md`.

**PR #6 head (`3c3da08`) was verified before merging** in an isolated extract (no change to this checkout):
`npm test` exit 0 (9/9 feature tests, 172 s); `benchmark` 15 gates; `bench:synthetic` 8/8 tracks, 0 problems; `bench:parity` 104/104 match G0; `bench:crosscheck` 120/120 agree with mir_eval 0.8.2 (needed a venv; first attempt failed because of my PATH, not the code); `bench:integrity` passed. This reproduces the CI numbers in the PR description. It does not validate any real-music result, because none exist yet.

## 2. Open work and its relationship to this plan

| Ref | State on GitHub (checked 2026-11-17) | Relationship |
|---|---|---|
| G0 (PR #2) | Merged, `d6c448a` | Done. Measurement foundation, gates, dev-server hardening. |
| PR #1 `ceo/validation-and-experiment-foundation` | Draft, conflicts with main (README, package.json) | Only home of the strategy, benchmark-protocol, engineering-standard, competitive and A/B docs. Owner's call: reconcile with main and keep the documentation. Not touched here. |
| PR #3 `chore/claude-code-specialists-2026-11` | Draft, conflicts with main since #6 | Agent/skill workspace files. Independent of this work. Not touched here. |
| PR #4 `g1-harness` | Draft, CI green | Superseded by #6 (same tree plus two docs). Founder recommends closing it as superseded; not closed by me. |
| PR #6 | **Merged** (`07b9012`) | Real-music harness (`bench/`), G1 plan, pilot checklist, two-track templates, extended generator and manifest. This is the base for all follow-up work. |
| Tag `analyzer-baseline-a` | Created and pushed (see `docs/BASELINE_A.md`) | Frozen Version A. The earlier local `version-a` tag never existed. |

## 3. Previously identified findings: current status on `main`

Findings are from `docs/TECHNICAL_AUDIT_2026-11-16.md`. "Verified" means I checked the current code or ran it.

| Finding | Status | Evidence |
|---|---|---|
| C1-1 two copies of the app | **Resolved** | one clone; `git ls-files -s` shows 0 gitlinks |
| C1-3 `npm test` cannot fail | **Partly resolved** | Runner propagates exit codes and page errors fail. Only `test21` asserts a result (first downbeat); the other eight print values. |
| C1-4 tempo/beat/downbeat unmeasured | **Resolved for synthetic only** | G0 gates. Real-music harness merged in PR #6; no real data run yet. |
| C1-5 key scored by same-notes | **Resolved** | `key(exact)` gate; README corrected |
| C1-6 unsupported 808/bass number | **Resolved** | README says "not measured"; the harness now scores bass on the synthetic set (onset F 0.858, note F 0.829, 0 octave errors). Still no real-music bass result. |
| New (review): partial annotation coverage | **Open, verified. Must be fixed before the real-music pilot** | `bench/score.js` only excludes predictions inside declared `gap` spans, and only for beats. Drum and bass events and beat F score every prediction in the track, so a track annotated for an excerpt would count everything outside it as false positives. Chords are cropped to the reference span by the mir_eval convention. Needs a per-track scorable-region concept (annotation scope per type), applied to every event metric. |
| C1-7 synthetic set is also tuning set | **Open** | `ONSET_LAG` etc. still tuned on it; PR #6 extends the generator but real data decides |
| C1-8 cannot run on this machine | **Resolved** (here) | Ran with the deviations in section 1 |
| C1-9 no engine version, settings, evidence; title+duration project ID | **Open**, verified | `tdId()` = title slug + rounded duration; history keeps 12 and de-duplicates by title+duration, so a re-analysis overwrites |
| C1-10 corrections write fake 99; `retempo` leaves analysis inconsistent | **Open**, verified | `setKey`: `keyConf = 99`; `retempo`: `bpmConf = 99`, rescales `barSec` and section bars only; chords, drum grid and first downbeat are not recomputed |
| C1-12 no size/duration limit before decode | **Open**, verified | `analyze()` calls `decodeAudioData` on any file; `lastBuffer` retained |
| C1-13 coach explains results it did not compute | **Open** | not re-inspected in this phase |
| D-2 tracked grid discarded | **Open**, verified | `grid` is exposed as a non-enumerable property, but chords (`firstDown + n*barSec`), sections, `songNotes`, aligned WAV and playback overlays still use constant `barSec` |
| D-2b sections binned from file start, reported from `firstDown` | **Open**, verified | bin index `off/SR/barSec` (line 725) vs `firstDown + startBar*barSec` (line 866) |
| 125 BPM prior and 70–180 range | **Open**, verified | line 571 |
| Beat at exactly 0:00 missed | **Open**, verified | `eAll[0] = 0` (line 555) |
| 4/4 hard-coded, no meter detection or tempo map | **Open** | by design today |
| New: concurrent/stale analysis | **Open**, verified | `handle()` has no job token: a second upload while the first is analysing revokes the first's audio URL, and whichever finishes last writes `lastBuffer`, `render` and history |
| New: README still says "FL Studio" is the product | **Open** | Phase 4 |

Not repeated in this plan: G0 gates, dev-server hardening and tests, README accuracy correction, the metric library and its tests, the real-music harness itself (PR #6).

## 4. Implementation plan

Rules: each step is a separate PR; algorithm, UI and architecture changes are not mixed; `npm test`, `npm run benchmark` and the `bench:*` suite run before and after each; **Version A (`docs/BASELINE_A.md`) is never modified**. Not started and not authorised yet: framework migration, UI redesign, new model integrations, AI assistant.

**Version A / Version B.** Version A is the pinned analyzer. Version B is the working engine with the new timing model. Both are run on the same recordings, settings and hardware, and compared per track. This applies to the synthetic fixtures now and to the annotated real-music set when it exists, so the improvement is measured rather than asserted.

**TimeMap design requirements (step 2).** The model must keep these distinct, per position and per interval: *measured* beats (from the tracker), *inferred* structure (bars, meter, downbeat choice), *user-corrected* positions (with the original retained), *unsupported or uncertain* meter, and *tempo variation and discontinuities* (tempo map). A constant-grid fallback must carry an explicit `source: "fallback-grid"` and must never be reported as measured.

**Export versus timeline tests are separate.** Variable-tempo recordings: the *internal timeline* (sections, chords, overlays, event positions) is tested for alignment against the measured grid, and exports are tested to **refuse** with a disclosure. Constant-tempo 4/4 recordings: exported MIDI and lined-up audio are tested for alignment. Neither test is allowed to substitute for the other.

| # | Step | Depends on | Acceptance criteria |
|---|---|---|---|
| 0 | Integration route for PR #6 | – | **Done.** #6 merged; work proceeds from `main`. |
| 1 | Roadmap update, Version A pinned (tag, stored predictions, reproduction recipe) | 0 | **Done in PR #7.** Frozen page reproduces the stored predictions for all 8 tracks. |
| 2 | **Phase 2a: `TimeMap`, additive.** *(PR #8, open)* Pure module, no DOM; seconds ↔ beat/bar position; meter; tempo map; per-point provenance; uncertainty flag | 1 | Unit tests (round-trip, leading silence, nonzero first downbeat, pickup, drift, tempo change, unsupported meter, fallback labelled); `bench:parity` 104/104 and the 15 gates unchanged; index.html analysis output byte-identical |
| 3 | **Reliability PRs** (a) stale-job guard *(PR #9)* (b) cancellation *(PR #10)* (c) object-URL ownership *(PR #11)* (d) input limits *(PR #12)*. Stacked in that order because all four edit `handle()`; each has tests that fail on the previous page | none | Each has Playwright tests that assert behaviour, e.g. a second upload during analysis wins; oversize files error and leave state intact; a cancelled job cannot write results |
| 4 | **Phase 2b: deterministic fixtures** *(PR #13, stacked on #8; report in `docs/TIME_FIXTURES_BASELINE.md`)* (leading silence, pickup, half/double ambiguity, nonzero first downbeat, drift, tempo change, 3/4 and 6/8, long) with new seeds; run Version A on them | 2 | Fixtures deterministic; per-fixture failure table for Version A published **before any consumer is migrated**; baselines stored, nothing gated up |
| 5 | **Benchmark scoring: scorable regions** (partial annotations) | 1 | Tests prove predictions outside an annotated span are not false positives, for beats, drums, bass and chords; synthetic scores unchanged. **Prerequisite for the real-music pilot** |
| 6 | **Phase 2c: route consumers through `TimeMap`**, then exports restricted to verified constant-tempo 4/4 | 2, 4 | Paired Version A vs B on all fixtures; no gate drops; timeline-alignment tests on variable-tempo fixtures; export-refusal tests there; export-alignment tests on constant-tempo ones |
| 7 | **Phase 2d: corrections** recompute or invalidate dependents; `{original, corrected, source:"user"}`; no hard-coded 99 | 2, 6 | After a BPM/meter/downbeat edit, results equal a fresh analysis at those values or are marked stale and not exported |
| 8 | Phase 1 pilot: two-track rehearsal then 12-track development set | 5, **rights-cleared audio and independent annotators (human, blocked)** | Manifest passes `run.js` checks; Version A and B reports on identical files; failure atlas; no accuracy claim before review |
| 9 | Phases 3–10 | 6–8 | Scoped from the fixture and pilot failures. The versioned result schema (Phase 3) is designed with `TimeMap` to avoid two migrations |

**Tests assert as they go.** Each PR above that touches a workflow turns the corresponding print-only feature test into one with real assertions (musical or application invariants), rather than a separate test-rewrite project. Today only `test21` asserts a result.

Deliberately not next: UI workspace (Phase 5), comparison rewrite (6), AI contract (8). They consume the time model and result schema; building them first would mean building them twice. Third-party models (Beat This!, Basic Pitch, source separation) wait for real-music baselines and the licence review.

## 5. Roadmap by phase

| Phase | Item | Status |
|---|---|---|
| 0 | Reconcile existing work, baseline, plan | **implemented** (PR #7) |
| 0 | Pin Version A (tag, stored predictions, recipe) | **implemented** (`docs/BASELINE_A.md`) |
| 1 | Synthetic regression gates | implemented (G0) |
| 1 | Real-music harness, integrity checks, mir_eval cross-check | implemented (PR #6, merged; synthetic data only) |
| 1 | Scorable regions for partially annotated tracks | open, **required before pilot** (step 5) |
| 1 | Two-track rehearsal, 12-track pilot, held-out set | **blocked** (rights, annotators) |
| 1 | Bass metrics on real data | blocked (scorer merged; no data). Melody scorer: open |
| 2 | `TimeMap` (additive, with tests) | implemented (PR #8, open) |
| 2 | Consumer migration (sections, chords, events, overlays, exports) | open (step 6) |
| 2 | Time-model fixtures and Version A failure report | implemented (PR #13, open) |
| 2 | Correction-triggered recompute / invalidation | open (step 7) |
| 3 | Versioned result schema, provenance, calibrated-or-unknown confidence | open |
| 3 | Chord vocabulary, key ambiguity, drum fills, bass octave, quantisation options | open (benchmark-driven) |
| 4 | Analysis-first default page; non-primary features moved, not deleted | open (needs founder approval for placement) |
| 5 | Synchronized timeline workspace | open |
| 6 | Multidimensional comparison replacing closeness score | open |
| 7 | Export validation; IndexedDB persistence with stable IDs and quota errors | open |
| 8 | Evidence/data contract for a future assistant; hide unavailable AI | open |
| 9 | Workers, memory, limits, stale-job guard | stale-job guard, cancellation, URL ownership, limits implemented as PRs #9 to #12 (open, stacked). Workers, memory profiling: later |
| 10 | Module boundaries, data-model docs | open |
| 11 | Alpha study design | deferred until a pilot-quality analysis exists |
| – | Framework migration (React/Svelte/Next/TypeScript) | **rejected for this assignment** |
| – | Madmom models, Essentia in product | rejected (licence), unless separately licensed |

## 6. Known limits of this Phase 0 record

- I did not read every line of the roughly 2,300 lines of non-analysis UI, the coach, or the Windows-specific parts of the audit.
- The 175 s and 15.7 s timings are one run on one machine, with a warm disk cache; they are not cold/warm app timings.
- Real-music behaviour is unmeasured. Every "open, verified" row above is verified from the code path; its size on real tracks is not.
- Licence statements in the audit were not re-checked in this phase.

## 7. Findings from the fixtures that change the plan (PR #13)

- Moving consumers onto the tracked grid fixes the drift cases; it does **not** fix octave errors, tempo steps (the tracker itself fails), non-4/4 meters, the 480 s rhythm cap or hi-hat recall. Those need tracker, meter-detection and drum work, scheduled from the Version A failure report, not from TimeMap.
- TimeMap is only as good as the beats it is given, and cannot see an octave error or a regular-but-wrong tracker. Step 6 (consumer migration) should therefore add a visible disclosure of the assumed 4/4 and show tempo alternatives where the fixtures show failures.
- Step 6 should be done one consumer at a time, each compared against `bench/baselines/version-a/` on the synthetic set and on the time fixtures.
- Open decisions for the founder: (1) allow export with an *assumed* 4/4 meter and a caveat, or require confirmation; (2) the input-limit values (200 MB, 15:00, 8 s minimum) from PR #12; (3) the 20 ms constant-grid tolerance, to be revisited with real recordings.
