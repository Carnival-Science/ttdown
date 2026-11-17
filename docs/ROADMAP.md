# Track Teardown: Living Roadmap and Phase 0 Record

Status values: **implemented · in progress · deferred · blocked · rejected · open** (not started).
Last updated: 2026-11-17 (Phase 0). Update this file in every PR that changes an item's status.

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

**PR #6 head (`3c3da08`) verified locally** in an isolated extract (no change to this checkout):
`npm test` exit 0 (9/9 feature tests, 172 s); `benchmark` 15 gates; `bench:synthetic` 8/8 tracks, 0 problems; `bench:parity` 104/104 match G0; `bench:crosscheck` 120/120 agree with mir_eval 0.8.2 (needed a venv; first attempt failed because of my PATH, not the code); `bench:integrity` passed. This reproduces the CI numbers in the PR description. It does not validate any real-music result, because none exist yet.

## 2. Open work and its relationship to this plan

| Ref | State on GitHub (checked 2026-11-17) | Relationship |
|---|---|---|
| G0 (PR #2) | Merged, `d6c448a` | Done. Measurement foundation, gates, dev-server hardening. |
| PR #1 `ceo/validation-and-experiment-foundation` | Draft, **conflicts with main** (README, package.json) | Source of the strategy, benchmark protocol, engineering standard, competitive and A/B docs. None are on main. Needs a rebase by its author or an approved port; do not close or supersede. |
| PR #3 `chore/claude-code-specialists-2026-11` | Draft, mergeable | Agent/skill workspace files. No overlap with this work. |
| PR #4 `g1-harness` | Draft, **conflicts with main** | Its reviewed tree is carried by PR #6 (same tree plus two docs). Leave open; its author can close it once #6 lands. |
| PR #6 `codex/g1-h-main-reconcile-20261117` | Draft, mergeable, one commit on `d6c448a` | Real-music harness (`bench/`), G1 plan, pilot checklist, two-track intake/annotation templates, extended synthetic generator and manifest. **Phase 1 depends on it.** Not merged by this work. |
| Local tag `version-a` | **Does not exist** (audit said it was local and unpushed) | Re-create the baseline tag at `d6c448a` only with approval. |

## 3. Previously identified findings: current status on `main`

Findings are from `docs/TECHNICAL_AUDIT_2026-11-16.md`. "Verified" means I checked the current code or ran it.

| Finding | Status | Evidence |
|---|---|---|
| C1-1 two copies of the app | **Resolved** | one clone; `git ls-files -s` shows 0 gitlinks |
| C1-3 `npm test` cannot fail | **Partly resolved** | Runner propagates exit codes and page errors fail. Only `test21` asserts a result (first downbeat); the other eight print values. |
| C1-4 tempo/beat/downbeat unmeasured | **Resolved for synthetic only** | G0 gates. Real-music harness is in PR #6, with no real data run. |
| C1-5 key scored by same-notes | **Resolved** | `key(exact)` gate; README corrected |
| C1-6 unsupported 808/bass number | **Resolved (claim removed)**; metric **open** | README says "not measured"; no bass scorer on main (PR #6 adds one) |
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

Rule applied throughout: each step is a separate PR, algorithm/UI/architecture changes are not mixed, and the full gate suite (`npm test`, `npm run benchmark`, plus PR #6's `bench:*` once it is the base) runs before and after.

| # | Step | Depends on | Acceptance criteria |
|---|---|---|---|
| 0 | **Decision:** integration route for PR #6 (stack on its branch vs. wait for it to merge) | founder | Written decision recorded here. Nothing else touches `make_test_songs.py` or `tests/metrics.js` before this. |
| 1 | Roadmap and baseline record (this file); optional `baseline-g0` tag | 0 | File reviewed; tag only with approval |
| 2 | **Phase 2a: musical time model, additive.** One `TimeMap` module (seconds ↔ beat/bar/position, meter, tempo hypotheses, uncertainty flag), built from the existing tracked grid; no consumer changed | 0 | Unit tests: round-trip conversion, leading silence, nonzero first downbeat, pickup, drift, tempo change; benchmark output byte-identical |
| 3 | **Phase 2b: extend synthetic fixtures** (leading silence, pickup, half/double ambiguity, drift, tempo change, 3/4 and 6/8, 10-minute track). New seeds, truth files versioned, reported separately from the tuning set | 0, 2a | Fixtures generate deterministically; the current engine's results on them are recorded as the baseline and the known failures are listed, **not** gated up |
| 4 | **Phase 2c: route consumers through `TimeMap`** (sections, chords, drum/bass/melody events, playback overlays), then exports and aligned WAV, restricted to verified constant-tempo 4/4 with disclosed refusal otherwise | 2a, 2b | Paired before/after on all fixtures: exported-grid drift on drift/tempo-change fixtures falls, no existing gate drops, unsupported structures show a visible disclosure instead of being forced to 4/4 |
| 5 | **Phase 2d: corrections.** BPM, meter and downbeat edits recompute or visibly invalidate dependents; corrections stored as `{original, corrected, source:"user"}`; remove hard-coded 99 | 2a | Test: after `retempo`, chords/sections/export match a fresh analysis at that tempo, or are marked stale and not exported |
| 6 | **Small reliability fixes** (can run in parallel with 2–5): job token so stale analyses cannot overwrite newer state; file size and duration limits with clear errors; cancel; object-URL lifetime | none | Playwright tests: second upload during analysis wins; oversized file shows an error and leaves state intact |
| 7 | **Phase 1 completion:** run the two-track rehearsal, then the 12-track development pilot | PR #6 base, **rights-cleared audio and independent annotators (human, blocked)** | Manifest passes `run.js` integrity checks; real baseline report with failure atlas; no accuracy claim until reviewed |
| 8 | Phases 3–10 | 2–7 | Scoped after Phase 2 results; the result-schema (Phase 3) is designed together with `TimeMap` to avoid two migrations |

Deliberately **not** next: UI workspace (Phase 5), comparison rewrite (6) and AI contract (8). They consume the time model and the result schema, so building them first would mean doing them twice. Any third-party model (Beat This!, Basic Pitch, source separation) waits for real-music baselines and the licence review in the brief.

## 5. Roadmap by phase

| Phase | Item | Status |
|---|---|---|
| 0 | Reconcile existing work, baseline, plan | **implemented** (this file; nothing committed) |
| 1 | Synthetic regression gates | implemented (G0) |
| 1 | Real-music harness, integrity checks, mir_eval cross-check | in progress (PR #6, draft, verified locally) |
| 1 | Two-track rehearsal, 12-track pilot, held-out set | **blocked** (rights, annotators) |
| 1 | Bass and melody metrics on real data | in progress (scorers in PR #6; no data) |
| 2 | Authoritative timing model and consumer migration | open |
| 2 | Time-model fixtures | open |
| 2 | Correction-triggered recompute / invalidation | open |
| 3 | Versioned result schema, provenance, calibrated-or-unknown confidence | open |
| 3 | Chord vocabulary, key ambiguity, drum fills, bass octave, quantisation options | open (benchmark-driven) |
| 4 | Analysis-first default page; non-primary features moved, not deleted | open (needs founder approval for placement) |
| 5 | Synchronized timeline workspace | open |
| 6 | Multidimensional comparison replacing closeness score | open |
| 7 | Export validation; IndexedDB persistence with stable IDs and quota errors | open |
| 8 | Evidence/data contract for a future assistant; hide unavailable AI | open |
| 9 | Workers, memory, limits, stale-job guard | open (stale-job guard and limits scheduled as step 6) |
| 10 | Module boundaries, data-model docs | open |
| 11 | Alpha study design | deferred until a pilot-quality analysis exists |
| – | Framework migration (React/Svelte/Next/TypeScript) | **rejected for this assignment** |
| – | Madmom models, Essentia in product | rejected (licence), unless separately licensed |

## 6. Known limits of this Phase 0 record

- I did not read every line of the roughly 2,300 lines of non-analysis UI, the coach, or the Windows-specific parts of the audit.
- The 175 s and 15.7 s timings are one run on one machine, with a warm disk cache; they are not cold/warm app timings.
- Real-music behaviour is unmeasured. Every "open, verified" row above is verified from the code path; its size on real tracks is not.
- Licence statements in the audit were not re-checked in this phase.
