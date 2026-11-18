<!-- TTdown tabs. Wraps @ui-sdk/svelte/tabs. Panels stay mounted (keepMounted), as in the legacy page, so audio
     players and other state inside a tab survive switching tabs. -->
<script lang="ts" generics="T extends { value: string; label: string }">
  import type { Snippet } from "svelte";
  import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/svelte/tabs";

  let { items, label, value = $bindable(items[0]?.value ?? null), panel, listClass = "", onchange }: {
    items: readonly T[]; label: string; value?: string | null; panel: Snippet<[T]>; listClass?: string; onchange?: (v: string | null) => void;
  } = $props();
</script>

<Tabs bind:value activation="automatic" class="tt-tabs" onValueChange={v => onchange?.(v)}>
  <TabsList class={"tt-tablist " + listClass} aria-label={label}>
    {#each items as item (item.value)}
      <TabsTab value={item.value} class="tt-tab">{item.label}</TabsTab>
    {/each}
  </TabsList>
  {#each items as item (item.value)}
    <TabsPanel value={item.value} keepMounted class="tt-tabpanel">{@render panel(item)}</TabsPanel>
  {/each}
</Tabs>

<style>
  :global(.tt-tabs) { display: grid; gap: var(--tt-gap); }
  :global(.tt-tablist) {
    display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 8px; position: sticky; top: 0;
    background: var(--tt-chassis); border: 1px solid var(--tt-line); border-radius: var(--tt-radius);
  }
  :global(.tt-tab) {
    flex: 0 0 auto; min-height: var(--tt-tap); padding: 0 14px; border-radius: var(--tt-radius-sm); border: 0; background: transparent;
    color: var(--tt-ink-2); font: 600 var(--tt-fs-sm) var(--tt-font-body); cursor: pointer; transition: background var(--tt-ease);
  }
  :global(.tt-tab[aria-selected="true"]) { background: var(--tt-accent); color: var(--tt-accent-ink); }
</style>
