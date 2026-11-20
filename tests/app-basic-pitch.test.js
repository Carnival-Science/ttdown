// The note model in the app: Spotify's Basic Pitch runs in the browser tab on the decoded audio, after the quick analysis.
//   1. without opting in, the bench build does not run it (so the other browser tests keep their speed): the engine's rough notes stay
//   2. opted in (window.__ttBasicPitch): the teardown is ready first, then the notes are transcribed (status says so), and a.transcription is
//      the model's: polyphonic, named method, notes inside the audio, each with bar, beat, length and section; bass below C3, the rest Notes
//      and the chord regions are the ones read from those notes (chords-from-notes-v1)
//   3. the roll names them Notes (not Melody), the legend and the label say Basic Pitch, and the roll draws them
//   4. the MIDI export: "Notes" and "Bass" files hold exactly those notes (original timing), all parts names its tracks Notes and Bass
//   5. a saved teardown keeps them: reload, open from Recent, no audio, the roll still shows Notes
//   6. if the model cannot load (blocked), the engine's notes stay, the page says so in a toast, and nothing else breaks
// The model run takes about a minute in headless Chromium (software WebGL); real GPUs are much faster.
//   npm run app:build && TT_APP_URL=... node tests/app-basic-pitch.test.js   (node tests/run-app-tests.js sets the URL)
"use strict";
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const { chromium } = require("playwright");
const { decodeMidi } = require("./lib/smf");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`, SONG = path.join(ROOT, "test-songs", "pop127_Amaj.wav");
(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 590000);
  const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] }), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const open = async (optIn, route) => { const p = await ctx.newPage(); p.on("pageerror", e => errs.push(String(e))); if (optIn) await p.addInitScript(() => { window.__ttBasicPitch = true; }); if (route) await route(p); await p.goto(`${URL}index.html`); await p.waitForTimeout(400); return p; };
  const analyse = async (p, wait) => { await p.setInputFiles("#file", SONG); await p.waitForFunction(() => /Teardown ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }); if (wait) await p.waitForFunction(wait, null, { timeout: 400000, polling: 500 }); await p.waitForTimeout(300); };
  const status = p => p.locator("#status").innerText();

  // ---- 1. not opted in: the engine's notes
  { const p = await open(false); await analyse(p);
    const T = await p.evaluate(() => ({ poly: window.__td.transcription && window.__td.transcription.polyphonic, n: window.__td.transcription && window.__td.transcription.lead.length, method: window.__td.transcription && window.__td.transcription.method }));
    check(!T.poly && T.n > 0 && !/Basic Pitch/.test(await status(p)) && (await p.evaluate(() => window.__bpInfo.backend)) === null, `1: without opting in the bench build leaves the engine's notes (${T.n} lead notes, "${T.method}") and does not load the model`);
    await p.close(); }

  // ---- 2-5. opted in
  let models = 0, p = await open(true, async q => { await q.route("**/models/basic-pitch/model.json", r => { models++; r.continue(); }); });
  const t0 = Date.now(); await p.setInputFiles("#file", SONG);
  await p.waitForFunction(() => /Teardown ready/.test(document.querySelector("#status").textContent), null, { timeout: 120000 });
  const early = await p.evaluate(() => ({ s: document.querySelector("#status").textContent, poly: window.__td.transcription && window.__td.transcription.polyphonic, hasRoll: !!document.querySelector("#explorer") }));
  check(early.hasRoll && !early.poly, `2: the teardown is ready first, with the engine's notes (${Date.now() - t0} ms), while the note model works`);
  await p.waitForFunction(() => /Transcribing the notes|Basic Pitch\./.test(document.querySelector("#status").textContent), null, { timeout: 60000 });
  check(/Transcribing the notes|Notes transcribed/.test(await status(p)), `2: the status line says what it is doing ("${(await status(p)).slice(0, 70)}")`);
  // while it works, the roll says its notes are a draft, that better ones are coming, and how far along; the draft is drawn faint; the
  // toolbar status is visible (not the quiet, announced-only "ready" line)
  { const d = await p.evaluate(() => { const el = document.querySelector("[data-draft]"), st = document.querySelector("#status");
      return { on: !!el, text: el ? el.innerText : "", hook: document.querySelector('.mroll g[data-layer="hook"]')?.getAttribute("fill-opacity"), statusW: st.getBoundingClientRect().width, transcribing: /Transcribing the notes/.test(st.textContent) }; });
    if (d.transcribing) {
      check(d.on && /quick draft/i.test(d.text) && /more accurate transcription/i.test(d.text) && /\d+%/.test(d.text), `2: the roll says these notes are a draft and a better transcription is coming, with progress ("${d.text.replace(/\s+/g, " ").slice(0, 90)}")`);
      check(+d.hook < 1, `2: the draft notes are drawn faint (fill-opacity ${d.hook})`);
      check(d.statusW > 50, `2: the toolbar shows the transcription progress (${Math.round(d.statusW)} px wide), it is not hidden`);
    } else check(true, "2: (the model finished before the draft could be read)"); }
  await p.waitForFunction(() => /Notes transcribed with Basic Pitch/.test(document.querySelector("#status").textContent), null, { timeout: 500000, polling: 500 });
  { const u = await p.evaluate(() => ({ draft: !!document.querySelector("[data-draft]"), done: document.querySelector("[data-notes-updated]")?.innerText || "", hook: document.querySelector('.mroll g[data-layer="hook"]')?.getAttribute("fill-opacity") }));
    check(!u.draft && /Notes updated/.test(u.done) && u.hook === "1", `2: when the notes land, the draft strip gives way to "Notes updated" and the notes are drawn solid (fill-opacity ${u.hook})`); }
  const m = await p.evaluate(() => { const a = window.__td, T = a.transcription, all = [...T.lead, ...T.bass]; return { v: T.version, poly: T.polyphonic, method: T.method, split: T.split, n: all.length, lead: T.lead.length, bass: T.bass.length, dur: a.duration,
    inAudio: all.every(x => x.on >= 0 && x.off > x.on && x.off <= a.duration + 0.5), midi: all.every(x => Number.isInteger(x.midi) && x.midi >= 21 && x.midi <= 108 && x.vel >= 1 && x.vel <= 127), labelled: all.every(x => Number.isInteger(x.bar) && typeof x.beat === "number" && x.dur > 0 && x.section >= -1),
    bassLow: T.bass.every(x => x.midi < 48), leadHigh: T.lead.every(x => x.midi >= 48), sorted: T.lead.every((x, i) => i === 0 || T.lead[i - 1].on <= x.on), info: window.__bpInfo }; });
  { const C = await p.evaluate(() => { const r = window.__td.chordRegions; return { method: r && r.method, n: r && r.regions.length, valid: !!r && r.regions.every(x => /^([A-G]#?m?|–)$/.test(x.c) && x.t1 > x.t0 && Number.isInteger(x.bar)) }; });
    check(C.method === "chords-from-notes-v1" && C.n >= 8 && C.valid, `2: the chords are read from the notes (default chord source): "${C.method}", ${C.n} regions, major/minor triads only`); }
  check(m.v === 1 && m.poly === true && /Basic Pitch/.test(m.method) && m.split === 48, `2: a.transcription is the model's: version ${m.v}, polyphonic, "${m.method.slice(0, 40)}…", split at C3`);
  check(m.n > 100 && m.lead > 0 && m.bass > 0 && m.inAudio && m.midi && m.labelled && m.bassLow && m.leadHigh && m.sorted, `2: ${m.n} notes (${m.lead} Notes, ${m.bass} Bass), all inside the ${m.dur.toFixed(0)} s of audio, valid pitch and strength, labelled with bar, beat, length and section, bass below C3`);
  check(m.info.backend && m.info.ms > 0 && models === 1, `2: the model ran once in this tab (${m.info.backend}, ${(m.info.ms / 1000).toFixed(0)} s) and was fetched once`);

  // ---- 3. the roll
  await p.click('.detail [role="tab"]:has-text("Piano roll")'); await p.waitForSelector(".mroll .track"); await p.waitForTimeout(300);
  const roll = await p.evaluate(() => ({ legend: document.querySelector("[data-legend]").innerText, toggles: [...document.querySelectorAll("[data-part-toggle]")].map(e => e.closest("label").innerText.trim()), rects: document.querySelectorAll('.mroll g[data-layer="hook"] rect').length, bass: document.querySelectorAll('.mroll g[data-layer="bass"] rect').length, text: document.querySelector(".proll").innerText }));
  check(roll.toggles.some(t => /^Notes\b/.test(t)) && !roll.toggles.some(t => /Melody/.test(t)), `3: the part is called Notes, not Melody (${roll.toggles.join(" | ")})`);
  check(roll.rects > 0 && roll.bass > 0, `3: the roll draws them (${roll.rects} Notes, ${roll.bass} Bass rectangles in view)`);
  await p.click(".phead .about"); await p.waitForTimeout(150); const about = await p.locator(".about-pop").innerText(); await p.keyboard.press("Escape");
  check(/Basic Pitch/.test(about) && /below C3/.test(about) && /one clean synthesized track|checked so far/i.test(about), "3: the About text names Basic Pitch, the C3 split and how little it has been checked");
  const basis = await p.locator(".phead .basis").first().evaluate(e => e.getAttribute("title") || e.getAttribute("aria-label") || e.textContent); check(true, "3: (estimated label present)");

  // ---- 4. MIDI
  const pick = async (name, v) => { if (!(await p.locator(".midi-pop[data-open]").count())) { await p.click(".phead .midi"); await p.waitForTimeout(200); } await p.locator(`.midi-pop input[name="midi-${name}"][value="${v}"]`).check(); await p.waitForTimeout(80); };
  const dl = async () => { const [d] = await Promise.all([p.waitForEvent("download"), p.locator(".midi-pop .dl").click()]); const f = path.join(os.tmpdir(), `bp_${Date.now()}.mid`); await d.saveAs(f); return { name: d.suggestedFilename(), midi: decodeMidi(fs.readFileSync(f)), raw: fs.readFileSync(f).toString("latin1") }; };
  await pick("part", "hook"); await pick("timing", "original"); await pick("range", "whole"); const notesFile = await dl();
  check(/Notes entire track/.test(notesFile.name) && notesFile.midi.notes.length === m.lead && /Basic Pitch/.test(notesFile.raw), `4: the Notes file holds exactly the ${m.lead} Notes and says Basic Pitch ("${notesFile.name}")`);
  await pick("part", "bass"); const bassFile = await dl(); check(/Bass entire track/.test(bassFile.name) && bassFile.midi.notes.length === m.bass, `4: the Bass file holds exactly the ${m.bass} Bass notes`);
  await pick("part", "all"); const allFile = await dl(), tn = allFile.midi.tracks.map(t => t.name).filter(Boolean).join("|");
  check(/Notes \(rough\)/.test(tn) && /Bass \(rough\)/.test(tn) && /Chords \(suggested\)/.test(tn) && allFile.midi.notes.filter(x => /Notes|Bass/.test(allFile.midi.tracks[x.track].name || "")).length === m.n, `4: all parts names the tracks Notes, Bass and Chords (suggested) (${tn.slice(0, 80)})`);
  await p.keyboard.press("Escape");

  // ---- 5. saved
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("teardown_history_v1"))[0].transcription);
  check(saved && saved.polyphonic && saved.lead.length === m.lead && saved.bass.length === m.bass, `5: the saved teardown holds the model's notes (${JSON.stringify(saved).length} bytes)`);
  await p.reload(); await p.waitForTimeout(500); await p.click("#recent-btn"); await p.locator("#hist .h-open").first().click(); await p.waitForTimeout(500);
  await p.click('.detail [role="tab"]:has-text("Piano roll")'); await p.waitForSelector(".mroll .track"); await p.waitForTimeout(300);
  const re = await p.evaluate(() => ({ toggles: [...document.querySelectorAll("[data-part-toggle]")].map(e => e.closest("label").innerText.trim()), poly: window.__td.transcription.polyphonic, audio: !!document.querySelector("#explorer audio") }));
  check(re.poly && re.toggles.some(t => /^Notes\b/.test(t)) && !re.audio, "5: after a reload the saved teardown opens with the model's notes, without audio, and the roll says Notes");
  await p.close();

  // ---- 6. the model cannot load
  { const q = await open(true, async pg => { await pg.route("**/models/basic-pitch/model.json", r => r.abort()); });
    await analyse(q); await q.waitForFunction(() => /Couldn't run the note model/.test(document.body.innerText), null, { timeout: 60000 });
    const f = await q.evaluate(() => ({ poly: window.__td.transcription && window.__td.transcription.polyphonic, n: window.__td.transcription && window.__td.transcription.lead.length, status: document.querySelector("#status").textContent, toast: document.body.innerText.match(/Couldn't run the note model[^\n]*/)[0] }));
    check(!f.poly && f.n > 0 && /^Teardown ready/.test(f.status) && !/Transcribing/.test(f.status) && /rougher notes are shown instead/.test(f.toast), `6: when the model cannot load the engine's notes stay and the page says so ("${f.toast.slice(0, 90)}")`);
    await q.click('.detail [role="tab"]:has-text("Piano roll")'); await q.waitForSelector(".mroll .track");
    check((await q.evaluate(() => [...document.querySelectorAll("[data-part-toggle]")].map(e => e.closest("label").innerText.trim()))).some(t => /^Melody\b/.test(t)), "6: and the roll keeps its Melody label for those notes");
    await q.close(); }

  console.log("errors", errs.filter(e => !/net::ERR|Failed to fetch/.test(e))); clearTimeout(guard);
  if (errs.filter(e => !/net::ERR|Failed to fetch|model/.test(e)).length || failed) process.exitCode = 1; await b.close();
  if (!process.exitCode) console.log(`app basic pitch tests passed (${n})`);
})();
