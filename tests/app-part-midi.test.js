// Per-part MIDI beside the piano rolls and chords, and the empty drum interface for a track with no drums.
//   * Top line and Bass: "MIDI" downloads the DISPLAYED 4-bar phrase through the same writer as the full package, read back here with the
//     independent decoder (tests/lib/smf.js) and compared with the notes on screen; locked until the bar lines are confirmed (same gate)
//   * Harmony: the section's chords as suggested triads, and the chord names copied as text
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
  const midiBtns = p => p.locator('#explorer .detail [data-part="notes"] button:has-text("MIDI")');

  { const f = "pop127_Amaj", p = await open(); await analyse(p, path.join(SONGS, `${f}.wav`));
    const td = await p.evaluate(() => ({ hook: window.__td.hook, bass: window.__td.bassline, chords: window.__td.chords.bars, sections: window.__td.sections, bpm: window.__td.bpm, steady: window.__td.steady }));
    check(td.hook && td.hook.notes.length >= 3 && td.bass && td.bass.notes.length >= 2, `${f}: a top line and a bass line were found`);
    const si = td.sections.findIndex(s => td.hook.bar === s.startBar + 1); check(si >= 0, `${f}: the section the notes come from is #${si}`);
    await p.locator("#explorer .seg").nth(si).click(); await p.waitForTimeout(200);
    await tabBtn(p, "Notes").click(); await p.waitForSelector('#explorer .detail [data-part="notes"]'); await p.waitForTimeout(150);
    check(await midiBtns(p).count() === 2, `${f}: a MIDI button sits beside Top line and beside Bass (found ${JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("#explorer .detail button")].map(x => x.textContent.trim())))})`);
    check(await midiBtns(p).first().isDisabled() && await midiBtns(p).nth(1).isDisabled() && /MIDI is locked/.test(await p.locator("#explorer .detail").innerText()), `${f}: both are locked, with the reason, until the bar lines are confirmed`);
    await p.locator('#exports input[type=checkbox]').nth(0).check(); await p.locator('#exports input[type=checkbox]').nth(1).check(); await p.locator('#exports button:has-text("Confirm and unlock")').click(); await p.waitForTimeout(200);
    check(await midiBtns(p).first().isEnabled() && await midiBtns(p).nth(1).isEnabled(), `${f}: confirming in Export unlocks them (one shared gate)`);
    const grab = async (btn, nameRe, tag) => { const [dl] = await Promise.all([p.waitForEvent("download"), btn.click()]); const file = path.join(OUT, `${f}_${tag}.mid`); await dl.saveAs(file); check(nameRe.test(dl.suggestedFilename()), `${f}: ${tag} file name "${dl.suggestedFilename()}"`); return decodeMidi(fs.readFileSync(file)); };
    const same = (d, notes, tag) => {
      const exp = notes.map(x => [x.midi, x.t]).sort((x, y) => x[1] - y[1] || x[0] - y[0]), got = d.notes.map(x => [x.pitch, x.onTick / 24]);
      check(d.notes.length === notes.length && got.every((g, i) => g[0] === exp[i][0] && Math.abs(g[1] - exp[i][1]) < 0.5), `${f}: ${tag} MIDI holds exactly the ${notes.length} notes the piano roll shows (pitches and onsets)`);
      check(d.notes.every(x => x.onTick < 64 * 24) && d.timeSignatures.length === 1 && d.tempos.length === 1 && Math.abs(d.tempos[0].bpm - td.bpm) < 0.5, `${f}: ${tag} MIDI is the 4-bar phrase (not the song repeated), 4/4, one tempo near ${td.bpm}`);
      check(/rough/.test(d.tracks[0].text[0].text) && /not the original timing/.test(d.tracks[0].text[0].text), `${f}: ${tag} MIDI says rough and quantized`);
    };
    same(await grab(midiBtns(p).first(), /Top line \(rough, 4-bar phrase\)\.mid$/, "topline"), td.hook.notes, "Top line");
    same(await grab(midiBtns(p).nth(1), /(808|Bass) \(rough, 4-bar phrase\)\.mid$/, "bass"), td.bass.notes, "Bass");
    await tabBtn(p, "Harmony").click(); await p.waitForTimeout(150);
    const sec = td.sections[si], cbtn = p.locator('#explorer .detail button:has-text("Chords MIDI")');
    check(await cbtn.isEnabled(), `${f}: the chord button is unlocked by the same confirmation`);
    const cd = await grab(cbtn, /Chords bars \d+-\d+ \(suggested voicings\)\.mid$/, "chords"), withChord = td.chords.slice(sec.startBar, sec.startBar + sec.bars).filter(c => c && c !== "–").length;
    check(cd.notes.length === withChord * 3 && /SUGGESTED voicings/.test(cd.tracks[0].text[0].text), `${f}: chords MIDI is one suggested triad per detected bar (${cd.notes.length} notes, ${withChord} bars), labelled as suggested`);
    await p.locator('#explorer .detail button:has-text("Copy chord names")').click(); await p.waitForTimeout(200);
    const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => null)), want = td.chords.slice(sec.startBar, sec.startBar + sec.bars).map(c => !c || c === "–" ? "N.C." : c).join(" | ");
    check(clip === want || /Copied: /.test(await p.locator("#explorer .detail [role=status]").first().innerText()), `${f}: chord names copied as text (${(clip || "").slice(0, 40)}…)`);
    const sName = await p.locator("#explorer .detail h3").first().innerText(); check(!/^Groove\b/.test(sName), `${f}: the section is not called "Groove" ("${sName.split("bars")[0].trim()}")`);
    check(await p.locator("#explorer [data-drumless]").count() === 0 && await tabBtn(p, "Rhythm").count() === 1, `${f}: a track with drums keeps the Rhythm tab and shows no drumless notice`);
    await p.close(); }

  // a locked grid cannot be unlocked from a part button: a track whose tempo drifts is refused, so its parts stay locked
  { const p = await open(); await analyse(p, path.join(SONGS, "time-fixtures", "drift_fast.wav"));
    const si = await p.evaluate(() => { const a = window.__td; return a.hook && a.hook.notes.length >= 3 ? a.sections.findIndex(s => a.hook.bar === s.startBar + 1) : -1; });
    if (si >= 0) { await p.locator("#explorer .seg").nth(si).click(); await tabBtn(p, "Notes").click(); await p.waitForTimeout(150);
      check(await midiBtns(p).first().isDisabled() && /Blocked/.test(await p.locator("#explorer .detail").innerText()), "drift_fast: the part MIDI buttons stay locked, and say the grid is blocked (nothing to confirm)"); }
    else check(true, "drift_fast: no top line was read, so there is no button to test (the refusal itself is covered by app-exports)");
    await p.close(); }

  { const p = await open(); await analyse(p, path.join(SONGS, "pop127_Amaj.wav"));
    // the analyzer finds no kick or snare anywhere (a replaced result, as after a correction: same object shape, same grid)
    await p.evaluate(() => window.__tdReplace(y => { const off = v => v.map(() => false); y.pattern.kick = off(y.pattern.kick); y.pattern.snare = off(y.pattern.snare); if (y.pattern.ghost) { y.pattern.ghost.kick = off(y.pattern.ghost.kick || []); y.pattern.ghost.snare = off(y.pattern.ghost.snare || []); } (y.drumParts || []).forEach(pt => { pt.kick = off(pt.kick); pt.snare = off(pt.snare); }); }));
    await p.waitForTimeout(300);
    check(await p.locator("#explorer [data-drumless]").count() === 1, "no drums: the notice says none were found");
    const note = await p.locator("#explorer [data-drumless]").innerText();
    check(/No kick or snare was found/.test(note) && !/instrumental|no vocals/i.test(note), "no drums: the notice claims nothing about vocals or instrumentals (\"" + note.slice(0, 60) + "…\")");
    check(await tabBtn(p, "Rhythm").count() === 0 && await p.locator('#explorer button:has-text("Drums")').count() === 0, "no drums: no Rhythm tab and no Drums button; Harmony and Notes remain (" + await tabBtn(p, "Harmony").count() + "," + await tabBtn(p, "Notes").count() + ")");
    check(await p.locator("#explorer .detail [data-part=\"rhythm\"]").count() === 0, "no drums: no empty drum grid is on the page");
    check(await p.locator("#exports").innerText().then(t => /Download the song as MIDI/.test(t)), "no drums: Export is still there (its drum files are simply not written when empty)");
    await p.locator('#explorer [data-drumless] button:has-text("Show the drum tools anyway")').click(); await p.waitForTimeout(200);
    check(await tabBtn(p, "Rhythm").count() === 1 && await p.locator("#explorer [data-drumless]").count() === 0, "'Show the drum tools anyway' brings them back");
    await p.close(); }

  console.log("errors", errs); if (errs.length || failed) process.exitCode = 1; await b.close();
  if (!process.exitCode) console.log(`app part-midi tests passed (${n})`);
})();
