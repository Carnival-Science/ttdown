<!-- The saved teardowns, each with a delete beside it. Deleting cannot be undone, so it asks first (inline: "Delete? Yes / Cancel"),
     and says plainly that it only removes the copy saved in this browser. Used in the Recent popover and on the empty-state page. -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  let { limit = 99, onopen, clearAll = false }: { limit?: number; onopen?: () => void; clearAll?: boolean } = $props();
  /** Which row (index) is asking "Delete?", or "all" for Clear all. */
  let asking = $state<number | "all" | null>(null);
  const label = (h: { title?: string }) => h.title || "Untitled";
  const rows = $derived(teardown.history.slice(0, limit));
  $effect(() => { if (asking !== null && asking !== "all" && asking >= rows.length) asking = null; });
</script>

<div class="rl" id={clearAll ? "hist" : undefined}>
  {#each rows as h, i (i)}
    <div class="hrow" data-hrow>
      {#if asking === i}
        <span class="ask" role="group" aria-label={"Delete " + label(h) + "?"}>
          <span class="q">Delete “{label(h)}”?</span>
          <button type="button" class="btn danger yes" data-delete-yes onclick={() => { asking = null; teardown.forget(h); }}>Yes</button>
          <button type="button" class="btn cancel" data-delete-cancel onclick={() => (asking = null)}>Cancel</button>
        </span>
      {:else}
        <button type="button" class="btn h-open" onclick={() => { teardown.open(h); onopen?.(); }}>{`${label(h)} · ${h.bpm} BPM · ${h.key}`}</button>
        <button type="button" class="btn x" data-delete aria-label={"Delete " + label(h)} title={"Delete " + label(h)} onclick={() => (asking = i)}>×</button>
      {/if}
    </div>
  {/each}
</div>
{#if clearAll && teardown.history.length}
  <div class="clear">
    {#if asking === "all"}
      <p class="small warn" role="alert">Delete all {teardown.history.length} saved teardowns? This can't be undone. It only removes the copies saved in this browser.</p>
      <span class="ask"><button type="button" class="btn danger yes" data-clear-yes onclick={() => { asking = null; teardown.forgetAll(); }}>Yes, delete all</button>
        <button type="button" class="btn cancel" data-clear-cancel onclick={() => (asking = null)}>Cancel</button></span>
    {:else}
      <button type="button" class="btn clearbtn" data-clear-all onclick={() => (asking = "all")}>Clear all saved teardowns</button>
      <p class="small hint">Deleting only removes the copy saved in this browser.</p>
    {/if}
  </div>
{/if}

<style>
  .rl { display: grid; gap: 6px; }
  .hrow { display: flex; gap: 6px; align-items: stretch; min-width: 0; }
  .h-open { flex: 1; min-width: 0; justify-content: flex-start; text-align: left; white-space: normal; }
  .x { flex: none; padding: 0 10px; font-size: 1.1rem; line-height: 1; color: var(--tt-ink-3); }
  .x:hover, .x:focus-visible { color: #ff8a80; }
  .ask { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: 1; }
  .q { flex: 1 1 100%; font-size: .85rem; color: var(--tt-ink-2); overflow-wrap: anywhere; }
  .danger { border-color: #c0504a; color: #ff8a80; }
  .clear { display: grid; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--tt-line, #2a2d35); }
  .clear .small { margin: 0; color: var(--tt-ink-3); }
  .clear .warn { color: var(--tt-ink-2); }
  .clearbtn { justify-self: start; }
</style>
