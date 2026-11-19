<!-- TTdown popover. Wraps @ui-sdk/svelte/popover: a button that opens a small panel beside it (Escape and an outside press close it).
     `trigger` is the button's content; `triggerClass` styles the button itself; `keepMounted` keeps the closed panel in the page
     (hidden), so what is inside stays alive and findable; `openOnHover` also opens it on hover (a press always works). -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from "@ui-sdk/svelte/popover";

  let { open = $bindable(false), trigger, children, title, label, triggerClass = "", class: cls = "", id, triggerId, side = "bottom", align = "start", keepMounted = false, openOnHover = false, disabled = false }: {
    open?: boolean; trigger: Snippet; children: Snippet; title?: string; label?: string; triggerClass?: string; class?: string; id?: string; triggerId?: string;
    side?: "top" | "bottom" | "left" | "right"; align?: "start" | "center" | "end"; keepMounted?: boolean; openOnHover?: boolean; disabled?: boolean;
  } = $props();
</script>

<Popover bind:open {openOnHover}>
  <PopoverTrigger class={triggerClass} aria-label={label} id={triggerId} {disabled}>{@render trigger()}</PopoverTrigger>
  <PopoverContent {side} {align} sideOffset={8} {keepMounted} {id} class={"tt-pop " + cls}>
    {#if title}<PopoverTitle class="tt-pop-title">{title}</PopoverTitle>{/if}
    {@render children()}
  </PopoverContent>
</Popover>
