// localStorage helpers (src/lib/storage/local.ts): JSON in and out, never throwing, with an explicit "did it save" variant.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KEYS, lsGet, lsSet, lsTrySet } from "../../src/lib/storage/local";
import { FakeStorage } from "./helpers";

let ls: FakeStorage;
beforeEach(() => { ls = new FakeStorage(); vi.stubGlobal("localStorage", ls); });

describe("storage keys", () => {
  it("are the legacy page's keys, so both read each other's saves", () => {
    expect(KEYS).toEqual({ volume: "app_volume_v1", history: "teardown_history_v1" });
  });
});

describe("lsGet", () => {
  it("returns the default when the key is missing", () => { expect(lsGet("k", { a: 1 })).toEqual({ a: 1 }); });
  it("parses stored JSON", () => { ls.setItem("k", JSON.stringify([1, 2])); expect(lsGet("k", [])).toEqual([1, 2]); });
  it("returns the default for unreadable JSON", () => { ls.setItem("k", "{oops"); expect(lsGet("k", "d")).toBe("d"); });
  it("returns the default when storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("SecurityError"); } });
    expect(lsGet("k", 7)).toBe(7);
  });
});

describe("lsSet and lsTrySet", () => {
  it("lsTrySet writes JSON and reports success", () => { expect(lsTrySet("k", { v: 1 })).toBe(true); expect(ls.getItem("k")).toBe('{"v":1}'); });
  it("lsTrySet reports a full storage instead of throwing", () => { ls.limit = 3; expect(lsTrySet("k", { v: 1 })).toBe(false); expect(ls.getItem("k")).toBeNull(); });
  it("lsSet never throws, even when the write fails", () => { ls.limit = 3; expect(() => lsSet("k", { v: 1 })).not.toThrow(); expect(ls.getItem("k")).toBeNull(); });
});
