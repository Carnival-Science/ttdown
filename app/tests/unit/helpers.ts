// Shared fixtures for the unit tests: an in-memory Storage with an optional size limit, and synthetic analysis results shaped like
// the engine's (enumerable fields plus the non-enumerable tracked `grid` and decoded `__buf`).
/* eslint-disable @typescript-eslint/no-explicit-any */

/** A localStorage stand-in. `limit` caps the length of any single stored value, like the browser tests' fake quota. */
export class FakeStorage {
  private m = new Map<string, string>();
  limit = Infinity;
  writes = 0;
  failRemove = false;
  getItem(k: string): string | null { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string): void {
    const s = String(v);
    if (s.length > this.limit) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; }
    this.m.set(k, s); this.writes++;
  }
  removeItem(k: string): void { if (this.failRemove) throw new Error("blocked"); this.m.delete(k); }
  clear(): void { this.m.clear(); }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  get length(): number { return this.m.size; }
}

/** Beat times for a steady tempo, from `firstDown` to the end. */
export function steadyBeats(bpm: number, duration: number, firstDown = 0): { beats: number[]; downbeats: number[] } {
  const beats: number[] = [], downbeats: number[] = [], step = 60 / bpm;
  for (let k = 0; firstDown + k * step < duration; k++) {
    const t = +(firstDown + k * step).toFixed(4); beats.push(t); if (k % 4 === 0) downbeats.push(t);
  }
  return { beats, downbeats };
}

/** A synthetic analysis result. `beats` gives it a tracked grid; without it, it has none (the constant-tempo fallback). */
export function analysis(title: string, o: { duration?: number; bpm?: number; firstDown?: number; beats?: { beats: number[]; downbeats: number[] } | null; extra?: Record<string, unknown> } = {}): any {
  const duration = o.duration ?? 60, bpm = o.bpm ?? 120, firstDown = o.firstDown ?? 0;
  const a: any = { title, duration, bpm, barSec: 240 / bpm, firstDown, bpmConf: 0.9, sections: [{ label: "A", startBar: 0, bars: 8 }], ...(o.extra || {}) };
  const g = o.beats === undefined ? steadyBeats(bpm, duration, firstDown) : o.beats;
  if (g) Object.defineProperty(a, "grid", { value: { source: "dp-tracker", beats: g.beats, downbeats: g.downbeats }, enumerable: false, configurable: true });
  Object.defineProperty(a, "__buf", { value: { fakeDecodedAudio: true }, enumerable: false, configurable: true });
  return a;
}
