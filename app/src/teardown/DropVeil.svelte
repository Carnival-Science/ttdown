<!-- Shown while a file is dragged over the window: the page dims to paper and a fine cobalt frame marks the whole window as the drop
     target. The discs, and the line in their overlap, are the session's one Scene (lib/ui/art/Scene.svelte), which comes forward in front of
     this veil and follows the pointer. Decorative (aria-hidden) and pointer-transparent. -->
<script lang="ts">
  // no props: the pointer is followed by the Scene
</script>

<div class="dropveil" aria-hidden="true"><div class="frame"></div></div>

<style>
  .dropveil { position: fixed; inset: 0; z-index: 50; pointer-events: none; background: rgb(247 248 242 / .94); animation: veil-in 160ms ease-out; }
  .frame { position: absolute; inset: 12px; border: 1px solid var(--tt-cobalt); }
  @keyframes veil-in { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .dropveil { animation: none; } }
</style>
