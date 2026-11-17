// Synthetic regression benchmark. Runs the analyzer on the generated test songs (answers known exactly)
// and scores it. These are computer-made loops, so the numbers are a regression check, not a measure of
// real-world accuracy.
//
//   node tests/benchmark.js [page.html]      default page: index.html
//
// Writes a full JSON record to tests/out/ and exits 1 if any metric falls below tests/benchmark-gates.json.
// Metric definitions are in tests/metrics.js.
const path = require('path'), fs = require('fs'), crypto = require('crypto'), { execSync } = require('child_process');
const { chromium } = require('playwright');
const M = require('./metrics');
const ROOT = path.resolve(__dirname, '..'), ROOTURL = 'file://' + ROOT + '/', SONGS = path.join(ROOT, 'test-songs') + '/', OUT = path.join(__dirname, 'out') + '/';
fs.mkdirSync(OUT, { recursive: true });
const FILE = process.argv[2] || 'index.html';
const GATES = path.join(__dirname, 'benchmark-gates.json');

const NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const tri = t => { const r = t[0] % 12, m = (t[1] - t[0]) === 3; return NAMES[r] + (m ? 'm' : ''); };
const R16 = [...Array(16).keys()];
const SONG_SEC = 70; // make_test_songs.py: dur=70, music fills whole bars only, first downbeat at 0 (+ padding)

// Answers, copied from test-songs/make_test_songs.py. `pad` = seconds of silence before the song.
const S = {
  pop127_Amaj: { bpm: 127, key: 'A major', kick: [0,10], snare: [4,12,15], hats: [0,2,4,6,8,10,12,14], prog: [[57,61,64],[54,57,61],[50,54,57],[52,56,59]] },
  trap142_Fsmin: { bpm: 142, key: 'F# minor', kick: [0,3,10], snare: [8], hats: R16, prog: [[54,57,61],[50,54,57],[57,61,64],[52,56,59]] },
  house124_Cmin: { bpm: 124, key: 'C minor', kick: [0,4,8,12], snare: [4,12], hats: [2,6,10,14], prog: [[48,51,55],[44,48,51],[51,55,58],[46,50,53]] },
  swing100_Dmin: { bpm: 100, key: 'D minor', kick: [0,10], snare: [4,12], hats: R16, prog: [[50,53,57],[46,50,53],[53,57,60],[48,52,55]] },
  lead120_Amin: { bpm: 120, key: 'A minor', kick: [0,6,10], snare: [4,12], hats: [0,2,4,6,8,10,12,14], prog: [[57,60,64],[53,57,60],[48,52,55],[55,59,62]],
    lead: [[0,76],[3,74],[6,72],[8,69],[12,72],[16,76],[19,77],[22,76],[24,72],[32,76],[35,74],[38,72],[40,69],[44,67],[48,69],[54,72],[56,69]] },
  fast808_142: { bpm: 142, key: 'F# minor', kick: [0,3,7,10], snare: [8], hats: R16, prog: [[54,57,61],[50,54,57],[57,61,64],[52,56,59]] },
  // Same pop song with silence in front: scored for tempo / beats / downbeats only (tests finding bar 1).
  pop127_pad300: { bpm: 127, key: 'A major', pad: 0.3, gridOnly: true },
  pop127_pad1200: { bpm: 127, key: 'A major', pad: 1.2, gridOnly: true },
};

const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

(async () => {
  const b = await chromium.launch(); const tot = {}, records = [];
  const add = (k, tp, fp, fn) => { tot[k] = tot[k] || [0,0,0]; tot[k][0]+=tp; tot[k][1]+=fp; tot[k][2]+=fn; };
  const grid = { tempoAcc1: [], tempoAcc2: [], tempoAbsErr: [], beatF: [], downF: [], exportBeatF: [], exportDownF: [] };
  for (const [f, T] of Object.entries(S)) {
    const wav = `${SONGS}${f}.wav`; if (!fs.existsSync(wav)) { console.error(`Missing ${wav}. Run: npm run songs`); process.exit(1); }
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`${ROOTURL}${FILE}#teardown`); await p.waitForTimeout(300);
    const t0 = Date.now();
    await p.setInputFiles('#file', wav);
    await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector('#status').textContent), null, { timeout: 180000 });
    const ms = Date.now() - t0;
    const r = await p.evaluate(() => { const a = window.__td, N = window.__sn(a);
      return { full: JSON.parse(JSON.stringify(a)), key: a.key, bpm: a.bpm, bars: a.chords.bars, nBars: a.nBars, D: N.D, hook: a.hook, firstDown: a.firstDown, barSec: a.barSec, duration: a.duration, grid: a.grid || null }; });
    const line = [f], rec = { id: f, sha256: sha256(wav), runtimeMs: ms, pageErrors: errs, truth: { bpm: T.bpm, key: T.key, pad: T.pad || 0 }, metrics: {} };

    // ---- the original scorecard (unchanged, so old and new runs compare line for line) ----
    if (!T.gridOnly) {
      for (const k of ['kick','snare','hats']) { let tp=0,fp=0,fn=0; const truth = new Set(T[k]);
        for (let bar = 1; bar < r.nBars - 1; bar++) { const got = new Set(r.D[k].filter(n => Math.floor(n.t/16) === bar).map(n => n.t % 16));
          got.forEach(s => truth.has(s) ? tp++ : fp++); truth.forEach(s => { if (!got.has(s)) fn++; }); }
        add(k,tp,fp,fn); rec.metrics[k] = { tp, fp, fn }; line.push(`${k} P${(tp/(tp+fp||1)).toFixed(2)} R${(tp/(tp+fn||1)).toFixed(2)}`); }
      let ok = 0, n = 0; r.bars.forEach((c, i) => { if (i >= r.nBars - 1) return; n++; if (c === tri(T.prog[i % 4])) ok++; }); add('chords', ok, 0, n - ok); rec.metrics.chords = { ok, n }; line.push(`chords ${ok}/${n}`);
      const sc = k => { const [n, q] = k.split(' '), t = NAMES.indexOf(n); return (q === 'minor' ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11]).map(d => (d + t) % 12).sort((a,b)=>a-b).join(); };
      const same = sc(r.key) === sc(T.key); add('key(notes)', same ? 1 : 0, 0, same ? 0 : 1); line.push(`key ${r.key}${r.key === T.key ? ' ✓' : same ? ' ≈ same notes as ' + T.key : ' ✗ (' + T.key + ')'}`);
      const exact = r.key === T.key; add('key(exact)', exact ? 1 : 0, 0, exact ? 0 : 1); rec.metrics.key = { predicted: r.key, exact, sameNotes: same };
      if (T.lead && r.hook && r.hook.notes) { const ph = ((r.hook.bar - 1) % 4) * 16, Mp = new Map(T.lead.map(([s, m]) => [((s - ph) % 64 + 64) % 64, m]));
        let tp = 0, pc = 0; r.hook.notes.forEach(n => { if (Mp.has(n.t)) { tp++; if (n.midi === Mp.get(n.t)) pc++; } });
        add('hook', tp, r.hook.notes.length - tp, Mp.size - tp); rec.metrics.hook = { tp, extra: r.hook.notes.length - tp, size: Mp.size, pitch: pc }; line.push(`hook onsets ${tp}/${Mp.size} (+${r.hook.notes.length - tp} extra) pitch ${pc}`); }
    }

    // ---- new (G0): tempo, beat grid, downbeats ----
    const pad = T.pad || 0, beatSec = 60 / T.bpm, nBeats = Math.floor(SONG_SEC / (4 * beatSec)) * 4;
    const refBeats = Array.from({ length: nBeats }, (_, k) => pad + k * beatSec), refDown = refBeats.filter((_, k) => k % 4 === 0);
    const tempo = M.tempo(r.bpm, T.bpm);
    const tracked = r.grid ? M.events(r.grid.beats, refBeats) : null, trackedDown = r.grid ? M.events(r.grid.downbeats, refDown) : null;
    // the grid the app actually exports (chords, sections, MIDI, lined-up WAV): firstDown + n * barSec / 4
    const expBeats = [], expDown = []; for (let n = Math.ceil((-M.WINDOW - r.firstDown) / (r.barSec / 4)); r.firstDown + n * r.barSec / 4 <= r.duration; n++) { const t = r.firstDown + n * r.barSec / 4; expBeats.push(t); if (((n % 4) + 4) % 4 === 0) expDown.push(t); }
    const exported = M.events(expBeats, refBeats), exportedDown = M.events(expDown, refDown);
    rec.metrics.tempo = tempo; rec.metrics.trackedBeats = tracked; rec.metrics.trackedDownbeats = trackedDown; rec.metrics.exportBeats = exported; rec.metrics.exportDownbeats = exportedDown;
    grid.tempoAcc1.push(tempo.acc1 ? 1 : 0); grid.tempoAcc2.push(tempo.acc2 ? 1 : 0); grid.tempoAbsErr.push(tempo.absErr);
    if (tracked) { grid.beatF.push(tracked.f); grid.downF.push(trackedDown.f); }
    grid.exportBeatF.push(exported.f); grid.exportDownF.push(exportedDown.f);
    const f2 = v => v == null ? '–' : v.toFixed(2);
    line.push(`tempo ${r.bpm} (${T.bpm})${tempo.acc1 ? ' ✓' : tempo.acc2 ? ' ✗ octave' : ' ✗'} | beatF ${f2(tracked && tracked.f)} downF ${f2(trackedDown && trackedDown.f)} | export beatF ${f2(exported.f)} downF ${f2(exportedDown.f)} | ${(ms / 1000).toFixed(1)}s`);
    if (errs.length) line.push(`PAGE ERRORS ${errs.length}`);

    rec.prediction = r.full; records.push(rec);
    console.log(line.join(' | ')); await p.close(); }

  const mean = a => a.length ? a.reduce((p, q) => p + q, 0) / a.length : null;
  const summary = Object.fromEntries(Object.entries(tot).map(([k,[tp,fp,fn]]) => [k, { P: +(tp/(tp+fp||1)).toFixed(4), R: +(tp/(tp+fn||1)).toFixed(4) }]));
  summary.grid = { tracks: records.length, tempoAcc1: mean(grid.tempoAcc1), tempoAcc2: mean(grid.tempoAcc2), tempoMeanAbsErr: mean(grid.tempoAbsErr),
    beatF: mean(grid.beatF), downbeatF: mean(grid.downF), exportBeatF: mean(grid.exportBeatF), exportDownbeatF: mean(grid.exportDownF) };
  // chords and key are right/wrong per item, so print a count (their "R" in the JSON summary is that accuracy)
  console.log('TOTAL', Object.entries(tot).map(([k,[tp,fp,fn]]) => /^(chords|key)/.test(k) ? `${k}: ${tp}/${tp + fn}` : `${k}: P ${(tp/(tp+fp||1)).toFixed(2)} R ${(tp/(tp+fn||1)).toFixed(2)}`).join(' | '));
  const g = summary.grid, f3 = v => v == null ? '–' : v.toFixed(3);
  console.log(`GRID (${g.tracks} songs, ±${M.WINDOW * 1000} ms) tempo Acc1 ${f3(g.tempoAcc1)} Acc2 ${f3(g.tempoAcc2)} mean|err| ${f3(g.tempoMeanAbsErr)} BPM | tracked beatF ${f3(g.beatF)} downF ${f3(g.downbeatF)} | export beatF ${f3(g.exportBeatF)} downF ${f3(g.exportDownbeatF)}`);

  // ---- record + regression gates ----
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // headSha = the PR head on pull_request CI runs (where the checkout is a temporary merge commit), else HEAD
  const record = { date: new Date().toISOString(), kind: 'synthetic-regression', page: FILE, pageSha256: sha256(path.join(ROOT, FILE)), ...require('../bench/lib/provenance').provenance(ROOT),
    node: process.version, browser: b.version(), config: { windowSec: M.WINDOW, tempoTolerance: M.TEMPO_TOL, songSec: SONG_SEC, trimStartSec: 0 }, summary, tracks: records };
  const outFile = path.join(OUT, `benchmark-${stamp}.json`); fs.writeFileSync(outFile, JSON.stringify(record, null, 1));
  console.log('record', path.relative(ROOT, outFile));
  await b.close();

  if (!fs.existsSync(GATES)) { console.log('no gates file, so nothing to check'); return; }
  const gates = JSON.parse(fs.readFileSync(GATES, 'utf8')).min, fails = [];
  const get = k => k.split('.').reduce((o, x) => o == null ? null : o[x], summary);
  for (const [k, min] of Object.entries(gates)) { const v = get(k); if (v == null || v < min - 1e-9) fails.push(`${k} = ${v} (gate ${min})`); }
  if (records.some(t => t.pageErrors.length)) fails.push('page errors during analysis');
  if (fails.length) { console.log('GATES FAILED:\n  ' + fails.join('\n  ')); process.exitCode = 1; } else console.log(`gates passed (${Object.keys(gates).length})`);
})().catch(e => { console.error(e); process.exit(1); });
