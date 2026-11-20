// The one export decision for the page: the piano roll's MIDI download reads this. It wraps domain.exportGate (stale results, refused
// grids). The analyzer's 4/4 and first downbeat are taken as given: there is no separate step asking the person to confirm the bar
// lines, so `confirmed` is always true. Nothing here lifts a refused or stale grid: those still block quantized MIDI.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { teardown } from "./teardown.svelte";
import { domain } from "../domain";
import { gridOf } from "../timeline/grid";

const { exportGate, tdId } = domain as any;
const REASONS: Record<string, string> = {
  "tempo-changes": "The tempo changes during the track, so one fixed bar grid can't line up with it.",
  "tempo-not-constant": "The tempo isn't steady enough for one fixed bar grid.",
  "tempo-drift": "The tempo drifts: one steady tempo would miss the tracked beats by more than the allowed margin somewhere.",
  "meter-not-4/4": "The meter isn't 4/4, and quantized MIDI only supports four beats per bar.",
  "meter-ambiguous": "The meter is ambiguous.", "meter-unsupported": "The meter isn't supported.", "no-grid": "There is no usable bar grid.",
};
export type Gate = { canExport: boolean; state: string; stale: string[]; reasons: string[]; needs: string[]; caveats: string[]; tempo: number | null };

class ExportState {
  id = $derived.by(() => { const a = teardown.result as any; if (!a) return ""; const m = (gridOf(a) as any).map; return tdId(a) + "|" + (m ? m.fingerprint() : ""); });
  readonly confirmed = true;
  gate = $derived.by((): Gate => { const a = teardown.result as any; return a ? exportGate(a, (gridOf(a) as any).map, this.confirmed) : { canExport: false, state: "refused", stale: [], reasons: ["no-grid"], needs: [], caveats: [], tempo: null }; });
  /** Why a part's MIDI button is locked, in the words the page uses; "" when it is available. */
  get lockedWhy(): string {
    const g = this.gate; if (g.canExport) return "";
    if (g.stale.length) return "Out of date after a correction. Upload the track again to export.";
    if (g.state === "refused") return (g.reasons.map(r => REASONS[r] || r).join(" ") || "One fixed bar grid can't follow this track.") + " Use original timing or the tempo map instead.";
    return "Not available for this track.";
  }
}
export const exportState = new ExportState();
