// One play clock for every moving thing on screen. The media element's currentTime is the only authority: while it plays, this reads it
// once per animation frame and hands the time to subscribers (playheads write a transform; nothing is re-rendered). It never advances a
// clock of its own, so every view shows the same time, through seeks, loops, speed changes and tempo changes alike.
export interface PlayClock { time: number; playing: boolean; subscribe(fn: (t: number) => void): () => void; destroy(): void }

export function createPlayClock(el: HTMLMediaElement): PlayClock {
  const subs = new Set<(t: number) => void>();
  let raf = 0, last = NaN;
  const emit = () => { const t = el.currentTime; if (t === last) return; last = t; subs.forEach(f => f(t)); };
  const frame = () => { raf = 0; emit(); if (!el.paused && !el.ended) raf = requestAnimationFrame(frame); };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const once = () => { last = NaN; emit(); };
  const onPlay = () => { last = NaN; kick(); };
  el.addEventListener("play", onPlay); el.addEventListener("playing", onPlay);
  for (const ev of ["pause", "ended", "seeked", "ratechange", "loadedmetadata"]) el.addEventListener(ev, once);
  el.addEventListener("timeupdate", kick); // a safety net if a frame was missed
  return {
    get time() { return el.currentTime; },
    get playing() { return !el.paused && !el.ended; },
    subscribe(fn) { subs.add(fn); fn(el.currentTime); return () => { subs.delete(fn); }; },
    destroy() {
      cancelAnimationFrame(raf); subs.clear();
      el.removeEventListener("play", onPlay); el.removeEventListener("playing", onPlay); el.removeEventListener("timeupdate", kick);
      for (const ev of ["pause", "ended", "seeked", "ratechange", "loadedmetadata"]) el.removeEventListener(ev, once);
    },
  };
}
