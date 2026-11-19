// The transport's shared pieces: the one play clock (read from the audio element), the editor viewport that the piano rolls share, and the
// full-track overview viewport the arrangement shows. The arrangement and every lane draw ONE playhead from this clock.
import { TimeViewport } from "../ui/timeline/viewport.svelte";
import type { PlayClock } from "../ui/timeline/clock";

class Transport {
  clock = $state.raw<PlayClock | null>(null);
  /** What the editor lanes show (zoomable, scrollable). */
  view = new TimeViewport();
  /** What the arrangement shows: always the whole track (it carries a window marking `view`). */
  overview = new TimeViewport();
}
export const transport = new Transport();
