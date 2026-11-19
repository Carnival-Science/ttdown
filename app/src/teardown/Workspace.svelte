<!-- The analysis workspace. The arrangement and the section editor are the main area: they stay put while you work. The findings
     about the whole track and the export are an inspector beside them on wide screens (foldable to a rail), and a sheet opened
     from a bar on narrow screens. One Inspector component holds both, and the state it needs lives in `workspace`, so folding
     it, closing the sheet or crossing the breakpoint never resets playback, the selection, edits or a bar-grid confirmation. -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import { workspace } from "../lib/state/workspace.svelte";
  import Sheet from "../lib/ui/Sheet.svelte";
  import Notices from "./Notices.svelte";
  import Explorer from "./Explorer.svelte";
  import Inspector from "./Inspector.svelte";

  const a = $derived(teardown.result as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  const folded = $derived(workspace.wide && workspace.collapsed);
</script>

<Notices />
<div class="workspace" class:wide={workspace.wide} class:folded>
  <section class="main panel" aria-label="Arrangement and section editor"><Explorer /></section>

  {#if workspace.wide}
    <aside class="inspector panel" aria-label="Track findings and export">
      <div class="ihead">
        {#if !folded}<h2 id="found-h" class="ititle">Findings</h2>{/if}
        <button type="button" class="fold" aria-expanded={!folded} aria-label={folded ? "Show findings and export" : "Hide findings and export"} onclick={() => (workspace.collapsed = !workspace.collapsed)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={folded ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} /></svg>
        </button>
      </div>
      {#if folded}<span class="railtext" aria-hidden="true">Findings · Export</span>{/if}
      <div class="insp" hidden={folded}><Inspector /></div>
    </aside>
  {:else}
    <div class="sheetbar">
      <span class="summary">{a.bpm} BPM · {a.key} · {a.notFourFour ? "not 4/4" : "4/4"}</span>
      <button type="button" class="btn" onclick={() => workspace.openSheet("findings")}>Findings</button>
      <button type="button" class="btn primary" onclick={() => workspace.openSheet("export")}>Export</button>
    </div>
    <Sheet bind:open={workspace.sheet} title={workspace.section === "export" ? "Export" : "Findings"}><Inspector sheet /></Sheet>
  {/if}
</div>

<style>
  .workspace { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; min-width: 0; }
  .main.panel { display: flex; flex-direction: column; padding: 12px; gap: 8px; min-width: 0; min-height: 0; }

  .workspace.wide { grid-template-columns: minmax(0, 1fr) 320px; flex: 1; min-height: 0; transition: grid-template-columns 200ms cubic-bezier(0.23, 1, 0.32, 1); }
  .workspace.wide.folded { grid-template-columns: minmax(0, 1fr) 52px; }
  .workspace.wide .main.panel { padding: 12px 12px; }
  .inspector.panel { display: flex; flex-direction: column; gap: 8px; padding: 12px; min-height: 0; min-width: 0; overflow: hidden; }
  .folded .inspector.panel { padding: 8px 6px; align-items: center; }
  .ihead { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: none; width: 100%; }
  .folded .ihead { justify-content: center; }
  .ititle { font-size: 1rem; }
  .fold { width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--tt-ink-2); cursor: pointer; }
  .fold:hover { color: var(--tt-ink); background: var(--tt-chassis); }
  .fold:focus-visible { outline: 2px solid var(--tt-focus); outline-offset: 2px; }
  .fold svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .railtext { writing-mode: vertical-rl; color: var(--tt-ink-3); font-size: var(--tt-fs-xs); letter-spacing: .04em; margin-top: 8px; }
  .insp { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .insp[hidden] { display: none; }

  .sheetbar {
    position: sticky; bottom: 8px; z-index: 8; display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 12px; border-radius: 14px;
    background: var(--tt-chassis); border: 1px solid #3a3d46; box-shadow: 0 10px 28px rgb(0 0 0 / 0.55);
  }
  .summary { flex: 1; min-width: 0; font: 600 .82rem var(--tt-font-body); color: var(--tt-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .sheetbar .btn { min-height: var(--tt-tap); padding: 0 12px; }
  @media (prefers-reduced-motion: reduce) { .workspace.wide { transition: none; } }
</style>
