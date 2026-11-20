<!-- A ruler along a time axis. Press or drag on it to seek. The caller supplies the ticks (it owns the time-to-label mapping: bars, beats,
     seconds…) and what seeking does. Ticks are placed in percent of the visible span. -->
<script lang="ts">
  import type { TimeViewport } from "./viewport.svelte";
  export interface Tick { t: number; label: string; dashed?: boolean; end?: boolean; attrs?: Record<string, string> }
  let { viewport, ticks, onseek, title, attrs = {}, height = 18, class: cls = "", slider }: {
    viewport: TimeViewport; ticks: Tick[]; onseek?: (t: number, phase: "start" | "move" | "end") => void; title?: string; attrs?: Record<string, string>; height?: number; class?: string;
    /** Makes the ruler a keyboard-operable slider for the position (arrows 1 s, Shift 5 s, Home, End) so seeking never needs a pointer. */
    slider?: { label: string; value: number; max: number; text: string };
  } = $props();
  let el: HTMLDivElement, down = false;
  const at = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return viewport.tOf(Math.min(Math.max(e.clientX - r.left, 0), r.width), r.width); };
  const pd = (e: PointerEvent) => { if (!onseek) return; down = true; el.setPointerCapture(e.pointerId); onseek(at(e), "start"); };
  const pm = (e: PointerEvent) => { if (down) onseek?.(at(e), "move"); };
  const pu = (e: PointerEvent) => { if (!down) return; down = false; try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ } onseek?.(at(e), "end"); };
  const key = (e: KeyboardEvent) => {
    if (!slider || !onseek) return; const step = e.shiftKey ? 5 : 1; let t = slider.value;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") t += step; else if (e.key === "ArrowLeft" || e.key === "ArrowDown") t -= step; else if (e.key === "Home") t = 0; else if (e.key === "End") t = slider.max; else return;
    e.preventDefault(); onseek(Math.min(Math.max(0, t), slider.max), "end");
  };
  const pct = (t: number) => (100 * (t - viewport.start) / viewport.span).toFixed(3) + "%";
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_tabindex -->
<div class={"ruler " + cls} class:seekable={!!onseek} bind:this={el} style:height={height + "px"} {title} {...attrs} aria-hidden={slider && onseek ? undefined : "true"}
  role={slider && onseek ? "slider" : undefined} tabindex={slider && onseek ? 0 : undefined} aria-label={slider && onseek ? slider.label : undefined}
  aria-valuemin={slider && onseek ? 0 : undefined} aria-valuemax={slider && onseek ? slider.max : undefined} aria-valuenow={slider && onseek ? Math.round(slider.value * 10) / 10 : undefined} aria-valuetext={slider && onseek ? slider.text : undefined}
  onpointerdown={pd} onpointermove={pm} onpointerup={pu} onpointercancel={pu} onkeydown={key}>
  {#each ticks as t (t.t)}<span style:left={pct(t.t)} class={[t.dashed ? "ext" : "", t.end ? "end" : ""].join(" ").trim()} {...t.attrs}>{t.label}</span>{/each}
</div>

<style>
  .ruler { position: relative; touch-action: none; user-select: none; overflow: hidden; }
  .ruler.seekable { cursor: pointer; }
  .ruler:focus-visible { outline: 2px solid var(--tl-focus, var(--tt-focus)); outline-offset: 2px; }
  .ruler span { position: absolute; top: 0; height: 100%; padding-left: 3px; border-left: 1px solid var(--tt-line-2); font-size: .68rem; line-height: 1.4; white-space: nowrap; color: var(--tl-ink, var(--tt-ink-3)); font-variant-numeric: tabular-nums; }
  .ruler span.ext { border-left-style: dashed; opacity: .55; }
  .ruler span.end { translate: -100%; border-left: 0; border-right: 1px solid var(--tt-line-2); padding: 0 3px 0 0; }
</style>
