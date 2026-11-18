// The musical grid for a teardown (port of the legacy page's gridOf(), index.html): TimeMap.forAnalysis() from the canonical
// TimeMap, cached per result object and recomputed when the tempo, bar length, first downbeat, duration or BPM confidence change.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { TimeMap } from "../timemap";

export interface Grid { kind: string; reason?: string | null; tracked: boolean; label: string; barStart(b: number): number; barOf(t: number): number; isExtrapolated(t: number): boolean; beats(from: number, to: number): { t: number; bar: number; beat: number; downbeat: boolean }[] }
const GRIDS = new WeakMap<object, { sig: string; g: Grid }>();
export function gridOf(a: any): Grid {
  const sig = [a.bpm, a.barSec, a.firstDown, a.duration, a.bpmConf].join("|"), hit = GRIDS.get(a);
  if (hit && hit.sig === sig) return hit.g;
  let g: Grid;
  try { g = TimeMap.forAnalysis(a) as Grid; }
  catch {
    const fd = a.firstDown || 0, bs = a.barSec;
    g = { kind: "legacy", reason: "TimeMap unavailable", tracked: false, label: "Bars use one constant tempo.", barStart: b => fd + b * bs, barOf: t => Math.floor((t - fd) / bs), isExtrapolated: () => true,
      beats: (from, to) => { const beat = 60 / a.bpm, out = []; for (let k = Math.ceil((from - fd) / beat); fd + k * beat < to; k++) out.push({ t: fd + k * beat, bar: Math.floor(k / 4), beat: ((k % 4) + 4) % 4 + 1, downbeat: ((k % 4) + 4) % 4 === 0 }); return out; } };
  }
  GRIDS.set(a, { sig, g }); return g;
}
