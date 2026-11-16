#!/usr/bin/env node
"use strict";

// Run browser feature tests as separate processes and preserve each exit code.
// The previous shell pipeline ("node test.js | tail -1") could mask failures.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const files = fs.readdirSync(__dirname)
  .filter(name => /^test.*\.js$/.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (files.length === 0) {
  console.error("No feature tests found in tests/.");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  console.log("\n===== " + file + " =====");
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  });

  if (result.error) {
    failed++;
    console.error("FAILED to start " + file + ": " + result.error.message);
  } else if (result.signal) {
    failed++;
    console.error("FAILED " + file + ": terminated by " + result.signal);
  } else if (result.status !== 0) {
    failed++;
    console.error("FAILED " + file + ": exit code " + result.status);
  } else {
    console.log("PASSED " + file);
  }
}

console.log("\nFeature tests: " + (files.length - failed) + " passed, " + failed + " failed.");
process.exitCode = failed === 0 ? 0 : 1;
