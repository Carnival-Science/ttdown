// Saved teardowns from older versions, or odd ones, may lack optional fields. For each optional field of a REAL saved record (made
// by the legacy page), remove it and open the record in the legacy page and in the Svelte app on the same origin. The Svelte app must
// never fail where the legacy page works (it may fail only where the legacy page fails too, which is then reported, not hidden).
//   npm run app:build && node tests/app-saved-data-variants.test.js
"use strict";
const path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createTarget } = require("../bench/lib/target");
const ROOT = path.resolve(__dirname, ".."), SONG = path.join(ROOT, "test-songs", "pop127_Amaj.wav");
const OPTIONAL = ["swing", "drumParts", "hook", "bassline", "altKeys", "bassNote", "steady", "chords", "nBars", "firstDown", "bpmConf", "keyConf", "checks", "stems", "chordChecks", "timing", "timingCorrections", "bpmFixed", "keyFixed", "patternEdited"];
const NULLED = ["chords", "hook", "bassline", "swing", "drumParts"];

(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 280000);
  const t = createTarget({ kind: "svelte", root: ROOT, build: "bench" }); await t.start();
  const app = t.url(), origin = app.replace(/app\/dist\/bench\/index\.html#teardown$/, ""), legacy = origin + "index.html#teardown";
  const b = await chromium.launch(), ctx = await b.newContext();
  const L = await ctx.newPage(); await L.goto(legacy); await L.waitForTimeout(400);
  await L.setInputFiles("#file", SONG); await L.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 });
  const rec = await L.evaluate(() => JSON.parse(localStorage.getItem("teardown_history_v1"))[0]); await L.close();
  const variants = [{ name: "as saved", rec }]; for (const k of OPTIONAL) { const r = JSON.parse(JSON.stringify(rec)); delete r[k]; variants.push({ name: "without " + k, rec: r }); }
  for (const k of NULLED) { const r = JSON.parse(JSON.stringify(rec)); r[k] = null; variants.push({ name: k + " = null", rec: r }); }
  { const r = JSON.parse(JSON.stringify(rec)); r.sections.forEach(s => { delete s.timing; }); variants.push({ name: "sections without timing marker (saved before section times)", rec: r }); }
  { const r = JSON.parse(JSON.stringify(rec)); r.chords = { bars: [], loop: null, loopCount: 0 }; variants.push({ name: "no chord bars", rec: r }); }
  const tryOpen = async (url, rec) => {
    const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(String(e).slice(0, 120)));
    await p.goto(url); await p.evaluate(r => localStorage.setItem("teardown_history_v1", JSON.stringify([r])), rec); await p.reload(); await p.waitForTimeout(500);
    let shown = false;
    try { await p.click("#recent-btn", { timeout: 4000 }); await p.click("#hist button", { timeout: 4000 }); await p.waitForTimeout(500);
      if (/^http/.test(url) && url.includes("/app/dist/")) { // the v1 app: findings, then the section detail tabs
        await p.waitForSelector('[data-finding="tempo"]', { timeout: 3000 });
        for (const tab of ["Piano roll", "Rhythm"]) { await p.click(`[role=tab]:has-text("${tab}")`, { timeout: 3000 }); await p.waitForTimeout(120); }
        shown = new RegExp(`\\b${rec.bpm}\\b`).test(await p.locator('[data-finding="tempo"] .big').innerText());
      } else { // the legacy page
        for (const tab of ["Build it", "Idea generator", "Song map", "Sounds and mix", "Compare", "Overview"]) { await p.click(`.tdtabs button:has-text("${tab}")`, { timeout: 3000 }); await p.waitForTimeout(120); }
        shown = (await p.textContent("#lcd-bpm")).trim() === rec.bpm.toFixed(1); }
    } catch (e) { errs.push("ui: " + String(e).split("\n")[0].slice(0, 100)); }
    await p.close(); return { ok: shown && errs.length === 0, errs };
  };
  let worse = 0, sameFail = 0; const rows = [];
  for (const v of variants) {
    const l = await tryOpen(legacy, v.rec), s = await tryOpen(app, v.rec);
    rows.push([v.name, l.ok ? "ok" : "FAILS", s.ok ? "ok" : "FAILS"]);
    if (l.ok && !s.ok) { worse++; console.log(`REGRESSION: "${v.name}" works in the legacy page but fails in the Svelte app: ${s.errs.join(" | ")}`); }
    if (!l.ok && !s.ok) { sameFail++; console.log(`existing defect: "${v.name}" fails in both: legacy ${l.errs.join(" | ")} / svelte ${s.errs.join(" | ")}`); }
    if (!l.ok && s.ok) console.log(`note: "${v.name}" fails in the legacy page but works in the Svelte app`);
  }
  clearTimeout(guard); await b.close(); await t.stop();
  console.log(rows.map(r => r.join(" | ")).join("\n"));
  assert.equal(worse, 0, `${worse} saved-data variant(s) work in the legacy page but fail in the Svelte app`);
  console.log(`saved-data variant tests passed (${variants.length} variants; ${sameFail} also fail in the legacy page)`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
