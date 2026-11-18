<!-- TTdown group of toggles, several pressed at once, one tab stop. Wraps @ui-sdk/svelte/toggle's ToggleGroup. -->
<script lang="ts" generics="T extends { value: string; label: string }">
  import { Toggle, ToggleGroup } from "@ui-sdk/svelte/toggle";

  let { items, value, label, disabled = false, class: cls = "", onchange }: {
    items: readonly T[]; value: string[]; label: string; disabled?: boolean; class?: string; onchange: (v: string[]) => void;
  } = $props();
</script>

<ToggleGroup class={"tt-tgroup " + cls} aria-label={label} multiple {value} {disabled} onValueChange={v => onchange(v as string[])}>
  {#each items as it (it.value)}<Toggle class="tt-toggle" value={it.value}>{it.label}</Toggle>{/each}
</ToggleGroup>
