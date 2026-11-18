// The analysis result, as produced by src/engine.js (analyze) and saved in history. Hand-written from the engine's result
// literal; keep in step with it. Enumerable fields only: `grid` and `__buf` are deliberately NOT declared here, so nothing can
// depend on them through spreading, JSON or reactive proxies. Read them only with gridOf()/bufferOf() (./index.ts).
export type Steps16 = boolean[];
export interface Note { step?: number; t?: number; dur?: number; len?: number; midi: number; vel?: number; [k: string]: unknown }
export interface Section { label: string; startBar: number; bars: number; start: number; end: number; timing?: "tracked" }
export interface DrumPattern { kick: Steps16; snare: Steps16; hats: Steps16; ghost?: { snare: Steps16; hats: Steps16 }; vel?: unknown; freq?: unknown; bars?: unknown; tracked?: boolean }
export interface Rhythm { fourFloor: boolean; kickPerBar: number; hatDiv: number; lowPulse: number; busy: number }
export interface AltKey { key: string; camelot: string; gap: number }
export interface Chords { bars: (string | null)[] | unknown[]; loop: string[] | null; loopCount: number }
export interface Transcription { notes: Note[]; from: string; bar: number }
export interface TrackedGrid { source: string; beats: number[]; downbeats: number[] }
export interface TimingCorrection { type: "bpm" | string; from: number; to: number; source: "user"; at: string }

export interface AnalysisResult {
  title: string;
  duration: number;
  bpm: number; bpmConf: number;
  key: string; camelot: string; keyConf: number; relKey: string; altKeys?: AltKey[]; bassNote?: string;
  chords?: Chords;
  firstDown: number; barSec: number; nBars: number;
  pattern: DrumPattern; rhythm: Rhythm; swing?: unknown; drumParts?: unknown; steady?: unknown;
  sections: Section[];
  hook?: Transcription | null; bassline?: Transcription | null;
  balance: number[]; width: number; loudRms: number; crest: number; peakDb: number;
  // user edits and persistence (legacy fields, kept as they are)
  keyFixed?: boolean; patternEdited?: boolean; bpmFixed?: boolean;
  timing?: unknown; timingCorrections?: TimingCorrection[];
  [extra: string]: unknown;
}
