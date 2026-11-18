// One owner for every sound the app makes (founder decision: no AudioContext monkey-patching).
// Legacy behaviour kept: two volumes ("Song" for <audio> players, "App sounds" for every synthesized sound), a mute, saved
// under app_volume_v1. Code that makes sound asks for a context here and connects to `out` instead of `destination`.
import { KEYS } from "../storage/local";

interface Vol { song: number; sounds: number; muted: boolean }
const load = (): Vol => { try { return Object.assign({ song: 0.9, sounds: 0.7, muted: false }, JSON.parse(localStorage.getItem(KEYS.volume) || "{}")); } catch { return { song: 0.9, sounds: 0.7, muted: false }; } };
export interface OwnedContext { ctx: AudioContext; out: GainNode; close(): Promise<void> }

class AudioService {
  vol = $state<Vol>(load());
  private live = new Set<OwnedContext>();
  private players = new Set<HTMLMediaElement>();
  get soundsGain() { return this.vol.muted ? 0 : this.vol.sounds; }
  get songVolume() { return this.vol.muted ? 0 : this.vol.song; }

  /** A new AudioContext whose sounds go through the app-sounds volume. Close it with `close()` when done. */
  context(): OwnedContext {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC(), out = ctx.createGain(); out.gain.value = this.soundsGain; out.connect(ctx.destination);
    const owned: OwnedContext = { ctx, out, close: async () => { this.live.delete(owned); if (ctx.state !== "closed") await ctx.close(); } };
    this.live.add(owned); return owned;
  }
  /** Register a song player (<audio>): it follows the song volume, and a change made on its own controls updates it. */
  player(el: HTMLMediaElement): () => void {
    el.volume = this.songVolume; this.players.add(el);
    const onChange = () => { if (!this.vol.muted && Math.abs(el.volume - this.vol.song) > 0.01) { this.vol.song = el.volume; this.apply(); } };
    el.addEventListener("volumechange", onChange);
    return () => { el.removeEventListener("volumechange", onChange); this.players.delete(el); };
  }
  apply() {
    this.live.forEach(c => { try { if (c.ctx.state !== "closed") c.out.gain.setTargetAtTime(this.soundsGain, c.ctx.currentTime, 0.02); } catch { /* closed meanwhile */ } });
    this.players.forEach(p => { p.volume = this.songVolume; });
    try { localStorage.setItem(KEYS.volume, JSON.stringify(this.vol)); } catch { /* storage full or blocked */ }
  }
  /** One volume for the song and for every sound the app plays over it (the player's volume control). */
  setAll(v: number) { this.vol.song = v; this.vol.sounds = v; this.vol.muted = false; this.apply(); }
  setSong(v: number) { this.vol.song = v; this.vol.muted = false; this.apply(); }
  setSounds(v: number) { this.vol.sounds = v; this.vol.muted = false; this.apply(); }
  toggleMute() { this.vol.muted = !this.vol.muted; this.apply(); }
}
export const audio = new AudioService();
