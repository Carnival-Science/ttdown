// The analysis workspace: ONE view, an audio application that happens to run in a browser. A toolbar (Open track, name, Recent, status,
// help) over a stage: a drop zone before a track is loaded, then the arrangement and the section editor with the findings about the whole
// track and the export beside them (an inspector) on wide screens, and a sheet on narrow ones.
//   one view (1280x720, the smallest comfortable desktop window):
//     0. before a track: the stage is a drop zone (with what you get and the "never uploaded" line); the toolbar has Open track, a name,
//        Recent (off until something is saved), status and help; the window does not scroll; a file dragged over anywhere shows the drop veil
//     0b. after: the window still does not scroll (scrollHeight <= the window), and the transport, song map, section tabs, a piano roll, the
//        findings and the export are all on screen; only the inspector and the editor scroll inside themselves
//     0c. the name in the toolbar renames the teardown (and its saved copy); Recent reopens it; help carries every label's meaning and the
//        synthetic-songs-only accuracy line, and the inspector's own accuracy line opens it; pressing a badge says what it means
//   wide (1360x860):
//     1. the inspector is a column beside the main area, not below it; the whole workspace fits the window (nothing to scroll to reach it)
//     2. the essentials of each finding (tempo, key, meter and bar 1) and the export buttons are in view without scrolling; the explanations,
//        alternatives and measured sound are folded away until asked for
//     3. changing the tab or the section changes the editor, not the page position; the export stays in view meanwhile
//     4. the tab bar is not sticky and never overlaps the piano roll
//     5. the inspector folds to a rail and back; folding it does not reset anything
//   narrow (390x844):
//     6. there is no inspector column; a bar offers Findings and Export, and the transport is play, time and mute with the rest on demand
//     7. Findings opens a sheet, Export opens it at the export; closing it keeps the selected section, the playback position, the
//        notes tab and a bar-grid confirmation
//     8. nothing is wider than the screen
//   npm run app:build && TT_APP_URL=... node tests/app-workspace.test.js   (npm run app:product-tests sets the URL)
"use strict";
const path = require("node:path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`, SONGS = path.join(ROOT, "test-songs");
(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 240000);
  const b = await chromium.launch(), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const open = async (vp, mobile) => { const ctx = await b.newContext({ viewport: vp, isMobile: !!mobile, hasTouch: !!mobile }), p = await ctx.newPage(); p.on("pageerror", e => errs.push(String(e))); await p.goto(`${URL}index.html`); await p.waitForTimeout(300); return p; };
  const analyse = async (p, file) => { await p.setInputFiles("#file", file); await p.waitForFunction(() => /Teardown ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }); await p.waitForTimeout(1200); }; // the page brings the workspace into view by itself
  const box = (p, sel) => p.locator(sel).first().boundingBox();
  const inView = async (p, sel) => { const r = await box(p, sel), vh = p.viewportSize().height; return !!r && r.y >= 0 && r.y + r.height <= vh + 1; };

  // ---- one view at 1280x720
  { const p = await open({ width: 1280, height: 720 });
    const page = () => p.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth - innerWidth }));
    const e = await page(), txt = await p.locator("#empty").innerText();
    check(await p.locator("#empty").isVisible() && /drop a track here/i.test(txt) && /never uploaded/.test(txt) && await p.locator(".workspace").count() === 0, "0: before a track the stage is a drop zone (no landing page, no workspace yet)");
    check(e.sh <= e.ih && e.sw <= 0, `0: and the window does not scroll (${e.sh} <= ${e.ih})`);
    check(await p.locator('.toolbar button:has-text("Open track")').isVisible() && await p.locator("#title").isVisible() && await p.locator("#recent-btn").isDisabled() && await p.locator('.toolbar button[aria-label^="Help"]').isVisible() && await p.locator("#status").isVisible(), "0: the toolbar has Open track, a name, Recent (disabled: nothing saved yet), the status and help");
    await p.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(4)], "x.wav", { type: "audio/wav" })); window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true })); });
    await p.waitForTimeout(150);
    check(await p.locator(".dropveil").isVisible(), "0: a file dragged over the window shows the drop veil, so it can be dropped anywhere");
    await p.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(4)], "x.wav", { type: "audio/wav" })); window.dispatchEvent(new DragEvent("dragleave", { dataTransfer: dt, bubbles: true })); }); await p.waitForTimeout(100);
    check(await p.locator(".dropveil").count() === 0, "0: and it goes away when the file leaves");

    await analyse(p, path.join(SONGS, "pop127_Amaj.wav"));
    const g = await page(), sel = s => inView(p, s);
    check(g.sh <= g.ih && g.sw <= 0, `0b: with a track loaded the window still does not scroll (${g.sh} <= ${g.ih})`);
    check(await sel('button[aria-label="Play"]') && await sel("#explorer .timeline") && await sel('.detail [role="tab"]:has-text("Notes")') && await sel('[data-finding="tempo"] .big') && await sel('#exports button:has-text("Download the song as MIDI")'), "0b: at 1280x720 the transport, the song map, the section tabs, the findings and the export are all on screen");
    await p.click('.detail [role="tab"]:has-text("Notes")'); await p.waitForTimeout(250);
    const roll = await p.locator(".detail .layer").first().boundingBox();
    check(!!roll && roll.y >= 0 && roll.y + 120 <= 720, `0b: and a piano roll starts on screen (top ${roll && Math.round(roll.y)} px) with the editor scrolling inside itself for the rest`);
    const scr = await p.evaluate(() => ({ ed: (() => { const t = document.querySelector(".tt-tabpanel:not([hidden])"); return t ? t.scrollHeight > t.clientHeight : false; })(), insp: (() => { const t = document.querySelector(".inspector .scroll"); return t.scrollHeight > t.clientHeight; })() }));
    check(scr.ed || scr.insp, `0b: only the editor (${scr.ed}) and the inspector (${scr.insp}) scroll, never the window`);

    // the name, Recent, help, badges
    await p.fill("#title", "Renamed take"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("teardown_history_v1"))[0].title);
    check(await p.evaluate(() => window.__td.title) === "Renamed take" && saved === "Renamed take", `0c: the name in the toolbar renames the teardown and its saved copy (${saved})`);
    check(await p.locator("#recent-btn").isEnabled(), "0c: Recent is on now that something is saved");
    await p.click("#recent-btn"); await p.waitForTimeout(250);
    check(/Renamed take/.test(await p.locator("#hist").innerText()), "0c: Recent lists it");
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    await p.click('.toolbar button[aria-label^="Help"]'); await p.waitForTimeout(250);
    const help = await p.locator("#howto").innerText();
    check(/Measured/i.test(help) && /Estimated/i.test(help) && /Assumed/i.test(help) && /Unknown/i.test(help) && /only on computer-generated songs/.test(help) && /not been measured on real recordings/.test(help), "0c: help carries all four labels and the synthetic-songs-only accuracy line");
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    await p.click(".inspector .acc"); await p.waitForTimeout(250);
    check(await p.locator("#howto").isVisible(), "0c: the inspector's own accuracy line opens the same help, without hunting");
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    await p.locator('[data-finding="tempo"] .basis').first().click(); await p.waitForTimeout(250);
    check(/Inferred by the analyzer/.test(await p.locator(".basis-pop").first().innerText()), "0c: pressing a badge says what it means for that number");
    await p.keyboard.press("Escape");
    const kinds = await p.evaluate(() => [...new Set([...document.querySelectorAll("#out .basis")].map(x => (x.className.match(/basis-(\w+)/) || [])[1]))].sort());
    check(["assumed", "estimated", "measured"].every(k => kinds.includes(k)), `0c: the labels are all still there (${kinds.join(", ")})`);
    await p.context().close(); }

  // ---- wide
  { const p = await open({ width: 1360, height: 860 }); await analyse(p, path.join(SONGS, "sections120.mp3"));
    const m = await box(p, ".workspace .main"), i = await box(p, ".workspace .inspector"), w = await box(p, ".workspace");
    check(i.x >= m.x + m.width && Math.abs(i.y - m.y) < 2 && i.width >= 300 && i.width <= 340, `1: the inspector is a ${Math.round(i.width)} px column beside the main area (x ${Math.round(i.x)} vs ${Math.round(m.x + m.width)}), starting at the same height`);
    check(w.height <= 860 && w.y >= -12 && w.y + w.height <= 872, `1: the whole workspace (${Math.round(w.height)} px, top at ${Math.round(w.y)}) fits the window`);
    check(await inView(p, '[data-finding="tempo"] .big') && await inView(p, '[data-finding="key"] .big') && await inView(p, '[data-finding="meter"] .big') && await inView(p, '#exports button:has-text("Download the song as MIDI")'), "2: tempo, key, meter and the export downloads are all in view at once, no scrolling");
    const closed = await p.evaluate(() => [...document.querySelectorAll(".inspector details.more")].map(d => d.open));
    check(closed.length >= 4 && closed.every(o => !o), `2: explanations, alternatives and measured sound are folded away (${closed.length} folds, all closed)`);
    await p.click('.inspector summary:has-text("Measured sound")', { position: { x: 14, y: 10 } }); await p.waitForTimeout(150);
    check(await p.locator('.inspector [data-finding="level"] dd').first().isVisible(), "2: opening “Measured sound” shows level, dynamics and frequency bands");
    await p.click('.inspector summary:has-text("Measured sound")', { position: { x: 14, y: 10 } });

    const y0 = await p.evaluate(() => scrollY);
    await p.click('.detail [role="tab"]:has-text("Notes")'); await p.waitForTimeout(250);
    await p.locator("#explorer .timeline .seg").nth(2).click(); await p.waitForTimeout(300);
    check(await p.evaluate(() => scrollY) === y0 && await inView(p, '#exports button:has-text("Analysis data")'), `3: changing the tab and the section leaves the page where it was (scrollY ${y0}) and the export in view`);
    const tl = await p.evaluate(() => { const el = document.querySelector(".tt-tablist"), cs = getComputedStyle(el); return { pos: cs.position }; });
    const bar = await box(p, ".detail .tt-tabbar"), roll = await p.locator(".detail .layer, .detail [data-part=notes] .pianoroll, .detail [data-part=notes] svg").first().boundingBox().catch(() => null);
    check(tl.pos !== "sticky" && (!roll || bar.y + bar.height <= roll.y + 1), `4: the tab bar is ${tl.pos}, not sticky, and ends above the notes (${Math.round(bar.y + bar.height)} <= ${roll ? Math.round(roll.y) : "n/a"})`);

    await p.click('.inspector .fold'); await p.waitForTimeout(350);
    const f = await box(p, ".workspace .inspector"), m2 = await box(p, ".workspace .main");
    check(f.width < 80 && m2.width > m.width + 200 && await p.locator('[data-finding="tempo"]').isHidden(), `5: folded, the inspector is a ${Math.round(f.width)} px rail and the main area grows (${Math.round(m.width)} to ${Math.round(m2.width)} px)`);
    await p.click('.inspector .fold'); await p.waitForTimeout(350);
    check(await p.locator('[data-finding="tempo"] .big').isVisible() && await p.locator('.detail [role="tab"][aria-selected="true"]').innerText() === "Notes", "5: unfolded again, and the editor is still on Notes, same section");
    await p.context().close(); }

  // ---- narrow
  { const p = await open({ width: 390, height: 844 }, true); await analyse(p, path.join(SONGS, "sections120.mp3"));
    check(await p.locator(".workspace .inspector").count() === 0 && await p.locator(".sheetbar").isVisible(), "6: no inspector column on a phone; a bar offers Findings and Export");
    check(/BPM/.test(await p.locator(".sheetbar .summary").innerText()) && await p.locator(".sheetbar .btn").allInnerTexts().then(t => t.join() === "Findings,Export"), "6: the bar says the tempo and key, and offers Findings and Export");
    const prim = await box(p, ".transport .primary");
    check(prim.height < 70 && await p.locator("#transport-more").isHidden() && await p.locator('button[aria-label="Play"]').isVisible(), `6: the transport is one ${Math.round(prim.height)} px row (play, time, mute); speed, loop and beat clicks are on demand`);
    await p.click('.transport .morebtn'); await p.waitForTimeout(200);
    check(await p.locator('#transport-more [role="radiogroup"][aria-label="Loop"]').isVisible() && await p.locator('#transport-more button:has-text("Beat clicks")').isVisible(), "6: “More” opens speed, loop, beat clicks and Follow");
    await p.click('button:has-text("Close")'); await p.waitForTimeout(150);

    await p.locator("#explorer .timeline .seg").nth(1).click(); await p.waitForTimeout(250);
    await p.click('.detail [role="tab"]:has-text("Harmony")'); await p.waitForTimeout(150);
    await p.evaluate(() => document.querySelector("#explorer audio").pause()); await p.waitForTimeout(150);
    const t0 = await p.evaluate(() => document.querySelector("#explorer audio").currentTime), sel0 = await p.locator("#explorer .seg[aria-checked=true]").getAttribute("data-label");
    await p.click('.sheetbar .btn:has-text("Findings")'); await p.waitForTimeout(700);
    check(await p.locator(".tt-sheet").isVisible() && await p.locator('.tt-sheet [data-finding="tempo"] .big').isVisible(), "7: Findings opens a sheet with the findings in it");
    await p.click(".tt-sheet-close"); await p.waitForTimeout(500);
    await p.click('.sheetbar .btn:has-text("Export")'); await p.waitForTimeout(700);
    check(await p.locator('.tt-sheet #exports button:has-text("Download the song as MIDI")').isVisible() && await p.locator('.tt-sheet [data-finding="tempo"]').isHidden(), "7: Export opens the sheet at the export, without the findings");
    await p.click(".tt-sheet-close"); await p.waitForTimeout(500);
    const t1 = await p.evaluate(() => document.querySelector("#explorer audio").currentTime);
    check(await p.locator("#explorer .seg[aria-checked=true]").getAttribute("data-label") === sel0 && await p.locator('.detail [role="tab"][aria-selected="true"]').innerText() === "Harmony" && Math.abs(t1 - t0) < 0.5, `7: after the sheets, the section (${sel0}), the Harmony tab and the playback position (${t0.toFixed(1)} s) are unchanged`);
    check(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "8: nothing is wider than the screen");
    await p.context().close(); }

  // the bar-grid confirmation survives closing the sheet (a steady track, so the bar-aligned exports can be confirmed)
  { const p = await open({ width: 390, height: 844 }, true); await analyse(p, path.join(SONGS, "pop127_Amaj.wav"));
    await p.click('.sheetbar .btn:has-text("Export")'); await p.waitForTimeout(700);
    check(await p.locator('.tt-sheet #exports button:has-text("Confirm and unlock")').count() === 1, "7: a steady track asks for the bar lines to be checked");
    await p.locator('.tt-sheet #exports input[type=checkbox]').nth(0).check(); await p.locator('.tt-sheet #exports input[type=checkbox]').nth(1).check();
    await p.click('.tt-sheet #exports button:has-text("Confirm and unlock")'); await p.waitForTimeout(200);
    check(await p.locator('.tt-sheet #exports button:has-text("Download the song as MIDI")').isEnabled(), "7: confirming the bar lines unlocks the downloads");
    await p.click(".tt-sheet-close"); await p.waitForTimeout(500); await p.click('.sheetbar .btn:has-text("Export")'); await p.waitForTimeout(600);
    check(await p.locator('.tt-sheet #exports button:has-text("Download the song as MIDI")').isEnabled(), "7: reopened, the confirmation is still there (closing the sheet resets nothing)");
    await p.context().close(); }

  clearTimeout(guard); console.log("errors", errs); if (errs.length || failed) process.exitCode = 1; await b.close();
  if (!process.exitCode) console.log(`app workspace tests passed (${n})`);
})();
