// Types for the canonical ../../../../src/domain.js (imported as "$domain"): the module exports a factory.
// The domain functions were written for the untyped legacy page; their parameters stay loosely typed here. Only the names this app
// uses are listed; src/domain.js exports more (the legacy page uses them).
import type { Engine } from "../engine/engine-module";
import type { TimingStoreModule } from "../persistence/timing-store-module";
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Fn = (...args: any[]) => any;
export interface Domain {
  // data
  BANDS: string[]; COLORS: Record<string, string>;
  // time and keys
  fmtT: (s: number) => string; tdId: (a: any) => string; fixSectionTimes: Fn; transcriptionFromNotes: Fn; keyInfo: Fn; keyChords: Fn; chordNotes: Fn; chordFromDegree: Fn; recomputeLoop: Fn;
  // drum steps
  posOf: Fn; stepsText: Fn;
  // corrections
  applyKey: Fn; applyTempo: Fn; applyMeter: Fn; recordCorrection: Fn; forcedOf: (a: any) => { bpm?: number; downbeatShift?: number }; staleReasons: (a: any) => string[];
  // detected notes and exports
  songNotes: Fn; songMidiFiles: Fn; zipStore: (files: { name: string; data: Uint8Array }[]) => Uint8Array; alignedWav: Fn;
}
declare function createDomain(deps: { TimingStore: TimingStoreModule; engine: Engine }): Domain;
export default createDomain;
