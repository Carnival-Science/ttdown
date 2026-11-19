// Saved teardowns (src/lib/storage/data.ts): what is written, the storage-full fallback, and that earlier saves are never damaged.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearHist, deleteHist, loadHist, saveHist } from "../../src/lib/storage/data";
import { KEYS } from "../../src/lib/storage/local";
import { FakeStorage, analysis } from "./helpers";

let ls: FakeStorage;
const raw = () => ls.getItem(KEYS.history);
const stored = () => JSON.parse(raw() || "[]");

beforeEach(() => { ls = new FakeStorage(); vi.stubGlobal("localStorage", ls); });

describe("saveHist", () => {
  it("saves a record with versioned tracked timing and nothing from the decoded audio", () => {
    const a = analysis("Song A");
    expect(saveHist(a)).toEqual({ note: "", bad: false });
    const [rec] = stored();
    expect(rec.title).toBe("Song A");
    expect(rec.timing.v).toBe(1);
    expect(rec.timing.beats).toEqual(Object.getOwnPropertyDescriptor(a, "grid")!.value.beats);
    expect(raw()).not.toMatch(/__buf|fakeDecodedAudio/);
    expect(rec).not.toHaveProperty("grid");
  });

  it("does not modify the live analysis it saves", () => {
    const a = analysis("Song A"), before = JSON.stringify(a);
    saveHist(a);
    expect(JSON.stringify(a)).toBe(before);
    expect(Object.keys(a)).not.toContain("timing");
  });

  it("puts the newest save first and replaces a save with the same title and duration", () => {
    saveHist(analysis("One")); saveHist(analysis("Two")); saveHist(analysis("One", { extra: { note: "again" } }));
    const list = stored();
    expect(list.map((r: { title: string }) => r.title)).toEqual(["One", "Two"]);
    expect(list[0].note).toBe("again");
  });

  it("keeps two saves with the same title but different durations", () => {
    saveHist(analysis("Same", { duration: 60 })); saveHist(analysis("Same", { duration: 90 }));
    expect(stored()).toHaveLength(2);
  });

  it("keeps at most 12 saves, dropping the oldest", () => {
    for (let i = 0; i < 13; i++) saveHist(analysis("Song " + i, { duration: 30 }));
    const titles = stored().map((r: { title: string }) => r.title);
    expect(titles).toHaveLength(12);
    expect(titles[0]).toBe("Song 12");
    expect(titles).not.toContain("Song 0");
  });

  it("when storage is nearly full, saves the new teardown without its beats or chord regions and says so; the earlier save is untouched", () => {
    saveHist(analysis("Earlier", { duration: 30 }));
    const earlier = raw()!, next = analysis("Next", { duration: 30, extra: { chordRegions: [{ t: 0, end: 4, name: "Am" }, { t: 4, end: 8, name: "F" }] } });
    const leanLen = JSON.stringify({ ...JSON.parse(JSON.stringify(next)), timing: undefined, chordRegions: undefined }).length;
    ls.limit = earlier.length + leanLen + 50; // room for the new record without its beats and chord regions, not with them
    const attempts = ls.attempts, r = saveHist(next);
    expect(r.bad).toBe(false);
    expect(r.note).toMatch(/without its tracked beats/);
    expect(ls.attempts - attempts).toBe(2); // the full record, then the lean one
    const list = stored();
    expect(list.map((x: { title: string }) => x.title)).toEqual(["Next", "Earlier"]);
    expect(list[0]).not.toHaveProperty("timing");
    expect(list[0]).not.toHaveProperty("chordRegions");
    expect(JSON.stringify(list[1])).toBe(JSON.stringify(JSON.parse(earlier)[0]));
  });

  it("a teardown with chord regions but no tracked beats is also retried without them", () => {
    saveHist(analysis("Earlier", { duration: 30, beats: null }));
    const earlier = raw()!, next = analysis("Next", { duration: 30, beats: null, extra: { chordRegions: Array.from({ length: 40 }, (_, i) => ({ t: i, end: i + 1, name: "C" })) } });
    const leanLen = JSON.stringify({ ...JSON.parse(JSON.stringify(next)), chordRegions: undefined }).length;
    ls.limit = earlier.length + leanLen + 50;
    const attempts = ls.attempts, r = saveHist(next);
    expect(r.bad).toBe(false);
    expect(ls.attempts - attempts).toBe(2);
    expect(stored()[0]).not.toHaveProperty("chordRegions");
  });

  it("when nothing fits, reports an error and leaves storage byte-for-byte unchanged", () => {
    saveHist(analysis("Earlier"));
    const before = raw(); ls.limit = 10;
    const r = saveHist(analysis("Next"));
    expect(r.bad).toBe(true);
    expect(r.note).toMatch(/Couldn't save this teardown/);
    expect(r.note).toMatch(/not changed/);
    expect(raw()).toBe(before);
  });

  it("a teardown with neither tracked beats nor chord regions gets exactly one attempt, then the error", () => {
    ls.limit = 10;
    const attempts = ls.attempts, writes = ls.writes, r = saveHist(analysis("No grid", { beats: null }));
    expect(r.bad).toBe(true);
    expect(ls.attempts - attempts).toBe(1); // nothing to leave out, so no lean retry (counts refused writes too)
    expect(ls.writes).toBe(writes);
  });
});

describe("loadHist", () => {
  it("returns [] when nothing is saved", () => { expect(loadHist()).toEqual([]); });

  it("re-attaches the tracked beats as a non-enumerable grid", () => {
    const a = analysis("Song A"); saveHist(a);
    const [rec] = loadHist(), d = Object.getOwnPropertyDescriptor(rec, "grid");
    expect(d?.enumerable).toBe(false);
    expect(d?.value.beats).toEqual(Object.getOwnPropertyDescriptor(a, "grid")!.value.beats);
    expect(JSON.stringify(rec)).not.toMatch(/"grid"/);
  });

  it("leaves a record with invalid timing without a grid, and does not rewrite storage", () => {
    saveHist(analysis("Bad"));
    const list = stored(); list[0].timing.beats[3] = "x"; ls.setItem(KEYS.history, JSON.stringify(list));
    const before = raw(), writes = ls.writes;
    const [rec] = loadHist();
    expect(Object.getOwnPropertyDescriptor(rec, "grid")).toBeUndefined();
    expect(raw()).toBe(before);
    expect(ls.writes).toBe(writes);
  });

  it("returns [] for unreadable JSON and does not overwrite it", () => {
    ls.setItem(KEYS.history, "{not json");
    expect(loadHist()).toEqual([]);
    expect(raw()).toBe("{not json");
  });
});

describe("deleteHist and clearHist", () => {
  it("deletes only the save with the same title and duration", () => {
    saveHist(analysis("Keep", { duration: 30 })); saveHist(analysis("Drop", { duration: 30 })); saveHist(analysis("Drop", { duration: 45 }));
    expect(deleteHist(analysis("Drop", { duration: 30 }))).toBe(true);
    expect(stored().map((r: { title: string; duration: number }) => `${r.title}/${r.duration}`)).toEqual(["Drop/45", "Keep/30"]);
  });

  it("deleting the last save removes the key", () => {
    saveHist(analysis("Only"));
    expect(deleteHist(analysis("Only"))).toBe(true);
    expect(raw()).toBeNull();
  });

  it("returns false and changes nothing when storage cannot be written", () => {
    saveHist(analysis("A", { duration: 30 })); saveHist(analysis("B", { duration: 30 }));
    const before = raw(); ls.limit = 5;
    expect(deleteHist(analysis("A", { duration: 30 }))).toBe(false);
    expect(raw()).toBe(before);
  });

  it("clearHist removes every save, and reports a blocked storage", () => {
    saveHist(analysis("A"));
    expect(clearHist()).toBe(true);
    expect(raw()).toBeNull();
    saveHist(analysis("B")); ls.failRemove = true;
    expect(clearHist()).toBe(false);
    expect(stored()).toHaveLength(1);
  });
});
