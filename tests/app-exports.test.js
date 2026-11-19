// Exports in the v1 app: what is always available, what needs the bar lines to be trusted, what is blocked and why.
//   * constant-tempo 4/4: the first downbeat is where the known answer puts it; bar-aligned exports stay locked until the user checks
//     the bar lines and confirms; then the MIDI zip and the lined-up WAV download
//   * a track whose tempo changes: bar-aligned exports are refused, with the reason, even though the analysis works
//   * a tempo the user corrected: the results are stale, so they are blocked too
//   * analysis data (.json) is always available and carries the tracked beat times
//   npm run app:build && TT_APP_URL=... node tests/app-exports.test.js   (npm run app:feature-tests sets the URL)
"use strict";
const path = require("node:path"), fs = require("node:fs");
const { chromium } = require("playwright");
const { decodeMidi, tickToSec, readZip } = require("./lib/smf");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`, SONGS = path.join(ROOT, "test-songs"), FIX = path.join(SONGS, "time-fixtures"), OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const open = async () => { const p = await b.newPage({ viewport: { width: 1200, height: 950 }, acceptDownloads: true }); p.on("pageerror", e => errs.push(String(e))); await p.goto(`${URL}index.html`); await p.waitForTimeout(300); return p; };
  const analyse = async (p, file) => { await p.setInputFiles("#file", file); await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }); };
  const midi = p => p.locator('#exports button:has-text("Download the song as MIDI")'), wav = p => p.locator('#exports button:has-text("lined up to bar 1")'), json = p => p.locator('#exports button:has-text("Analysis data")');

  for (const f of ["pop127_Amaj", "pop127_pad300", "pop127_pad1200"]) {
    const p = await open(); await analyse(p, path.join(SONGS, `${f}.wav`));
    const fd = await p.evaluate(() => window.__td.firstDown), bar = 240 / 127, pad = { pop127_Amaj: 0, pop127_pad300: 0.3, pop127_pad1200: 1.2 }[f]; let want = pad % bar; if (want > bar / 2) want -= bar;
    check(Math.abs(fd - want) <= 0.02, `${f}: first downbeat ${fd} s (known answer ${want.toFixed(3)} ±0.020)`);
    check(await midi(p).isDisabled() && await wav(p).isDisabled(), `${f}: bar-aligned exports are locked until the bar lines are confirmed`);
    check(/Check the bar lines before exporting/.test(await p.locator("#exports").innerText()), `${f}: and the page says why`);
    check(await p.locator('#exports button:has-text("Confirm and unlock")').isDisabled(), `${f}: confirming needs both checks ticked`);
    await p.locator('#exports input[type=checkbox]').nth(0).check(); await p.locator('#exports input[type=checkbox]').nth(1).check();
    await p.locator('#exports button:has-text("Confirm and unlock")').click(); await p.waitForTimeout(150);
    check(await midi(p).isEnabled() && await wav(p).isEnabled(), `${f}: after confirming, both bar-aligned exports are available`);
    let [dl] = await Promise.all([p.waitForEvent("download"), midi(p).click()]); await dl.saveAs(path.join(OUT, `${f}.zip`)); const dl0name = dl.suggestedFilename();
    check(/full song MIDI 127 BPM\.zip$/.test(dl.suggestedFilename()) && fs.statSync(path.join(OUT, `${f}.zip`)).size > 200, `${f}: MIDI zip downloaded (${dl.suggestedFilename()}, ${fs.statSync(path.join(OUT, `${f}.zip`)).size} bytes)`);
    [dl] = await Promise.all([p.waitForEvent("download"), wav(p).click()]); await dl.saveAs(path.join(OUT, `${f}_ref.wav`));
    const w = fs.readFileSync(path.join(OUT, `${f}_ref.wav`)); check(w.slice(0, 4).toString() === "RIFF" && w.slice(8, 12).toString() === "WAVE" && w.length > 100000, `${f}: lined-up WAV downloaded (${(w.length / 1e6).toFixed(1)} MB)`);
    [dl] = await Promise.all([p.waitForEvent("download"), json(p).click()]); await dl.saveAs(path.join(OUT, `${f}.json`));
    const j = JSON.parse(fs.readFileSync(path.join(OUT, `${f}.json`), "utf8")); check(j.bpm && j.timing && j.timing.beats.length > 16 && !("grid" in j) && !("__buf" in j), `${f}: analysis data parses and carries ${j.timing && j.timing.beats.length} tracked beats, no audio`);
    // the downloaded MIDI zip, read back with the independent decoder: parts, tempo, meter, bar 1, grid alignment, and the labels
    const files = readZip(fs.readFileSync(path.join(OUT, `${f}.zip`))), parts = files.map(x => ({ name: x.name, d: decodeMidi(x.data) }));
    check(parts.length === 6 && parts.map(x => x.name.replace(/ - full song\.mid$/, "")).join("|") === "1 Kick|2 Snare or clap|3 Hi-hats|4 808|5 Chords (suggested)|6 Hook (rough)", `${f}: the zip holds the six parts, chords labelled as suggested (${parts.map(x => x.name).join(", ")})`);
    const B = j.timing.beats.map(b => typeof b === "number" ? b : b.t), n = B.length, mt = B.reduce((p, v) => p + v, 0) / n, mi = (n - 1) / 2; let sxy = 0, sxx = 0; B.forEach((v, i) => { sxy += (v - mt) * (i - mi); sxx += (i - mi) ** 2; });
    const lsBpm = 60 / (sxy / sxx), tempi = parts.map(x => x.d.tempos.length === 1 && x.d.tempos[0].bpm);
    check(tempi.every(t => t && Math.abs(t - lsBpm) < 0.05), `${f}: every file carries one tempo equal to the tracked beats' (${tempi.map(t => t && t.toFixed(3)).join(", ")} vs ${lsBpm.toFixed(3)} measured from the ${n} beats)`);
    check(parts.every(x => x.d.timeSignatures.length === 1 && x.d.timeSignatures[0].num === 4 && x.d.timeSignatures[0].den === 4 && x.d.unmatched.length === 0 && x.d.notes.length > 0 && x.d.tracks[0].ended), `${f}: each file states 4/4, has notes, and every note-on closes`);
    check(parts[0].d.notes.length > 0 && parts[0].d.notes.every(nt => nt.onTick % 24 === 0), `${f}: the kick sits on the 16th grid measured from bar 1 (quantized, not original timing)`);
    check(/SUGGESTED voicings/.test(parts[4].d.tracks[0].text[0].text) && /quantized/.test(parts[0].d.tracks[0].text[0].text), `${f}: the files' own metadata says chords are suggested and the timing is quantized`);
    check(new RegExp(`full song MIDI ${Math.round(tempi[0])} BPM\\.zip$`).test(dl0name), `${f}: the zip name's BPM matches the tempo inside`);
    await p.close();
  }
  { const p = await open(); await analyse(p, path.join(FIX, "drift_fast.wav"));
    check(await json(p).isEnabled(), "drift_fast: analysis data is available");
    check(await midi(p).isDisabled() && await wav(p).isDisabled(), "drift_fast: bar-aligned exports are refused");
    const t = await p.locator("#exports").innerText(); check(/Blocked/.test(t) && /tempo changes/i.test(t) && !(await p.locator('#exports button:has-text("Confirm and unlock")').count()), `drift_fast: the reason is given and no confirmation can override it ("${t.match(/Blocked:[^.]*\./)?.[0]}")`);
    await p.close(); }
  { const p = await open(); await analyse(p, path.join(SONGS, "pop127_Amaj.wav"));
    await p.locator('input[aria-label="Type the BPM"]').fill("63.5"); await p.locator('button:has-text("Set BPM")').click(); await p.waitForFunction(() => /Analysed again/.test(document.querySelector('#status').textContent), null, { timeout: 120000 }); await p.waitForTimeout(300);
    const t = await p.locator("#exports").innerText();
    check(!/Blocked/.test(t) && /Check the bar lines/.test(t) && await midi(p).isDisabled(), "with the audio a tempo correction analyses again, so the results are fresh: not blocked, but the bar lines must be checked again");
    check(/Analysed again at your tempo/.test(await p.locator("#out .notice").first().innerText()) && await p.locator('[data-finding="tempo"] .basis-corrected').count() === 1, "the tempo finding is labelled as corrected, with the detected tempo named");
    await p.reload(); await p.waitForTimeout(400); await p.click("#recent-btn"); await p.locator("#hist .h-open").first().click(); await p.waitForTimeout(400);
    await p.locator('input[aria-label="Type the BPM"]').fill("100"); await p.locator('button:has-text("Set BPM")').click(); await p.waitForTimeout(500);
    const t2 = await p.locator("#exports").innerText();
    check(await midi(p).isDisabled() && /Blocked/.test(t2) && /audio isn't here/.test(t2), "without the audio (a saved teardown) a corrected tempo cannot be analysed again: the results are out of date, bar-aligned exports are blocked, and it says why");
    check(/isn't here to analyse again/.test(await p.locator("#out .notice").first().innerText()), "and the page says the audio is needed");
    check(await json(p).isEnabled(), "analysis data stays available");
    await p.close(); }
  console.log("errors", errs); if (errs.length || failed) process.exitCode = 1; await b.close();
  if (!process.exitCode) console.log(`app exports tests passed (${n})`);
})();
