#!/usr/bin/env node
// Leakage check between a development manifest and the holdout manifest.
// Every track must carry artists (names and/or internal artistIds), release and songFamily; dev and holdout may
// share none of them, and no track id or audio file. Names are normalized before comparing, and resolved through
// the internal artist registry when given, so one artist under different names or aliases still collides.
// The holdout custodian runs this before every holdout run and whenever tracks are added to either set.
//
//   node bench/check-splits.js <dev-manifest.json> <holdout-manifest.json> [--registry artists.json]
"use strict";
const fs = require("node:fs");
const { splitOverlap, identityProblems, loadRegistry } = require("./lib/holdout");
const args = process.argv.slice(2), ri = args.indexOf("--registry"), regPath = ri >= 0 ? args[ri + 1] : null;
const [devPath, holdPath] = args.filter((a, i) => !a.startsWith("--") && (ri < 0 || i !== ri + 1));
if (!devPath || !holdPath || (ri >= 0 && !regPath)) { console.error("usage: node bench/check-splits.js <dev-manifest.json> <holdout-manifest.json> [--registry artists.json]"); process.exit(2); }
const dev = JSON.parse(fs.readFileSync(devPath, "utf8")).tracks, hold = JSON.parse(fs.readFileSync(holdPath, "utf8")).tracks;
const R = regPath ? loadRegistry(JSON.parse(fs.readFileSync(regPath, "utf8"))) : null;
if (R && R.problems.length) { console.log(`REGISTRY: ${R.problems.length} ambiguous alias(es); fix the artist registry first:\n  ` + R.problems.join("\n  ")); process.exit(1); }
const missing = identityProblems([...dev, ...hold], R);
if (missing.length) { console.log(`INCOMPLETE: ${missing.length} identifier problem(s), so leakage can't be ruled out:\n  ` + missing.join("\n  ")); process.exit(1); }
const bad = splitOverlap(dev, hold, R);
if (bad.length) { console.log(`LEAKAGE: ${bad.length} overlap(s) between dev and holdout:\n  ` + bad.join("\n  ")); process.exit(1); }
console.log(`OK: no shared ids, audio, artists, releases or song families (${dev.length} dev, ${hold.length} holdout tracks${R ? `, artist registry with ${R.ids.size} artists` : ", no artist registry: aliases not resolved"}).`);
