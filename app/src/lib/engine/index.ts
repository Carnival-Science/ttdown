// The app's only entry to the analysis engine: the canonical src/engine.js, created with the canonical TimeMap.
// No analysis code lives in app/. Results are plain objects; `grid` (tracked beats) and `__buf` (decoded audio) are
// non-enumerable properties set by the engine, read only through these accessors.
import createEngine from "$engine";
import { TimeMap } from "../timemap";
import type { AnalysisResult, TrackedGrid } from "./types";

export type * from "./types";
export type { Engine, InputLimits, AnalysisStats } from "./engine-module";
export const engine = createEngine({ TimeMap });

export function gridOf(r: AnalysisResult | null | undefined): TrackedGrid | undefined {
  return r ? (Object.getOwnPropertyDescriptor(r, "grid")?.value as TrackedGrid | undefined) : undefined;
}
export function bufferOf(r: AnalysisResult | null | undefined): AudioBuffer | undefined {
  return r ? (Object.getOwnPropertyDescriptor(r, "__buf")?.value as AudioBuffer | undefined) : undefined;
}
/** A copy of `r` with its enumerable fields and the SAME non-enumerable grid/__buf (for replacement-style updates). */
export function withHidden<T extends AnalysisResult>(from: AnalysisResult, next: T): T {
  for (const k of ["grid", "__buf"] as const) {
    const d = Object.getOwnPropertyDescriptor(from, k);
    if (d) Object.defineProperty(next, k, { value: d.value, enumerable: false, configurable: true });
  }
  return next;
}
