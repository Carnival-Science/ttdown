<!-- TTdown segmented control (one of a few, all visible). Wraps @ui-sdk/svelte/segmented-control: a radio group, arrow keys move
     and check. `item` renders an option's content, `itemProps` adds per-option attributes (style, class, title, data-*). -->
<script lang="ts" generics="T extends { value: string; label: string }">
  import type { Snippet } from "svelte";
  import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/svelte/segmented-control";

  let { items, value, label, class: cls = "", disabled = false, indicator = true, item, itemProps, onchange }: {
    items: readonly T[]; value: string | null; label: string; class?: string; disabled?: boolean; indicator?: boolean;
    item?: Snippet<[T, boolean]>; itemProps?: (it: T, checked: boolean) => Record<string, unknown>; onchange?: (v: string) => void;
  } = $props();
</script>

<SegmentedControl class={"tt-seg " + cls} aria-label={label} {value} {disabled}
  onValueChange={v => { if (v != null) onchange?.(v); }}>
  {#if indicator}<SegmentedControlIndicator class="tt-seg-indicator" />{/if}
  {#each items as it (it.value)}
    <SegmentedControlItem value={it.value} class="tt-seg-item" {...(itemProps?.(it, it.value === value) ?? {})}>
      {#if item}{@render item(it, it.value === value)}{:else}{it.label}{/if}
    </SegmentedControlItem>
  {/each}
</SegmentedControl>
