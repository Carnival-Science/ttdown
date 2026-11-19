// The one export decision for the page: Export (the full package), and the per-part MIDI buttons beside the piano rolls and chords, all
// read this. It wraps domain.exportGate (stale results, refused grids, assumptions that need confirming) and holds the person's
// confirmation of the bar lines, which belongs to one teardown + grid (a changed grid asks again). Nothing here can lift a refused or
// stale grid: `confirmed` only matters to a grid that is merely an assumption.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { teardown } from "./teardown.svelte";
import { domain } from "../domain";
import { gridOf } from "../timeline/grid";
import { workspace } from "./workspace.svelte";

const { exportGate, tdId } = domain as any;
export type Gate = { canExport: boolean; state: string; stale: string[]; reasons: string[]; needs: string[]; caveats: string[]; tempo: number | null };

class ExportState {
  id = $derived.by(() => { const a = teardown.result as any; if (!a) return ""; const m = (gridOf(a) as any).map; return tdId(a) + "|" + (m ? m.fingerprint() : ""); });
  confirmed = $derived(workspace.confirmedFor === this.id);
  gate = $derived.by((): Gate => { const a = teardown.result as any; return a ? exportGate(a, (gridOf(a) as any).map, this.confirmed) : { canExport: false, state: "refused", stale: [], reasons: ["no-grid"], needs: [], caveats: [], tempo: null }; });
  confirm() { workspace.confirmedFor = this.id; }
  /** Why a part's MIDI button is locked, in the words the page uses; "" when it is available. */
  get lockedWhy(): string {
    const g = this.gate; if (g.canExport) return "";
    if (g.stale.length) return "Out of date after a correction. Upload the track again to export.";
    if (g.state === "refused") return "Blocked: one fixed bar grid can't follow this track (see Export).";
    return "Check the bar lines in Export first: the analyzer's downbeat and 4/4 are assumptions.";
  }
}
export const exportState = new ExportState();
