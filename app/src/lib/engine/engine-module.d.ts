// Types for the canonical ../../../../src/engine.js (imported as "$engine"): the module exports a factory.
import type { TimeMapModule } from "../timemap/timemap-module";
import type { AnalysisResult, Transcription, Section } from "./types";

export interface InputLimits { maxFileBytes: number; rhythmSeconds: number; maxSeconds: number; minSeconds: number; silentPeak: number }
export interface AnalysisStats { checkpoints: number; aborted: number }
/** What a person corrected, held fixed in a re-analysis: the tempo, and how many beats bar 1 was moved. */
export interface Forced { bpm?: number; downbeatShift?: number }
export interface Engine {
  analyze(file: File, onProgress: (pct: number, msg: string) => void, compare?: boolean, signal?: AbortSignal, forced?: Forced): Promise<AnalysisResult>;
  /** Check a file against the input limits and decode it (needs a page). analyze() is decode() then analyzeDecoded(). */
  decode(file: File, onProgress: (pct: number, msg: string) => void, signal?: AbortSignal): Promise<AudioBuffer>;
  /** The analysis of audio that is already decoded: used to analyse again, with `forced`, after a correction. */
  analyzeDecoded(buffer: AudioBuffer, onProgress: (pct: number, msg: string) => void, compare?: boolean, signal?: AbortSignal, forced?: Forced): Promise<AnalysisResult>;
  tick(): Promise<void>;
  transcribe(x: Float32Array, SR: number, firstDown: number, barSec: number, sections: Section[], tune: number): { hook: Transcription | null; bass: Transcription | null };
  mag(x: Float32Array, off: number, n: number, out: Float32Array): void;
  detrend(e: Float32Array | number[], w: number): Float32Array;
  acfAt(x: Float32Array, maxLag: number): Float32Array;
  readonly NAMES: readonly string[];
  readonly CAM_MAJ: readonly string[];
  readonly CAM_MIN: readonly string[];
  readonly LIMITS: Readonly<InputLimits>;
  InputLimitError: new (msg: string) => Error;
  fmtLen(s: number): string;
  readonly ANALYSIS_STATS: AnalysisStats;
}
declare function createEngine(deps: { TimeMap: TimeMapModule }): Engine;
export default createEngine;
