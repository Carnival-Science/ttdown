#!/usr/bin/env node
// Browser smoke test for the app shell, in all three ways it runs:
//   dev         the Vite dev server (source modules, the shared UMD files transformed on the fly)
//   production  app/dist/production over localhost (scripts/dev-server.js, via the benchmark target adapter): no test hooks
//   bench       app/dist/bench over localhost: with test hooks
// Checks: the empty state, the canonical TimeMap gives the same fingerprint as Node, build identity matches the external manifest,
// test hooks only in the bench build, a real analysis renders findings and the timeline (bench), nothing wider than the screen on desktop
// or phone before and after analysis, no page errors. What the page says and does is tested in tests/app-product.test.js.
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
const sha = f => createHash("sha256").update(readFileSync(path.join(ROOT, "src", f))).digest("hex");
const SHARED = { timemapSha256: sha("timemap.js"), timingStoreSha256: sha("timing-store.js"), engineSha256: sha("engine.js"), domainSha256: sha("domain.js") };
const SONG = path.join(ROOT, "test-songs", "pop127_Amaj.wav");

let failures = 0, checks = 0;
const check = (cond, msg) => { checks++; if (!cond) { failures++; console.log("  FAIL " + msg); } };

// ---- bundle checks (no browser) ----
function bundleChecks(build) {
  const dir = path.join(APP, "dist", build), man = JSON.parse(readFileSync(path.join(dir, "build-manifest.json"), "utf8"));
  const js = readdirSync(path.join(dir, "assets")).filter(f => f.endsWith(".js")).map(f => readFileSync(path.join(dir, "assets", f), "utf8")).join("\n");
  const lines = man.files.map(f => { const h = createHash("sha256").update(readFileSync(path.join(dir, f.path))).digest("hex"); check(h === f.sha256, `${build}: ${f.path} hash differs from manifest`); return `${h}  ${f.path}\n`; });
  check(createHash("sha256").update(lines.join("")).digest("hex") === man.bundleSha256, `${build}: bundleSha256 does not match the files`);
  for (const [k, v] of Object.entries(SHARED)) check(man[k] === v, `${build}: manifest ${k}`);
  // exactly one copy of each shared module: distinctive strings of the source appear once in the bundle
  { const src = readFileSync(path.join(ROOT, "src", "timemap.js"), "utf8");
    const lits = [...new Set([...src.matchAll(/"([A-Za-z0-9 ,.:'%/-]{24,})"/g)].map(m => m[1]))].filter(l => src.split(`"${l}"`).length === 2).slice(0, 12);
    check(lits.length >= 4, `${build}: too few timemap.js literals to check`);
    for (const l of lits) { const k = js.split(l).length - 1; check(k === 1, `${build}: timemap.js literal "${l.slice(0, 40)}" appears ${k}x in the bundle (want 1)`); } }
  for (const l of ["That file is empty.", "Decoding audio", "Checking the file", "dp-tracker (too few beats; downbeats not chosen)"]) { const k = js.split(l).length - 1; check(k === 1, `${build}: engine string "${l.slice(0, 40)}" appears ${k}x in the bundle (want 1)`); }
  const hooks = js.includes("__analysisStats");
  check(build === "bench" ? hooks : !hooks, `${build}: test hooks ${hooks ? "present" : "absent"} in the bundle`);
  check(!/fonts\.googleapis|fonts\.gstatic/.test(js + readFileSync(path.join(dir, "index.html"), "utf8")), `${build}: no third-party font host`);
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
    await p.goto(baseUrl); await p.waitForSelector("main.app");
    const over = async () => p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, wide: [...document.querySelectorAll("main *")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== "fixed" && !e.closest(".scroll,.timeline,.barruler"); }).slice(0, 3).map(e => e.tagName + "." + e.className) }));

    check(/teardown/i.test(await p.textContent("h1")), `${name}/${label}: heading`);
    check(await p.locator("#file").count() === 1 && await p.locator("#empty").count() === 1, `${name}/${label}: upload and the empty state are shown`);
    let o = await over(); check(o.over <= 0 && o.wide.length === 0, `${name}/${label}: empty state fits the screen (${o.over}px, ${o.wide})`);

    // the canonical TimeMap, same result as Node
    const tm = await p.$eval("main.app", e => ({ schema: e.dataset.timemapSchema, fp: e.dataset.timemapFingerprint }));
    check(tm.schema === TM.SCHEMA && tm.fp === NODE_FP, `${name}/${label}: TimeMap ${tm.schema} ${tm.fp}, Node ${TM.SCHEMA} ${NODE_FP}`);

    // build identity and test hooks
    const id = await p.evaluate(() => window.__build);
    check(id && id.schema === "ttdown-build/1" && id.mode === expect.mode, `${name}/${label}: __build mode ${id && id.mode}`);
    for (const [k, v] of Object.entries(SHARED)) check(id && id[k] === v, `${name}/${label}: __build ${k}`);
    const hooks = await p.evaluate(() => ({ tm: typeof window.TimeMap, td: "__td" in window, sn: typeof window.__sn, stats: typeof window.__analysisStats, buf: Object.keys(window).filter(k => /buf/i.test(k)) }));
    check((hooks.tm === "object") === expect.hooks && hooks.td === expect.hooks && (hooks.sn === "function") === expect.hooks && (hooks.stats === "object") === expect.hooks, `${name}/${label}: hooks ${JSON.stringify(hooks)}`);
    check(hooks.buf.length === 0, `${name}/${label}: no audio buffer globals`);
    await p.click('button[aria-label^="Help"]'); await p.waitForTimeout(250);
    await p.locator("details summary", { hasText: "About this build" }).click();
    check((await p.locator('[data-testid="build-info"]').innerText()).includes(NODE_FP), `${name}/${label}: About this build shows the TimeMap fingerprint`);

    // a real analysis, where the page can show it (the bench build reads the result back)
    if (expect.hooks) {
      await p.setInputFiles("#file", SONG);
      await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }); await p.waitForTimeout(300);
      check(await p.locator("[data-finding]").count() === 5 && await p.locator("#explorer .timeline .seg").count() >= 1 && await p.locator(".detail .phead .midi").count() === 1 && await p.locator("#exports").count() === 0, `${name}/${label}: findings, timeline and the piano roll's MIDI menu render (no Export panel)`);
      o = await over(); check(o.over <= 0 && o.wide.length === 0, `${name}/${label}: the analysed page fits the screen (${o.over}px, ${o.wide})`);
      await p.screenshot({ path: path.join(OUT, `${name}-${label}.png`), fullPage: true });
    }
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
