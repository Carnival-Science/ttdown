#!/usr/bin/env node
// index.html is one self-contained file (it also runs as a single-file artifact), so the framework-free modules in src/ are INLINED
// into it, each between its own pair of marker comments. src/*.js stay the single source of truth (Node tests and the future Svelte app
// import them); this copies them into the page.
//   node scripts/sync-timemap.js          rewrite the inlined copies
//   node scripts/sync-timemap.js --check  exit 1 if any inlined copy differs from its src file (run by npm test)
"use strict";
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, ".."), PAGE = path.join(ROOT, "index.html"), MODULES = ["timemap", "timing-store", "engine", "domain"];
let page = fs.readFileSync(PAGE, "utf8"), bad = 0, changed = 0;
for (const name of MODULES) {
  const SRC = path.join(ROOT, "src", name + ".js"), file = `src/${name}.js`;
  const BEGIN = `/* BEGIN ${file}: inlined copy. Edit ${file}, then run \`npm run sync:timemap\`; \`npm test\` fails if they differ. */`, END = `/* END ${file} */`;
  const src = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n").trimEnd();
  if (src.includes("</script")) { console.error(`${file} must not contain </script`); process.exit(2); }
  const i = page.indexOf(BEGIN), j = page.indexOf(END);
  if (i < 0 || j < i) { console.error(`index.html has no markers for ${file}. Add a <script> containing the BEGIN and END marker comments.`); process.exit(2); }
  const next = page.slice(0, i) + `${BEGIN}\n${src}\n${END}` + page.slice(j + END.length);
  if (next !== page) { if (process.argv.includes("--check")) { console.error(`index.html's inlined ${file} differs from the source. Run: npm run sync:timemap`); bad++; } else changed++; }
  page = next;
}
if (process.argv.includes("--check")) { if (bad) process.exit(1); console.log("inlined modules match src/: " + MODULES.join(", ")); }
else { fs.writeFileSync(PAGE, page); console.log(changed ? `index.html updated (${changed} module${changed > 1 ? "s" : ""})` : "index.html already up to date"); }
