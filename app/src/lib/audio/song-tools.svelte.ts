// @ts-nocheck -- generated port of the legacy Song-map listening tools (index.html playerTools, overlayTools/stopOverlay,
// beatClickBtn). The timing and synth lines are copied verbatim from the legacy page by a script; only the routing changed:
// sound goes to the audio service (app-sounds volume) instead of a monkey-patched AudioContext.destination, and state that the
// legacy page kept in button labels is reactive state here.
import { audio } from "./service.svelte";
import { domain } from "../domain";
import { gridOf } from "../timeline/grid";
const { songNotes } = domain;

/** Speed and loops for the song player (legacy playerTools; the band solo was cut from v1). */
export class PlayerTools {
  rate = $state(1);
  loopSel = $state("");
  loop = null;
  timer = null;
  constructor(a, player) {
    this.a = a; this.player = player;
    if (__TEST_HOOKS__) try { Object.defineProperty(window, "__loop", { configurable: true, get: () => this.loop }); } catch (e) {} // tests only (bench build): the active loop range
    this.timer = setInterval(() => { if (!player.isConnected) { this.destroy(); return; } if (this.loop && !player.paused && player.currentTime >= this.loop[1]) player.currentTime = this.loop[0]; }, 40);
  }
  setRate(r) { this.player.playbackRate = r; try { this.player.preservesPitch = true; } catch (e) {} this.rate = r; }
  setLoop(value) {
    const a = this.a, player = this.player, sel = { value }; let loop = null;
    this.loopSel = value;
    if (sel.value === "") loop = null;
    else if (sel.value === "here") { const G = gridOf(a), b = Math.max(0, G.barOf(player.currentTime)), st = Math.max(0, G.barStart(b)); loop = [st, Math.min(a.duration - 0.05, G.barStart(b + 4))]; }
    else { const s = a.sections[+sel.value]; loop = [s.start, Math.min(a.duration - 0.05, s.end)]; player.currentTime = s.start; }
    this.loop = loop;
    if (loop) player.play().catch(() => {});
  }
  loopRange(st, en, rate) { const a = this.a; this.loopSel = ""; this.loop = [Math.max(0, st), Math.min(a.duration - 0.05, en)]; this.player.currentTime = this.loop[0]; if ([0.5, 0.75, 1].includes(rate)) this.setRate(rate); }
  loopSection(i, rate) { const a = this.a, s2 = a.sections[i]; if (!s2) return; this.loopSel = String(i); this.loop = [s2.start, Math.min(a.duration - 0.05, s2.end)]; this.player.currentTime = s2.start; if ([0.5, 0.75, 1].includes(rate)) this.setRate(rate); }
  destroy() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

/** "Check by ear": the detected notes played over the real song, in time (legacy overlayTools). */
export class Overlay {
  on = $state(false);
  parts = $state({ drums: true, bass: true, chords: false, hook: false });
  cur = null;
  start(a, player) {
    if (this.on) { this.stop(); player.pause(); return; }
    const parts = this.parts; let ev = [];
    const buildEv = () => { const N = songNotes(a), stepSec = N.stepSec, fd = a.firstDown || 0; ev = []; const add = (kind, arr) => arr.forEach(n => ev.push({ kind, time: fd + n.t * stepSec, dur: n.dur * stepSec, midi: n.midi }));
    add("kick", N.D.kick); add("snare", N.D.snare); add("hats", N.D.hats); add("bass", N.bass); add("chords", N.chords); add("hook", N.hook); ev.sort((p, q) => p.time - q.time); };
    let o; try { o = audio.context(); } catch (e) { return; }
    const ctx = o.ctx;
    buildEv();
    const master = ctx.createGain(); master.gain.value = 0.7; master.connect(o.out);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate), nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const f = m => 440 * Math.pow(2, (m - 69) / 12);
    const kick = t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g).connect(master); o.start(t); o.stop(t + 0.27); };
    const nz = (t, fr, type, ln, vol) => { const sb = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); sb.buffer = noise; fl.type = type; fl.frequency.value = fr; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + ln); sb.connect(fl).connect(g).connect(master); sb.start(t); sb.stop(t + ln + 0.02); };
    const tone = (t, d, m, type, vol, cut) => { const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = type; o.frequency.value = f(m); fl.type = "lowpass"; fl.frequency.value = cut; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol, t + Math.max(0.01, d - 0.03)); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(fl).connect(g).connect(master); o.start(t); o.stop(t + d + 0.03); };
    const fire = (e, t, rate) => { const d = e.dur / rate;
    if (e.kind === "kick" && parts.drums) kick(t); else if (e.kind === "snare" && parts.drums) nz(t, 1700, "bandpass", 0.15, 0.55); else if (e.kind === "hats" && parts.drums) nz(t, 8000, "highpass", 0.04, 0.2);
    else if (e.kind === "bass" && parts.bass) tone(t, Math.min(d, 1.5), e.midi + 12, "sine", 0.5, 800); else if (e.kind === "chords" && parts.chords) tone(t, d * 0.95, e.midi, "triangle", 0.06, 2000); else if (e.kind === "hook" && parts.hook) tone(t, d * 0.9, e.midi, "square", 0.08, 3000); };
    let idx = 0; const seek = () => { const now = player.currentTime; idx = 0; while (idx < ev.length && ev[idx].time < now) idx++; };
    const tick = () => { if (player.paused) return; const now = player.currentTime, rate = player.playbackRate || 1, ahead = 0.25 * rate;
    while (idx < ev.length && ev[idx].time < now + ahead) { const e = ev[idx++]; if (e.time >= now - 0.02) fire(e, ctx.currentTime + (e.time - now) / rate + 0.03, rate); } };
    audio.apply(); seek(); player.play().catch(() => {});
    player.addEventListener("seeked", seek); player.addEventListener("ratechange", seek);
    this.cur = { o, player, seek, timer: setInterval(() => { if (!player.isConnected) { this.stop(); return; } tick(); }, 25) }; this.on = true;
  }
  stop() { const c = this.cur; if (c) { clearInterval(c.timer); c.player.removeEventListener("seeked", c.seek); c.player.removeEventListener("ratechange", c.seek); try { c.o.close(); } catch (e) {} this.cur = null; } this.on = false; }
  only(k, a, player) { Object.keys(this.parts).forEach(x => { this.parts[x] = x === k; }); if (!this.on) this.start(a, player); }
  restart(a, player) { if (this.on) { this.stop(); this.start(a, player); } }
}

/** "Play with beat clicks": the decoded song with a click on every tracked beat (legacy beatClickBtn). */
export class BeatClicks {
  on = $state(false);
  cur = null;
  toggle(a, audioEl, buffer) {
    if (this.cur) { this.cur.close(); this.cur = null; this.on = false; return; }
    let own; try { own = audio.context(); } catch (e) { return; }
    const ctx = own.ctx, out = own.out; this.cur = own; this.on = true;
    if (audioEl) audioEl.pause();
    const from = audioEl ? audioEl.currentTime : 0, t0 = ctx.currentTime + 0.1;
    const src = ctx.createBufferSource(); src.buffer = buffer; const sg = ctx.createGain(); sg.gain.value = 0.7; src.connect(sg).connect(out); src.start(t0, from);
    const endT = Math.min(a.duration, from + 240); // clicks sit on the TRACKED beats when there are any, so they follow tempo drift
    for (const bt of gridOf(a).beats(from, endT)) {
    const at = Math.max(t0, t0 + (bt.t - from)); // a beat a few ms before the start point is clicked at the start
    const o = ctx.createOscillator(), g = ctx.createGain(), down = bt.downbeat;
    o.frequency.value = down ? 1800 : 1200; g.gain.setValueAtTime(down ? 0.5 : 0.28, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    o.connect(g).connect(out); o.start(at); o.stop(at + 0.06);
    }
    src.onended = () => { if (this.cur === own) { own.close(); this.cur = null; this.on = false; } };
  }
  stop() { if (this.cur) { this.cur.close(); this.cur = null; } this.on = false; }
}
