// Layout state for the analysis workspace. Wide screens show the findings as an inspector beside the arrangement;
// narrow ones open the same content in a sheet. The state lives here, outside the components, so closing the sheet, collapsing
// the inspector or crossing the breakpoint never resets what the person was doing (playback, selection, edits).
import { MediaQuery } from "svelte/reactivity";

export const WIDE_QUERY = "(min-width: 1180px)";
const wideQuery = new MediaQuery(WIDE_QUERY);

class Workspace {
  /** The inspector is folded to a rail (wide screens). */
  collapsed = $state(false);
  /** The findings sheet is open (narrow screens). */
  sheet = $state(false);
  /** The compact transport's secondary controls are open (narrow screens). */
  more = $state(false);
  /** The help popover (how to read the labels, accuracy, build) is open: the toolbar's ? and the inspector's accuracy line both open it. */
  helpOpen = $state(false);
  /** A file is being dragged over the window (the art gathers towards it). */
  dragging = $state(false);
  get wide() { return wideQuery.current; }
  openSheet() { this.sheet = true; }
}
export const workspace = new Workspace();
