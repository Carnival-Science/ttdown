// Types for the canonical ../../../../src/timing-store.js (imported as "$timingstore"). Contract: docs/PERSISTENCE.md.
import type { AnalysisResult } from "../engine/types";
export type AttachStatus = "none" | "tracked" | "invalid" | "newer-version";
export interface TimingStoreModule {
  readonly VERSION: number;
  readonly MAX_BEATS: number;
  check(t: unknown): { ok: boolean; status: AttachStatus; reason: string | null; grid: unknown };
  /** The record to write: the result plus `timing`; never `grid` or `__buf`. */
  forStorage(a: AnalysisResult): AnalysisResult;
  ensure(a: AnalysisResult): AnalysisResult;
  /** After reading: attaches the non-enumerable `grid` when `timing` is valid. Never throws. */
  attach(record: AnalysisResult): { status: AttachStatus; reason: string | null };
  size(record: unknown): number;
}
declare const TimingStore: TimingStoreModule;
export default TimingStore;
