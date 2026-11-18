// @ts-nocheck -- generated port of the legacy playIdea()/kitLoad() (index.html): the synth lines are copied verbatim; only the
// routing changed (sounds go to the audio service's `out`, the app-sounds volume, instead of a monkey-patched destination) and the
// "which button is playing" state is a reactive id instead of a button label.
import { audio } from "./service.svelte";
import { domain } from "../domain";
const { drumBar, KIT, analyzeSample } = domain;

class IdeaPlayer {
  playing = $state(null); // id of the idea that is playing, or null
  cur = null; timer = null;
  stop() { if (this.cur) { try { this.cur.close(); } catch (e) {} this.cur = null; } if (this.timer) { clearTimeout(this.timer); this.timer = null; } this.playing = null; }
  play(id, parts, bpm, bars, noFill) {
    const was = this.playing; this.stop(); if (was === id) return;
    let o; try { o = audio.context(); } catch (e) { return; } const ac = o.ctx;
    this.cur = o; this.playing = id;
    const step = 60 / bpm / 4, t0 = ac.currentTime + 0.08, loops = 2, len = bars * 16;
    const master = ac.createGain(); master.gain.value = 0.85; master.connect(o.out);
    const noise = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate), nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const f = m => 440 * Math.pow(2, (m - 69) / 12);
    const kick = t => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g).connect(master); o.start(t); o.stop(t + 0.32); };
    const nz = (t, fr, type, ln, vol) => { const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noise; fl.type = type; fl.frequency.value = fr; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + ln); s.connect(fl).connect(g).connect(master); s.start(t); s.stop(t + ln + 0.02); };
    const voice = (t, dur, m, type, vol, cutoff, atk, glideTo) => { const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f(m), t); if (glideTo) o.frequency.exponentialRampToValueAtTime(f(glideTo), t + dur); fl.type = "lowpass"; fl.frequency.value = cutoff; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.setValueAtTime(vol, t + Math.max(atk, dur - 0.04)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.03); o.connect(fl).connect(g).connect(master); o.start(t); o.stop(t + dur + 0.06); };
    const chopV = (t, dur, m) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "sawtooth"; o.frequency.value = f(m); [[800, 5, 1], [1250, 6, 0.6], [2700, 8, 0.3]].forEach(([fr, q, v]) => { const b = ac.createBiquadFilter(), bg = ac.createGain(); b.type = "bandpass"; b.frequency.value = fr; b.Q.value = q; bg.gain.value = v; o.connect(b).connect(bg).connect(g); }); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.015); g.gain.linearRampToValueAtTime(0.0001, t + dur); g.connect(master); o.start(t); o.stop(t + dur + 0.03); };
    const smp = (slot, t, vol, rate, dur) => { const sb = ac.createBufferSource(), g = ac.createGain(); sb.buffer = KIT[slot].buf; sb.playbackRate.value = rate || 1; g.gain.setValueAtTime(vol, t); sb.connect(g).connect(master); sb.start(t); if (dur) { g.gain.setValueAtTime(vol, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04); sb.stop(t + dur + 0.06); } };
    const fitR = r => { while (r > 2.1) r /= 2; while (r < 0.48) r *= 2; return r; }, sw = parts.drums && parts.drums.swing ? parts.drums.swing : 0;
    for (let L = 0; L < loops; L++) {
      const T = st => t0 + (L * len + st) * step + (sw && Math.round(st) % 2 === 1 ? sw * step : 0);
      if (parts.drums) for (let b = 0; b < bars; b++) { const d = drumBar(parts.drums, b, noFill); for (let s = 0; s < 16; s++) { const t = T(b * 16 + s);
        if (d.kick[s]) { if (KIT.kick) smp("kick", t, 0.9); else kick(t); }
        if (d.snare[s]) { if (KIT.snare) smp("snare", t, 0.8); else nz(t, 1500, "bandpass", 0.18, 0.6); }
        if (d.ghost && d.ghost[s]) { if (KIT.snare) smp("snare", t, 0.25); else nz(t, 1500, "bandpass", 0.1, 0.18); }
        if (d.hats[s]) { const hv = s % 4 === 0 ? 1 : 0.65; if (KIT.hat) smp("hat", t, 0.6 * hv); else nz(t, 8000, "highpass", 0.05, 0.25 * hv); if (d.roll && d.roll.includes(s)) { if (KIT.hat) smp("hat", t + step / 2, 0.3); else nz(t + step / 2, 8000, "highpass", 0.04, 0.13); } }
        if (d.open && d.open.includes(s)) nz(t, 6000, "highpass", 0.22, 0.16); } }
      if (parts.bass && KIT.bass) parts.bass.notes.forEach(n => { if (n.t >= len) return; const actual = n.midi + 12, root = KIT.bass.root == null ? parts.bass.notes[0].midi + 12 : KIT.bass.root; smp("bass", T(n.t), 0.8, fitR(Math.pow(2, (actual - root) / 12)), n.dur * step); });
      else if (parts.bass) parts.bass.notes.forEach((n, i) => { if (n.t >= len) return; const nx = parts.bass.notes[i + 1]; voice(T(n.t), n.dur * step, n.midi + 12, "sine", 0.55, 900, 0.01, n.glide && nx ? nx.midi + 12 : 0); voice(T(n.t), Math.min(n.dur, 2) * step, n.midi + 24, "triangle", 0.12, 1200, 0.005); });
      if (parts.chords) parts.chords.chords.forEach((c, b) => { if (b >= bars) return; parts.chords.rhythm.steps.forEach(s => c.notes.forEach(m => voice(T(b * 16 + s), parts.chords.rhythm.len * step * 0.95, m, "sawtooth", parts.melody ? 0.045 : 0.07, 1400, 0.02))); });
      if (parts.melody) parts.melody.notes.forEach(n => { if (n.t < len) { voice(T(n.t), n.dur * step * 0.9, n.midi, "triangle", 0.3, 4000, 0.005); voice(T(n.t), n.dur * step * 0.5, n.midi, "square", 0.05, 2500, 0.005); } });
      if (parts.chop) parts.chop.notes.forEach(n => { if (n.t >= len) return; if (KIT.chop) smp("chop", T(n.t), 0.7, Math.pow(2, (n.midi - (parts.chop.base || n.midi)) / 12), n.dur * step * 0.95); else chopV(T(n.t), n.dur * step * 0.9, n.midi); });
    }
    this.timer = setTimeout(() => { if (this.cur === o) this.stop(); }, (loops * len * step + 0.6) * 1000);
  }
  async kitLoad(file, slot) {
    try { const it = await analyzeSample(file), ab = await new OfflineAudioContext(2, 44100, 44100).decodeAudioData(await file.arrayBuffer());
      const k = slot || { "Kick": "kick", "Snare / Clap": "snare", "Hi-hat": "hat", "808 / Bass": "bass", "Vocal": "chop", "Melodic one-shot": "chop" }[it.type]; if (!k) return false;
      KIT[k] = { name: file.name, buf: ab, root: it.note ? it.note.midi : null }; return true; } catch (e) { return false; }
  }
}
export const ideaPlayer = new IdeaPlayer();
