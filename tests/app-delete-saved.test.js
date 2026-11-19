// Deleting saved teardowns from the browser. Saved copies live in localStorage (teardown_history_v1); nothing else is persisted.
//   1. a delete button per saved teardown (Recent popover and empty-state chips), keyboard reachable, labelled "Delete <title>"
//   2. deleting asks first (Yes / Cancel); Cancel keeps it; the text says it only removes the copy saved in this browser
//   3. Yes removes it from storage and it stays gone after a reload
//   4. "Clear all saved teardowns" asks first, Cancel keeps all, Yes removes the key; gone after a reload
//   5. deleting the teardown that is open leaves it open, says it is no longer saved, and nothing breaks
//   npm run app:build && TT_APP_URL=... node tests/app-delete-saved.test.js
"use strict";
const path = require("node:path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`, SONGS = path.join(ROOT, "test-songs"), HK = "teardown_history_v1";
(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 280000);
  const b = await chromium.launch(), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const open = async () => { const q = await ctx.newPage(); q.on("pageerror", e => errs.push(String(e))); await q.goto(`${URL}index.html`); await q.waitForTimeout(400); return q; };
  const store = q => q.evaluate(k => JSON.parse(localStorage.getItem(k) || "[]").map(r => r.title), HK);
  const raw = q => q.evaluate(k => localStorage.getItem(k), HK);

  let p = await open();
  await p.setInputFiles("#file", path.join(SONGS, "sections120.mp3"));
  await p.waitForFunction(() => /Teardown ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 });
  // three saved copies (the analysed one and two copies under other names), then reload so the Recent list shows all of them
  await p.evaluate(k => { const h = JSON.parse(localStorage.getItem(k)); const mk = t => ({ ...h[0], title: t }); localStorage.setItem(k, JSON.stringify([h[0], mk("Second take"), mk("Third take")])); }, HK);
  const first = (await store(p))[0], rec = await p.evaluate(k => JSON.parse(localStorage.getItem(k))[0], HK);
  await p.reload(); await p.waitForTimeout(500);
  check((await store(p)).length === 3, `0: three saved teardowns (${await store(p)})`);

  // ---- 1. buttons
  await p.click("#recent-btn");
  const labels = await p.locator("#hist [data-delete]").evaluateAll(els => els.map(e => e.getAttribute("aria-label")));
  check(labels.length === 3 && labels.includes("Delete Second take") && labels.includes("Delete " + first), `1: each row has a delete button labelled "Delete <title>" (${labels})`);
  await p.locator("#hist .h-open").first().focus(); await p.keyboard.press("Tab");
  check(await p.evaluate(() => document.activeElement && document.activeElement.hasAttribute("data-delete")), "1: the delete button is next in the keyboard order after its row");
  check(/only removes the copy saved in this browser/i.test(await p.locator(".recent-pop").innerText()), "1: it says deleting only removes the copy saved in this browser");

  // ---- 2. cancel keeps it
  await p.locator('#hist [data-delete][aria-label="Delete Second take"]').click();
  check(await p.locator("#hist [data-delete-yes]").count() === 1 && /Delete “Second take”\?/.test(await p.locator("#hist").innerText()), "2: deleting asks first: Delete “Second take”? Yes / Cancel");
  check((await store(p)).length === 3, "2: nothing is deleted before the answer");
  await p.locator("#hist [data-delete-cancel]").click();
  check((await store(p)).length === 3 && await p.locator("#hist [data-delete-yes]").count() === 0 && await p.locator("#hist .h-open").count() === 3, "2: Cancel keeps it, in the list and in storage");

  // ---- 3. yes deletes, and a reload keeps it gone
  await p.locator('#hist [data-delete][aria-label="Delete Second take"]').click(); await p.locator("#hist [data-delete-yes]").click(); await p.waitForTimeout(200);
  let t = await store(p);
  check(t.length === 2 && !t.includes("Second take") && await p.locator("#hist .h-open").count() === 2, `3: Yes removes it from storage and the list (${t})`);
  check(/deleted “Second take” from this browser|Deleted “Second take” from this browser/i.test(await p.locator(".tst-title").last().innerText()), "3: a toast says it was deleted from this browser");
  await p.reload(); await p.waitForTimeout(500); t = await store(p);
  check(t.length === 2 && !t.includes("Second take"), `3: after a reload it is still gone (${t})`);

  // ---- 5 (before clear all). the open teardown is deleted: it stays open, is no longer saved
  await p.click("#recent-btn"); await p.locator("#hist .h-open").first().click(); await p.waitForTimeout(500);
  const shown = await p.evaluate(() => window.__td.title);
  await p.click("#recent-btn"); await p.locator(`#hist [data-delete][aria-label="Delete ${shown}"]`).click(); await p.locator("#hist [data-delete-yes]").click(); await p.waitForTimeout(300);
  check(!(await store(p)).includes(shown) && await p.evaluate(() => window.__td.title) === shown && await p.locator("#explorer").isVisible(), `5: deleting the open teardown ("${shown}") leaves it open on screen`);
  check(/no longer saved/i.test(await p.locator(".tst-title").last().innerText()), "5: and a toast says it is no longer saved");
  check(await p.locator('.detail [role="tab"]').count() > 0, "5: the rest of the page still works");

  // ---- 4. clear all (the popover has one saved teardown left plus we add two)
  await p.evaluate(k => { const h = JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify([...h, { ...h[0], title: "A" }, { ...h[0], title: "B" }])); }, HK);
  await p.reload(); await p.waitForTimeout(500);
  const before = (await store(p)).length;
  await p.click("#recent-btn"); await p.locator("[data-clear-all]").click();
  check(await p.locator("[data-clear-yes]").count() === 1 && /can't be undone/i.test(await p.locator(".recent-pop").innerText()) && /only removes the cop/i.test(await p.locator(".recent-pop").innerText()), `4: Clear all asks first and says it can't be undone, only in this browser (${before} saved)`);
  await p.locator("[data-clear-cancel]").click();
  check((await store(p)).length === before && await p.locator("[data-clear-all]").count() === 1, "4: Cancel keeps all of them");
  await p.locator("[data-clear-all]").click(); await p.locator("[data-clear-yes]").click(); await p.waitForTimeout(200);
  check(await raw(p) === null && await p.locator("#recent-btn").isDisabled(), "4: Yes removes them from storage (the key is gone) and Recent empties");
  await p.reload(); await p.waitForTimeout(500);
  check(await raw(p) === null && await p.locator("#empty").isVisible() && await p.locator("#empty .recents").count() === 0, "4: after a reload there is nothing saved and no Recent chips");

  // ---- empty-state chips: the same delete, the same confirmation
  await p.evaluate(([k, rec]) => localStorage.setItem(k, JSON.stringify([{ ...rec, title: "Chip one" }, { ...rec, title: "Chip two" }])), [HK, rec]);
  await p.reload(); await p.waitForTimeout(500);
  check(await p.locator("#empty .recents [data-delete]").count() === 2, "6: the empty-state Recent chips each have a delete button");
  await p.locator('#empty [data-delete][aria-label="Delete Chip one"]').click();
  check(await p.locator("#empty [data-delete-yes]").count() === 1 && (await store(p)).length === 2, "6: it asks first");
  await p.locator("#empty [data-delete-yes]").click(); await p.waitForTimeout(200);
  check(JSON.stringify(await store(p)) === '["Chip two"]' && await p.locator("#empty .recents .h-open").count() === 1, "6: Yes removes just that one from storage and the chips");
  console.log(errs.length ? "errors " + JSON.stringify(errs) : "errors []"); clearTimeout(guard); await b.close();
  console.log(`app delete tests ${failed ? "FAILED" : "passed"} (${n})`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
