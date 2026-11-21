<!-- A lane of notes on a shared time axis: pitch up, time across, drawn for the visible stretch only (so a whole song's notes stay cheap).
     Generic: notes are {start, end, pitch} in seconds and pitch numbers; the caller supplies the grid lines (it owns bars and beats) and
     the pitch names. The left gutter is `--tl-gutter` wide, outside the time axis, so a playhead and rulers can line up with every lane. -->
<script lang="ts">
  import type { TimeViewport } from "./viewport.svelte";
  export interface LaneNote { start: number; end: number; pitch: number; level?: number; mark?: boolean }
  export interface GridLine { t: number; major?: boolean }
  let { notes, viewport, lines = () => [], pitchName = (p: number) => String(p), label, color = "#5E8A2E", markColor = "#526BCE", empty = "" }: {
    notes: LaneNote[]; viewport: TimeViewport; lines?: (start: number, end: number) => GridLine[]; pitchName?: (p: number) => string;
    label: string; color?: string; markColor?: string; empty?: string;
  } = $props();
  let width = $state(0), height = $state(0);
  const range = $derived.by(() => {
    if (!notes.length) return { lo: 60, hi: 72 };
    let lo = 127, hi = 0; for (const n of notes) { if (n.pitch < lo) lo = n.pitch; if (n.pitch > hi) hi = n.pitch; }
    return { lo: lo - 1, hi: hi + 1 };
  });
  const rows = $derived(range.hi - range.lo + 1), rh = $derived(height / rows);
  // only the notes that touch the visible stretch
  const shown = $derived.by(() => { const a = viewport.start, b = viewport.end; return notes.filter(n => n.end >= a && n.start <= b); });
  const grid = $derived(lines(viewport.start, viewport.end));
  const used = $derived(new Set(notes.map(n => n.pitch)));
  const keys = $derived(Array.from({ length: rows }, (_, i) => range.hi - i));
  const black = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  const x = (t: number) => viewport.xOf(t, width);
</script>

<div class="lane" role="img" aria-label={label}>
  <div class="gutter" aria-hidden="true">
    {#each keys as m (m)}{#if used.has(m) && rh >= 7}<span style:top={(range.hi - m) * rh + "px"} style:height={rh + "px"} style:line-height={rh + "px"}>{pitchName(m)}</span>{/if}{/each}
  </div>
  <div class="track" bind:clientWidth={width} bind:clientHeight={height}>
    {#if width && height}
      <svg {width} {height} aria-hidden="true">
        {#each keys as m (m)}<rect x="0" y={(range.hi - m) * rh} {width} height={rh} fill={black(m) ? "#EDF0E9" : "#FBFCF8"} />{/each}
        {#each grid as g (g.t)}<line x1={x(g.t)} x2={x(g.t)} y1="0" y2={height} stroke={g.major ? "#B4BDB3" : "#DCE2DB"} stroke-width={g.major ? 1.2 : 0.6} />{/each}
        {#each shown as n, i (i)}
          <rect x={x(n.start) + 0.5} y={(range.hi - n.pitch) * rh + 0.5} width={Math.max(2, x(n.end) - x(n.start) - 1)} height={Math.max(1, rh - 1)} rx="1.5"
            fill={n.mark ? markColor : color} opacity={n.level == null ? 1 : 0.45 + 0.55 * n.level} />
        {/each}
      </svg>
    {/if}
    {#if empty && !shown.length}<p class="none">{empty}</p>{/if}
  </div>
</div>

<style>
  .lane { position: relative; display: grid; grid-template-columns: var(--tl-gutter, 40px) minmax(0, 1fr); min-height: 0; height: 100%; background: var(--tt-panel); border: 1px solid var(--tt-line-2); border-radius: 0; overflow: hidden; }
  .gutter { position: relative; font: 400 .62rem var(--tt-font-mono, monospace); color: var(--tt-ink-3); }
  .gutter span { position: absolute; left: 3px; white-space: nowrap; }
  .track { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
  svg { display: block; }
  .none { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 0 12px; text-align: center; color: var(--tt-ink-3); font-size: .8rem; pointer-events: none; }
</style>
