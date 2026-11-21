<!-- Small line icons drawn to sit with Absans (the typefaces have no ▶ ✓ ✕ ⓘ glyphs, and a fallback font in the middle of a label looks
     broken). Decorative: the button or label they sit in carries the words or the aria-label. Size follows the text (1em). -->
<script lang="ts">
  type Name = "play" | "stop" | "check" | "close" | "info" | "download" | "chevron-down" | "chevron-left" | "chevron-right";
  let { name, class: cls = "" }: { name: Name; class?: string } = $props();
</script>

<svg class={"tt-icon " + cls} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  {#if name === "play"}<path class="fill" d="M5 3.2v9.6L12.6 8z" />
  {:else if name === "stop"}<rect class="fill" x="4" y="4" width="8" height="8" rx="1" />
  {:else if name === "check"}<path d="M3.5 8.5l3 3 6-7" />
  {:else if name === "close"}<path d="M4 4l8 8M12 4l-8 8" />
  {:else if name === "info"}<circle cx="8" cy="8" r="6" /><path d="M8 7.2V11.2" /><circle class="fill" cx="8" cy="5" r=".8" />
  {:else if name === "download"}<path d="M8 2.8v7.4M4.8 7.2L8 10.4l3.2-3.2M3.2 13.2h9.6" />
  {:else if name === "chevron-down"}<path d="M4.5 6.5L8 10l3.5-3.5" />
  {:else if name === "chevron-left"}<path d="M9.5 4.5L6 8l3.5 3.5" />
  {:else if name === "chevron-right"}<path d="M6.5 4.5L10 8l-3.5 3.5" />{/if}
</svg>

<style>
  .tt-icon { width: 1em; height: 1em; flex: none; display: inline-block; vertical-align: -0.125em; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .tt-icon .fill { fill: currentColor; stroke: none; }
</style>
