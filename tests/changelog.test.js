#!/usr/bin/env node
/* CHANGELOG.md and the app version agree: the newest entry is the version in app/package.json (and app/package-lock.json), headings follow the
 * format the app's changelog dialog reads, dates are real and not in the future, versions are in descending order, every list item is a
 * single non-empty line, and the sections are the three known kinds. */
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, ".."), text = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
const ver = JSON.parse(fs.readFileSync(path.join(ROOT, "app", "package.json"), "utf8")).version, lock = JSON.parse(fs.readFileSync(path.join(ROOT, "app", "package-lock.json"), "utf8"));
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const heads = [...text.matchAll(/^## (.*)$/gm)].map(m => m[1]);
ok(heads.length > 0 && heads.every(h => /^v\d+\.\d+\.\d+ \(\d{4}-\d{2}-\d{2}\)$/.test(h)), `every release heading is "vX.Y.Z (YYYY-MM-DD)" (${heads.join("; ")})`);
const vs = heads.map(h => h.match(/^v(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number)), cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
ok(vs.every((v, i) => i === 0 || cmp(vs[i - 1], v) > 0), "versions are in strictly descending order, newest first");
ok(heads[0].startsWith("v" + ver + " "), `the newest entry (${heads[0]}) is the app version in app/package.json (${ver})`);
ok(lock.version === ver && lock.packages[""].version === ver, `app/package-lock.json carries the same version (${lock.version}, ${lock.packages[""].version})`);
for (const h of heads) { const d = new Date(h.match(/\((.*)\)/)[1] + "T00:00:00Z"); ok(!isNaN(d) && d.toISOString().slice(0, 10) === h.match(/\((.*)\)/)[1] && d <= new Date(Date.now() + 86400000), `${h}: a real date, not in the future`); }
const secs = [...text.matchAll(/^### (.*)$/gm)].map(m => m[1]);
ok(secs.length > 0 && secs.every(s => ["Features", "Improvements", "Fixes"].includes(s)), `sections are Features, Improvements or Fixes (${[...new Set(secs)].join(", ")})`);
const items = text.split(/\r?\n/).filter(l => /^- /.test(l)); ok(items.length > 0 && items.every(l => l.length > 6), `${items.length} list items, none empty`);
ok(!/^\s+- /m.test(text) && !/^\* /m.test(text), "lists are flat, with `- ` bullets (the app reads only those)");
for (const rel of text.split(/^## /m).slice(1)) { const body = rel.split(/\r?\n/); ok(body.some(l => /^### /.test(l)), `${body[0]}: has at least one section`); }
console.log(`changelog tests passed (${pass})`); 
