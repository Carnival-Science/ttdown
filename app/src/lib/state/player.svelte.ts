// The song player and the controls other parts of the page reach into. Parts register what they own; others call through here.
class Player {
  el = $state<HTMLAudioElement | null>(null);
  /** Loop a section at a playback rate (registered by the player tools). */
  loopSection: ((sectionIndex: number, rate: number) => void) | null = null;
  /** Loop a time range (seconds) at a rate. */
  loopRange: ((start: number, end: number, rate: number) => void) | null = null;
  /** "Check by ear": play only one detected part over the song ("drums" | "bass" | "chords" | "hook"), or restart after a change. */
  overlayOnly: ((kind: string) => void) | null = null;
  overlayRestart: (() => void) | null = null;
  seek(t: number, play = true) { const a = this.el; if (!a) return; a.currentTime = t; if (play) a.play().catch(() => {}); }
}
export const player = new Player();
