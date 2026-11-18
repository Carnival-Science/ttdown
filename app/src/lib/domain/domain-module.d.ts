// Types for the canonical ../../../../src/domain.js (imported as "$domain"): the module exports a factory.
// The domain functions were written for the untyped legacy page; their parameters stay loosely typed here. The names
// are the contract: every name below is exported by src/domain.js (checked by the smoke test).
import type { Engine } from "../engine/engine-module";
import type { TimingStoreModule } from "../persistence/timing-store-module";
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Fn = (...args: any[]) => any;
export interface Domain {
  BANDS: string[]; REF: number[]; GENRES: Record<string, any>; COLORS: Record<string, string>; MIX_EX: Record<string, string>; MIX_SHEET: string[][];
  SNARE_EX: any; STYLES: any; KIT: any; KIT_SLOTS: any; KIND_NAME: Record<string, string>; PART_NAMES: Record<string, string>; LIB: any[];
  SECTION_HOW: Record<string, string>; COACH_SETUP: string; STYPES: string[]; SFOLDER: Record<string, string>; STIP: Record<string, string>;
  SHORTCUTS: [string, [string, string][]][]; CAMPAIGN: any[]; EXAMPLE: any; IDEAS: { id: string | null; style: string; weird: number; [k: string]: any };
  genreOf: Fn; mixNotes: Fn; hatFeel: Fn; posOf: Fn; posList: Fn; stepsText: Fn; fmtT: (s: number) => string; fixSectionTimes: Fn; rnd: Fn; flNote: Fn;
  B16: Fn; idxOf: Fn; keyInfo: Fn; is808: Fn; chordFromDegree: Fn; genChords: Fn; genDrums: Fn; genBass: Fn; genMelody: Fn; genChop: Fn;
  genArrangement: Fn; drumBar: Fn; midiBytes: (notes: any[], bpm: number) => Uint8Array; zipStore: (files: { name: string; data: Uint8Array }[]) => Uint8Array;
  ideaMidiFiles: Fn; noteList: Fn; wText: Fn; makeIdeas: Fn; alignedWav: Fn; songMidiFiles: Fn; partScores: Fn; recomputeLoop: Fn; loudestIdx: Fn;
  swingText: Fn; shareData: Fn; sampleList: Fn; moodTags: Fn; chordNotes: Fn; keyChords: Fn; compress: Fn; applyKey: Fn; applyTempo: Fn;
  compare: Fn; coachData: Fn; suggestName: Fn; keyFit: Fn; shelfId: Fn; K: Fn; dayStr: (d: Date) => string; logStats: Fn; tdId: (a: any) => string;
  songNotes: Fn; buildPlan: Fn; analyzeSample: Fn; reviewHtml: Fn;
}
declare function createDomain(deps: { TimingStore: TimingStoreModule; engine: Engine }): Domain;
export default createDomain;
