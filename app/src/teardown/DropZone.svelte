<!-- Before a track is loaded the stage is the discs (the session's one Scene, App.svelte) and one line of copy in their overlap. The motif
     itself is the control: clicking it (or Enter on it) opens a file; a file can also be dropped anywhere on the window. While a track is
     analysed the same line says so (the toolbar carries the stage and the progress). Formats and privacy are in the help menu. -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import { workspace } from "../lib/state/workspace.svelte";
  import { LINES, Cycle } from "../lib/ui/art/lines.svelte";

  const idle = new Cycle(LINES.idle, 4200), busy = new Cycle(LINES.analyse, 2600);
  const line = $derived(teardown.running ? busy.line : idle.line);
  const open = () => document.getElementById("file")?.click();
  $effect(() => () => { workspace.motifHover = false; });
</script>

<section class="dropzone" id="empty" aria-labelledby="drop-h" data-mode={teardown.running ? "analyse" : "idle"}>
  {#if !teardown.running}
    <button type="button" class="motif" aria-label="Open a track (or drop one anywhere on the window)" onclick={open}
      onpointerenter={() => (workspace.motifHover = true)} onpointerleave={() => (workspace.motifHover = false)}
      onfocus={() => (workspace.motifHover = true)} onblur={() => (workspace.motifHover = false)}></button>
  {/if}
  {#key line}<h2 id="drop-h" class="tt-line">{line}</h2>{/key}
</section>

<style>
  .dropzone { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; padding: 24px; }
  /* the click target is the motif: a round area the size of the gathered discs (same R as Scene) */
  .motif {
    --R: clamp(120px, min(21vw, 33vh), 340px);
    position: absolute; left: 50%; top: 50%; translate: -50% -50%; width: calc(var(--R) * 2.5); height: calc(var(--R) * 2.3); max-width: 100%; max-height: 100%;
    border: 0; border-radius: 50%; padding: 0; background: transparent; cursor: pointer;
  }
  .motif:focus-visible { outline: 2px solid var(--tt-focus); outline-offset: 4px; }
  h2 { position: relative; pointer-events: none; }
</style>
