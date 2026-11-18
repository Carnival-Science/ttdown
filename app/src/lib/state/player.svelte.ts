// The song player on the Song map, and the controls other panels reach into (the legacy page's audioEl, ptCtl, ovCtl,
// showTdTab, goMap). Panels register what they own; others call through here.
class Player {
  el = $state<HTMLAudioElement | null>(null);
  /** Player tools (speed, loops): loop a section at a rate. */
  loopSection: ((sectionIndex: number, rate: number) => void) | null = null;
  /** Player tools: loop a time range (seconds) at a rate. */
  loopRange: ((start: number, end: number, rate: number) => void) | null = null;
  /** Check-by-ear overlay: play only one part ("drums" | "bass" | ...), or restart after the parts changed. */
  overlayOnly: ((kind: string) => void) | null = null;
  overlayRestart: (() => void) | null = null;
  /** Beat clicks button, for "Open beat clicks". */
  beatClicks: HTMLElement | null = null;
  toggle() { const a = this.el; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause(); }
  seek(t: number, play = true) { const a = this.el; if (!a) return; a.currentTime = t; if (play) a.play().catch(() => {}); }
}
export const player = new Player();

/** Switch the teardown tab (set by the Teardown view). */
export const nav = { show: (_tab: string) => {}, goMap(then?: () => void) { nav.show("map"); if (then) setTimeout(then, 150); } };
