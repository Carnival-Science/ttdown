// Data compatibility between the legacy page and the v1 app ON THE SAME ORIGIN (localStorage is per origin): both are served by
// scripts/dev-server.js. A teardown saved by one opens in the other, with its tracked beats; a correction made in the app is read back
// by the legacy page (rollback depends on this); and the app writes no storage keys of its own beyond saved teardowns and the volume,
// and deletes nothing the legacy page saved (its journal, log and shelf stay in the browser).
//   npm run app:build && node tests/app-storage-roundtrip.test.js
"use strict";
const path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createTarget } = require("../bench/lib/target");
const ROOT = path.resolve(__dirname, ".."), SONG = path.join(ROOT, "test-songs", "pop127_Amaj.wav");

(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 200000);
  const t = createTarget({ kind: "svelte", root: ROOT, build: "bench" }); await t.start();
  const app = t.url(), origin = app.replace(/app\/dist\/bench\/index\.html#teardown$/, ""), legacy = origin + "index.html#teardown";
  const b = await chromium.launch(), ctx = await b.newContext(), errs = [];
  let checks = 0; const ok = (c, m) => { checks++; assert.ok(c, m); };
  const page = async url => { const p = await ctx.newPage(); p.on("pageerror", e => errs.push(url + ": " + e)); await p.goto(url); await p.waitForTimeout(400); return p; };

  // 1. the legacy page saves a teardown, a practice-log entry and a journal card
  const L = await page(legacy);
  await L.setInputFiles("#file", SONG); await L.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 });
  await L.goto(origin + "index.html#learn"); await L.waitForTimeout(300); await L.fill("#log-min", "20"); await L.fill("#log-note", "legacy only"); await L.click('button:has-text("Log session")');
  await L.evaluate(() => localStorage.setItem("beat_journal_v1", JSON.stringify([{ id: "jr-x", type: "journal", title: "kept", ref: { bpm: 1, key: "A", camelot: "1A", style: "x" }, exports: [] }])));
  const legacyData = await L.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
  await L.close();
  ok(["teardown_history_v1", "fl_log_v1", "beat_journal_v1"].every(k => legacyData[k]), "the legacy page saved a teardown, a log entry and a journal card");

  // 2. the app opens the legacy teardown, with its tracked beats, and corrects the key
  const S = await page(app);
  ok((await S.textContent("#hist")).includes("pop127_Amaj"), "the app lists the teardown the legacy page saved");
  await S.click("#recent-btn"); await S.click("#hist button"); await S.waitForTimeout(400);
  ok(await S.evaluate(() => !!window.__td.grid && window.__td.grid.beats.length > 16), "its saved tracked beats come back as the grid");
  ok(await S.locator('[data-finding="tempo"] .small').first().innerText().then(t => /Steady/.test(t)), "and the tempo finding is computed from them (steady), not from a fallback");
  await S.locator('select[aria-label="Set the key yourself"]').selectOption("C minor"); await S.waitForTimeout(300);
  const after = await S.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
  await S.close();
  const allowed = new Set([...Object.keys(legacyData), "app_volume_v1"]);
  ok(Object.keys(after).every(k => allowed.has(k)), `the app writes no new storage keys (${Object.keys(after).join(", ")})`);
  ok(after.fl_log_v1 === legacyData.fl_log_v1 && after.beat_journal_v1 === legacyData.beat_journal_v1, "the legacy journal and practice log were left untouched");
  ok(JSON.parse(after.teardown_history_v1)[0].keyFixed === true && JSON.parse(after.teardown_history_v1)[0].key === "C minor", "the key correction was saved to the shared history");

  // 3. the legacy page reads what the app saved (rollback)
  const L2 = await page(legacy);
  await L2.click("#hist button"); await L2.waitForTimeout(500);
  ok(await L2.evaluate(() => window.__td.key === "C minor" && window.__td.keyFixed === true && !!window.__td.grid), "the legacy page opens the app's corrected teardown, with its tracked beats");
  ok(errs.length === 0, "no page errors: " + errs.join(" | "));
  clearTimeout(guard); await b.close(); await t.stop();
  console.log(`storage round-trip tests passed (${checks})`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
