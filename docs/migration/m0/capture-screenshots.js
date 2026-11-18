const { chromium } = require("playwright");
// Usage: PORT=5199 npm run dev, then: node docs/migration/m0/capture-screenshots.js [outDir] [baseUrl]
const path = require("path"), ROOT = path.resolve(__dirname, "../../.."), OUT = process.argv[2] || __dirname, URL = process.argv[3] || "http://localhost:5199/";
(async () => {
  const b = await chromium.launch();
  for (const [name, vp, mobile] of [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 375, height: 812 }, true]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(String(e)));
    for (const v of ["learn", "samples", "journal"]) { await p.goto(`${URL}index.html#${v}`); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${name}-${v}.png` }); }
    await p.goto(`${URL}index.html#teardown`); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${name}-teardown-example.png` });
    await p.setInputFiles("#file", ROOT + "/test-songs/pop127_Amaj.wav");
    await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 });
    const tabs = await p.$$eval(".tdtabs button", bs => bs.map(b => b.textContent));
    for (const t of tabs) { await p.click(`.tdtabs button:has-text("${t}")`); await p.waitForTimeout(400);
      await p.locator(".tdtabs").scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/${name}-tab-${t.toLowerCase().replace(/[^a-z]+/g, "-")}.png`, fullPage: false }); }
    const hscroll = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(name, "tabs:", tabs.join(" | "), "| page errors:", errs.length, "| horizontal overflow px:", hscroll);
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
