<!-- The inspector: what was found about the whole track, with the export pinned underneath so downloading never scrolls out of
     reach while you work on a section. Wide screens show it beside the arrangement; narrow screens show the same content in a
     sheet (`section` then picks which part, and the other stays mounted but hidden so nothing in it resets). -->
<script lang="ts">
  import { workspace } from "../lib/state/workspace.svelte";
  import Findings from "./Findings.svelte";
  import Exports from "./Exports.svelte";

  let { sheet = false }: { sheet?: boolean } = $props();
  const showFindings = $derived(!sheet || workspace.section === "findings");
  const showExport = $derived(!sheet || workspace.section === "export");
</script>

<div class="inspector-body" class:sheet>
  <div class="scroll" hidden={!showFindings}><Findings /></div>
  <div class="dockwrap" hidden={!showExport}><Exports /></div>
</div>

<style>
  .inspector-body { display: flex; flex-direction: column; min-height: 0; flex: 1; gap: 12px; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; display: grid; align-content: start; gap: 10px; }
  .scroll[hidden], .dockwrap[hidden] { display: none; }
  .dockwrap { flex: none; max-height: 46%; overflow-y: auto; border-top: 1px solid var(--tt-line); padding-top: 12px; overscroll-behavior: contain; }
  .sheet .dockwrap { max-height: none; border-top: 0; padding-top: 0; flex: 1 1 auto; }
</style>
