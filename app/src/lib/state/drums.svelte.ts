// "No kick or snare was found": the drum tools step aside for such a track. A person can bring them back for the current teardown
// (the detector can be wrong, so hiding is never final); a new teardown starts hidden again.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { teardown } from "./teardown.svelte";
import { domain } from "../domain";

const { noDrumsFound } = domain as any;
class Drums {
  shownFor = $state(-1);
  /** No kick or snare anywhere in this teardown (says nothing about vocals or other instruments). */
  none = $derived.by(() => { const a = teardown.result as any; return !!a && !!noDrumsFound(a); });
  /** Hide the drum tools: there are none to show, and the person has not asked for them. */
  hidden = $derived(this.none && this.shownFor !== teardown.mountId);
  showAnyway() { this.shownFor = teardown.mountId; }
}
export const drums = new Drums();
