<!-- A playhead: ONE positioned element, moved with a transform by the play clock. It spans its positioned parent (the area the time axis
     covers), so a single playhead can cross several lanes. Not a reactive value per frame: nothing under it is re-rendered. -->
<script lang="ts">
  import { untrack } from "svelte";
  import type { PlayClock } from "./clock";
  import type { TimeViewport } from "./viewport.svelte";
  let { clock, viewport, label = "Playhead" }: { clock: PlayClock | null; viewport: TimeViewport; label?: string } = $props();
  let box: HTMLDivElement, line: HTMLDivElement, width = $state(0), lastT = 0;
  const place = (t: number) => {
    lastT = t; if (!line || !width) return;
    const x = viewport.xOf(t, width), inside = x >= -1 && x <= width + 1;
    line.style.transform = `translateX(${x.toFixed(2)}px)`; line.style.visibility = inside ? "visible" : "hidden"; line.dataset.time = t.toFixed(3);
  };
  $effect(() => { const c = clock; if (!c) return; return untrack(() => c.subscribe(place)); });
  // a change of the viewport or of the width moves the playhead too (the clock may be paused)
  $effect(() => { void viewport.start; void viewport.span; void width; place(lastT); });
</script>

<div class="phbox" bind:this={box} bind:clientWidth={width} aria-hidden="true"><div class="ph" bind:this={line} data-playhead={label}></div></div>

<style>
  .phbox { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 4; }
  .ph { position: absolute; left: -1px; top: 0; bottom: 0; width: 2px; background: var(--tl-playhead, var(--tt-accent)); box-shadow: 0 0 0 1px rgb(251 252 248 / 0.9); will-change: transform; visibility: hidden; }
</style>
