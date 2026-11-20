<!-- TTdown tabs. Wraps @ui-sdk/svelte/tabs. Panels stay mounted (keepMounted), as in the legacy page, so audio
     players and other state inside a tab survive switching tabs. -->
<script lang="ts" generics="T extends { value: string; label: string }">
  import type { Snippet } from "svelte";
  import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/svelte/tabs";

  let { items, label, value = $bindable(items[0]?.value ?? null), panel, trailing, listClass = "", onchange }: {
    items: readonly T[]; label: string; value?: string | null; panel: Snippet<[T]>; trailing?: Snippet; listClass?: string; onchange?: (v: string | null) => void;
  } = $props();
</script>

<Tabs bind:value activation="automatic" class="tt-tabs" onValueChange={v => onchange?.(v)}>
  <div class="tt-tabbar">
    <TabsList class={"tt-tablist " + listClass} aria-label={label}>
      {#each items as item (item.value)}
        <TabsTab value={item.value} class="tt-tab">{item.label}</TabsTab>
      {/each}
    </TabsList>
    {#if trailing}{@render trailing()}{/if}
  </div>
  {#each items as item (item.value)}
    <TabsPanel value={item.value} keepMounted class="tt-tabpanel">{@render panel(item)}</TabsPanel>
  {/each}
</Tabs>

<style>
  /* The tab bar has its own reserved row above the panels, never floating over them (it used to be sticky and covered the piano roll). */
  :global(.tt-tabs) { display: flex; flex-direction: column; gap: 12px; min-height: 0; flex: 1; }
  .tt-tabbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; flex: none; }
  :global(.tt-tablist) {
    display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; padding: 4px; flex: none; max-width: 100%;
    background: var(--tt-inset); border-radius: var(--tt-radius-sm); box-shadow: inset 0 0 0 1px var(--tt-line-2);
  }
  :global(.tt-tabpanel) { min-height: 0; overflow-y: auto; overscroll-behavior: contain; flex: 1; }
  :global(.tt-tabpanel[hidden]) { display: none; }
  @media (max-width: 1179px) { :global(.tt-tabpanel) { overflow: visible; flex: none; } :global(.tt-tab) { padding: 0 12px; } .tt-tabbar { gap: 6px 8px; } }
  :global(.tt-tab) {
    flex: 0 0 auto; min-height: 36px; padding: 0 12px; border-radius: var(--tt-radius-sm); border: 0; background: transparent;
    color: var(--tt-ink-2); font: 600 var(--tt-fs-sm) var(--tt-font-body); cursor: pointer; transition: background var(--tt-ease);
  }
  :global(.tt-tab[aria-selected="true"]) { background: var(--tt-accent); color: var(--tt-accent-ink); }
</style>
