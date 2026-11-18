// @ts-nocheck -- generated port of the legacy playPattern() (index.html): synth lines verbatim, routed to the audio service.
import { audio } from "./service.svelte";
class PatternPlayer {
  on = $state(false);
  cur = null;
  toggle(a) {
      if (this.cur) { this.cur.close(); this.cur = null; this.on = false; return; }
      let own; try { own = audio.context(); } catch (e) { return; } const ac = own.ctx;
      this.cur = own; this.on = true;
      const step = 60 / a.bpm / 4, t0 = ac.currentTime + 0.05, noise = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const kickF = t => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g).connect(own.out); o.start(t); o.stop(t + 0.4); };
      const nz = (t, f, type, len, vol) => { const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noise; fl.type = type; fl.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len); s.connect(fl).connect(g).connect(own.out); s.start(t); s.stop(t + len + 0.02); };
      for (let bar = 0; bar < 8; bar++) for (let s = 0; s < 16; s++) {
        const t = t0 + (bar * 16 + s) * step;
        if (a.pattern.kick[s]) kickF(t);
        if (a.pattern.snare[s]) nz(t, 1500, "bandpass", 0.18, 0.6);
        if (a.pattern.hats[s]) nz(t, 8000, "highpass", 0.05, 0.25);
      }
      const ms = (8 * 16 * step + 0.5) * 1000;
      setTimeout(() => { if (this.cur === own) { own.close(); this.cur = null; this.on = false; } }, ms);
  }
  stop() { if (this.cur) { this.cur.close(); this.cur = null; } this.on = false; }
}
export const patternPlayer = new PatternPlayer();
