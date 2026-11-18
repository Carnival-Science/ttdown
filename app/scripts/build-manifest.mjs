#!/usr/bin/env node
// Writes <dist>/build-manifest.json: the sha256 of every compiled file, computed AFTER the build, outside the bundle
// (a bundle cannot contain its own hash). The benchmark target adapter records `bundleSha256` and checks `gitSha`
// against the identity the running page reports (window.__build).
//   node scripts/build-manifest.mjs dist/production
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.resolve(APP, process.argv[2] || "dist/production");
const NAME = "build-manifest.json";
const sha = buf => createHash("sha256").update(buf).digest("hex");
const walk = d => readdirSync(d).flatMap(n => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const git = cmd => { try { return execSync(`git ${cmd}`, { cwd: APP, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };

const files = walk(dir).map(p => path.relative(dir, p).split(path.sep).join("/")).filter(p => p !== NAME).sort()
  .map(p => { const buf = readFileSync(path.join(dir, p)); return { path: p, bytes: buf.length, sha256: sha(buf) }; });
if (!files.some(f => f.path === "index.html")) { console.error(`No index.html in ${dir}: build first.`); process.exit(1); }
const html = readFileSync(path.join(dir, "index.html"), "utf8");
const manifest = {
  schema: "ttdown-build-manifest/1",
  mode: path.basename(dir),
  gitSha: git("rev-parse HEAD"),
  gitDirty: (git("status --porcelain --untracked-files=no") ?? "") !== "",
  timemapSha256: sha(readFileSync(path.join(APP, "..", "src", "timemap.js"))),
  timingStoreSha256: sha(readFileSync(path.join(APP, "..", "src", "timing-store.js"))),
  engineSha256: sha(readFileSync(path.join(APP, "..", "src", "engine.js"))),
  domainSha256: sha(readFileSync(path.join(APP, "..", "src", "domain.js"))),
  // One hash for the whole build: sha256 over "sha256  path\n" lines in path order (the sha256sum format).
  bundleSha256: sha(files.map(f => `${f.sha256}  ${f.path}\n`).join("")),
  totalBytes: files.reduce((s, f) => s + f.bytes, 0),
  entry: { html: "index.html", scripts: [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1].replace(/^\.\//, "")) },
  files,
};
writeFileSync(path.join(dir, NAME), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${path.relative(APP, path.join(dir, NAME))}: ${files.length} files, ${manifest.totalBytes} bytes, bundle ${manifest.bundleSha256.slice(0, 16)}…, commit ${String(manifest.gitSha).slice(0, 7)}${manifest.gitDirty ? " (dirty)" : ""}`);
