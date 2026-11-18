// index.html carries an inlined copy of src/timemap.js. They must never differ.
"use strict";
const { spawnSync } = require("node:child_process"), path = require("node:path");
const r = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "sync-timemap.js"), "--check"], { encoding: "utf8" });
if (r.status !== 0) { console.error(r.stdout + r.stderr); process.exit(1); }
console.log("timemap sync test passed");
