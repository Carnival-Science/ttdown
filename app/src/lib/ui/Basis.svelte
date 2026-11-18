<!-- How a number on the page is known. Every finding carries exactly one of these (docs/SVELTE_MIGRATION.md §14):
     measured   computed directly from the audio
     estimated  inferred by the analyzer: listen, check and correct it
     assumed    not detected: the analyzer assumes it
     unknown    the analyzer cannot tell
     corrected  you changed it; what depends on it was recomputed, or is marked out of date
     stale      worked out before a correction and not recomputed: hidden, never shown as valid -->
<script lang="ts">
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

<span class={"basis basis-" + kind} title={note || TEXT[kind][1]}>{TEXT[kind][0]}</span>

<style>
  .basis { display: inline-block; font: 600 0.68rem var(--tt-font-mono); letter-spacing: .04em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap; vertical-align: middle; }
  .basis-measured { color: var(--tt-good); border-color: color-mix(in srgb, var(--tt-good) 55%, transparent); }
  .basis-estimated { color: var(--tt-lcd); border-color: color-mix(in srgb, var(--tt-lcd) 55%, transparent); }
  .basis-assumed { color: var(--tt-cool); border-color: color-mix(in srgb, var(--tt-cool) 55%, transparent); }
  .basis-unknown { color: var(--tt-ink-3); border-color: var(--tt-line); border-style: dashed; }
  .basis-corrected { color: var(--tt-accent); border-color: color-mix(in srgb, var(--tt-accent) 60%, transparent); }
  .basis-stale { color: var(--tt-warn); border-color: color-mix(in srgb, var(--tt-warn) 60%, transparent); border-style: dashed; }
</style>
