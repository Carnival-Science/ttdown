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
  import DropVeil from "./teardown/DropVeil.svelte";
  import { workspace } from "./lib/state/workspace.svelte";
  import { sweepReveal, stopSweep, sweeping } from "./lib/ui/sweep";
  import { enterWorkspace, stopEntrance } from "./lib/ui/entrance";
  import { faviconWorking } from "./lib/ui/favicon";
  import Scene, { type SceneState } from "./lib/ui/art/Scene.svelte";

  installTestHooks();
  // the tab icon turns cobalt and pulses while the note model transcribes (lib/ui/favicon.ts)
  $effect(() => { faviconWorking(teardown.transcribing); return () => faviconWorking(false); });
  $effect(() => mountNotes());
  $effect(() => { teardown.refreshHistory(); });
  // Runs the canonical TimeMap once; the smoke test compares this with Node (dev server and built bundle alike).
  const tm = timeMapSelfCheck();

  // A file can be dropped anywhere on the window.
  let depth = $state(0);
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (depth === 0) { px = e.clientX; py = e.clientY; } depth++; };
  // where the pointer is during a drag, so the discs can follow it
  let px = $state(0), py = $state(0);
  const over = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); px = e.clientX; py = e.clientY; };
  const leave = (e: DragEvent) => { if (hasFiles(e)) depth = Math.max(0, depth - 1); };
  $effect(() => { workspace.dragging = depth > 0; });
  // A teardown arriving on the stage: the discs wash into the background (the scene below), a shader band crosses the window and the
  // workspace's parts rise in as it uncovers them. Swapping one open teardown for another only rises (lib/ui/entrance.ts).
  let stage: HTMLElement | undefined = $state();
  $effect(() => {
    const e = teardown.entrance; if (!e.id) return;
    if (e.sweep) void sweepReveal(stage);
    enterWorkspace(stage, sweeping());
    return () => { stopSweep(); stopEntrance(); };
  });
  // ONE scene of discs for the whole session; the state only changes its depth of field (lib/ui/art/Scene.svelte). A teardown on screen keeps
  // the wash behind it even while a new file is analysed, so nothing moves behind the work.
  const scene = $derived<SceneState>(depth > 0 ? "drop" : teardown.result ? "workspace" : teardown.running ? "analyse" : "idle");
  const drop = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; void teardown.analyzeFile(e.dataTransfer?.files[0]); };
</script>

<svelte:window ondragenter={enter} ondragover={over} ondragleave={leave} ondrop={drop} />

<Scene state={scene} x={px} y={py} lean={workspace.motifHover} />
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
  {#if depth > 0}<DropVeil />{/if}
</main>
