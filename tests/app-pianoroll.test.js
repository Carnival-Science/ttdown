// ONE piano roll and a scrubbable arrangement.
//   1. the section editor has two tabs, Rhythm and Piano roll; the roll is ONE keyboard, pitch axis, time axis and playhead for all parts
//   2. melody (orange) and bass (blue) are filled; the suggested chord voicings are outlined, dashed and nearly transparent (not heard in
//      the audio); the legend says "Transcribed notes · Suggested chord voicings" (+ "Representative pattern" when that is shown)
//   3. a checkbox per part hides or shows it; Alt/Option-click shows only that part, and again brings the others back
//   4. the chord strip names each bar's chord; the one under the playhead is marked and matches the bar.beat · chord readout, also while
//      playing; clicking a chord opens the correction, which records the change like before
//   5. zoom −, + and Fit
//   6. the arrangement: a click seeks to exactly that place and selects that section (paused stays paused); a drag scrubs without changing
//      the selection (paused stays paused; playing keeps playing from the new place); the PLAYING section is marked apart from the SELECTED
//      one; the view box's handle pans the piano roll without seeking; a double-click fits a section in the roll
//   npm run app:build && TT_APP_URL=... node tests/app-pianoroll.test.js   (npm run app:product-tests sets the URL)
"use strict";
const path = require("node:path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`, SONGS = path.join(ROOT, "test-songs");
(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 280000);
  const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] }), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); p.on("pageerror", e => errs.push(String(e)));
  await p.goto(`${URL}index.html`); await p.waitForTimeout(300);
  await p.setInputFiles("#file", path.join(SONGS, "sections120.mp3"));
  await p.waitForFunction(() => /Teardown ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }); await p.waitForTimeout(500);
  const td = await p.evaluate(() => ({ dur: window.__td.duration, chords: window.__td.chords.bars, sections: window.__td.sections.map(s => ({ start: s.start, end: s.end })), tr: !!window.__td.transcription }));
  const audio = () => p.evaluate(() => { const a = document.querySelector("#explorer audio"); return { t: a.currentTime, paused: a.paused }; });
  const setT = t => p.evaluate(t => { document.querySelector("#explorer audio").currentTime = t; }, t);
  const vp = () => p.evaluate(() => { const l = document.querySelector(".lanes"); return { start: +l.dataset.vpStart, span: +l.dataset.vpSpan, follow: l.dataset.follow }; });
  const segIdx = attr => p.evaluate(a => [...document.querySelectorAll("#explorer .seg")].findIndex(e => e.hasAttribute(a)), attr);
  const secAt = t => td.sections.findIndex(s => t >= s.start && t < s.end);

  // ---- 1. one roll
  const tabs = await p.locator('.detail [role="tab"]').allInnerTexts();
  check(JSON.stringify(tabs) === '["Rhythm","Piano roll"]', `1: the editor's tabs are Rhythm and Piano roll (${tabs})`);
  await p.click('.detail [role="tab"]:has-text("Piano roll")'); await p.waitForTimeout(300);
  const shape = await p.evaluate(() => { const l = document.querySelector(".lanes"); return { rolls: l.querySelectorAll(".mroll").length, keys: l.querySelectorAll(".keys").length, heads: l.querySelectorAll(".phbox").length, rulers: l.querySelectorAll(".mroll-ruler").length, layers: [...l.querySelectorAll("g[data-layer]")].map(g => g.dataset.layer) }; });
  check(shape.rolls === 1 && shape.keys === 1 && shape.heads === 1 && shape.rulers === 1, `1: one roll, one keyboard, one ruler and one playhead for every part (${JSON.stringify(shape)})`);
  check(JSON.stringify(shape.layers) === '["chords","bass","hook"]' && td.tr, `1: melody, bass and suggested chords are layers of that roll (${shape.layers})`);

  // ---- 2. styles and legend
  const st = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll(".lanes g[data-layer]")].map(g => [g.dataset.layer, { fill: g.getAttribute("fill"), op: +g.getAttribute("fill-opacity"), stroke: g.getAttribute("stroke"), dash: g.getAttribute("stroke-dasharray"), n: g.querySelectorAll("rect").length }])));
  check(st.hook.fill === "#ff7a1a" && st.hook.op === 1 && !st.hook.dash && st.hook.n > 0, `2: melody notes are filled orange (${st.hook.n} visible)`);
  check(st.bass.fill === "#5b9dff" && st.bass.op === 1 && !st.bass.dash && st.bass.n > 0, `2: bass notes are filled blue (${st.bass.n} visible)`);
  check(st.chords.op <= 0.25 && st.chords.stroke && st.chords.stroke !== "none" && !!st.chords.dash && st.chords.n > 0, `2: suggested chord voicings are dashed outlines with a faint fill (fill-opacity ${st.chords.op}, dash "${st.chords.dash}")`);
  let legend = await p.locator("[data-legend]").innerText();
  check(/Transcribed notes/.test(legend) && /Suggested chord voicings/.test(legend) && !/Representative pattern\s*$/.test(legend.split("\n")[0] || ""), "2: the legend reads Transcribed notes · Suggested chord voicings");
  await p.click('[data-legend] [role="radio"]:has-text("Representative pattern")'); await p.waitForTimeout(200);
  check(await p.locator("[data-legend] .sw-pat").count() === 1 && await p.locator(".lanes").getAttribute("data-source") === "pattern", "2: showing the representative pattern adds it to the legend");
  await p.click('[data-legend] [role="radio"]:has-text("Full track")'); await p.waitForTimeout(200);

  // ---- 3. part toggles and solo
  const drawn = () => p.evaluate(() => [...document.querySelectorAll(".lanes g[data-layer]")].map(g => g.dataset.layer).join(","));
  await p.locator('[data-part-toggle="bass"] input').uncheck(); await p.waitForTimeout(100);
  check(await drawn() === "chords,hook", "3: unticking Bass hides the bass");
  await p.locator('[data-part-toggle="bass"] input').check(); await p.waitForTimeout(100);
  await p.locator('[data-part-toggle="hook"] input').click({ modifiers: ["Alt"] }); await p.waitForTimeout(100);
  const boxes = await p.evaluate(() => [...document.querySelectorAll("[data-part-toggle] input")].map(i => i.checked).join(","));
  check(await drawn() === "hook" && boxes === "true,false,false", `3: Alt-click on Melody shows only the melody (${boxes})`);
  await p.locator('[data-part-toggle="hook"] input').click({ modifiers: ["Alt"] }); await p.waitForTimeout(100);
  check(await drawn() === "chords,bass,hook", "3: Alt-click again brings every part back");

  // ---- 4. chord strip, playing chord, readout, correction
  const strip = await p.evaluate(() => [...document.querySelectorAll('[data-annotations="chords"] .ann-item')].map(e => ({ bar: +e.dataset.bar, text: e.textContent.trim() })));
  check(strip.length >= 4 && strip.every(x => x.text.replace(/\?$/, "") === (td.chords[x.bar] && td.chords[x.bar] !== "–" ? td.chords[x.bar] : "·")), `4: the chord strip names each visible bar's chord (${strip.slice(0, 6).map(x => x.text).join(" ")})`);
  const mid = strip[Math.min(5, strip.length - 1)];
  const tMid = await p.evaluate(b => { const el = document.querySelector(`[data-annotations="chords"] .ann-item[data-bar="${b}"]`), r = el.getBoundingClientRect(), box = el.parentElement.getBoundingClientRect(), l = document.querySelector(".lanes"); return +l.dataset.vpStart + ((r.left + r.width / 2 - box.left) / box.width) * +l.dataset.vpSpan; }, mid.bar);
  await setT(tMid); await p.waitForTimeout(250);
  const play1 = await p.evaluate(() => ({ bar: (document.querySelector('[data-annotations="chords"] .ann-item.playing') || {}).dataset?.bar, readout: document.querySelector("[data-readout]").textContent }));
  check(+play1.bar === mid.bar && new RegExp(`^Bar ${mid.bar + 1}\\.\\d`).test(play1.readout) && (td.chords[mid.bar] === "–" || play1.readout.endsWith(td.chords[mid.bar])), `4: the chord under the playhead is marked and the readout agrees ("${play1.readout}", bar ${mid.bar + 1}: ${td.chords[mid.bar]})`);
  await p.evaluate(() => document.querySelector("#explorer audio").play()); await p.waitForTimeout(2600);
  const play2 = await p.evaluate(() => ({ bar: +(document.querySelector('[data-annotations="chords"] .ann-item.playing') || { dataset: { bar: -1 } }).dataset.bar, readout: document.querySelector("[data-readout]").textContent }));
  await p.evaluate(() => document.querySelector("#explorer audio").pause());
  check(play2.bar > mid.bar && play2.readout.startsWith(`Bar ${play2.bar + 1}.`), `4: during playback the marked chord moves with the playhead (bar ${play2.bar + 1}, "${play2.readout}")`);
  await p.locator(`[data-annotations="chords"] .ann-item[data-bar="${mid.bar}"]`).click(); await p.waitForTimeout(150);
  check(await p.locator(".fix").count() === 1 && (await p.locator(".fix").innerText()).startsWith(`Bar ${mid.bar + 1}:`), "4: clicking a chord name opens its correction");
  const sel = p.locator('.fix select[aria-label="Change this bar\'s chord"]'), opts = (await sel.locator("option").allInnerTexts()).filter(o => o && !/Change|No chord/.test(o) && o !== td.chords[mid.bar]);
  await sel.selectOption(opts[0]); await p.waitForTimeout(200);
  const rec = await p.evaluate(() => (window.__td.timingCorrections || []).filter(c => c.type === "chord"));
  check(rec.length === 1 && rec[0].bar === mid.bar && rec[0].to === opts[0] && (await p.locator(`[data-annotations="chords"] .ann-item[data-bar="${mid.bar}"]`).innerText()).replace("?", "") === opts[0], `4: changing it records the correction and the strip shows ${opts[0]}`);
  await p.click('.fix button[aria-label="Close the chord correction"]');

  // ---- 5. zoom
  const z0 = await vp(); await p.click('.phead button[aria-label="Zoom in"]'); await p.waitForTimeout(100); const z1 = await vp();
  await p.click('.phead button:has-text("Fit")'); await p.waitForTimeout(100); const z2 = await vp();
  check(Math.abs(z1.span - z0.span / 2) < 0.05 && Math.abs(z2.span - td.dur) < 0.1 && z2.start < 0.05, `5: + halves the span (${z0.span.toFixed(1)} → ${z1.span.toFixed(1)} s), Fit shows the whole track (${z2.span.toFixed(1)} s)`);
  await p.click('.phead button[aria-label="Zoom in"]'); await p.click('.phead button[aria-label="Zoom in"]'); await p.waitForTimeout(100);

  // ---- 6. the arrangement as a scrubbing surface
  const map = await p.locator(".map").boundingBox(), y = map.y + map.height * 0.6, X = f => map.x + map.width * f;
  await p.evaluate(() => document.querySelector("#explorer audio").pause());
  await p.mouse.click(X(0.62), y); await p.waitForTimeout(250);
  let A = await audio(); const selA = await segIdx("data-checked");
  check(Math.abs(A.t - 0.62 * td.dur) < 0.4 && A.paused, `6: a click seeks to exactly that place (${A.t.toFixed(2)} s for ${(0.62 * td.dur).toFixed(2)} s) and stays paused`);
  check(selA === secAt(0.62 * td.dur), `6: and selects the section there (#${selA})`);
  await p.mouse.move(X(0.05), y); await p.mouse.down(); await p.mouse.move(X(0.12), y, { steps: 5 }); await p.mouse.move(X(0.2), y, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(250);
  A = await audio();
  check(secAt(A.t) !== selA, `6: (the scrub ends in another section, #${secAt(A.t)})`);
  check(Math.abs(A.t - 0.2 * td.dur) < 0.4 && A.paused && await segIdx("data-checked") === selA, `6: a drag scrubs to where it ends (${A.t.toFixed(2)} s), stays paused and keeps the selection`);
  const both = await p.evaluate(() => ({ playing: [...document.querySelectorAll("#explorer .seg")].findIndex(e => e.hasAttribute("data-playing")), checked: [...document.querySelectorAll("#explorer .seg")].findIndex(e => e.hasAttribute("data-checked")) }));
  check(both.playing === secAt(A.t) && both.checked === selA && both.playing !== both.checked, `6: the playing section (#${both.playing}, where the playhead is) is marked apart from the selected one (#${both.checked})`);
  await p.evaluate(() => document.querySelector("#explorer audio").play()); await p.waitForTimeout(400);
  await p.mouse.move(X(0.4), y); await p.mouse.down(); await p.mouse.move(X(0.5), y, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(700);
  A = await audio();
  check(!A.paused && A.t > 0.5 * td.dur && A.t < 0.5 * td.dur + 1.6, `6: scrubbing while playing keeps playing from the new place (${A.t.toFixed(2)} s, playing)`);
  await p.evaluate(() => document.querySelector("#explorer audio").pause()); await p.waitForTimeout(150);
  const t0 = (await audio()).t, v0 = await vp(), h = await p.locator(".vphandle").boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(h.x + h.width / 2 + 120, h.y + h.height / 2, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
  const v1 = await vp(), t1 = (await audio()).t, want = Math.min(td.dur - v0.span, v0.start + 120 / map.width * td.dur);
  check(Math.abs(v1.start - want) < 0.6 && Math.abs(t1 - t0) < 0.01 && v1.follow === "0", `6: dragging the view box's handle pans the piano roll (${v0.start.toFixed(1)} → ${v1.start.toFixed(1)} s) without seeking, and Follow turns off`);
  await p.locator(".vphandle").focus(); await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(100);
  check((await vp()).start < v1.start, "6: the handle also moves with the arrow keys");
  const s1 = td.sections[1], sx = map.x + map.width * ((s1.start + s1.end) / 2 / td.dur);
  await p.mouse.dblclick(sx, y); await p.waitForTimeout(250); const v2 = await vp();
  check(Math.abs(v2.start - s1.start) < 0.1 && Math.abs(v2.span - (s1.end - s1.start)) < 0.1, `6: a double-click fits that section in the piano roll (${v2.start.toFixed(1)}–${(v2.start + v2.span).toFixed(1)} s for ${s1.start.toFixed(1)}–${s1.end.toFixed(1)})`);
  const sc = await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1);
  check(sc, "the page still does not scroll at 1280×720");

  console.log("errors", errs); clearTimeout(guard); if (errs.length || failed) process.exitCode = 1; await b.close();
  if (!process.exitCode) console.log(`app piano roll tests passed (${n})`);
})();
