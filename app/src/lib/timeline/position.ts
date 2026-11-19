// Time <-> musical position through the TimeMap grid (not a fixed bar length), so tracks with a changing tempo play and show correctly.
// Playback and export eligibility are separate concerns: a track whose export is refused still plays, and its playhead moves.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Grid } from "./grid";

const beatsPerBar = (G: any) => G.beatsPerBar || (G.map && G.map.meter && G.map.meter.beatsPerBar) || 4;
// The map counts beats from its own origin; bar 1 starts `barOffset` bars later (G.barStart applies the same offset).
const offBeats = (G: any) => (G.barOffset || 0) * beatsPerBar(G);
/** Beat coordinate (0 = beat 1 of bar 1) at a time. */
export function beatAt(G: Grid, a: any, t: number): number {
  const m = (G as any).map; if (m && m.timeToBeat) return m.timeToBeat(t) - offBeats(G);
  return (t - (a.firstDown || 0)) / (a.barSec / 4);
}
/** Time of a beat coordinate. */
export function timeAtBeat(G: Grid, a: any, q: number): number {
  const m = (G as any).map; if (m && m.beatToTime) return m.beatToTime(q + offBeats(G));
  return (a.firstDown || 0) + q * (a.barSec / 4);
}
/** The bar (1-based) and beat (1-based, fractional) at a time, or null before bar 1. */
export function barBeat(G: Grid, a: any, t: number): { bar: number; beat: number } | null {
  const n = beatsPerBar(G), q = beatAt(G, a, t); if (!(q >= 0)) return null;
  const bar = Math.floor(q / n); return { bar: bar + 1, beat: 1 + (q - bar * n) };
}
/** Grid lines for a stretch of time: bars (every `every`-th one major) and, when zoomed in, beats. */
export function gridLines(G: Grid, a: any, from: number, to: number): { t: number; major?: boolean }[] {
  const out: { t: number; major?: boolean }[] = [], n = beatsPerBar(G), q0 = Math.floor(beatAt(G, a, from) / n) - 1, q1 = Math.ceil(beatAt(G, a, to) / n) + 1, bars = q1 - q0;
  if (bars > 400) return out;
  for (let b = Math.max(0, q0); b <= q1; b++) { const t = G.barStart(b); if (t >= from - 0.01 && t <= to + 0.01) out.push({ t, major: b % 4 === 0 }); }
  if (bars <= 10) for (let q = Math.max(0, q0 * n); q <= q1 * n; q++) { if (q % n === 0) continue; const t = timeAtBeat(G, a, q); if (t >= from && t <= to) out.push({ t }); }
  return out;
}
/** Ruler ticks (bar numbers) for a stretch: dense enough to read, sparse enough not to collide. */
export function barTicks(G: Grid, a: any, from: number, to: number, widthPx: number): { t: number; label: string; dashed?: boolean; attrs: Record<string, string> }[] {
  const n = beatsPerBar(G), q0 = Math.floor(beatAt(G, a, from) / n), q1 = Math.ceil(beatAt(G, a, to) / n), bars = Math.max(1, q1 - q0), perPx = widthPx / bars;
  const every = [1, 2, 4, 8, 16, 32].find(e => perPx * e >= 34) ?? 64, out: { t: number; label: string; dashed?: boolean; attrs: Record<string, string> }[] = [];
  for (let b = Math.max(0, Math.floor(q0 / every) * every); b <= q1; b += every) {
    const t = G.barStart(b); if (t < from - 0.01 || t > to) continue;
    out.push({ t, label: String(b + 1), dashed: G.tracked && G.isExtrapolated(t), attrs: { "data-bar": String(b) } });
  }
  return out;
}
