# Saved teardowns: persisting tracked timing

**Contract for every consumer** of saved teardowns (the current page and the Svelte application). Implemented once, in `src/timing-store.js` (framework-free, no DOM, no storage, no TimeMap dependency). The page carries an inlined copy kept in sync by `npm run sync:timemap`; `npm test` fails if they differ.

## Why

A fresh analysis holds the tracker's beats as a non-enumerable `grid`. Saving used to drop it, so a reopened teardown could only offer a labelled constant-tempo fallback, and a drifting track showed tracked section times beside a constant-tempo ruler. A saved analysis should be as musically meaningful as a fresh one.

## What is persisted

One additive field on the existing record (storage key `teardown_history_v1`, document ids `td-<title>-<duration>`, and every existing field are unchanged):

```
timing: {
  v: 1,                                   schema version
  source: "tracker", engine: "dp-tracker",
  beats: [seconds], downbeats: [seconds],
  meter: { beatsPerBar: 4, status: "assumed", source: "analyzer-assumption" },
  basis: { bpm, barSec, firstDown, duration }   what the tracker measured (kept after a user tempo correction)
}
timingCorrections: [{ type: "bpm", from, to, source: "user", at }]    on the record itself, never inside the measurement
```

| Data | Persisted |
|---|---|
| Tracked beats, downbeats | yes (measured: 7 KB for a 225-beat record, 14 KB for a 7-minute, 898-beat record; 12 history entries is about 170 KB) |
| Meter and its provenance | yes (`assumed` until a person confirms it; confirmations will be `timingCorrections`) |
| Timing corrections | yes |
| Schema version | yes |
| Decoded audio buffer, audio URL | **never** (tested; stripped even if they were enumerable) |
| TimeMap instances, derived rendering data | no: TimeMap is rebuilt from the beats |

## Reading

`TimingStore.attach(record)` validates `record.timing` and, if valid, attaches the non-enumerable `grid` the page expects. Statuses: `none` (no timing: every record saved before this change, which keeps working with the labelled fallback), `tracked`, `invalid` (with a reason: not an object, no version, too few or too many beats, beats not increasing numbers, out of range or past the end of the audio, a downbeat that is not a tracked beat, bad meter, bad basis) and `newer-version`. It never throws. An unreadable or newer block is **left in the record untouched** (re-saving does not destroy it) and the page falls back, labelled.

## Corrections win over measurements

Every correction is a record in `timingCorrections`: `{ type, from, to, source: "user", at, ... }` with types `bpm`, `key`, `downbeat` (`shift`, in beats), `meter`, `chord` (`bar`) and `drum` (`lane`, `step`). `from` is the original value, kept for good (repeated edits of one chord or step keep the first); the measured `bpmConf` and `keyConf` are never overwritten. What depends on a corrected value is then either **recomputed** or **invalidated** (docs/ROADMAP.md section 9):

- **With the audio, a tempo or bar-1 correction analyses the track again** with that value fixed (`forcedOf` reads it from the records; `recomputed: true` marks the entry). The saved record is then the new analysis: `timing` holds the beats tracked at that tempo, and the original tempo lives in the first `bpm` entry's `from`. Nothing is stale. Chord and drum edits made before it are dropped; a key the user set is kept.
- **Without the audio, a tempo correction invalidates**: it sets `bpmFixed`, keeps the original `basis` and beats, and drops the `tracked` marker from every section so their times are recomputed from the corrected bars. The restored grid is not used while the correction stands (`TimeMap.forAnalysis` reports `bpm-corrected-by-user`), the drum pattern, chords and notes are marked out of date and the bar-aligned exports are blocked.
- `meter` (`notFourFour: true`) invalidates the same way and is reversible.

## Storage failures are never silent

If the browser is full, the teardown is saved **without** its tracked beats and the user is told it will reopen with a constant-tempo ruler. If even that does not fit, nothing is written, earlier saved teardowns stay exactly as they were, and the user is told. Older history entries are never dropped or stripped to make room.

## Known limits

Records saved by the intermediate build between the sections change and this one carry tracked section times but no beats, so their ruler is the labelled fallback. Account-sync documents carry the same record. The meter is still the analyzer's assumption; there is no confirmation UI yet. Tempo correction by x2 and /2 or tapping still uses the old section-bar rounding (which ignores `firstDown`); unchanged here.

## For the Svelte migration

Import `TimingStore` from `src/timing-store.js` as is (UMD: `require` or global). Do not reimplement the schema. Keep the storage key and the record shape; call `forStorage(analysis)` to write and `attach(record)` after reading. `tests/timing-store.test.js` and `tests/test31.js` are the executable specification.
