// The version number and the changelog it opens.
//   1. a version button in the toolbar reads v<version> and the version is the one the build reports (window.__build.appVersion)
//   2. it opens a dialog titled Changelog that shows every release from CHANGELOG.md: version, date, sections and items; the current
//      version is marked; it says which version you are on
//   3. Escape and the Close button close it, focus returns to the version button, and the page behind is inert while it is open
//   4. it works from the keyboard alone (Enter opens, Escape closes) and on a phone-width window (readable, scrolls inside, no page overflow)
//   npm run app:build && TT_APP_URL=... node tests/app-changelog.test.js
"use strict";
const path = require("node:path"), fs = require("node:fs");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`;
(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 120000);
  const b = await chromium.launch(), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const ver = JSON.parse(fs.readFileSync(path.join(ROOT, "app", "package.json"), "utf8")).version, log = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  const heads = [...log.matchAll(/^## v(\S+) \((\S+)\)$/gm)].map(m => [m[1], m[2]]), nItems = (log.match(/^- /gm) || []).length;
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); p.on("pageerror", e => errs.push(String(e)));
  await p.goto(`${URL}index.html`); await p.waitForTimeout(400);

  // 1. the button
  const btn = p.locator("#version"), built = await p.evaluate(() => window.__build.appVersion);
  check((await btn.innerText()) === `v${ver}` && built === ver, `1: the toolbar shows v${ver}, the version in app/package.json and in the build (${built})`);
  check(await btn.isVisible() && await p.locator("#empty").isVisible(), "1: it is there before any track is loaded");

  // 2. the dialog
  await btn.click(); await p.waitForSelector("[data-changelog]");
  const d = await p.evaluate(() => { const dlg = document.querySelector('.tt-dialog'); return { title: dlg.querySelector(".tt-dialog-title").innerText, sub: dlg.querySelector(".tt-dialog-sub").innerText, versions: [...dlg.querySelectorAll(".release")].map(r => [r.dataset.version, r.querySelector("time").getAttribute("datetime")]), items: dlg.querySelectorAll(".ritems li").length, current: dlg.querySelectorAll(".rv.current").length, sections: [...dlg.querySelectorAll(".rsec")].map(e => e.innerText) }; });
  check(d.title === "Changelog" && d.sub === `You are on v${ver}`, `2: a dialog titled Changelog says which version you are on ("${d.sub}")`);
  check(JSON.stringify(d.versions) === JSON.stringify(heads) && d.items === nItems, `2: it lists every release in CHANGELOG.md with its date (${d.versions.map(v => v.join(" ")).join("; ")}) and all ${d.items} items`);
  check(d.current === 1 && d.sections.every(s => ["Features", "Improvements", "Fixes"].includes(s)) && d.sections.length >= 2, `2: the current version is marked, the sections are ${d.sections.join(", ")}`);
  const inert = await p.evaluate(() => { const m = document.querySelector("main.app"); return m.hasAttribute("inert") || m.getAttribute("aria-hidden") === "true" || !!document.querySelector('.tt-dialog').closest("[aria-modal]") || document.querySelector('.tt-dialog').getAttribute("aria-modal") === "true"; });
  check(inert, "3: the page behind is inert or the dialog is modal while it is open");

  // 3. closing
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  check(await p.locator('.tt-dialog').count() === 0 || !(await p.locator('.tt-dialog').first().isVisible()), "3: Escape closes it");
  check(await p.evaluate(() => document.activeElement && document.activeElement.id === "version"), "3: focus returns to the version button");
  await btn.click(); await p.waitForSelector("[data-changelog]"); await p.locator(".tt-dialog-close").click(); await p.waitForTimeout(250);
  check(await p.locator('.tt-dialog').count() === 0 || !(await p.locator('.tt-dialog').first().isVisible()), "3: the Close button closes it");

  // 4. keyboard and phone
  await btn.focus(); await p.keyboard.press("Enter"); await p.waitForSelector("[data-changelog]");
  check(await p.evaluate(() => document.querySelector('.tt-dialog').contains(document.activeElement)), "4: Enter on the button opens it and focus moves inside");
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  await p.setViewportSize({ width: 390, height: 780 }); await p.waitForTimeout(200);
  await p.locator("#version").click(); await p.waitForSelector("[data-changelog]"); await p.waitForTimeout(200);
  const ph = await p.evaluate(() => { const dlg = document.querySelector('.tt-dialog'), r = dlg.getBoundingClientRect(), body = dlg.querySelector(".tt-dialog-body"); return { w: r.width, fits: r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, noX: document.documentElement.scrollWidth <= innerWidth + 1, scrolls: body.scrollHeight >= body.clientHeight }; });
  check(ph.fits && ph.noX, `4: on a 390 px wide phone the dialog fits (${Math.round(ph.w)} px) and the page does not overflow sideways`);
  console.log("errors", errs); clearTimeout(guard); if (errs.length || failed) process.exitCode = 1; await b.close();
  if (!process.exitCode) console.log(`app changelog tests passed (${n})`);
})();
