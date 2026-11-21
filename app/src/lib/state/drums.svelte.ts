// "No drums found" (measured: almost none of the sound is percussive; or no kick or snare step in any pattern): the drum tools step aside for such a track. A person can bring them back for the current teardown
// (the detector can be wrong, so hiding is never final); a new teardown starts hidden again.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { teardown } from "./teardown.svelte";
import { domain } from "../domain";

const { noDrumsFound } = domain as any;
class Drums {
  shownFor = $state(-1);
  /** No kick or snare anywhere in this teardown (says nothing about vocals or other instruments). */
  none = $derived.by(() => { const a = teardown.result as any; return !!a && !!noDrumsFound(a); });
  /** The absence was measured (almost none of the sound is percussive), not just a pattern with no kick or snare step. */
  measured = $derived.by(() => { const a = teardown.result as any; return !!a && !!a.drumEvidence && a.drumEvidence.found === false; });
  /** Hide the drum tools: there are none to show, and the person has not asked for them. */
  hidden = $derived(this.none && this.shownFor !== teardown.mountId);
  showAnyway() { this.shownFor = teardown.mountId; }
  /** The big notice can be closed without bringing the drum tools back; a small one-line reminder with the way back stays. A new teardown shows the notice again. */
  closedFor = $state(-1);
  noticeOpen = $derived(this.hidden && this.closedFor !== teardown.mountId);
  closeNotice() { this.closedFor = teardown.mountId; }
}
export const drums = new Drums();
