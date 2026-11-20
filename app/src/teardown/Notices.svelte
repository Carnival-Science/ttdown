<!-- What a correction did to the results. Always in view above the workspace (not inside the findings), so a stale or recomputed
     result is never missed on a phone where the findings sit in a sheet. Nothing is rendered when nothing needs saying. Only what is still true is shown here; "analysed again at your tempo" is an event, so it is a toast (teardown.svelte.ts). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";

  const { staleReasons } = domain as any;
  const a = $derived(teardown.result as any);
  const fixes = $derived((a.timingCorrections || []) as any[]);
  const bpmFixes = $derived(fixes.filter(c => c.type === "bpm"));
  const detectedBpm = $derived(bpmFixes[0]?.from ?? null);
  const stale = $derived(staleReasons(a) as string[]);
</script>

{#if stale.includes("tempo")}
  <p class="notice" role="status"><b>You corrected the tempo{detectedBpm ? ` (detected: ${detectedBpm} BPM)` : ""}, but the audio isn't here to analyse again.</b> The drum pattern, chords, notes and exports were worked out at the detected tempo and no longer line up, so they are marked out of date. Upload the track again to analyse it at your tempo.</p>
{/if}
{#if stale.includes("meter")}
  <p class="notice" role="status"><b>You said this track isn't in 4/4.</b> The analyzer can only read four beats per bar, so the bars, drum pattern, chords and notes are unreliable and marked out of date. The sections, key and measured sound are not affected.</p>
{/if}
