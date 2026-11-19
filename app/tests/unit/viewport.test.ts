// The shared timeline viewport (src/lib/ui/timeline/viewport.svelte.ts): clamping, pixel mapping, zoom anchoring, and "follow".
import { describe, expect, it } from "vitest";
import { TimeViewport } from "../../src/lib/ui/timeline/viewport.svelte";

const vp = (min = 0, max = 100, minSpan = 1) => { const v = new TimeViewport(); v.configure(min, max, minSpan); return v; };

describe("TimeViewport", () => {
  it("keeps the view inside the axis and the span between minSpan and the whole axis", () => {
    const v = vp();
    v.jump(95, 10); expect([v.start, v.span]).toEqual([90, 10]);
    v.jump(-5, 10); expect(v.start).toBe(0);
    v.jump(10, 0.1); expect(v.span).toBe(1);
    v.jump(0, 500); expect([v.start, v.span]).toEqual([0, 100]);
  });

  it("never lets the axis be shorter than minSpan", () => {
    const v = vp(5, 5, 2);
    expect(v.max).toBe(7);
  });

  it("maps time to pixels and back", () => {
    const v = vp(); v.jump(20, 10);
    expect(v.xOf(25, 800)).toBe(400);
    expect(v.tOf(400, 800)).toBe(25);
    expect(v.end).toBe(30);
  });

  it("reveal puts a time a little after the left edge", () => {
    const v = vp(); v.jump(0, 10); v.reveal(50);
    expect(v.start).toBe(49);
    expect(v.contains(50)).toBe(true);
    expect(v.contains(49.5, 0.1)).toBe(false);
  });

  it("zoom keeps the anchor time under the same pixel", () => {
    const v = vp(); v.jump(20, 40);
    const anchor = 30, frac = (anchor - v.start) / v.span;
    v.zoom(0.5, anchor);
    expect(v.span).toBe(20);
    expect((anchor - v.start) / v.span).toBeCloseTo(frac, 9);
  });

  it("manual moves (pan, zoom, fit) stop following playback; programmatic jumps do not", () => {
    const v = vp();
    expect(v.follow).toBe(true);
    v.jump(10); v.reveal(40); expect(v.follow).toBe(true);
    v.pan(5); expect(v.follow).toBe(false);
    v.follow = true; v.zoom(2); expect(v.follow).toBe(false);
    v.follow = true; v.fit(); expect(v.follow).toBe(false);
    expect([v.start, v.span]).toEqual([0, 100]);
  });
});
