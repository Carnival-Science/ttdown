#!/usr/bin/env node
// Leakage check between a development manifest and the holdout manifest.
// Every track must carry artists, release and songFamily; dev and holdout may share none of them, and no track id
// or audio file. Names are normalized before comparing (see lib/holdout.js).
// The holdout custodian runs this before every holdout run and whenever tracks are added to either set.
//
//   node bench/check-splits.js <dev-manifest.json> <holdout-manifest.json>
"use strict";
const fs = require("node:fs");
const { splitOverlap, identityProblems } = require("./lib/holdout");
const [devPath, holdPath] = process.argv.slice(2);
if (!devPath || !holdPath) { console.error("usage: node bench/check-splits.js <dev-manifest.json> <holdout-manifest.json>"); process.exit(2); }
const dev = JSON.parse(fs.readFileSync(devPath, "utf8")).tracks, hold = JSON.parse(fs.readFileSync(holdPath, "utf8")).tracks;
const missing = identityProblems([...dev, ...hold]);
if (missing.length) { console.log(`INCOMPLETE: ${missing.length} track(s) lack leakage identifiers, so leakage can't be ruled out:\n  ` + missing.join("\n  ")); process.exit(1); }
const bad = splitOverlap(dev, hold);
if (bad.length) { console.log(`LEAKAGE: ${bad.length} overlap(s) between dev and holdout:\n  ` + bad.join("\n  ")); process.exit(1); }
console.log(`OK: no shared ids, audio, artists, releases or song families (${dev.length} dev, ${hold.length} holdout tracks).`);
