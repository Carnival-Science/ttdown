// The musical grid and time <-> position maths (src/lib/timeline/grid.ts, position.ts), on constant-tempo, offset and drifting tracks.
import { describe, expect, it, vi } from "vitest";
import { gridOf } from "../../src/lib/timeline/grid";
import { barBeat, barTicks, beatAt, gridLines, timeAtBeat } from "../../src/lib/timeline/position";
import { TimeMap } from "../../src/lib/timemap";
import { analysis, steadyBeats } from "./helpers";

/** Beats whose spacing shrinks steadily (the tempo rises from about 116 to 124 BPM). */
function driftingBeats(duration: number) {
  const beats: number[] = [], downbeats: number[] = []; let t = 0, k = 0;
  while (t < duration) { const v = +t.toFixed(4); beats.push(v); if (k % 4 === 0) downbeats.push(v); t += 60 / (116 + 8 * (t / duration)); k++; }
  return { beats, downbeats };
}

describe("gridOf", () => {
  it("builds a tracked grid from the tracker's beats", () => {
    const a = analysis("T"), G = gridOf(a);
    expect(G.tracked).toBe(true);
    expect(G.kind).toBe("tracked");
    expect(G.barStart(1)).toBeCloseTo(2, 6); // 120 BPM: 2 s per bar
  });

  it("falls back to a labelled constant-tempo grid without tracked beats", () => {
    const G = gridOf(analysis("F", { beats: null }));
    expect(G.tracked).toBe(false);
    expect(G.label).toMatch(/constant tempo/);
    expect(G.barStart(3)).toBeCloseTo(6, 6);
  });

  it("is cached per result and recomputed when the tempo changes", () => {
    const a = analysis("C", { beats: null }), g1 = gridOf(a);
    expect(gridOf(a)).toBe(g1);
    a.bpm = 60; a.barSec = 4;
    const g2 = gridOf(a);
    expect(g2).not.toBe(g1);
    expect(g2.barStart(1)).toBeCloseTo(4, 6);
  });

  it("uses a labelled legacy grid if the TimeMap cannot be built", () => {
    vi.spyOn(TimeMap, "forAnalysis").mockImplementation(() => { throw new Error("boom"); });
    const G = gridOf(analysis("L", { beats: null, firstDown: 0.5 }));
    expect(G.kind).toBe("legacy");
    expect(G.tracked).toBe(false);
    expect(G.barStart(2)).toBeCloseTo(4.5, 6);
    expect(G.barOf(4.6)).toBe(2);
    expect(G.beats(0.5, 2.5).map(b => b.downbeat)).toEqual([true, false, false, false]);
  });
});

describe("position maths", () => {
  it("beatAt and timeAtBeat are inverse on a steady grid", () => {
    const a = analysis("S"), G = gridOf(a);
    expect(beatAt(G, a, 0.5)).toBeCloseTo(1, 6);
    expect(timeAtBeat(G, a, 4)).toBeCloseTo(2, 6);
    for (const t of [0, 1.25, 7.3, 41.9]) expect(timeAtBeat(G, a, beatAt(G, a, t))).toBeCloseTo(t, 6);
  });

  it("follows a drifting tempo instead of a fixed bar length", () => {
    const a = analysis("D", { beats: driftingBeats(60) }), G = gridOf(a), grid = Object.getOwnPropertyDescriptor(a, "grid")!.value;
    expect(G.tracked).toBe(true);
    for (const t of [3.1, 22.4, 55.5]) expect(timeAtBeat(G, a, beatAt(G, a, t))).toBeCloseTo(t, 4);
    expect(timeAtBeat(G, a, 100)).toBeCloseTo(grid.beats[100], 4); // beat 100 lands on the tracked beat, not on 100 * constant spacing
  });

  it("barBeat is 1-based, fractional within the bar, and null before bar 1", () => {
    const a = analysis("O", { firstDown: 1, beats: steadyBeats(120, 60, 1) }), G = gridOf(a);
    expect(barBeat(G, a, 1)).toEqual({ bar: 1, beat: 1 });
    const p = barBeat(G, a, 3.25)!;
    expect(p.bar).toBe(2);
    expect(p.beat).toBeCloseTo(1.5, 6);
    expect(barBeat(G, a, 0.5)).toBeNull();
  });

  it("gridLines draws bar lines (every 4th major) and adds beat lines only when zoomed in", () => {
    const a = analysis("G", { duration: 600 }), G = gridOf(a);
    const near = gridLines(G, a, 0, 8), bars = near.filter(l => l.major !== undefined), beats = near.filter(l => l.major === undefined);
    expect(bars.map(l => +l.t.toFixed(3))).toEqual([0, 2, 4, 6, 8]);
    expect(bars.map(l => l.major)).toEqual([true, false, false, false, true]);
    expect(beats.length).toBe(12);
    const far = gridLines(G, a, 0, 120);
    expect(far.every(l => l.major !== undefined)).toBe(true);
    expect(gridLines(G, a, 0, 2000)).toEqual([]); // more than 400 bars: nothing rather than thousands of lines
  });

  it("barTicks labels bars from 1 and thins them out so labels never collide", () => {
    const a = analysis("R", { duration: 240 }), G = gridOf(a);
    const wide = barTicks(G, a, 0, 32, 1600);
    expect(wide[0]).toMatchObject({ label: "1", attrs: { "data-bar": "0" } });
    expect(wide.map(t => t.label).slice(0, 4)).toEqual(["1", "2", "3", "4"]);
    const narrow = barTicks(G, a, 0, 240, 300), step = +narrow[1]!.label - +narrow[0]!.label;
    expect(step).toBeGreaterThan(1);
    expect((300 / 120) * step).toBeGreaterThanOrEqual(34); // at least 34 px between labels (120 bars across 300 px)
    expect(narrow.every(t => t.t >= -0.01 && t.t <= 240)).toBe(true);
  });

  it("marks ticks past the tracked beats as extrapolated (dashed), but never on a fallback grid", () => {
    const tracked = analysis("E", { duration: 60, beats: steadyBeats(120, 30) }), G = gridOf(tracked);
    const ticks = barTicks(G, tracked, 0, 60, 2000);
    expect(ticks.filter(t => t.t < 28).every(t => !t.dashed)).toBe(true);
    expect(ticks.filter(t => t.t > 32).every(t => t.dashed)).toBe(true);
    const fb = analysis("N", { beats: null }), F = gridOf(fb);
    expect(barTicks(F, fb, 0, 60, 2000).some(t => t.dashed)).toBe(false);
  });
});
