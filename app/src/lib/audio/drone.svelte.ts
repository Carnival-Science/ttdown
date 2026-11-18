// "Play the key": a home-note drone plus the scale walked up and back (port of the legacy playDrone()).
import { audio, type OwnedContext } from "./service.svelte";
import { engine } from "../engine";

class Drone {
  playing = $state<string | null>(null);
  private cur: OwnedContext | null = null;
  toggle(keyName: string) {
    const was = this.playing;
    this.stop();
    if (was === keyName) return;
    let o: OwnedContext; try { o = audio.context(); } catch { return; }
    this.cur = o; this.playing = keyName;
    const { ctx, out } = o, root = engine.NAMES.indexOf(keyName.split(" ")[0] ?? ""), minor = /minor/.test(keyName), t0 = ctx.currentTime + 0.05;
    const scale = minor ? [0, 2, 3, 5, 7, 8, 10, 12] : [0, 2, 4, 5, 7, 9, 11, 12];
    const f = (m: number) => 440 * Math.pow(2, (m - 69) / 12), base = 48 + root;
    const g = ctx.createGain(); g.gain.value = 0.18; g.connect(out);
    const tone = (m: number, at: number, len: number, vol: number, type: OscillatorType = "triangle") => { const osc = ctx.createOscillator(), e = ctx.createGain(); osc.type = type; osc.frequency.value = f(m); e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(vol, at + 0.03); e.gain.setValueAtTime(vol, at + len - 0.08); e.gain.linearRampToValueAtTime(0, at + len); osc.connect(e).connect(g); osc.start(at); osc.stop(at + len + 0.02); };
    tone(base - 12, t0, 6.4, 0.5, "sine"); tone(base - 5, t0, 6.4, 0.25, "sine");
    scale.concat(scale.slice(0, -1).reverse()).forEach((d, i) => tone(base + d, t0 + 0.2 + i * 0.4, 0.38, 0.6));
    setTimeout(() => { if (this.cur === o) this.stop(); }, 6800);
  }
  stop() { if (this.cur) { void this.cur.close(); this.cur = null; } this.playing = null; }
}
export const drone = new Drone();
