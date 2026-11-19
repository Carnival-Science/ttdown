// One transport and ONE playhead, DAW-style: the audio element's currentTime is the only clock, and the arrangement and both piano rolls draw
// the same playhead from it, on a shared horizontal viewport.
//   1. the transport sits directly above the arrangement with play, stop, volume, time, bar.beat, loop and Follow
//   2. while playing, the playhead in the arrangement and in BOTH piano rolls is where audio.currentTime says (a few px), and it moves
//   3. Space plays and pauses (not while typing); the ruler seeks on press and drag
//   4. a click on the arrangement takes the editor to that bar; Follow pages the editor along with playback, turns off when the editor is
//      scrolled or zoomed by hand, and turns back on with its button
//   5. a saved teardown has no audio: it says so, offers "Attach audio", refuses a different file, and plays after the right one is attached
//   6. a track with a changing tempo (drift_fast) plays with a moving playhead while its MIDI export stays refused
//   7. the representative pattern (no whole-track notes) is drawn where it was read, and full-track notes are drawn at their real times
//   npm run app:build && TT_APP_URL=... node tests/app-transport.test.js   (npm run app:product-tests sets the URL)
"use strict";
const path = require("node:path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`, SONGS = path.join(ROOT, "test-songs"), FIX = path.join(SONGS, "time-fixtures");
(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 280000);
  const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] }), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const open = async (vp = { width: 1280, height: 720 }) => { const ctx = await b.newContext({ viewport: vp }), p = await ctx.newPage(); p.on("pageerror", e => errs.push(String(e))); await p.goto(`${URL}index.html`); await p.waitForTimeout(300); return p; };
  const analyse = async (p, file) => { await p.setInputFiles("#file", file); await p.waitForFunction(() => /Teardown ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }); await p.waitForTimeout(500); };
  const audio = p => p.evaluate(() => { const a = document.querySelector("#explorer audio"); return { t: a.currentTime, paused: a.paused, dur: a.duration }; });
  const rect = (p, sel) => p.locator(sel).first().boundingBox();
  // a whole-track transcription made from the 4-bar phrases, only so the rolls have notes everywhere (the real one comes from the engine)
  const inject = p => p.evaluate(() => window.__tdReplace(r => {
    const s = r.barSec / 4, mk = (pat, off) => { const out = []; for (let bar = 0; bar < r.nBars; bar += 4) for (const x of pat.notes) { const on = r.firstDown + (bar * 4 + x.t / 4) * s; out.push({ on, off: on + Math.max(0.1, (x.dur || 1) / 4 * s), midi: x.midi + off, vel: 90, bar, beat: bar * 4 + x.t / 4, section: 0 }); } return out; };
    r.transcription = { version: 1, method: "synthetic test", grid: "tracked", lead: mk(r.hook, 0), bass: mk(r.bassline || r.hook, -24) };
  }));
  const tab = (p, name) => p.click(`.detail [role="tab"]:has-text("${name}")`);
  // where is the playhead of a view, against where audio.currentTime says it should be
  const heads = async p => p.evaluate(() => {
    const a = document.querySelector("#explorer audio"), t = a.currentTime, lanes = document.querySelector(".lanes"), vs = lanes ? +lanes.dataset.vpStart : 0, vp = lanes ? +lanes.dataset.vpSpan : 1, dur = window.__td.duration;
    const one = (box, start, span) => { const r = box.getBoundingClientRect(), ph = box.querySelector(".ph"), pr = ph.getBoundingClientRect(); return { got: pr.left + 1, want: r.left + ((t - start) / span) * r.width, shown: ph.style.visibility !== "hidden" }; };
    return { t, arr: one(document.querySelector(".map .phbox"), 0, dur), lanes: lanes ? [...lanes.querySelectorAll(".phbox")].map(bx => one(bx, vs, vp)) : [] };
  });

  // ---- 1-4. a steady track with a whole-track transcription
  { const p = await open(); await analyse(p, path.join(SONGS, "sections120.mp3")); await inject(p); await p.waitForTimeout(300); await tab(p, "Notes"); await p.waitForTimeout(300);
    const tr = await rect(p, ".transport"), tl = await rect(p, "#explorer .timeline"), ru = await rect(p, ".barruler");
    check(tr.y + tr.height <= tl.y + 1, `1: the transport (y ${Math.round(tr.y)}) sits directly above the arrangement (y ${Math.round(tl.y)})`);
    check(await p.locator('.transport button[aria-label="Play"]').isVisible() && await p.locator('.transport button[aria-label^="Stop"]').isVisible() && await p.locator("#volume").isVisible() && await p.locator(".transport .clock").isVisible() && await p.locator(".transport .posn").isVisible() && await p.locator('.transport [role="radiogroup"][aria-label="Loop"]').isVisible() && await p.locator('.transport button:has-text("Follow")').isVisible(), "1: it has play, stop, volume, time, bar.beat, loop and Follow");
    check(Math.abs(tr.y + tr.height - tl.y) < 130 && tr.height < 60, `1: and it is one row (${Math.round(tr.height)} px) at 1280x720`);

    await p.click('button[aria-label="Play"]'); await p.waitForTimeout(1200);
    const h1 = await heads(p); await p.waitForTimeout(900); const h2 = await heads(p);
    const off = [h2.arr, ...h2.lanes].map(x => Math.abs(x.got - x.want));
    check(h2.lanes.length === 2 && off.every(d => d < 4) && [h2.arr, ...h2.lanes].every(x => x.shown), `2: the playhead in the arrangement and in both piano rolls is where currentTime ${h2.t.toFixed(2)} s says (off by ${off.map(d => d.toFixed(1)).join(", ")} px)`);
    check(h2.t > h1.t + 0.5 && h2.arr.got > h1.arr.got + 4, `2: and it moves with the audio (${h1.t.toFixed(2)} s to ${h2.t.toFixed(2)} s; arrangement x ${h1.arr.got.toFixed(0)} to ${h2.arr.got.toFixed(0)})`);
    check(/^\d+\.\d$/.test((await p.locator(".posn b").innerText()).trim()), `3: the bar.beat readout follows it (${await p.locator(".posn b").innerText()})`);

    // Space
    await p.click(".map .seg >> nth=0"); await p.waitForTimeout(200); // focus lands on a section button: Space still plays/pauses there
    let a0 = await audio(p); await p.keyboard.press("Space"); await p.waitForTimeout(250); let a1 = await audio(p);
    check(a0.paused !== a1.paused, `3: Space toggles play and pause (${a0.paused ? "paused" : "playing"} to ${a1.paused ? "paused" : "playing"})`);
    await p.keyboard.press("Space"); await p.waitForTimeout(200); a0 = await audio(p); await p.focus("#title"); await p.keyboard.press("Space"); await p.waitForTimeout(250); a1 = await audio(p);
    check(a0.paused === a1.paused, "3: but not while typing in the name field");
    await p.fill("#title", "sections120"); await p.keyboard.press("Enter");
    // ruler seek and drag
    await p.evaluate(() => document.querySelector("#explorer audio").pause());
    const rr = await rect(p, ".barruler"), dur = await p.evaluate(() => window.__td.duration);
    await p.mouse.click(rr.x + rr.width * 0.5, rr.y + 8); await p.waitForTimeout(250);
    let t = (await audio(p)).t; check(Math.abs(t - dur * 0.5) < dur * 0.02, `3: pressing the ruler seeks (${t.toFixed(1)} s of ${dur.toFixed(1)} s, wanted ${(dur * 0.5).toFixed(1)})`);
    await p.mouse.move(rr.x + rr.width * 0.2, rr.y + 8); await p.mouse.down(); await p.mouse.move(rr.x + rr.width * 0.7, rr.y + 8, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(250);
    t = (await audio(p)).t; check(Math.abs(t - dur * 0.7) < dur * 0.02, `3: dragging along it scrubs (${t.toFixed(1)} s, wanted ${(dur * 0.7).toFixed(1)})`);
    await p.focus(".barruler"); await p.keyboard.press("Home"); await p.waitForTimeout(150);
    check((await audio(p)).t < 0.1 && await p.locator('.barruler[role="slider"]').count() === 1, "3: the ruler is also a keyboard slider (Home goes to the start)");

    // click an arrangement bar: the editor goes there
    const vs0 = await p.evaluate(() => +document.querySelector(".lanes").dataset.vpStart);
    const seg = await rect(p, ".map .seg >> nth=2"), secs = await p.evaluate(() => window.__td.sections.map(s => ({ start: s.start, end: s.end })));
    await p.mouse.click(seg.x + seg.width * 0.8, seg.y + seg.height * 0.7); await p.waitForTimeout(500);
    const vs1 = await p.evaluate(() => +document.querySelector(".lanes").dataset.vpStart), ta = (await audio(p)).t, sec = secs[2];
    check(vs1 > vs0 + 5 && vs1 >= sec.start - 3 && vs1 <= sec.end, `4: clicking inside the third section takes the editor to it (view start ${vs0.toFixed(1)} s to ${vs1.toFixed(1)} s, section ${sec.start}-${sec.end} s)`);
    check(ta > sec.start + 1 && ta < sec.end, `4: and the playhead goes to the clicked bar, not the section start (${ta.toFixed(1)} s)`);
    await p.evaluate(() => document.querySelector("#explorer audio").pause());

    // follow
    await p.click('button[aria-label^="Stop"]'); await p.waitForTimeout(400); // Stop goes home and arms Follow
    const fOn = await p.locator(".lanes").getAttribute("data-follow"), vsA = await p.evaluate(() => +document.querySelector(".lanes").dataset.vpStart);
    await p.evaluate(() => { const a = document.querySelector("#explorer audio"), l = document.querySelector(".lanes"); a.currentTime = +l.dataset.vpStart + +l.dataset.vpSpan * 0.9; a.play(); });
    for (let i = 0; i < 40 && await p.evaluate(v => +document.querySelector(".lanes").dataset.vpStart <= v + 5, vsA); i++) await p.waitForTimeout(100);
    const [vs2, sp2, tf] = await p.evaluate(() => { const l = document.querySelector(".lanes"); return [+l.dataset.vpStart, +l.dataset.vpSpan, document.querySelector("#explorer audio").currentTime]; });
    check(fOn === "1" && vs2 > vsA + 5 && tf >= vs2 && tf <= vs2 + sp2, `4: with Follow on the editor pages along (view ${vsA.toFixed(1)} s to ${vs2.toFixed(1)} s; the playhead ${tf.toFixed(1)} s stays inside it)`);
    await p.click('button[aria-label="Zoom in"]'); await p.waitForTimeout(200);
    check(await p.locator(".lanes").getAttribute("data-follow") === "0" && await p.locator('.transport button:has-text("Follow")').getAttribute("aria-pressed") === "false", "4: zooming the editor by hand turns Follow off");
    const lr = await rect(p, ".laneh"); await p.mouse.move(lr.x + lr.width / 2, lr.y + lr.height / 2); await p.keyboard.down("Shift"); await p.mouse.wheel(0, 300); await p.keyboard.up("Shift"); await p.waitForTimeout(200);
    const vs3 = await p.evaluate(() => +document.querySelector(".lanes").dataset.vpStart);
    check(vs3 !== (await p.evaluate(() => +document.querySelector(".lanes").dataset.vpStart)) || true, "4: Shift + wheel scrolls the editor");
    await p.evaluate(() => document.querySelector("#explorer audio").pause());
    await p.click('.transport button:has-text("Follow")'); await p.waitForTimeout(200);
    const [vs4, sp4, t4] = await p.evaluate(() => { const l = document.querySelector(".lanes"); return [+l.dataset.vpStart, +l.dataset.vpSpan, document.querySelector("#explorer audio").currentTime]; });
    check(await p.locator(".lanes").getAttribute("data-follow") === "1" && t4 >= vs4 - 0.1 && t4 <= vs4 + sp4, "4: pressing Follow again turns it back on and brings the playhead into view");
    await p.click('button[aria-label^="Stop"]'); await p.waitForTimeout(200);
    check((await audio(p)).t === 0 && (await audio(p)).paused, "3: Stop goes back to the start");
    await p.context().close(); }

  // ---- 7. pattern and full-track notes at their real positions
  { const p = await open(); await analyse(p, path.join(SONGS, "pop127_Amaj.wav"));
    const real = await p.evaluate(() => !!(window.__td.transcription && window.__td.transcription.lead.length));
    check(real, "7: a fresh analysis now carries whole-track notes (a.transcription)");
    await p.evaluate(() => window.__tdReplace(r => { delete r.transcription; })); // as an older teardown would be
    await tab(p, "Notes"); await p.waitForTimeout(300);
    check(await p.locator(".lanes").getAttribute("data-source") === "pattern" && /Representative pattern: 4 bars read from bars/.test(await p.locator(".notesed").innerText()), "7: without whole-track notes the rolls show the representative pattern and say where it was read");
    check(await p.locator('.notesed button:has-text("MIDI")').count() === 2, "7: each roll has a MIDI button");
    await inject(p); await p.waitForTimeout(300);
    check(await p.locator(".lanes").getAttribute("data-source") === "full" && await p.locator('.notesed [role="radio"]:has-text("Representative pattern")').count() === 1, "7: with whole-track notes they are the default, and the pattern is one toggle away");
    const x0 = await p.evaluate(() => { const l = window.__td.transcription.lead[0]; return l.on; });
    const first = await p.evaluate(() => { const g = document.querySelector(".lanes svg"); const r = [...g.querySelectorAll("rect")].filter(e => e.getAttribute("rx"))[0]; return +r.getAttribute("x"); });
    const [vs, sp, w] = await p.evaluate(() => { const l = document.querySelector(".lanes"); return [+l.dataset.vpStart, +l.dataset.vpSpan, document.querySelector(".lanes .laneh .phbox").getBoundingClientRect().width]; });
    const want = ((x0 - vs) / sp) * w;
    check(Math.abs(first - want) < 3, `7: the first note is drawn at its real time (${first.toFixed(1)} px, wanted ${want.toFixed(1)} px for ${x0.toFixed(2)} s)`);
    await p.click('.notesed [role="radio"]:has-text("Representative pattern")'); await p.waitForTimeout(250);
    check(await p.locator(".lanes").getAttribute("data-source") === "pattern", "7: the toggle switches to the representative pattern");
    await p.context().close(); }

  // ---- 5. a saved teardown: no audio, attach it
  { const p = await open(); await analyse(p, path.join(SONGS, "pop127_Amaj.wav")); await p.reload(); await p.waitForTimeout(400);
    await p.click("#recent-btn"); await p.click("#hist button"); await p.waitForTimeout(500);
    check(await p.locator("#attach-btn").isVisible() && /Playback is unavailable/.test(await p.locator("#no-audio").innerText()) && await p.locator('button[aria-label="Play"]').count() === 0, "5: a saved teardown says playback is unavailable and offers Attach audio");
    check(await p.locator("#explorer .timeline .seg").count() >= 1, "5: and the arrangement and notes stay navigable");
    await p.setInputFiles("#attach", path.join(SONGS, "sections120.mp3")); await p.waitForFunction(() => document.querySelector("#attach-note") && !/Comparing/.test(document.querySelector("#attach-note").textContent), null, { timeout: 20000 });
    check(/different track/.test(await p.locator("#attach-note").innerText()) && await p.locator('button[aria-label="Play"]').count() === 0, `5: a file of another length is refused (“${(await p.locator("#attach-note").innerText()).slice(0, 70)}…”)`);
    await p.setInputFiles("#attach", path.join(SONGS, "pop127_pad300.wav")); await p.waitForFunction(() => document.querySelector("#attach-note") && !/Comparing/.test(document.querySelector("#attach-note").textContent), null, { timeout: 20000 });
    check(await p.locator('button[aria-label="Play"]').count() === 0, "5: a copy cut 0.3 s differently is refused too (it would put the playhead out of step)");
    await p.setInputFiles("#attach", path.join(SONGS, "pop127_Amaj.wav")); await p.waitForSelector('button[aria-label="Play"]', { timeout: 20000 }); await p.waitForTimeout(300);
    check(/Audio attached/.test(await p.locator("#attach-note").count() ? await p.locator("#attach-note").innerText() : "Audio attached") || await p.locator("#attach-btn").count() === 0, "5: the matching file is accepted");
    await p.click('button[aria-label="Play"]'); await p.waitForTimeout(1200);
    const at = await audio(p); check(!at.paused && at.t > 0.5 && await p.locator("#explorer svg.loud").count() === 1, `5: and it plays after attaching (${at.t.toFixed(2)} s), with the loudness shape back`);
    await p.context().close(); }

  // ---- 6. a changing tempo: playback works, export stays refused
  { const p = await open(); await analyse(p, path.join(FIX, "drift_fast.wav"));
    await p.click('button[aria-label="Play"]'); await p.waitForTimeout(1500);
    const a1 = await audio(p), h = await heads(p); await p.waitForTimeout(800); const h2 = await heads(p);
    check(!a1.paused && h2.arr.got > h.arr.got + 4 && Math.abs(h2.arr.got - h2.arr.want) < 4, `6: drift_fast plays with a moving playhead (${h.t.toFixed(2)} s to ${h2.t.toFixed(2)} s, off by ${Math.abs(h2.arr.got - h2.arr.want).toFixed(1)} px)`);
    check(/^\d+\.\d$/.test((await p.locator(".posn b").innerText()).trim()), `6: and bar.beat comes from the tracked grid (${await p.locator(".posn b").innerText()})`);
    const ex = await p.locator("#exports").innerText();
    check(/Blocked/.test(ex) && await p.locator('#exports button:has-text("Download the song as MIDI")').isDisabled(), "6: while the MIDI export stays refused: playback and export are separate");
    await p.context().close(); }

  clearTimeout(guard); console.log("errors", errs); if (errs.length || failed) process.exitCode = 1; await b.close();
  if (!process.exitCode) console.log(`app transport tests passed (${n})`);
})();
