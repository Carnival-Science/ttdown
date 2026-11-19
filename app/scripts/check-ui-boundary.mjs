#!/usr/bin/env node
// UI SDK and Ding (toasts) are implementation details of TTdown's own components: only src/lib/ui/ may import "@ui-sdk/*" or "@yusufceng1z/*"
// (main.ts may import its stylesheet). Fails with the offending files otherwise.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const walk = d => readdirSync(d).flatMap(n => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const bad = walk(SRC).filter(p => /\.(svelte|ts|js)$/.test(p)).flatMap(p => {
  const rel = path.relative(SRC, p).split(path.sep).join("/");
  if (rel.startsWith("lib/ui/")) return [];
  const hits = [...readFileSync(p, "utf8").matchAll(/from\s+["'](@(?:ui-sdk|yusufceng1z)\/[^"']+)["']|import\s+["'](@(?:ui-sdk|yusufceng1z)\/[^"']+)["']/g)].map(m => m[1] || m[2]);
  return hits.filter(h => !(rel === "main.ts" && h === "@ui-sdk/core/web.css")).map(h => `${rel}: ${h}`);
});
if (bad.length) { console.error("UI SDK / Ding imported outside src/lib/ui/:\n  " + bad.join("\n  ")); process.exit(1); }
console.log("ui boundary ok: UI SDK and Ding are only imported in src/lib/ui/");
