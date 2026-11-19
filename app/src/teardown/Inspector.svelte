<!-- The inspector: what was found about the whole track, with the export pinned underneath so downloading never scrolls out of
     reach while you work on a section. Wide screens show it beside the arrangement; narrow screens show the same content in a
     sheet (`section` then picks which part, and the other stays mounted but hidden so nothing in it resets). -->
<script lang="ts">
  import { workspace } from "../lib/state/workspace.svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import Findings from "./Findings.svelte";
  import Exports from "./Exports.svelte";

  let { sheet = false }: { sheet?: boolean } = $props();
  const showFindings = $derived(!sheet || workspace.section === "findings");
  const showExport = $derived(!sheet || workspace.section === "export");
</script>

<div class="inspector-body" class:sheet>
  <div class="scroll" hidden={!showFindings}><Findings /></div>
  <div class="dockwrap" hidden={!showExport}><Exports /></div>
  {#if !sheet}<button type="button" class="acc" onclick={() => (workspace.helpOpen = true)}>Accuracy: checked on synthetic songs only</button>{/if}
</div>

<style>
  .inspector-body { display: flex; flex-direction: column; min-height: 0; flex: 1; gap: 12px; }
  .scroll { flex: 1 1 0; min-height: 168px; overflow-y: auto; overscroll-behavior: contain; padding: 0 4px 32px 0; display: grid; align-content: start; gap: 8px;
    /* content that runs on fades out (an eased ramp, no visible edge), so a cut block reads as "scroll for more"; the bottom padding lets the last line scroll clear of it */
    mask-image: linear-gradient(to bottom, #000 calc(100% - 32px), rgb(0 0 0 / .85) calc(100% - 24px), rgb(0 0 0 / .55) calc(100% - 14px), rgb(0 0 0 / .2) calc(100% - 6px), transparent); }
  .scroll[hidden], .dockwrap[hidden] { display: none; }
  .dockwrap { flex: 0 1 auto; min-height: 0; overflow-y: auto; border-top: 1px solid var(--tt-line); padding-top: 12px; overscroll-behavior: contain; } /* its natural height; it only scrolls when the window is very short */
  .acc { flex: none; align-self: start; padding: 0; border: 0; background: none; color: var(--tt-ink-3); font: 500 var(--tt-fs-xs) var(--tt-font-body); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .acc:hover { color: var(--tt-ink); }
  .sheet .dockwrap { border-top: 0; padding-top: 0; flex: 1 1 auto; }
  .sheet .scroll { mask-image: none; padding-bottom: 0; min-height: 0; }
</style>
