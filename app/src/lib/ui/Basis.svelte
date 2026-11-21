<!-- How a number on the page is known. Every finding carries exactly one of these (docs/SVELTE_MIGRATION.md §14):
     measured   computed directly from the audio
     estimated  inferred by the analyzer: listen, check and correct it
     assumed    not detected: the analyzer assumes it
     unknown    the analyzer cannot tell
     corrected  you changed it; what depends on it was recomputed, or is marked out of date
     stale      worked out before a correction and not recomputed: hidden, never shown as valid -->
<script lang="ts">
  import Popover from "./Popover.svelte";
  type Kind = "measured" | "estimated" | "assumed" | "unknown" | "corrected" | "stale";
  const TEXT: Record<Kind, [string, string]> = {
    measured: ["Measured", "Computed directly from the audio."],
    estimated: ["Estimated", "Inferred by the analyzer. Listen, check it and correct it if it is wrong."],
    assumed: ["Assumed", "Not detected: the analyzer assumes this."],
    unknown: ["Unknown", "The analyzer can't tell."],
    corrected: ["Corrected by you", "You changed this."],
    stale: ["Out of date", "Worked out before a correction and not recomputed, so it is not shown as valid."],
  };
  let { kind, note = "" }: { kind: Kind; note?: string } = $props();
</script>

<!-- The badge is a button: pressing, focusing or hovering it says what the label means and why. -->
<Popover openOnHover triggerClass={"basis basis-" + kind} side="bottom" align="start" class="basis-pop">
  {#snippet trigger()}{TEXT[kind][0]}{/snippet}
  <p class="basis-pop-head"><b>{TEXT[kind][0]}</b></p>
  <p>{note || TEXT[kind][1]}</p>
  {#if note && note !== TEXT[kind][1]}<p class="basis-pop-sub">{TEXT[kind][1]}</p>{/if}
</Popover>

<style>
  :global(.basis) { display: inline-block; cursor: help; background: transparent;  font: 400 10.5px/1.5 var(--tt-font-mono); letter-spacing: .01em; text-transform: uppercase; padding: 0 4px; border-radius: 2px; border: 1px solid; white-space: nowrap; vertical-align: middle; }
  :global(.basis-measured) { color: var(--tt-good); border-color: color-mix(in srgb, var(--tt-good) 50%, transparent); background: color-mix(in srgb, var(--tt-lime) 14%, transparent); }
  :global(.basis-estimated) { color: #7A5A12; border-color: color-mix(in srgb, #7A5A12 50%, transparent); background: color-mix(in srgb, #C9A64B 10%, transparent); }
  :global(.basis-assumed) { color: #4F5E6B; border-color: color-mix(in srgb, #4F5E6B 50%, transparent); }
  :global(.basis-unknown) { color: var(--tt-ink-3); border-color: var(--tt-line); border-style: dashed; }
  :global(.basis-corrected) { color: var(--tt-accent); border-color: color-mix(in srgb, var(--tt-accent) 60%, transparent); }
  :global(.basis-stale) { color: var(--tt-warn); border-color: color-mix(in srgb, var(--tt-warn) 60%, transparent); border-style: dashed; }
  :global(.basis:focus-visible) { outline: 2px solid var(--tt-focus); outline-offset: 2px; }
  :global(.basis-pop) { max-width: 260px; padding: 8px 12px; font-size: var(--tt-fs-sm); }
  :global(.basis-pop p) { margin: 0 0 4px; }
  :global(.basis-pop .basis-pop-sub) { color: var(--tt-ink-3); }
</style>
