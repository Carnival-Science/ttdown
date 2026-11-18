// Account sync and optional-runtime behaviour of the Svelte app, against a MOCK Claude runtime (window.claude.use), using saved data
// produced by the real legacy page on the same origin. Scenarios (review gates, docs/SVELTE_MIGRATION.md §13):
//   A. the account connects late, after the 10 s fallback to "local": everything saved offline is copied up (only missing ids),
//      nothing the account already has is overwritten, nothing is deleted, localStorage is untouched;
//   B. a refused account write is reported, kept locally, and retried at the next connection event;
//   C. a capability that failed once (downloads) is tried again on the next use instead of staying disabled until reload.
//   npm run app:build && node tests/app-account.test.js
"use strict";
const path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createTarget } = require("../bench/lib/target");
const ROOT = path.resolve(__dirname, ".."), SONG = path.join(ROOT, "test-songs", "pop127_Amaj.wav");

const MOCK = () => {
  const m = window.__mock = { calls: [], docs: {}, cb: null, failSets: 0, useFailures: { downloads: 1 } };
  const snap = (docs, fromCache) => ({ docs: Object.entries(docs).map(([id, d]) => ({ id, data: () => d })), metadata: { fromCache: !!fromCache } });
  m.fire = (docs, fromCache) => { if (docs) m.docs = { ...docs }; m.cb(snap(m.docs, fromCache)); };
  window.claude = { use: async cap => {
    m.calls.push(["use", cap]);
    if (m.useFailures[cap] > 0) { m.useFailures[cap]--; throw new Error("not ready"); }
    if (cap === "user") return { id: async () => "u1" };
    if (cap === "db") return { collection: () => ({ onSnapshot: cb => { m.cb = cb; }, doc: id => ({
      set: async data => { if (m.failSets > 0) { m.failSets--; m.calls.push(["set-failed", id]); throw Object.assign(new Error("offline"), { code: "unavailable" }); } m.calls.push(["set", id]); m.docs[id] = data; },
      delete: async () => { m.calls.push(["delete", id]); delete m.docs[id]; } }) }) };
    if (cap === "downloads") return { save: async f => { m.calls.push(["save", f.filename]); } };
    return null; } };
};

(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 150000);
  const t = createTarget({ kind: "svelte", root: ROOT, build: "bench" }); await t.start();
  const app = t.url(), origin = app.replace(/app\/dist\/bench\/index\.html#teardown$/, ""), legacy = origin + "index.html#teardown";
  const b = await chromium.launch(), ctx = await b.newContext(), errs = [];
  let checks = 0; const ok = (c, m) => { checks++; assert.ok(c, m); };
  const open = async (url, opts = {}) => { const p = await ctx.newPage(); p.on("pageerror", e => errs.push(String(e)));
    if (opts.mock) await p.addInitScript(MOCK); await p.goto(url); await p.waitForTimeout(500); return p; };

  // 1. real legacy data: a saved teardown with tracked timing, a ticked plan step, a practice-log entry, a saved idea
  const L = await open(legacy);
  await L.setInputFiles("#file", SONG); await L.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 });
  await L.click('.tdtabs button:has-text("Build it")'); await L.locator("#plan .pstep input[type=checkbox]").first().check();
  await L.click('.tdtabs button:has-text("Idea generator")'); await L.locator('#ideas button:has-text("☆ Save")').first().click();
  await L.goto(origin + "index.html#learn"); await L.waitForTimeout(300); await L.fill("#log-min", "20"); await L.fill("#log-note", "offline log"); await L.click('button:has-text("Log session")');
  // journal card and shelf item in the exact shapes the legacy functions write (they need a Compare upload and Sample Lab files to create)
  await L.evaluate(() => { localStorage.setItem("beat_journal_v1", JSON.stringify([{ id: "jr-td-pop127-amaj-70", title: "pop127_Amaj", ref: { bpm: 127, key: "A major", camelot: "11B", style: "Electronic pop" }, exports: [], learned: "local notes", saman: "", status: "In progress", createdAt: "2026-11-18T00:00:00.000Z", type: "journal", updatedAt: "2026-11-18T00:00:00.000Z" }]));
    localStorage.setItem("sample_shelf_v1", JSON.stringify([{ id: "sm-kick-1", type: "sample", name: "kick.wav", kind: "Kick", note: "", bpm: null, dur: 0.4, folder: "Drums", suggested: "Kick", savedAt: "2026-11-18T00:00:00.000Z" }])); });
  const keys = ["teardown_history_v1", "td_plan_v1", "idea_favs_v1", "fl_log_v1", "beat_journal_v1", "sample_shelf_v1"];
  const snapshotLS = p => p.evaluate(ks => Object.fromEntries(ks.map(k => [k, localStorage.getItem(k)])), keys);
  const before = await snapshotLS(L); await L.close();
  ok(keys.every(k => before[k]), "the legacy page saved every kind of data: " + keys.filter(k => !before[k]).join(", "));

  // A. the account connects late
  const A = await open(app, { mock: true });
  await A.evaluate(() => { location.hash = "learn"; });
  await A.waitForTimeout(10600);                                          // real time: the app's 10 s fallback to "local" fires first
  ok((await A.textContent("#save-note")).includes("this browser only"), "while the account has not answered, the app says it is saving in this browser only");
  await A.fill("#log-min", "5"); await A.fill("#log-note", "written while offline"); await A.click('button:has-text("Log session")'); await A.waitForTimeout(100);
  const accountDocs = { progress: { type: "progress", m: { m1: "2026-01-01" } }, "jr-td-pop127-amaj-70": { type: "journal", title: "pop127_Amaj", learned: "ACCOUNT notes", exports: [] } };
  await A.evaluate(d => window.__mock.fire(d), accountDocs);               // the late, non-cached snapshot
  await A.waitForTimeout(300);
  const calls = await A.evaluate(() => window.__mock.calls), sets = calls.filter(c => c[0] === "set").map(c => c[1]);
  ok((await A.textContent("#save-note")).includes("Claude account"), "once the account answers, the app says so");
  ok(sets.some(i => /^td-pop127-amaj-/.test(i)), "the saved teardown was copied up");
  ok(sets.some(i => /^plan-td-pop127-amaj-/.test(i)), "the plan ticks were copied up (the legacy page did not)");
  ok(sets.some(i => /^idea-/.test(i)), "the saved idea was copied up (the legacy page did not)");
  ok(sets.some(i => /^sm-kick-1$/.test(i)), "the shelf item was copied up (the legacy page did not)");
  ok(new Set(sets.filter(i => /^s-/.test(i))).size === 2, "both practice-log entries (legacy and offline) reached the account: " + sets.filter(i => /^s-/.test(i)).join(","));
  ok(!sets.includes("progress"), "an existing account document (progress) was not overwritten");
  ok(!sets.includes("jr-td-pop127-amaj-70"), "an existing account document (journal card) was not overwritten");
  ok(!calls.some(c => c[0] === "delete"), "nothing was deleted from the account");
  ok(await A.evaluate(d => window.__mock.docs["jr-td-pop127-amaj-70"].learned === d["jr-td-pop127-amaj-70"].learned, accountDocs), "the account's own journal text is intact");
  const after = await snapshotLS(A);
  ok(keys.filter(k => k !== "fl_log_v1").every(k => after[k] === before[k]), "localStorage was not changed by the account connecting");
  ok(JSON.parse(after.fl_log_v1).length === JSON.parse(before.fl_log_v1).length + 1, "the only local change is the log entry made offline");

  // B. a refused write is reported, kept locally and retried
  await A.evaluate(() => { window.__mock.failSets = 1; });
  await A.fill("#log-min", "7"); await A.fill("#log-note", "refused once"); await A.click('button:has-text("Log session")'); await A.waitForTimeout(200);
  ok((await A.textContent("#save-note")).includes("kept in this browser"), "a refused account write is reported to the user: " + await A.textContent("#save-note"));
  ok(JSON.parse(await A.evaluate(() => localStorage.getItem("fl_log_v1"))).some(x => x.note === "refused once"), "the refused entry is kept in this browser");
  ok(!(await A.evaluate(() => Object.values(window.__mock.docs).some(d => d.note === "refused once"))), "the account does not have it yet");
  await A.evaluate(() => window.__mock.fire()); await A.waitForTimeout(300);
  ok(await A.evaluate(() => Object.values(window.__mock.docs).some(d => d.note === "refused once")), "at the next connection event the refused entry was retried and saved");
  await A.close();

  // C. a capability that failed once is retried (no cache of the failure)
  const C = await open(app, { mock: true });
  await C.evaluate(() => window.__mock.fire && 0);
  await C.click("#hist button"); await C.waitForTimeout(300); await C.click('[role="tab"]:has-text("Build it")'); await C.waitForTimeout(200);
  const midi = C.locator('button:has-text("Download the song as MIDI")').first();
  await midi.scrollIntoViewIfNeeded();
  const dl1 = C.waitForEvent("download", { timeout: 8000 }); await midi.click(); await dl1;   // downloads capability failed -> plain browser download
  ok(true, "first use: the capability was not ready, the plain browser download still worked");
  await midi.click(); await C.waitForTimeout(500);
  ok((await C.evaluate(() => window.__mock.calls)).some(c => c[0] === "save" && /full song MIDI/.test(c[1])), "second use: the capability was asked again and the runtime's save was used");
  await C.close();

  ok(errs.length === 0, "no page errors: " + errs.join(" | "));
  clearTimeout(guard); await b.close(); await t.stop();
  console.log(`app account tests passed (${checks})`);
})().catch(e => { console.error(e); process.exit(1); });
