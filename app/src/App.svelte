<!-- Teardown: an audio application that happens to run in a browser. A toolbar (open a track, name, recent, status, help) over one
     workspace: a large drop zone before a track is loaded, the arrangement and the section editor with the findings and export
     beside them once it is analysed. On a wide screen the window never scrolls (only the inspector and the editor do); on a phone the
     page scrolls naturally and the findings and export open in a sheet. Everything shown says how it is known (measured,
     estimated, assumed or unknown). -->
<script lang="ts">
  import { installTestHooks } from "./lib/testing/hooks";
  import { teardown } from "./lib/state/teardown.svelte";
  import { timeMapSelfCheck } from "./lib/timemap";
  import { mountNotes } from "./lib/ui/toast";
  import Toolbar from "./teardown/Toolbar.svelte";
  import DropZone from "./teardown/DropZone.svelte";
  import Workspace from "./teardown/Workspace.svelte";
  import Circles from "./lib/ui/art/Circles.svelte";
  import { workspace } from "./lib/state/workspace.svelte";
  import { sweepReveal, stopSweep } from "./lib/ui/sweep";

  installTestHooks();
  $effect(() => mountNotes());
  $effect(() => { teardown.refreshHistory(); });
  // Runs the canonical TimeMap once; the smoke test compares this with Node (dev server and built bundle alike).
  const tm = timeMapSelfCheck();

  // A file can be dropped anywhere on the window.
  let depth = $state(0);
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; };
  const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
  const leave = (e: DragEvent) => { if (hasFiles(e)) depth = Math.max(0, depth - 1); };
  $effect(() => { workspace.dragging = depth > 0; });
  // A finished analysis develops onto the page behind a shader band (not a saved teardown being reopened).
  let stage: HTMLElement | undefined = $state();
  $effect(() => { if (teardown.analysedId > 0) void sweepReveal(stage); return stopSweep; });
  const drop = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; void teardown.analyzeFile(e.dataTransfer?.files[0]); };
</script>

<svelte:window ondragenter={enter} ondragover={over} ondragleave={leave} ondrop={drop} />

<main class="app" class:dragging={depth > 0} data-timemap-schema={tm.schema} data-timemap-fingerprint={tm.fingerprint}>
  <Toolbar />
  <div id="out" class="stage" bind:this={stage} class:has-result={!!teardown.result}>
    {#if teardown.result}
      {#key teardown.mountId}
        <Workspace />
      {/key}
    {:else}
      <DropZone />
    {/if}
  </div>
  {#if depth > 0}<div class="dropveil" aria-hidden="true"><div class="veilart"><Circles mode="converge" /></div><p>Drop to analyse</p></div>{/if}
</main>
