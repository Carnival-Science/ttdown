// The MIDI menu of the piano roll, and the empty drum interface for a track with no drums.
//   * one "↓ MIDI ▾" menu: Melody / Bass / Chords (suggested) / All parts, for the selected section, the visible range or the whole track,
//     with a timing choice (Original timing / Follow tempo map / Quantized). Every unavailable choice says why. Quantized MIDI keeps the one
//     export gate (no confirmation step: available on a steady 4/4 track; a refused grid stays locked, and the roll says why); the files are read back with the independent
//     decoder (tests/lib/smf.js) and compared with the analysis
//   * an older teardown without whole-track notes writes the representative 4-bar phrase, exactly the notes the roll shows
//   * the section's chord names copied as text
//   * a track with no kick or snare: no Rhythm tab, no Drums overlay button, a notice, and a way to bring the tools back
//   * a steady track's one section is not called "Groove"
//   npm run app:build && TT_APP_URL=... node tests/app-part-midi.test.js   (npm run app:product-tests sets the URL)
"use strict";
const path = require("node:path"), fs = require("node:fs");
const { chromium } = require("playwright");
const { decodeMidi } = require("./lib/smf");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`, SONGS = path.join(ROOT, "test-songs"), OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] }), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const open = async () => { const p = await b.newPage({ viewport: { width: 1200, height: 950 }, acceptDownloads: true }); await p.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {}); p.on("pageerror", e => errs.push(String(e))); await p.goto(`${URL}index.html`); await p.waitForTimeout(300); return p; };
  const analyse = async (p, file) => { await p.setInputFiles("#file", file); await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }); await p.waitForTimeout(300); };
  const tabBtn = (p, name) => p.locator(`#explorer [role="tab"]:has-text("${name}")`);
  const menu = async p => { if (!(await p.locator(".midi-pop[data-open]").count())) { await p.click(".phead .midi"); await p.waitForTimeout(200); } return p.locator(".midi-pop"); };
  const choose = async (p, name, value) => { const m = await menu(p); await m.locator(`input[name="midi-${name}"][value="${value}"]`).check(); await p.waitForTimeout(80); };
  const modes = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.midi-pop input[name="midi-timing"]')].map(i => [i.value, { disabled: i.disabled, checked: i.checked, why: (i.closest("label").querySelector(".why") || {}).textContent || "" }])));
  const dl = p => p.locator(".midi-pop .dl");
  const selectSection = async (p, si) => { await p.locator("#explorer .seg").nth(si).click(); await p.waitForTimeout(200); };
  const domainHas = (p, fn) => p.evaluate(f => { const t = document.querySelector('.midi-pop label:has(input[value="all"]) .why'); return f === "allPartsMidi" ? !t || !/Not available in this version/.test(t.textContent) : !/Not available in this version/.test((document.querySelector('.midi-pop [data-timing="original"] .why') || {}).textContent || ""); }, fn);

  { const f = "pop127_Amaj", p = await open(); await analyse(p, path.join(SONGS, `${f}.wav`));
    const td = await p.evaluate(() => ({ hook: window.__td.hook, bass: window.__td.bassline, chords: window.__td.chords.bars, sections: window.__td.sections, bpm: window.__td.bpm, nBars: window.__td.nBars, tr: !!window.__td.transcription }));
    check(td.hook && td.hook.notes.length >= 3 && td.bass && td.bass.notes.length >= 2 && td.tr, `${f}: a top line, a bass line and whole-track notes were found`);
    const si = Math.max(0, td.sections.findIndex(s => td.hook.bar === s.startBar + 1)), sec = td.sections[si];
    await selectSection(p, si);
    await tabBtn(p, "Piano roll").click(); await p.waitForSelector('#explorer .detail [data-part="roll"]'); await p.waitForTimeout(150);
    const m = await menu(p);
    const labels = await m.locator("label.opt").allInnerTexts();
    check(["Melody", "Bass", "Chords (suggested)", "All parts (multitrack MIDI)", "Selected section", "Visible range", "Whole track", "Original timing", "Follow tempo map", "Quantized"].every(w => labels.some(l => l.startsWith(w))), `${f}: one MIDI menu offers each part, all parts, three ranges and three timings`);
    let md = await modes(p);
    check(Object.values(md).every(x => !x.disabled || x.why.trim().length > 5), `${f}: every unavailable timing shows its reason, none is hidden`);
    check(!md.quantized.disabled && md.quantized.checked, `${f}: on a steady 4/4 track Quantized is available straight away (no bar-line confirmation step) and is the default`);
    check(await p.locator('#explorer [data-part="roll"]').innerText().then(t => !/Quantized MIDI is unavailable|bar lines|Export/.test(t)), `${f}: the roll asks for no confirmation and points to no Export panel`);
    check(await p.locator("#exports").count() === 0, `${f}: there is no Export panel: MIDI comes from the piano roll`);
    const grab = async (nameRe, tag) => { const [d] = await Promise.all([p.waitForEvent("download"), dl(p).click()]); const file = path.join(OUT, `${f}_${tag}.mid`); await d.saveAs(file); check(nameRe.test(d.suggestedFilename()), `${f}: ${tag} file name "${d.suggestedFilename()}"`); return decodeMidi(fs.readFileSync(file)); };
    // melody, selected section: the transcribed notes of those bars, from the section's first bar
    await choose(p, "part", "hook"); await choose(p, "range", "section"); await choose(p, "timing", "quantized");
    const rd = await grab(/Top line bars \d+-\d+ \(rough transcription\)\.mid$/, "melody_section"), lenTicks = sec.bars * 16 * 24;
    const want = await p.evaluate(([b0, b1]) => window.__td.transcription.lead.filter(n => n.bar >= b0 && n.bar < b1).length, [sec.startBar, sec.startBar + sec.bars]);
    check(rd.notes.length > 0 && rd.notes.length <= want + 1 && rd.notes.every(x => x.onTick >= 0 && x.onTick < lenTicks + 24), `${f}: Melody for the section holds the transcribed notes of bars ${sec.startBar + 1}-${sec.startBar + sec.bars} (${rd.notes.length} of ${want})`);
    check(rd.timeSignatures.length === 1 && rd.tempos.length === 1 && Math.abs(rd.tempos[0].bpm - td.bpm) < 0.5 && /not the original timing/.test(rd.tracks[0].text[0].text), `${f}: quantized MIDI is 4/4 at one tempo near ${td.bpm} and says it is not the original timing`);
    // bass, whole track
    await choose(p, "part", "bass"); await choose(p, "range", "whole");
    const bd = await grab(/(808|Bass) entire track \(rough transcription\)\.mid$/, "bass_whole"), bw = await p.evaluate(() => window.__td.transcription.bass.length);
    check(bd.notes.length > 0 && bd.notes.length <= bw, `${f}: Bass for the whole track holds the transcribed bass (${bd.notes.length} of ${bw})`);
    // chords, selected section: suggested triads
    await choose(p, "part", "chords"); await choose(p, "range", "section");
    const cd = await grab(/Chords bars \d+-\d+ \(suggested voicings\)\.mid$/, "chords"), withChord = td.chords.slice(sec.startBar, sec.startBar + sec.bars).filter(c => c && c !== "–").length;
    check(cd.notes.length === withChord * 3 && /SUGGESTED voicings/.test(cd.tracks[0].text[0].text), `${f}: Chords MIDI is one suggested triad per detected bar (${cd.notes.length} notes, ${withChord} bars), labelled as suggested`);
    // all parts and the other timings, once the domain provides them
    await menu(p);
    if (await domainHas(p, "allPartsMidi")) {
      await choose(p, "part", "all"); await choose(p, "range", "whole");
      const ad = await grab(/^pop127_Amaj - all parts .*\.mid$/, "all_parts");
      check(ad.tracks.length >= 4, `${f}: All parts is one multitrack file (${ad.tracks.length} tracks: tempo + parts)`);
    } else check(/Not available/.test(await (await menu(p)).locator('label:has(input[value="all"])').innerText()), `${f}: All parts says it is not available in this version yet (domain.allPartsMidi missing)`);
    await menu(p); md = await modes(p);
    if (!md.original.disabled) {
      await choose(p, "part", "hook"); await choose(p, "range", "section"); await choose(p, "timing", "original");
      check(/Plays in time at [\d.]+ BPM/.test(await (await menu(p)).locator('[data-timing="original"]').innerText()), `${f}: Original timing names the reference tempo to set in the DAW`);
      const od = await grab(/\.mid$/, "melody_original"); check(od.notes.length > 0, `${f}: Original timing writes the melody (${od.notes.length} notes)`);
      const ot = od.tempos.length === 1 && od.tempos[0].bpm; check(ot > 40 && ot < 300, `${f}: the original-timing file carries one reference tempo (${ot && ot.toFixed(2)} BPM)`);
    } else check(md.original.why.length > 5, `${f}: Original timing is unavailable and says why ("${md.original.why}")`);
    await menu(p); md = await modes(p);
    if (!md["tempo-map"].disabled) {
      await choose(p, "part", "bass"); await choose(p, "range", "whole"); await choose(p, "timing", "tempo-map");
      const tm = await grab(/\.mid$/, "bass_tempomap"); check(tm.notes.length > 0 && tm.tempos.length >= 1, `${f}: Follow tempo map writes the bass with the song's tempo map (${tm.notes.length} notes, ${tm.tempos.length} tempo events)`);
    } else check(md["tempo-map"].why.length > 5, `${f}: Follow tempo map is unavailable and says why ("${md["tempo-map"].why}")`);
    // a pickup (a note before bar 1): the whole-track file starts before bar 1 and keeps it; the range says so
    if (!md.original.disabled) {
      await p.keyboard.press("Escape"); await p.evaluate(() => window.__tdReplace(y => { const n = y.transcription.lead[0]; y.transcription.lead.unshift({ ...n, on: 0.01, off: 0.1, bar: -1, beat: -0.5, midi: 99 }); })); await p.waitForTimeout(300);
      const wl = await (await menu(p)).locator('label:has(input[name="midi-range"][value="whole"])').innerText();
      check(/\+ pickup/.test(wl), `pickup: the Whole track range says it includes the pickup ("${wl.trim()}")`);
      await choose(p, "part", "hook"); await choose(p, "range", "whole"); await choose(p, "timing", "original");
      const pk = await grab(/entire track/, "melody_pickup"), nl = await p.evaluate(() => window.__td.transcription.lead.length);
      check(pk.notes.some(x => x.pitch === 99) && pk.notes.length === nl, `pickup: the whole-track file keeps the note before bar 1 (${pk.notes.length} of ${nl} notes)`);
    }
    // "Whole track" chords: every bar, not just the selected section (the panel used to pass the selected section)
    await choose(p, "part", "chords"); await choose(p, "range", "whole"); await choose(p, "timing", "quantized");
    { const wd = await grab(/Chords entire track/, "chords_whole"), nSpans = await p.evaluate(() => window.__sn(window.__td).chords.length);
      check(wd.notes.length >= nSpans && wd.notes.length >= cd.notes.length && Math.max(...wd.notes.map(x => x.offTick)) > (sec.startBar + sec.bars) * 16 * 24 - 24, `${f}: Whole track chords reach past the selected section (${wd.notes.length} notes, ends at step ${Math.max(...wd.notes.map(x => x.offTick)) / 24 | 0}; section ends at ${(sec.startBar + sec.bars) * 16})`); }
    await (await menu(p)).locator('button:has-text("Copy this section")').click(); await p.waitForTimeout(200);
    const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => null)), wantTxt = td.chords.slice(sec.startBar, sec.startBar + sec.bars).map(c => !c || c === "–" ? "N.C." : c).join(" | ");
    check(clip === wantTxt || /Copied: /.test(await p.locator(".tst-title").last().innerText()), `${f}: chord names copied as text (${(clip || "").slice(0, 40)}…)`);
    await p.keyboard.press("Escape");
    const sName = await p.locator("#explorer .detail h3.dtitle").first().innerText(); check(!/^Groove\b/.test(sName), `${f}: the section is not called "Groove" ("${sName.split("bars")[0].trim()}")`);
    check(await p.locator("#explorer [data-drumless]").count() === 0 && await tabBtn(p, "Rhythm").count() === 1, `${f}: a track with drums keeps the Rhythm tab and shows no drumless notice`);
    // an older teardown (no whole-track notes): the roll shows the representative pattern, and Melody writes exactly that 4-bar phrase
    await p.evaluate(() => window.__tdReplace(y => { delete y.transcription; })); await p.waitForTimeout(300);
    check(await p.locator(".lanes").getAttribute("data-source") === "pattern" && /Representative pattern/.test(await p.locator(".pat").innerText()), `${f}: without whole-track notes the roll shows the representative pattern, and says so`);
    await menu(p);
    if (!(await modes(p)).original.disabled) {
      await choose(p, "timing", "original");
      const hookRow = (await menu(p)).locator('label:has(input[value="hook"])');
      check(await hookRow.locator("input").isDisabled() && /whole-track notes/.test(await hookRow.innerText()), `${f}: without whole-track notes, Melody in original timing is off and says why`);
    }
    await choose(p, "timing", "quantized"); await choose(p, "part", "hook"); await choose(p, "range", "section");
    const pd = await grab(/Top line \(rough, 4-bar phrase\)\.mid$/, "melody_phrase");
    const exp = td.hook.notes.map(x => [x.midi, x.t]).sort((x, y) => x[1] - y[1] || x[0] - y[0]), got = pd.notes.map(x => [x.pitch, x.onTick / 24]);
    check(pd.notes.length === exp.length && got.every((g, i) => g[0] === exp[i][0] && Math.abs(g[1] - exp[i][1]) < 0.5) && pd.notes.every(x => x.onTick < 64 * 24), `${f}: the phrase MIDI holds exactly the ${exp.length} pattern notes the roll shows, in 4 bars`);
    await p.close(); }

  // a refused grid cannot be unlocked from the menu: a track whose tempo drifts keeps Quantized locked, and says it is blocked
  { const p = await open(); await analyse(p, path.join(SONGS, "time-fixtures", "drift_fast.wav"));
    await tabBtn(p, "Piano roll").click(); await p.waitForTimeout(200);
    if (await p.locator(".phead .midi").isEnabled()) { await menu(p); const md = await modes(p);
      check(md.quantized.disabled && /fixed bar grid/.test(md.quantized.why), `drift_fast: Quantized stays locked and says why one fixed grid can't be used (nothing to confirm): "${md.quantized.why.slice(0, 60)}"`);
      check(!md.original.disabled ? md.original.checked || md["tempo-map"].checked : md.original.why.length > 5, `drift_fast: a timing that follows the audio is offered instead and chosen by default (original ${md.original.disabled ? "off" : "on"}, tempo map ${md["tempo-map"].disabled ? "off: " + md["tempo-map"].why.slice(0, 40) : "on"})`); }
    else check(true, "drift_fast: nothing was read to write, so the menu is off");
    check(await p.locator('#explorer [data-part="roll"]').innerText().then(t => /Quantized MIDI is unavailable/.test(t) && /tempo/i.test(t)), "drift_fast: the roll says quantized MIDI is unavailable, and why (the tempo)");
    await p.close(); }

  { const p = await open(); await analyse(p, path.join(SONGS, "pop127_Amaj.wav"));
    // the analyzer finds no kick or snare anywhere (a replaced result, as after a correction: same object shape, same grid)
    await p.evaluate(() => window.__tdReplace(y => { const off = v => v.map(() => false); y.pattern.kick = off(y.pattern.kick); y.pattern.snare = off(y.pattern.snare); if (y.pattern.ghost) { y.pattern.ghost.kick = off(y.pattern.ghost.kick || []); y.pattern.ghost.snare = off(y.pattern.ghost.snare || []); } (y.drumParts || []).forEach(pt => { pt.kick = off(pt.kick); pt.snare = off(pt.snare); }); }));
    await p.waitForTimeout(300);
    check(await p.locator("#explorer [data-drumless]").count() === 1, "no drums: the notice says none were found");
    const note = await p.locator("#explorer [data-drumless]").innerText();
    check(/No kick or snare was found/.test(note) && !/instrumental|no vocals/i.test(note), "no drums: the notice claims nothing about vocals or instrumentals (\"" + note.slice(0, 60) + "…\")");
    check(await tabBtn(p, "Rhythm").count() === 0 && await p.locator('#explorer button:has-text("Drums")').count() === 0 && await tabBtn(p, "Piano roll").count() === 1, "no drums: no Rhythm tab and no Drums button; the Piano roll remains");
    check(await p.locator("#explorer .detail [data-part=\"rhythm\"]").count() === 0, "no drums: no empty drum grid is on the page");
    await p.locator('#explorer [data-drumless] button:has-text("Show the drum tools anyway")').click(); await p.waitForTimeout(200);
    check(await tabBtn(p, "Rhythm").count() === 1 && await p.locator("#explorer [data-drumless]").count() === 0, "'Show the drum tools anyway' brings them back");
    await p.close(); }

  { // no drums, MEASURED: the sound is not percussive (a piano piece): the analysis carries drumEvidence, and the page says so and hides the drum tools
    const p = await open(); await analyse(p, path.join(SONGS, "pop127_Amaj.wav"));
    const ev = await p.evaluate(() => window.__td.drumEvidence);
    check(ev && ev.method === "percussive-share-v1" && ev.found === true && ev.pAll > 0.5, `a track with drums carries drum evidence that says so (${JSON.stringify(ev)})`);
    await p.evaluate(() => window.__tdReplace(y => { y.drumEvidence = { method: "percussive-share-v1", windows: 8, pAll: 0.11, pLo: 0.1, found: false }; })); await p.waitForTimeout(300);
    const note = await p.locator("#explorer [data-drumless]").innerText().catch(() => "");
    check(/^No drums found in this track, so there is no drum analysis/.test(note) && /Vocals are not detected/.test(note), `measured: the notice says no drums were found and that vocals are not detected ("${note.slice(0, 70)}…")`);
    check(await tabBtn(p, "Rhythm").count() === 0 && await p.locator('#explorer button:has-text("Drums")').count() === 0, "measured: no Rhythm tab and no Drums button, although the pattern has a kick");
    await p.close(); }

  console.log("errors", errs); if (errs.length || failed) process.exitCode = 1; await b.close();
  if (!process.exitCode) console.log(`app part-midi tests passed (${n})`);
})();
