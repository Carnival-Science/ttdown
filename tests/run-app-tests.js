#!/usr/bin/env node
// Runs the browser feature tests against the Svelte app instead of the legacy page: serves app/dist/bench (the build with test
// hooks) over localhost with scripts/dev-server.js and points every test at it through TT_APP_URL. Same tests, same assertions.
//   npm run app:build && node tests/run-app-tests.js [test25.js ...]
"use strict";
const path = require("node:path"), { spawnSync } = require("node:child_process");
const { createTarget } = require("../bench/lib/target");
(async () => {
  const t = createTarget({ kind: "svelte", root: path.resolve(__dirname, ".."), build: "bench" }); await t.start();
  const url = t.url().replace(/index\.html#teardown$/, "");
  console.log("Svelte app under test: " + url + "  (bundle " + String(t.manifest.bundleSha256).slice(0, 12) + ")");
  const r = spawnSync(process.execPath, [path.join(__dirname, "run-tests.js"), ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, TT_APP_URL: url } });
  await t.stop(); process.exit(r.status === null ? 1 : r.status);
})().catch(e => { console.error(e); process.exit(1); });
