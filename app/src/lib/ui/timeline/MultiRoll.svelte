<!-- A piano roll for INSPECTING several note layers on one time axis: one keyboard and pitch axis, one ruler, any number of annotation lanes
     above the notes (chord names, labels…), one playhead driven from outside, and shared navigation (drag or Shift + wheel to scroll,
     Ctrl/⌘ + wheel to zoom, through a TimeViewport that other views may share). Each layer is styled on its own (fill, outline, dash,
     opacity), so measured and suggested material can look clearly different. Read-only by design: no note editing, no sequencing.
     Generic: times are seconds and pitches are numbers; the caller supplies grid lines, ticks, pitch names and what seeking does. -->
<script lang="ts" module>
  import type { LaneNote, GridLine } from "./NoteLane.svelte";
  import type { Tick } from "./TimeRuler.svelte";
  export type { LaneNote, GridLine, Tick };
  export interface RollLayer {
    id: string; label: string; notes: LaneNote[]; hidden?: boolean;
    /** Note body colour and opacity (0 = outline only), outline colour, width and dash (e.g. "3 2"). */
    fill?: string; fillOpacity?: number; stroke?: string; strokeWidth?: number; dash?: string;
  }
  export interface Annotation { key: string | number; start: number; end: number; text: string; title?: string; tone?: string; attrs?: Record<string, string> }
  export interface AnnotationLane { id: string; label: string; items: Annotation[]; selected?: string | number | null; onpick?: (item: Annotation) => void }
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import type { TimeViewport } from "./viewport.svelte";
  import type { PlayClock } from "./clock";
  import TimeRuler from "./TimeRuler.svelte";
  import Playhead from "./Playhead.svelte";

  let { viewport, clock = null, layers, annotations = [], lines = () => [], ticks = [], pitchName = (p: number) => String(p), label, empty = "", gutter = 44, onseek, attrs = {} }: {
    viewport: TimeViewport; clock?: PlayClock | null; layers: RollLayer[]; annotations?: AnnotationLane[]; lines?: (start: number, end: number) => GridLine[]; ticks?: Tick[];
    pitchName?: (p: number) => string; label: string; empty?: string; gutter?: number; onseek?: (t: number, phase: "start" | "move" | "end") => void; attrs?: Record<string, string>;
  } = $props();

  const shownLayers = $derived(layers.filter(l => !l.hidden));
  // the pitch axis covers every shown layer's notes (the whole track, not only the visible stretch, so it does not jump while scrolling)
  const range = $derived.by(() => {
    let lo = 127, hi = 0; for (const l of shownLayers) for (const n of l.notes) { if (n.pitch < lo) lo = n.pitch; if (n.pitch > hi) hi = n.pitch; }
    return hi < lo ? { lo: 60, hi: 72 } : { lo: lo - 1, hi: hi + 1 };
  });
  let width = $state(0), height = $state(0);
  const rows = $derived(range.hi - range.lo + 1), rh = $derived(height / rows);
  const keys = $derived(Array.from({ length: rows }, (_, i) => range.hi - i));
  const used = $derived(new Set(shownLayers.flatMap(l => l.notes.map(n => n.pitch))));
  const black = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  const x = (t: number) => viewport.xOf(t, width);
  const visible = (notes: LaneNote[]) => { const a = viewport.start, b = viewport.end; return notes.filter(n => n.end >= a && n.start <= b); };
  const drawn = $derived(shownLayers.map(l => ({ l, notes: visible(l.notes) })));
  const nothing = $derived(drawn.every(d => !d.notes.length));
  const grid = $derived(lines(viewport.start, viewport.end));
  // every C carries its octave name (C2, C3…) as long as the rows are not packed tighter than 3 px; other used white keys get a name when
  // a row is tall enough to hold it without touching the next (black keys are too narrow to carry one)
  const label1 = (m: number) => ((m % 12) + 12) % 12 === 0 ? rh >= 3 : used.has(m) && !black(m) && rh >= 11;

  // a chord name is written only where its region is wide enough to hold it; a narrower region keeps its name for hover and assistive tech
  const annW = $derived(Math.max(1, width));
  const fits = (it: Annotation) => { const px = ((Math.min(it.end, viewport.end) - Math.max(it.start, viewport.start)) / viewport.span) * annW; return px >= it.text.length * 6.6 + 10; };

  // annotation items in view, placed in percent of the span; the one under the playhead is marked (state changes only when it changes)
  const pct = (t: number) => (100 * (t - viewport.start) / viewport.span).toFixed(3) + "%";
  let playing = $state<Record<string, string | number | null>>({});
  $effect(() => {
    const c = clock, lanes = annotations; if (!c) { playing = {}; return; }
    return untrack(() => c.subscribe(t => {
      for (const ln of lanes) { const hit = ln.items.find(it => t >= it.start && t < it.end), k = hit ? hit.key : null; if (playing[ln.id] !== k) playing = { ...playing, [ln.id]: k }; }
    }));
  });

  // navigation: Ctrl/⌘ + wheel zooms around the pointer, Shift + wheel (or a sideways wheel) scrolls, a drag scrolls
  let root = $state<HTMLDivElement | null>(null);
  $effect(() => {
    const el = root; if (!el) return;
    const h = (e: WheelEvent) => {
      const r = el.getBoundingClientRect(), w = Math.max(1, r.width - gutter), t = viewport.tOf(e.clientX - r.left - gutter, w);
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); viewport.zoom(Math.exp(e.deltaY * 0.0025), t); }
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); viewport.pan(((e.shiftKey ? e.deltaY : e.deltaX) / w) * viewport.span); }
    };
    el.addEventListener("wheel", h, { passive: false }); return () => el.removeEventListener("wheel", h);
  });
  let drag: { x: number; start: number; moved: boolean } | null = null;
  function pd(e: PointerEvent) { if (e.button !== 0) return; drag = { x: e.clientX, start: viewport.start, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function pm(e: PointerEvent) {
    if (!drag) return; const dx = e.clientX - drag.x; if (!drag.moved && Math.abs(dx) < 4) return;
    if (!drag.moved) { drag.moved = true; viewport.pan(0); }
    viewport.jump(drag.start - (dx / Math.max(1, width)) * viewport.span);
  }
  const pu = () => { drag = null; };
</script>

<div class="mroll" bind:this={root} style:--tl-gutter={gutter + "px"} {...attrs}>
  <div class="mr-row ruler-row"><span class="corner"></span><TimeRuler class="mroll-ruler" {viewport} {ticks} height={18} {onseek} /></div>
  {#each annotations as ln (ln.id)}
    <div class="mr-row ann-row" data-annotations={ln.id}>
      <span class="corner alabel">{ln.label}</span>
      <div class="ann" role="group" aria-label={ln.label}>
        {#each ln.items.filter(it => it.end > viewport.start && it.start < viewport.end) as it (it.key)}
          {@const on = playing[ln.id] === it.key}
          <button type="button" class={"ann-item" + (it.tone ? " " + it.tone : "")} class:playing={on} class:selected={ln.selected === it.key}
            style:left={pct(Math.max(it.start, viewport.start))} style:width={`calc(${pct(Math.min(it.end, viewport.end))} - ${pct(Math.max(it.start, viewport.start))})`}
            title={it.title ?? it.text} aria-current={on ? "time" : undefined} aria-pressed={ln.onpick ? ln.selected === it.key : undefined} {...it.attrs}
            aria-label={it.text} data-full={it.text} class:tight={!fits(it)}
            onclick={() => ln.onpick?.(it)} disabled={!ln.onpick}>{#if fits(it)}{it.text}{/if}</button>
        {/each}
      </div>
    </div>
  {/each}
  <div class="mr-row body-row">
    <div class="keys" aria-hidden="true">
      {#each keys as m (m)}
        <span class:black={black(m)} style:top={(range.hi - m) * rh + "px"} style:height={rh + "px"}>{#if label1(m)}<i>{pitchName(m)}</i>{/if}</span>
      {/each}
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="track" role="img" aria-label={label} bind:clientWidth={width} bind:clientHeight={height} onpointerdown={pd} onpointermove={pm} onpointerup={pu} onpointercancel={pu}>
      {#if width && height}
        <svg {width} {height} aria-hidden="true">
          {#each keys as m (m)}<rect x="0" y={(range.hi - m) * rh} {width} height={rh} fill={black(m) ? "#EDF0E9" : "#FBFCF8"} />{/each}
          {#each grid as g (g.t)}<line x1={x(g.t)} x2={x(g.t)} y1="0" y2={height} stroke={g.major ? "#B4BDB3" : "#DCE2DB"} stroke-width={g.major ? 1 : 0.6} />{/each}
          {#each drawn as d (d.l.id)}
            <g data-layer={d.l.id} fill={d.l.fill ?? "#5E8A2E"} fill-opacity={d.l.fillOpacity ?? 1} stroke={d.l.stroke ?? "none"} stroke-width={d.l.stroke ? (d.l.strokeWidth ?? 1.2) : 0} stroke-dasharray={d.l.dash}>
              {#each d.notes as n, i (i)}
                {@const w = Math.max(2, x(n.end) - x(n.start) - 1)}
                <rect x={x(n.start) + 0.5} y={(range.hi - n.pitch) * rh + 0.5} width={w} height={Math.max(1, rh - 1)} rx="1.5" opacity={n.level == null ? 1 : 0.5 + 0.5 * n.level} />
              {/each}
            </g>
          {/each}
        </svg>
      {/if}
      {#if empty && nothing}<p class="none">{empty}</p>{/if}
    </div>
  </div>
  <!-- ONE playhead across the ruler, the annotation lanes and the notes -->
  <div class="phover"><Playhead {clock} {viewport} label={label} /></div>
</div>

<style>
  .mroll { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; height: 100%; background: var(--tt-panel); border: 1px solid var(--tt-line); border-radius: 0; overflow: hidden; --tl-ink: var(--tt-ink-3); }
  .mr-row { display: grid; grid-template-columns: var(--tl-gutter) minmax(0, 1fr); min-width: 0; }
  .ruler-row { flex: none; border-bottom: 1px solid var(--tt-line); background: var(--tt-chassis); }
  .corner { background: var(--tt-chassis); }
  .ann-row { flex: none; height: 24px; border-bottom: 1px solid var(--tt-line); background: var(--tt-panel); }
  .alabel { font: 600 .68rem/24px var(--tt-font-body, sans-serif); color: var(--tt-ink-3); padding-left: 6px; overflow: hidden; }
  .ann { position: relative; min-width: 0; overflow: visible; z-index: 2; }
  .ann-row { overflow: visible; }
  .ann-item {
    position: absolute; top: 2px; bottom: 2px; min-width: 0; padding: 0 4px; margin: 0; border: 0; border-left: 1px solid var(--tt-line-2); border-radius: 0;
    background: transparent; color: var(--tl-ann-ink, var(--tt-ink-2)); font: 500 .72rem/20px var(--tt-font-body, sans-serif); text-align: left; white-space: nowrap; overflow: visible; cursor: pointer;
    transition: background-color 120ms, color 120ms;
  }
  .ann-item:disabled { cursor: default; }
  /* a region too narrow for its name: hovering (or focusing) it shows the full chord in a small label above the lane */
  .ann-item.tight:hover::after, .ann-item.tight:focus-visible::after {
    content: attr(data-full); position: absolute; left: 50%; bottom: calc(100% + 2px); translate: -50% 0; padding: 2px 6px; z-index: 5; pointer-events: none;
    background: var(--tt-ink); color: var(--tt-bg); font: 500 .72rem/1.4 var(--tt-font-body, sans-serif); white-space: nowrap;
  }
  .ann-item:not(:disabled):hover { background: var(--tt-inset); color: var(--tt-ink); }
  .ann-item.playing { background: var(--tl-ann-playing, var(--tt-accent-soft)); color: var(--tt-accent); }
  .ann-item.selected { box-shadow: inset 0 0 0 1.5px var(--tl-ann-selected, var(--tt-ink)); }
  .ann-item:focus-visible { outline: 2px solid var(--tl-focus, var(--tt-focus)); outline-offset: -2px; z-index: 1; }
  .body-row { position: relative; flex: 1; min-height: 0; }
  .keys { position: relative; overflow: hidden; background: #FFFFFF; border-right: 1px solid var(--tt-line-2); }
  .keys span { position: absolute; left: 0; right: 0; background: #FFFFFF; border-bottom: 1px solid var(--tt-line); }
  .keys span.black { background: #3A443E; right: 42%; border-bottom-color: #3A443E; }
  .keys i { position: absolute; right: 3px; bottom: 0; font: 500 .58rem/1 var(--tt-font-mono, monospace); font-style: normal; color: var(--tt-ink-2); white-space: nowrap; }
  .keys span { overflow: visible; }
  .keys span.black i { color: var(--tt-ink-3); right: -46%; }
  .track { position: relative; min-width: 0; min-height: 0; overflow: hidden; touch-action: pan-y; cursor: grab; }
  .track:active { cursor: grabbing; }
  svg { display: block; }
  .none { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 0 12px; text-align: center; color: var(--tt-ink-3); font-size: .8rem; pointer-events: none; }
  .phover { position: absolute; top: 0; bottom: 0; left: var(--tl-gutter); right: 0; pointer-events: none; }
  :global(.mroll-ruler) { min-width: 0; }
</style>
