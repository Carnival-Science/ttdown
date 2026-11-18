#!/usr/bin/env node
// Browser smoke test for the Svelte shell, in all three ways it runs:
//   dev         the Vite dev server (source modules, TimeMap transformed on the fly)
//   production  app/dist/production over localhost (scripts/dev-server.js, via the benchmark target adapter)
//   bench       app/dist/bench over localhost (same, with test hooks)
// Checks: default route and navigation (clicks, hash, back/forward, unknown hash, reload), the canonical TimeMap gives
// the same fingerprint as Node, build identity matches the external manifest, test hooks only in the bench build,
// UI SDK popover and tabs work by mouse and keyboard, phone width has no clipping or horizontal scroll, no page errors.
// Needs: npm run build:all (in app/). Run: npm run smoke (in app/), or npm run app:smoke at the repo root.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(APP, "..");
const OUT = path.join(APP, "tests", "out"); mkdirSync(OUT, { recursive: true });
const { chromium } = require("playwright");                 // the repo's own Playwright (root devDependency)
const TM = require(path.join(ROOT, "src", "timemap.js"));   // the canonical module, in Node
const { createTarget } = require(path.join(ROOT, "bench", "lib", "target.js"));

const SELF_CHECK = { bpm: 120, firstDownbeat: 0.5, duration: 30, beatsPerBar: 4 }; // = src/lib/timemap/index.ts
const NODE_FP = TM.fromConstantGrid(SELF_CHECK).fingerprint();
const TIMEMAP_SHA = createHash("sha256").update(readFileSync(path.join(ROOT, "src", "timemap.js"))).digest("hex");
const ROUTES = [["Teardown", "teardown"], ["Learn", "learn"], ["Sample Lab", "samples"], ["Journal", "journal"]];

let failures = 0, checks = 0;
const check = (cond, msg) => { checks++; if (!cond) { failures++; console.log("  FAIL " + msg); } };

// ---- bundle checks (no browser) ----
function bundleChecks(build) {
  const dir = path.join(APP, "dist", build), man = JSON.parse(readFileSync(path.join(dir, "build-manifest.json"), "utf8"));
  const js = readdirSync(path.join(dir, "assets")).filter(f => f.endsWith(".js")).map(f => readFileSync(path.join(dir, "assets", f), "utf8")).join("\n");
  // the manifest is the truth about the compiled files: recompute it
  const lines = man.files.map(f => { const h = createHash("sha256").update(readFileSync(path.join(dir, f.path))).digest("hex"); check(h === f.sha256, `${build}: ${f.path} hash differs from manifest`); return `${h}  ${f.path}\n`; });
  check(createHash("sha256").update(lines.join("")).digest("hex") === man.bundleSha256, `${build}: bundleSha256 does not match the files`);
  check(man.timemapSha256 === TIMEMAP_SHA, `${build}: manifest TimeMap hash`);
  // exactly one TimeMap: every distinctive string literal of src/timemap.js appears as often as in the source
  const src = readFileSync(path.join(ROOT, "src", "timemap.js"), "utf8");
  const lits = [...new Set([...src.matchAll(/"([A-Za-z0-9 ,.:'%/-]{24,})"/g)].map(m => m[1]))].filter(l => src.split(`"${l}"`).length === 2).slice(0, 12);
  check(lits.length >= 5, `${build}: too few TimeMap literals to check`);
  for (const l of lits) { const k = js.split(l).length - 1; check(k === 1, `${build}: TimeMap literal "${l.slice(0, 40)}" appears ${k}x in the bundle (want 1)`); }
  const hooks = js.includes("__ttdownTest");
  check(build === "bench" ? hooks : !hooks, `${build}: test hooks ${hooks ? "present" : "absent"} in the bundle`);
  return man;
}

// ---- browser checks ----
async function pageChecks(browser, name, baseUrl, expect) {
  console.log(`[${name}] ${baseUrl}`);
  for (const [vp, label] of [[{ width: 1440, height: 900 }, "desktop"], [{ width: 375, height: 812 }, "phone"]]) {
    const ctx = await browser.newContext({ viewport: vp, ...(label === "phone" ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    const p = await ctx.newPage(), errors = [];
    p.on("pageerror", e => errors.push(String(e)));
    p.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
    await p.goto(baseUrl); await p.waitForSelector("[data-route]");
    const route = () => p.$eval("[data-route]", e => e.dataset.route);
    const current = () => p.$eval('nav[aria-label="Main"] a[aria-current="page"]', e => e.textContent.trim());

    check(await route() === "teardown", `${name}/${label}: default route is ${await route()}, want teardown`);
    check(await current() === "Teardown", `${name}/${label}: nav marks ${await current()} as current`);
    check((await p.textContent("h1")).includes("Track Teardown"), `${name}/${label}: teardown heading`);

    // navigation by click, then history, unknown hash and reload
    for (const [text, id] of ROUTES.slice(1).concat([ROUTES[0]])) {
      await p.click(`nav[aria-label="Main"] a:has-text("${text}")`);
      await p.waitForFunction(i => document.querySelector("[data-route]").dataset.route === i, id);
      check(new URL(p.url()).hash === "#" + id, `${name}/${label}: ${text} sets #${id}`);
      check(await current() === text, `${name}/${label}: ${text} marked current`);
    }
    await p.goBack(); await p.waitForFunction(() => document.querySelector("[data-route]").dataset.route === "journal");
    check(await route() === "journal", `${name}/${label}: back goes to journal`);
    await p.goForward(); await p.waitForFunction(() => document.querySelector("[data-route]").dataset.route === "teardown");
    await p.evaluate(() => { location.hash = "#no-such-view"; }); await p.waitForTimeout(50);
    check(await route() === "teardown", `${name}/${label}: unknown hash falls back to teardown`);
    await p.goto(baseUrl.replace(/#.*$/, "") + "#samples"); await p.waitForSelector("[data-route=samples]");
    check(await route() === "samples", `${name}/${label}: reload on #samples`);
    await p.evaluate(() => { location.hash = "#teardown"; }); await p.waitForSelector("[data-route=teardown]");

    // canonical TimeMap, same result as Node
    const tm = await p.$eval("[data-route]", e => ({ schema: e.dataset.timemapSchema, fp: e.dataset.timemapFingerprint }));
    check(tm.schema === TM.SCHEMA && tm.fp === NODE_FP, `${name}/${label}: TimeMap ${tm.schema} ${tm.fp}, Node ${TM.SCHEMA} ${NODE_FP}`);

    // build identity and test hooks
    const id = await p.evaluate(() => window.__build);
    check(id && id.schema === "ttdown-build/1" && id.mode === expect.mode, `${name}/${label}: __build mode ${id && id.mode}`);
    check(id && id.timemapSha256 === TIMEMAP_SHA, `${name}/${label}: __build TimeMap hash`);
    const hooks = await p.evaluate(() => ({ test: typeof window.__ttdownTest, tm: typeof window.TimeMap, td: typeof window.__td, buf: Object.keys(window).filter(k => /buf/i.test(k)) }));
    check(hooks.test === (expect.hooks ? "object" : "undefined") && hooks.tm === (expect.hooks ? "object" : "undefined"), `${name}/${label}: hooks ${JSON.stringify(hooks)}`);
    check(hooks.buf.length === 0, `${name}/${label}: no audio buffer globals`);
    if (expect.hooks) {
      const fp = await p.evaluate(c => window.TimeMap.fromConstantGrid(c).fingerprint(), SELF_CHECK);
      check(fp === NODE_FP, `${name}/${label}: window.TimeMap fingerprint ${fp}`);
      await p.evaluate(() => window.__ttdownTest.navigate("journal")); await p.waitForSelector("[data-route=journal]");
      check(await p.evaluate(() => window.__ttdownTest.route()) === "journal", `${name}/${label}: __ttdownTest.navigate`);
      await p.evaluate(() => window.__ttdownTest.navigate("teardown")); await p.waitForSelector("[data-route=teardown]");
    }

    // UI SDK popover: opens by click, shows the identity, closes on Escape, returns focus
    const trigger = p.locator('button[aria-label="About this build"]');
    await trigger.click();
    const info = p.locator('[data-testid="build-info"]');
    await info.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
    check(await info.isVisible(), `${name}/${label}: About popover opens`);
    if (await info.isVisible()) check((await info.textContent()).includes(NODE_FP), `${name}/${label}: popover shows the TimeMap fingerprint`);
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    check(!(await info.isVisible()), `${name}/${label}: Escape closes the popover`);

    // UI SDK tabs: click and arrow keys; panels stay mounted
    const tabs = p.locator('[role="tablist"][aria-label="Parts of this teardown"] [role="tab"]');
    check(await tabs.count() === 6, `${name}/${label}: six teardown tabs (${await tabs.count()})`);
    await tabs.nth(3).click();
    check(await tabs.nth(3).getAttribute("aria-selected") === "true", `${name}/${label}: Song map tab selected by click`);
    await p.keyboard.press("ArrowRight");
    check(await tabs.nth(4).getAttribute("aria-selected") === "true", `${name}/${label}: ArrowRight selects the next tab`);
    check(await p.locator("[data-part]").count() === 6, `${name}/${label}: all six panels stay mounted`);

    // layout: no horizontal scroll, every nav link fully on screen
    const lay = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth,
      clipped: [...document.querySelectorAll('nav[aria-label="Main"] a')].filter(a => { const r = a.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 0.5 || a.scrollWidth > a.clientWidth + 1; }).map(a => a.textContent) }));
    check(lay.over <= 0, `${name}/${label}: horizontal overflow ${lay.over}px`);
    check(lay.clipped.length === 0, `${name}/${label}: clipped nav links ${lay.clipped}`);
    await p.screenshot({ path: path.join(OUT, `${name}-${label}.png`) });
    check(errors.length === 0, `${name}/${label}: page errors ${errors.join(" | ")}`);
    await ctx.close();
  }
}

async function startVite() {
  const vite = spawn(process.execPath, [path.join(APP, "node_modules", "vite", "bin", "vite.js"), "--mode", "development"], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
  const url = await new Promise((resolve, reject) => {
    let out = ""; const timer = setTimeout(() => reject(new Error("vite dev server did not start:\n" + out)), 20000);
    const on = d => { out += d; const m = out.replace(/\x1b\[[0-9;]*m/g, "").match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}/`); } };
    vite.stdout.on("data", on); vite.stderr.on("data", on); vite.on("exit", c => reject(new Error(`vite exited ${c}:\n${out}`)));
  });
  return { url, stop: () => vite.kill() };
}

const browser = await chromium.launch();
const stops = [];
try {
  for (const build of ["production", "bench"]) bundleChecks(build);
  const dev = await startVite(); stops.push(dev.stop);
  await pageChecks(browser, "dev", dev.url, { mode: "development", hooks: false });
  for (const build of ["production", "bench"]) {
    const t = createTarget({ kind: "svelte", root: ROOT, build }); await t.start(); stops.push(() => t.stop());
    const ctx = await browser.newContext(), p = await ctx.newPage(); await p.goto(t.url());
    try { await t.verifyIdentity(p); check(true, ""); } catch (e) { check(false, `${build}: ${e.message}`); }
    await ctx.close();
    await pageChecks(browser, build, t.url(), { mode: build, hooks: build === "bench" });
  }
} finally { await browser.close(); for (const s of stops) await s(); }
console.log(failures ? `app smoke: ${failures} of ${checks} checks failed` : `app smoke passed (${checks} checks; screenshots in app/tests/out/)`);
process.exit(failures ? 1 : 0);
