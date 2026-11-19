// The engine entry's accessors (src/lib/engine/index.ts): the tracked grid and the decoded audio are non-enumerable, so they are
// read through these helpers and survive replacement-style updates without ever being serialized.
import { describe, expect, it } from "vitest";
import { bufferOf, gridOf, withHidden } from "../../src/lib/engine";
import { analysis } from "./helpers";

describe("engine accessors", () => {
  it("read the non-enumerable grid and buffer, and tolerate a missing result", () => {
    const a = analysis("A");
    expect(gridOf(a)?.beats.length).toBeGreaterThan(100);
    expect(bufferOf(a)).toEqual({ fakeDecodedAudio: true });
    expect(gridOf(null)).toBeUndefined();
    expect(bufferOf(undefined)).toBeUndefined();
  });

  it("withHidden carries the same grid and buffer over to a new object, still non-enumerable", () => {
    const a = analysis("A"), next = withHidden(a, { ...a, bpm: 121 });
    expect(gridOf(next)).toBe(gridOf(a));
    expect(bufferOf(next)).toBe(bufferOf(a));
    expect(Object.keys(next)).not.toContain("grid");
    expect(JSON.stringify(next)).not.toMatch(/fakeDecodedAudio|"grid"/);
  });
});
