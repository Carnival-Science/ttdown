#!/usr/bin/env node
// The browser tests for the v1 app. Serves app/dist/bench (the build with test hooks) over localhost with scripts/dev-server.js and
// points every test at it through TT_APP_URL. Tests for the legacy page's removed features (Learn, coach, journal, sample lab, build
// plan, idea generator, compare, share, volume menu) are deliberately NOT run here: v1 does not have those features.
//   npm run app:build && node tests/run-app-tests.js [test-file ...]
"use strict";
const path = require("node:path"), { spawnSync } = require("node:child_process");
const { createTarget } = require("../bench/lib/target");

// Legacy behaviour tests that still describe the product (they drive hooks and ids both apps share), then the v1 tests.
const TESTS = [
  "test24.js",                  // TimeMap built from the real analyzer's tracked grid
  "test25.js", "test26.js", "test27.js", // stale jobs, cancellation, object-URL ownership
  "app-limits.test.js",         // input limits and clear errors
  "app-bars.test.js",           // ruler, beat clicks and 4-bar loops on the tracked grid; a tempo correction replaces it
  "app-sections.test.js",       // section times on the tracked bar lines
  "app-persistence.test.js",    // saved teardowns keep the tracker's beats
  "app-exports.test.js",        // bar-aligned exports: gated, refused, blocked when stale
  "app-corrections.test.js",    // Phase 2d: a correction recomputes (equals a fresh analysis) or invalidates (stale, not exported)
  "app-workspace.test.js",      // the analysis workspace: arrangement and editor stay put, findings and export as an inspector (wide) or a sheet (narrow)
  "app-product.test.js",        // what v1 is and is not: labels, timeline, volume, no removed features, nothing leaves the browser
];
(async () => {
  const only = process.argv.slice(2), list = only.length ? TESTS.filter(t => only.includes(t)) : TESTS;
  const t = createTarget({ kind: "svelte", root: path.resolve(__dirname, ".."), build: "bench" }); await t.start();
  const url = t.url().replace(/index\.html#teardown$/, "");
  console.log("Svelte app under test: " + url + "  (bundle " + String(t.manifest.bundleSha256).slice(0, 12) + ")");
  let failed = 0;
  for (const f of list) {
    console.log("\n===== " + f + " =====");
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit", env: { ...process.env, TT_APP_URL: url } });
    if (r.status !== 0) { failed++; console.error("FAILED " + f + ": exit code " + r.status); } else console.log("PASSED " + f);
  }
  await t.stop();
  console.log(`\nApp tests: ${list.length - failed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
