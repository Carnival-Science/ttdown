// The one line of copy over the discs (DropZone, DropVeil). Each state has a few short lines that take turns; the first of each is the
// plain instruction. Under prefers-reduced-motion the first line stays put.
export const LINES = {
  idle: ["Drop a track.", "Bring a song.", "What are we hearing?", "Show me a track.", "Give it here."],
  drop: ["Drop it here.", "That's the one.", "Let go.", "Right here."],
  analyse: ["Taking it apart.", "Finding the downbeat.", "Counting the bars.", "Listening closely.", "Every nook and cranny.", "Let's see what we've got."],
} as const;

/** A line that changes every `ms` while mounted (used inside a component: the interval is tied to its effect). */
export class Cycle {
  i = $state(0);
  constructor(private lines: readonly string[], ms: number) {
    $effect(() => {
      if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      const id = setInterval(() => { this.i = (this.i + 1) % this.lines.length; }, ms);
      return () => clearInterval(id);
    });
  }
  get line(): string { return this.lines[this.i] ?? this.lines[0] ?? ""; }
}
