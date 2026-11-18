// @ts-nocheck -- generated port of the legacy earPanel() sounds (index.html): tone/kick/hat and the three games' play
// bodies are copied verbatim; only the output changed (the audio service's app-sounds volume instead of the destination).
import { audio } from "./service.svelte";
let own = null;
const ac = () => { if (!own) { try { own = audio.context(); } catch (e) { return null; } } return own.ctx; };
const out = () => own.out;
const f = m => 440 * Math.pow(2, (m - 69) / 12);
const tone = (c, t, d, m, v) => { const o = c.createOscillator(), g = c.createGain(); o.type = "triangle"; o.frequency.value = f(m); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.setValueAtTime(v, t + d - 0.05); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(g).connect(out()); o.start(t); o.stop(t + d + 0.02); };
const kick = (c, t) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g).connect(out()); o.start(t); o.stop(t + 0.32); };
const hat = (c, t, v) => { const n = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s2 = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s2.buffer = n; fl.type = "highpass"; fl.frequency.value = 7000; g.gain.value = v; s2.connect(fl).connect(g).connect(out()); s2.start(t); };
export function playRhythm(ans) { const c = ac(); if (!c) return; const t0 = c.currentTime + 0.1, step = 60 / 90 / 4; for (let b = 0; b < 2; b++) for (let i = 0; i < 16; i++) { const t = t0 + (b * 16 + i) * step; if (i % 2 === 0) hat(c, t, i % 4 === 0 ? 0.35 : 0.18); if (i === 0 || i === ans) kick(c, t); } }
export function playQuality(ch) { const c = ac(); if (!c) return; const t = c.currentTime + 0.1; ch.forEach((m, i) => tone(c, t + i * 0.35, 0.35, m, 0.2)); ch.forEach(m => tone(c, t + 1.15, 1.4, m, 0.14)); }
export function playNext(root, ans) { const tri = d => { const sc = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19]; return [root + sc[d], root + sc[d + 2], root + sc[d + 4]]; }; const c = ac(); if (!c) return; const t = c.currentTime + 0.1; tri(0).forEach(m => tone(c, t, 0.9, m, 0.14)); tri(ans).forEach(m => tone(c, t + 1.0, 1.2, m, 0.14)); }
