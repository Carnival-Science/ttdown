<!-- TTdown popover. Wraps @ui-sdk/svelte/popover so the rest of the app never imports UI SDK directly
     (scripts/check-ui-boundary.mjs enforces this). Props used are checked against the installed 0.1.0-beta.6 typings. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@ui-sdk/svelte/popover";

  let { label, title, trigger, children, open = $bindable(false), triggerId, triggerClass = "tt-iconbtn", contentClass = "tt-pop", keepMounted = false, showTitle = true }: {
    label: string; title: string; trigger: Snippet; children: Snippet; open?: boolean; triggerId?: string; triggerClass?: string; contentClass?: string; keepMounted?: boolean; showTitle?: boolean;
  } = $props();
</script>

<Popover bind:open>
  <PopoverTrigger id={triggerId} class={triggerClass} aria-label={label} title={label}>{@render trigger()}</PopoverTrigger>
  <PopoverContent class={contentClass} side="bottom" align="end" sideOffset={8} {keepMounted}>
    <PopoverTitle class={showTitle ? "tt-pop-title" : "tt-sr-only"}>{title}</PopoverTitle>
    {@render children()}
  </PopoverContent>
</Popover>

<style>
  :global(.tt-iconbtn) {
    min-width: var(--tt-tap); min-height: var(--tt-tap); border-radius: var(--tt-radius-sm); border: 1px solid var(--tt-line);
    background: #15161a; color: var(--tt-ink-2); font: 600 var(--tt-fs-sm) var(--tt-font-body); cursor: pointer; padding: 0 12px;
  }
  :global(.tt-iconbtn[aria-expanded="true"]), :global(.tt-iconbtn:hover) { color: var(--tt-ink); border-color: #45362a; }
  :global(.tt-pop) {
    z-index: 50; min-width: 260px; max-width: min(360px, calc(100vw - 2 * var(--tt-gutter)));
    background: var(--tt-chassis); border: 1px solid var(--tt-line); border-radius: 12px; padding: 14px 16px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, .45); display: grid; gap: 8px;
  }
  :global(.tt-pop[hidden]) { display: none; }
  :global(.tt-pop-title) { font: 800 0.9rem var(--tt-font-display); text-transform: uppercase; margin: 0; }
  :global(.tt-sr-only) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
