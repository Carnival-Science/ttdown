const path = require('path'), ROOTURL = 'file://' + path.resolve(__dirname, '..') + '/', SONGS = path.resolve(__dirname, '../test-songs') + '/', SAMPLES = path.resolve(__dirname, 'samples') + '/', OUT = path.resolve(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright'); const fs = require('fs');
const FILE = process.argv[2] || 'index.html';
const NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const tri = t => { const r = t[0] % 12, m = (t[1] - t[0]) === 3; return NAMES[r] + (m ? 'm' : ''); };
const R16 = [...Array(16).keys()];
const S = {
  pop127_Amaj: { key: 'A major', kick: [0,10], snare: [4,12,15], hats: [0,2,4,6,8,10,12,14], prog: [[57,61,64],[54,57,61],[50,54,57],[52,56,59]] },
  trap142_Fsmin: { key: 'F# minor', kick: [0,3,10], snare: [8], hats: R16, prog: [[54,57,61],[50,54,57],[57,61,64],[52,56,59]] },
  house124_Cmin: { key: 'C minor', kick: [0,4,8,12], snare: [4,12], hats: [2,6,10,14], prog: [[48,51,55],[44,48,51],[51,55,58],[46,50,53]] },
  swing100_Dmin: { key: 'D minor', kick: [0,10], snare: [4,12], hats: R16, prog: [[50,53,57],[46,50,53],[53,57,60],[48,52,55]] },
  lead120_Amin: { key: 'A minor', kick: [0,6,10], snare: [4,12], hats: [0,2,4,6,8,10,12,14], prog: [[57,60,64],[53,57,60],[48,52,55],[55,59,62]],
    lead: [[0,76],[3,74],[6,72],[8,69],[12,72],[16,76],[19,77],[22,76],[24,72],[32,76],[35,74],[38,72],[40,69],[44,67],[48,69],[54,72],[56,69]] },
  fast808_142: { key: 'F# minor', kick: [0,3,7,10], snare: [8], hats: R16, prog: [[54,57,61],[50,54,57],[57,61,64],[52,56,59]] },
};
(async () => { const b = await chromium.launch(); const tot = {};
  const add = (k, tp, fp, fn) => { tot[k] = tot[k] || [0,0,0]; tot[k][0]+=tp; tot[k][1]+=fp; tot[k][2]+=fn; };
  for (const [f, T] of Object.entries(S)) {
    const p = await b.newPage(); await p.goto(`${ROOTURL}${FILE}#teardown`); await p.waitForTimeout(300);
    await p.setInputFiles('#file', `${SONGS}${f}.wav`);
    await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector('#status').textContent), null, { timeout: 180000 });
    const r = await p.evaluate(() => { const a = window.__td, N = window.__sn(a); return { key: a.key, bars: a.chords.bars, nBars: a.nBars, D: N.D, hook: a.hook }; });
    const line = [f];
    for (const k of ['kick','snare','hats']) { let tp=0,fp=0,fn=0; const truth = new Set(T[k]);
      for (let bar = 1; bar < r.nBars - 1; bar++) { const got = new Set(r.D[k].filter(n => Math.floor(n.t/16) === bar).map(n => n.t % 16));
        got.forEach(s => truth.has(s) ? tp++ : fp++); truth.forEach(s => { if (!got.has(s)) fn++; }); }
      add(k,tp,fp,fn); line.push(`${k} P${(tp/(tp+fp||1)).toFixed(2)} R${(tp/(tp+fn||1)).toFixed(2)}`); }
    let ok = 0, n = 0; r.bars.forEach((c, i) => { if (i >= r.nBars - 1) return; n++; if (c === tri(T.prog[i % 4])) ok++; }); add('chords', ok, 0, n - ok); line.push(`chords ${ok}/${n}`);
    const sc = k => { const [n, q] = k.split(' '), t = NAMES.indexOf(n); return (q === 'minor' ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11]).map(d => (d + t) % 12).sort((a,b)=>a-b).join(); };
    const same = sc(r.key) === sc(T.key); add('key(notes)', same ? 1 : 0, 0, same ? 0 : 1); line.push(`key ${r.key}${r.key === T.key ? ' ✓' : same ? ' ≈ same notes as ' + T.key : ' ✗ (' + T.key + ')'}`);
    if (T.lead && r.hook && r.hook.notes) { const ph = ((r.hook.bar - 1) % 4) * 16, M = new Map(T.lead.map(([s, m]) => [((s - ph) % 64 + 64) % 64, m]));
      let tp = 0, pc = 0; r.hook.notes.forEach(n => { if (M.has(n.t)) { tp++; if (n.midi === M.get(n.t)) pc++; } });
      add('hook', tp, r.hook.notes.length - tp, M.size - tp); line.push(`hook onsets ${tp}/${M.size} (+${r.hook.notes.length - tp} extra) pitch ${pc}`); }
    console.log(line.join(' | ')); await p.close(); }
  console.log('TOTAL', Object.entries(tot).map(([k,[tp,fp,fn]]) => `${k}: P ${(tp/(tp+fp||1)).toFixed(2)} R ${(tp/(tp+fn||1)).toFixed(2)}`).join(' | '));
  await b.close(); })();
