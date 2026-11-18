// Data compatibility between the legacy page and the Svelte app ON THE SAME ORIGIN (localStorage is per origin): both are served by
// scripts/dev-server.js, the legacy page at /index.html and the Svelte app at /app/dist/bench/index.html. Data written by one must
// show up in the other, both ways, because cutover and rollback depend on it (docs/SVELTE_MIGRATION.md §8.2).
//   npm run app:build && node tests/app-storage-roundtrip.test.js
"use strict";
const path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createTarget } = require("../bench/lib/target");
const ROOT = path.resolve(__dirname, ".."), SONG = path.join(ROOT, "test-songs", "pop127_Amaj.wav");

(async () => {
  const t = createTarget({ kind: "svelte", root: ROOT, build: "bench" }); await t.start();
  const app = t.url(), origin = app.replace(/app\/dist\/bench\/index\.html#teardown$/, ""), legacy = origin + "index.html#teardown";
  const b = await chromium.launch(), ctx = await b.newContext(), errs = [];
  const page = async url => { const p = await ctx.newPage(); p.on("pageerror", e => errs.push(url + ": " + e)); await p.goto(url); await p.waitForTimeout(400); return p; };
  const analyze = async p => { await p.setInputFiles("#file", SONG); await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }); };
  let checks = 0; const ok = (c, m) => { checks++; assert.ok(c, m); };

  // 1. legacy writes: a saved teardown (with tracked timing), a ticked Build-it step, a practice-log entry, display settings
  const L = await page(legacy); await analyze(L);
  await L.click('.tdtabs button:has-text("Build it")'); await L.locator("#plan .pstep input[type=checkbox]").first().check();
  await L.goto(origin + "index.html#learn"); await L.waitForTimeout(300);
  await L.fill("#log-min", "25"); await L.fill("#log-note", "from legacy"); await L.click('button:has-text("Log session")');
  const legacyKeys = await L.evaluate(() => Object.keys(localStorage).sort());
  await L.close();

  // 2. the Svelte app on the same origin reads all of it
  const S = await page(app);
  ok((await S.textContent("#hist")).includes("pop127_Amaj"), "Svelte shows the teardown the legacy page saved");
  await S.click("#hist button"); await S.waitForTimeout(300);
  ok(await S.evaluate(() => !!window.__td.grid && window.__td.grid.beats.length > 16), "the saved tracked beats come back as the grid (TimingStore.attach)");
  await S.click('[role="tab"]:has-text("Build it")'); await S.waitForTimeout(200);
  ok(await S.locator("#plan .pstep input[type=checkbox]").first().isChecked(), "the step ticked in the legacy page is ticked");
  await S.goto(app.replace("#teardown", "#learn")); await S.waitForTimeout(300);
  ok((await S.textContent("#log")).includes("from legacy"), "the practice-log entry from the legacy page is listed");

  // 3. the Svelte app writes: tick the second step, log a session
  await S.goto(app); await S.waitForTimeout(300); await S.click("#hist button"); await S.click('[role="tab"]:has-text("Build it")'); await S.waitForTimeout(200);
  await S.locator("#plan .pstep input[type=checkbox]").nth(1).check(); await S.waitForTimeout(100);
  await S.goto(app.replace("#teardown", "#learn")); await S.waitForTimeout(300);
  await S.fill("#log-min", "15"); await S.fill("#log-note", "from svelte"); await S.click('button:has-text("Log session")'); await S.waitForTimeout(100);
  const appKeys = await S.evaluate(() => Object.keys(localStorage).sort());
  await S.close();

  // 4. the legacy page reads what the Svelte app wrote (rollback)
  const L2 = await page(legacy);
  await L2.click("#hist button"); await L2.waitForTimeout(400); await L2.click('.tdtabs button:has-text("Build it")'); await L2.waitForTimeout(200);
  ok(await L2.locator("#plan .pstep input[type=checkbox]").nth(1).isChecked(), "the step ticked in the Svelte app is ticked in the legacy page");
  await L2.goto(origin + "index.html#learn"); await L2.waitForTimeout(300);
  ok((await L2.textContent("#log")).includes("from svelte"), "the practice-log entry from the Svelte app is listed in the legacy page");
  ok(appKeys.every(k => legacyKeys.includes(k) || ["app_volume_v1", "display_v1", "ear_training_v1"].includes(k)), `the Svelte app writes no new storage keys (${appKeys.join(", ")})`);
  ok(errs.length === 0, "no page errors: " + errs.join(" | "));
  await b.close(); await t.stop();
  console.log(`storage round-trip tests passed (${checks})`);
})().catch(e => { console.error(e); process.exit(1); });
