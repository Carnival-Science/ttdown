#!/usr/bin/env node
// index.html is one self-contained file (it also runs as a single-file artifact), so src/timemap.js is INLINED into it between two
// markers. src/timemap.js stays the single source of truth (Node tests import it); this copies it into the page.
//   node scripts/sync-timemap.js          rewrite the inlined copy
//   node scripts/sync-timemap.js --check  exit 1 if the inlined copy differs from src/timemap.js (run by npm test)
"use strict";
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, ".."), PAGE = path.join(ROOT, "index.html"), SRC = path.join(ROOT, "src", "timemap.js");
const BEGIN = "/* BEGIN src/timemap.js: inlined copy. Edit src/timemap.js, then run `npm run sync:timemap`; `npm test` fails if they differ. */";
const END = "/* END src/timemap.js */";
const src = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n").trimEnd(), page = fs.readFileSync(PAGE, "utf8");
if (src.includes("</script")) { console.error("src/timemap.js must not contain </script"); process.exit(2); }
const block = `${BEGIN}\n${src}\n${END}`, i = page.indexOf(BEGIN), j = page.indexOf(END);
if (i < 0 || j < i) { console.error("index.html has no TimeMap markers. Add a <script> containing the BEGIN and END marker comments."); process.exit(2); }
const next = page.slice(0, i) + block + page.slice(j + END.length);
if (process.argv.includes("--check")) { if (next !== page) { console.error("index.html's inlined TimeMap differs from src/timemap.js. Run: npm run sync:timemap"); process.exit(1); } console.log("inlined TimeMap matches src/timemap.js"); }
else { fs.writeFileSync(PAGE, next); console.log(next === page ? "index.html already up to date" : "index.html updated from src/timemap.js"); }
