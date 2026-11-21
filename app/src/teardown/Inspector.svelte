<!-- The inspector: what was found about the whole track. Wide screens show it beside the arrangement; narrow screens show the same
     content in a sheet. MIDI is downloaded from the piano roll. -->
<script lang="ts">
  import { workspace } from "../lib/state/workspace.svelte";
  import Findings from "./Findings.svelte";

  let { sheet = false }: { sheet?: boolean } = $props();
</script>

<div class="inspector-body" class:sheet>
  <div class="scroll"><Findings /></div>
  {#if !sheet}<button type="button" class="acc" onclick={() => (workspace.helpOpen = true)}>Accuracy: checked on synthetic songs only</button>{/if}
</div>

<style>
  .inspector-body { display: flex; flex-direction: column; min-height: 0; flex: 1; gap: 12px; }
  .scroll { flex: 1 1 0; min-height: 168px; overflow-y: auto; overscroll-behavior: contain; padding: 0 4px 32px 0; display: grid; align-content: start; gap: 8px;
    /* content that runs on fades out (an eased ramp, no visible edge), so a cut block reads as "scroll for more"; the bottom padding lets the last line scroll clear of it */
    mask-image: linear-gradient(to bottom, #000 calc(100% - 32px), rgb(0 0 0 / .85) calc(100% - 24px), rgb(0 0 0 / .55) calc(100% - 14px), rgb(0 0 0 / .2) calc(100% - 6px), transparent); }
  .acc { flex: none; align-self: start; padding: 0; border: 0; background: none; color: var(--tt-ink-3); font: 400 var(--tt-fs-xs) var(--tt-font-body); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .acc:hover { color: var(--tt-ink); }
  .sheet .scroll { mask-image: none; padding-bottom: 0; min-height: 0; }
</style>
