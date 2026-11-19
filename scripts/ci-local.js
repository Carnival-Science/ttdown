#!/usr/bin/env node
// Run the CI pipeline (.github/workflows/ci.yml) locally, stage by stage, in the same order, stopping at the first failure.
//   npm run ci:local                          every stage (needs Python with numpy and mir_eval, and the Playwright browsers)
//   npm run ci:local -- --fast                stage 1 only: type check, unit tests, production build, fast smoke
//   npm run ci:local -- --browsers=firefox    which extra browsers run the end-to-end journey (default firefox,webkit; "none" to skip)
// Install first: npm ci && npm ci --prefix app && npx playwright install chromium firefox webkit
// Keep this list in step with ci.yml when either changes.
"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2), fast = args.includes("--fast");
const browsersArg = (args.find(a => a.startsWith("--browsers=")) || "--browsers=firefox,webkit").split("=")[1];
const browsers = browsersArg === "none" ? [] : browsersArg.split(",").filter(Boolean);

const STAGES = [
  ["1. fast (ci.yml: fast)", [
    ["Type check and UI SDK import boundary", "npm run app:check"],
    ["Unit tests: app modules (Vitest)", "npm run app:unit"],
    ["Unit tests: engine, TimeMap, timing store, MIDI, scorers", "npm run test:unit"],
    ["Production build", "npm --prefix app run build"],
    ["Fast smoke test", "npm run smoke:fast"],
  ]],
  ["2. test fixtures", [
    ["Synthetic test songs", "npm run songs"],
    ["Time-model fixtures", "npm run songs:time"],
    ["Melody fixtures", "npm run songs:melody"],
  ]],
  ["3. feature tests and benchmarks (ci.yml: test)", [
    ["Feature tests", "npm test"],
    ["G0 benchmark gates", "npm run benchmark"],
    ["G1 harness, synthetic manifest", "npm run bench:synthetic"],
    ["G1 parity with G0", "npm run bench:parity"],
    ["G1 metrics vs mir_eval", "npm run bench:crosscheck"],
    ["G1 ground-truth integrity", "npm run bench:integrity"],
    ["Time-model fixtures (reported)", "npm run bench:time-fixtures && python bench/crosscheck_mir_eval.py bench/out/time-fixtures/scores.json"],
    ["Scorable regions", "npm run bench:regions"],
    ["Arrangement fixtures vs Version A", "npm run bench:arrangement && node tests/arrangement-vs-version-a.test.js && python bench/crosscheck_mir_eval.py bench/out/arrangement-fixtures/scores.json"],
    ["Melody and transcription scorers", "npm run bench:melody && npm run bench:transcription"],
    ["Full-track transcription", "npm run bench:melody-track"],
  ]],
  ["4. app (ci.yml: app)", [
    ["Production and bench builds", "npm run app:build"],
    ["Browser smoke test (dev, production, bench)", "npm run app:smoke"],
    ["Analyzer parity", "npm run app:parity"],
    ["Product tests", "npm run app:product-tests"],
    ["Data compatibility", "node tests/app-storage-roundtrip.test.js"],
    ["Saved-data variants", "node tests/app-saved-data-variants.test.js"],
    ["End-to-end journey (chromium)", "npm run e2e:journey"],
  ]],
  ["5. other browsers (ci.yml: e2e-browsers)", browsers.map(b => [`End-to-end journey (${b})`, "npm run e2e:journey", { TT_BROWSER: b }])],
];

const results = [], started = Date.now();
let failedAt = null;
for (const [stage, steps] of fast ? STAGES.slice(0, 1) : STAGES) {
  if (!steps.length) continue;
  console.log(`\n######## ${stage}`);
  for (const [name, cmd, env] of steps) {
    console.log(`\n==== ${name}\n$ ${cmd}`);
    const t0 = Date.now(), r = spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true, env: { ...process.env, ...(env || {}) } });
    const ok = r.status === 0, secs = (Date.now() - t0) / 1000;
    results.push({ stage, name, ok, secs });
    if (!ok) { failedAt = name; break; }
  }
  if (failedAt) break;
}

console.log("\n######## summary");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.secs.toFixed(1).padStart(7)} s  ${r.name}`);
const total = ((Date.now() - started) / 1000).toFixed(0);
if (failedAt) { console.log(`\nci:local FAILED at "${failedAt}" after ${total} s (later steps not run).`); process.exit(1); }
console.log(`\nci:local passed: ${results.length} steps in ${total} s${fast ? " (stage 1 only)" : ""}.`);
