#!/usr/bin/env node
// Leakage check between a development manifest and the holdout manifest (review finding 4).
// Fails if they share a track id, an audio file (sha256), or a group (artist / release / song family).
// The holdout custodian runs this before every holdout run, and whenever tracks are added to either set.
//
//   node bench/check-splits.js <dev-manifest.json> <holdout-manifest.json>
"use strict";
const fs = require("node:fs");
const { splitOverlap } = require("./lib/holdout");
const [devPath, holdPath] = process.argv.slice(2);
if (!devPath || !holdPath) { console.error("usage: node bench/check-splits.js <dev-manifest.json> <holdout-manifest.json>"); process.exit(2); }
const dev = JSON.parse(fs.readFileSync(devPath, "utf8")).tracks, hold = JSON.parse(fs.readFileSync(holdPath, "utf8")).tracks;
const noGroup = [...dev, ...hold].filter(t => !t.group).length;
const bad = splitOverlap(dev, hold);
if (noGroup) console.log(`WARNING: ${noGroup} track(s) have no "group"; artist/release leakage can't be checked for them.`);
if (bad.length) { console.log(`LEAKAGE: ${bad.length} overlap(s) between dev and holdout:\n  ` + bad.join("\n  ")); process.exit(1); }
console.log(`OK: no shared ids, audio or groups (${dev.length} dev, ${hold.length} holdout tracks).`);
