#!/usr/bin/env node
// Renders the PNG fallbacks of the tab icon from app/public/favicon.svg (the one source), so they never drift from it:
//   favicon-32.png        32 x 32, transparent (browsers that do not take SVG icons, Safari among them)
//   apple-touch-icon.png  180 x 180, on the paper colour (iOS home screens ignore transparency)
// Run: node scripts/make-favicons.mjs   (needs Playwright's Chromium, which the browser tests already use)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), PUB = path.join(ROOT, "app", "public");
const svg = readFileSync(path.join(PUB, "favicon.svg"), "utf8");
const b = await chromium.launch();
for (const [file, size, bg, pad] of [["favicon-32.png", 32, "transparent", 0], ["apple-touch-icon.png", 180, "#F7F8F2", 22]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0;background:${bg}"><div style="width:${size}px;height:${size}px;padding:${pad}px;box-sizing:border-box">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body></html>`);
  await p.screenshot({ path: path.join(PUB, file), omitBackground: bg === "transparent" });
  await p.close(); console.log("wrote", file);
}
await b.close();
